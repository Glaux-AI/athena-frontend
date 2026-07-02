"use client";

/**
 * Design system editor: name + description, an AI prompt to generate / refine
 * the system or BUILD it from the org's existing code, a four-tab body
 * (Preview | Tokens | Components | Code), save / duplicate / delete, and domain
 * assignment. The canonical body is the CSS STRING plus the components; the
 * Tokens tab is a structured view over the css (lib/design/css-model) that
 * serializes back on every edit, and the preview derives from both.
 *
 * Draft-safety rules this editor enforces:
 *   - editor state resets ONLY when the edited system's id changes - a detail
 *     refetch (domain toggle, list refresh) for the same id never wipes a draft;
 *   - dirty is tracked against a clean snapshot and reported to the page so
 *     switching systems asks before discarding;
 *   - an AI apply snapshots the previous draft into an undo slot (toast Undo);
 *   - saves carry expected_updated_at so a teammate's save surfaces as a
 *     reload toast instead of being clobbered;
 *   - while a generation is in flight the editable body sits under a disabled
 *     overlay so nothing can be typed into fields the result will replace.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Code2,
  Copy,
  Library,
  MonitorPlay,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type AiGeneration,
  type DesignSystemComponentInput,
  type DesignSystemDetail,
  type DesignSystemOrigin,
  type Domain,
  type GenerateDesignSystemInput,
  type GenerateDesignSystemResult,
  type ModelSelection,
  type RepoFull,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { Modal } from "@/components/ui/overlay";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { useGenerationPoll } from "@/hooks/use-generation";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import {
  parseSystemCss,
  serializeSystemCss,
  type EditableToken,
  type SystemCssModel,
} from "@/lib/design/css-model";
import { invalidateDesignSystemCache } from "@/lib/design/use-design-tokens";
import { cn } from "@/lib/cn";

import { ComponentsEditor, draftsFromInputs, type ComponentDraft } from "./components-editor";
import { ShowcasePreview } from "./showcase-preview";
import { TokenTableEditor } from "./token-table-editor";

const FROM_CODE_PROMPT =
  "Build a complete, detailed, accessible design system from our existing code " +
  "tokens, staying faithful to them and expanding across all the components we ship.";

/** A template (or blank) seed for a brand-new draft. */
export interface EditorSeed {
  css: string;
  components: DesignSystemComponentInput[];
}

type EditorView = "preview" | "tokens" | "components" | "code";

const VIEWS: { id: EditorView; label: string; Icon: typeof Code2 }[] = [
  { id: "preview", label: "Preview", Icon: MonitorPlay },
  { id: "tokens", label: "Tokens", Icon: SlidersHorizontal },
  { id: "components", label: "Components", Icon: Boxes },
  { id: "code", label: "Code", Icon: Code2 },
];

function toDrafts(components: DesignSystemDetail["components"]): ComponentDraft[] {
  return components.map((c) => ({
    key: c.id,
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    css: c.css,
    markup: c.markup,
  }));
}

function toInput(components: ComponentDraft[]): DesignSystemComponentInput[] {
  return components.map((c) => ({
    name: c.name,
    description: c.description,
    css: c.css,
    markup: c.markup,
  }));
}

/** The draft fields that count for dirty tracking (component keys excluded -
 *  they are client-only identity, not content). */
function snapshotOf(name: string, description: string, css: string, components: ComponentDraft[]): string {
  return JSON.stringify({
    name,
    description,
    css,
    components: components.map((c) => ({ name: c.name, description: c.description, css: c.css, markup: c.markup })),
  });
}

interface UndoSlot {
  name: string;
  description: string;
  css: string;
  components: ComponentDraft[];
  origin: DesignSystemOrigin;
}

export function SystemEditor({
  detail,
  seed,
  domains,
  repos,
  onSaved,
  onDeleted,
  onDirtyChange,
  onDomainsChanged,
}: {
  /** The system being edited, or null for a brand-new draft. */
  detail: DesignSystemDetail | null;
  /** Template seed for a new draft (from the gallery); ignored when editing. */
  seed?: EditorSeed | null;
  domains: Domain[];
  /** The org's repos, for "build from existing code" + component import. */
  repos: RepoFull[];
  onSaved: (saved: DesignSystemDetail) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  /** Reported whenever the draft's dirty state changes (page-level guards). */
  onDirtyChange?: (dirty: boolean) => void;
  /** A domain toggle saved server-side - the page refreshes its list without
   *  remounting the editor (the draft must survive). */
  onDomainsChanged?: (saved: DesignSystemDetail) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [css, setCss] = useState("");
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [origin, setOrigin] = useState<DesignSystemOrigin>("manual");
  const [domainIds, setDomainIds] = useState<string[]>([]);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
  const [view, setView] = useState<EditorView>("preview");
  const [prompt, setPrompt] = useState("");
  // Source repo for "build from existing code" ("" = all the org's repos).
  const [seedRepoId, setSeedRepoId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Live AI activity + cancel. Generations are DURABLE server-side rows the
  // editor polls - leaving the page loses nothing, and a remount reattaches
  // (or offers a draft that finished while away).
  const [status, setStatus] = useState<string | null>(null);
  // The last AI-applied draft's predecessor - restored by the toast Undo.
  const undoRef = useRef<UndoSlot | null>(null);
  // Clean snapshot for dirty tracking - set on load, reset, and save.
  const [cleanSnapshot, setCleanSnapshot] = useState(() => snapshotOf("", "", "", []));
  // Tokens tab: structured model over the canonical css. `tokenCssRef` marks
  // the css string the current model was parsed from / serialized to, so an
  // EXTERNAL css change (code tab, AI apply, undo) re-parses while our own
  // serializations don't loop.
  const [tokenModel, setTokenModel] = useState<SystemCssModel | null>(null);
  const tokenCssRef = useRef<string | null>(null);
  // The model + effort this generation runs on - never a random model.
  const [effort, setEffort] = usePersistedEffort("design");
  const { models } = useEnabledModels();
  const enabledModels = models.filter((m) => m.enabled);
  const [model, setModel] = useState<ModelSelection | null>(null);

  const resetFromDetail = useCallback(
    (d: DesignSystemDetail | null) => {
      const nextName = d?.name ?? "";
      const nextDescription = d?.description ?? "";
      const nextCss = d ? d.css : (seed?.css ?? "");
      const nextComponents = d ? toDrafts(d.components) : draftsFromInputs(seed?.components ?? []);
      setName(nextName);
      setDescription(nextDescription);
      setCss(nextCss);
      setComponents(nextComponents);
      setOrigin(d?.origin ?? "manual");
      setDomainIds(d?.domain_ids ?? []);
      setLoadedUpdatedAt(d?.updated_at ?? null);
      setView("preview");
      setPrompt("");
      setTokenModel(null);
      tokenCssRef.current = null;
      undoRef.current = null;
      setCleanSnapshot(snapshotOf(nextName, nextDescription, nextCss, nextComponents));
    },
    [seed],
  );

  // Reset ONLY when the edited system's id changes - never on a mere `detail`
  // object identity change (domain toggles / list refreshes refetch the same
  // system and must not wipe the draft). Switching systems stops FOLLOWING an
  // in-flight generation (never cancels it - the row is durable and scoped to
  // its own context_key, so it can never apply onto another system).
  const lastResetIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = detail?.id ?? null;
    if (lastResetIdRef.current === id) return;
    lastResetIdRef.current = id;
    genPoll.stopPolling();
    setGenerating(false);
    setBuilding(false);
    resetFromDetail(detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, resetFromDetail]);

  // Same-id detail refreshes still carry fresh server facts (domain_ids,
  // updated_at) - sync those WITHOUT touching the draft body.
  useEffect(() => {
    if (!detail) return;
    setDomainIds(detail.domain_ids);
    setLoadedUpdatedAt(detail.updated_at);
  }, [detail]);

  const dirty = useMemo(
    () => snapshotOf(name, description, css, components) !== cleanSnapshot,
    [name, description, css, components, cleanSnapshot],
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Default the model to the user's remembered pick, else the first enabled one.
  useEffect(() => {
    if (model !== null) return;
    const restored = restoreModelSelection("design", models);
    if (restored) {
      setModel(restored);
      return;
    }
    const first = models.find((m) => m.enabled);
    if (first) setModel({ provider: first.provider, model: first.id, source: first.source });
  }, [models, model]);

  // Tokens tab <-> canonical css sync: parse on entry and whenever the css
  // changed underneath us; our own serializations are marked via tokenCssRef.
  useEffect(() => {
    if (view !== "tokens") return;
    if (tokenCssRef.current === css) return;
    tokenCssRef.current = css;
    setTokenModel(parseSystemCss(css));
  }, [view, css]);

  const onTokensChange = (tokens: EditableToken[]) => {
    const nextModel: SystemCssModel = { tokens, extraCss: tokenModel?.extraCss ?? "" };
    setTokenModel(nextModel);
    const serialized = serializeSystemCss(nextModel);
    tokenCssRef.current = serialized;
    setCss(serialized);
  };

  const previewComponents = useMemo(
    () => components.map((c) => ({ name: c.name, css: c.css, markup: c.markup })),
    [components],
  );

  const restoreUndo = () => {
    const slot = undoRef.current;
    if (!slot) return;
    undoRef.current = null;
    setName(slot.name);
    setDescription(slot.description);
    setCss(slot.css);
    setComponents(slot.components);
    setOrigin(slot.origin);
    toast.success("Restored the draft from before the AI apply.");
  };

  const applyResult = (res: GenerateDesignSystemResult) => {
    undoRef.current = { name, description, css, components, origin };
    if (!name.trim()) setName(res.name);
    if (!description.trim()) setDescription(res.description);
    setCss(res.css);
    setComponents(draftsFromInputs(res.components));
    // Never silently flip a saved system's origin (a manual system stays
    // manual after an AI-assisted tweak); only a brand-new draft takes the
    // generation's origin.
    if (!detail) setOrigin(res.origin);
    setView("preview");
    setPrompt("");
    if (res.warnings && res.warnings.length > 0) toast.warning(res.warnings.join("\n"));
  };

  // The reattach scope: one key per edited system (or the new-draft slot).
  const contextKey = detail?.id ?? "new-system";

  const applySettled = useCallback(
    (gen: AiGeneration<GenerateDesignSystemResult>) => {
      setGenerating(false);
      setBuilding(false);
      setStatus(null);
      if (gen.context_key && gen.context_key !== contextKey) return; // another system's draft
      if (gen.status === "failed") {
        toast.error(gen.error ?? "Couldn't generate right now.");
        return;
      }
      if (gen.status !== "completed" || !gen.result) return; // cancelled - nothing to apply
      const res = gen.result;
      applyResult(res);
      toast.success(
        res.origin === "extracted"
          ? "Built a system from your code - review, tweak, and save it."
          : "Drafted a design system - review, tweak, and save it.",
        { action: { label: "Undo", onClick: restoreUndo } },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextKey],
  );
  const genPoll = useGenerationPoll<GenerateDesignSystemResult>(applySettled);

  // Surface the worker's live progress line while a generation runs.
  useEffect(() => {
    if (!genPoll.generation) return;
    setStatus(genPoll.generation.status_detail || "Working…");
  }, [genPoll.generation]);

  // Reattach after navigation: a generation started for THIS system that is
  // still running resumes silently; one that FINISHED while away is offered
  // (never auto-applied over the current draft).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.generations.list<GenerateDesignSystemResult>({
          kind: "design_system",
          contextKey,
          limit: 1,
        });
        const gen = rows[0];
        if (cancelled || !gen) return;
        if (gen.status === "queued" || gen.status === "running") {
          setGenerating(true);
          genPoll.start(gen);
        } else if (gen.status === "completed" && gen.result && !seenGenerationsRef.current.has(gen.id)) {
          seenGenerationsRef.current.add(gen.id);
          toast.info("An AI draft you started earlier is ready.", {
            action: { label: "Apply it", onClick: () => applySettled(gen) },
          });
        }
      } catch {
        /* best-effort - a failed lookup just skips the reattach */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);
  const seenGenerationsRef = useRef<Set<string>>(new Set());

  const cancel = () => genPoll.cancel();

  // Enqueue one DURABLE generation; the poll applies the result when it lands.
  // `extra` carries the per-call inputs (base_css / from_knowledge / repo_id);
  // model + effort are always sent.
  const runGeneration = async (extra: Partial<GenerateDesignSystemInput>) => {
    setStatus("Starting…");
    const input: GenerateDesignSystemInput = {
      prompt: extra.prompt ?? prompt.trim(),
      ...extra,
      ...(model ? { model_provider: model.provider, model_id: model.model } : {}),
      ...(model?.source && model.source !== "subscription" ? { model_source: model.source } : {}),
      effort,
      context_key: contextKey,
    };
    const gen = await api.design.generateSystem(input);
    seenGenerationsRef.current.add(gen.id);
    if (gen.status === "failed") {
      setStatus(null);
      throw new ApiError(503, "ai_enqueue_failed", gen.error ?? "Couldn't start the generation.");
    }
    genPoll.start(gen);
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      await runGeneration({ prompt: prompt.trim(), ...(css.trim() ? { base_css: css } : {}) });
    } catch (e) {
      setGenerating(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't generate right now.");
    }
  };

  const buildFromCode = async () => {
    setBuilding(true);
    try {
      await runGeneration({
        prompt: prompt.trim() || FROM_CODE_PROMPT,
        from_knowledge: true,
        ...(seedRepoId ? { repo_id: seedRepoId } : {}),
      });
    } catch (e) {
      setBuilding(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't build from your code right now.");
    }
  };

  const reloadFromServer = async () => {
    if (!detail) return;
    try {
      const fresh = await api.design.getSystem(detail.id);
      resetFromDetail(fresh);
      await onSaved(fresh);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't reload the design system.");
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Give the design system a name.");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description, css, origin, components: toInput(components) };
      const saved = detail
        ? await api.design.updateSystem(detail.id, {
            ...payload,
            ...(loadedUpdatedAt ? { expected_updated_at: loadedUpdatedAt } : {}),
          })
        : await api.design.createSystem(payload);
      // The Design Studio caches fetched systems (5-min TTL) - evict so a
      // design task picks up the new token values immediately.
      invalidateDesignSystemCache(saved.id);
      setCleanSnapshot(snapshotOf(name, description, css, components));
      toast.success(detail ? "Saved." : "Created.");
      await onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === "stale_write") {
        toast.error("Someone else saved this design system since you loaded it.", {
          description: "Reload to pick up their version - your unsaved edits here will be replaced.",
          action: { label: "Reload", onClick: () => void reloadFromServer() },
        });
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't save.");
      }
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!detail) return;
    // The copy is made from the last-SAVED version and opening it remounts
    // this editor - same confirm as switching systems, so a dirty draft is
    // never silently discarded.
    if (dirty && !window.confirm("Discard unsaved changes to this design system?")) return;
    setSaving(true);
    try {
      const copy = await api.design.duplicateSystem(detail.id);
      invalidateDesignSystemCache(copy.id);
      toast.success("Duplicated - you are now editing the copy.");
      await onSaved(copy);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't duplicate.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.design.deleteSystem(detail.id);
      invalidateDesignSystemCache(detail.id);
      setConfirmDelete(false);
      toast.success("Deleted.");
      await onDeleted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDomain = async (domainId: string) => {
    if (!detail) return;
    const next = domainIds.includes(domainId)
      ? domainIds.filter((d) => d !== domainId)
      : [...domainIds, domainId];
    try {
      const saved = await api.design.assignDomains(detail.id, next);
      // Keep the assignment + concurrency stamp fresh WITHOUT resetting the
      // draft (the page refreshes its list from onDomainsChanged).
      setDomainIds(saved.domain_ids);
      setLoadedUpdatedAt(saved.updated_at);
      onDomainsChanged?.(saved);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update domains.");
    }
  };

  const busy = generating || building;
  const showMalformedHint =
    view === "tokens" &&
    tokenModel !== null &&
    tokenModel.tokens.length === 0 &&
    tokenModel.extraCss.trim() !== "";

  return (
    <Card variant="elevated">
      <Stack gap="4">
        <Stack gap="2" className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <Cluster gap="2" align="center">
            <Sparkles className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
            <span className="text-xs font-medium text-[var(--text-muted)]">
              {css.trim() ? "Refine with AI" : "Generate with AI"}
            </span>
          </Cluster>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the design system you want - e.g. 'warm editorial, ink on paper, fired-clay accents, calm and legible'"
            className="min-h-[64px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <Cluster gap="2" align="center" className="flex-wrap">
            <Button
              size="sm"
              loading={generating}
              disabled={busy || !prompt.trim()}
              onClick={() => void generate()}
            >
              <Wand2 className="size-3.5" />
              {css.trim() ? "Refine" : "Generate"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={building}
              disabled={busy}
              onClick={() => void buildFromCode()}
            >
              <Library className="size-3.5" />
              Build from existing code
            </Button>
            {repos.length > 0 && (
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-subtle)]">
                from
                <select
                  value={seedRepoId}
                  onChange={(e) => setSeedRepoId(e.target.value)}
                  aria-label="Source repo for build from existing code"
                  disabled={busy}
                  className="max-w-[200px] truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="">All repos</option>
                  {repos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Cluster>
          <Cluster gap="2" align="center" className="flex-wrap">
            <EffortSelector value={effort} onChange={setEffort} disabled={busy} />
            {enabledModels.length > 1 && (
              <ModelSelector
                models={models}
                value={model}
                onChange={(m) => {
                  setModel(m);
                  storeModel("design", m);
                }}
                disabled={busy}
              />
            )}
          </Cluster>
          <span className="text-[11px] text-[var(--text-subtle)]">
            Extracts the tokens already in your code, then expands them into a detailed system with AI.
          </span>
          {status !== null && (
            <Cluster
              gap="2"
              align="center"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            >
              <span
                className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--primary)]"
                aria-hidden
              />
              <span
                className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]"
                aria-live="polite"
              >
                {status}
              </span>
              <Button size="sm" variant="ghost" onClick={cancel}>
                <X className="size-3.5" />
                Cancel
              </Button>
            </Cluster>
          )}
        </Stack>

        <div className="relative">
          {busy && (
            <div
              aria-hidden
              className="absolute inset-0 z-10 rounded-lg bg-[var(--surface)] opacity-60"
              title="Waiting for the AI draft"
            />
          )}
          <Stack gap="4">
            <Stack gap="2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Design system name"
                aria-label="Design system name"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base font-semibold text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One-line description (optional)"
                aria-label="Description"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-muted)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </Stack>

            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              <Cluster
                justify="between"
                align="center"
                className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                  <MonitorPlay className="size-3.5 text-[var(--primary)]" aria-hidden />
                  Design system
                  {dirty && (
                    <span className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--warning-ink)]">
                      Unsaved changes
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1" role="tablist" aria-label="Editor view">
                  {VIEWS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={view === id}
                      onClick={() => setView(id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                        view === id
                          ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text)]",
                      )}
                    >
                      <Icon className="size-3" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
              </Cluster>
              <div className="p-3">
                {view === "preview" && <ShowcasePreview css={css} components={previewComponents} />}
                {view === "tokens" && tokenModel !== null && (
                  <Stack gap="2">
                    {showMalformedHint && (
                      <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                        This CSS has structures the table editor can&apos;t
                        safely edit (for example comments or non-token rules
                        inside :root / .dark), so it is left untouched - use
                        the Code tab. Nothing is lost.
                      </p>
                    )}
                    <TokenTableEditor tokens={tokenModel.tokens} onChange={onTokensChange} />
                    {!showMalformedHint && tokenModel.extraCss.trim() !== "" && (
                      <p className="text-[11px] text-[var(--text-subtle)]">
                        Non-token css (component rules, media queries, comments)
                        is preserved verbatim - edit it on the Code tab.
                      </p>
                    )}
                  </Stack>
                )}
                {view === "components" && (
                  <ComponentsEditor
                    components={components}
                    onChange={setComponents}
                    css={css}
                    repos={repos}
                  />
                )}
                {view === "code" && (
                  <textarea
                    value={css}
                    onChange={(e) => setCss(e.target.value)}
                    aria-label="Design system CSS"
                    spellCheck={false}
                    className="h-[520px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                )}
              </div>
            </div>
          </Stack>
        </div>

        <DomainAssignment detail={detail} domainIds={domainIds} domains={domains} onToggle={toggleDomain} />

        <Cluster gap="2" align="center">
          <Button loading={saving} disabled={saving || busy} onClick={() => void save()}>
            <Save className="size-3.5" />
            {detail ? "Save changes" : "Create design system"}
          </Button>
          {detail && (
            <Button variant="secondary" disabled={saving || busy} onClick={() => void duplicate()}>
              <Copy className="size-3.5" />
              Duplicate
            </Button>
          )}
          {detail && (
            <Button variant="ghost" disabled={saving || busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </Cluster>
      </Stack>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete design system?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" loading={saving} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">
          {`"${name || "This design system"}" will be removed for the whole org, and design tasks referencing it lose their token grounding. This cannot be undone.`}
        </p>
      </Modal>
    </Card>
  );
}

function DomainAssignment({
  detail,
  domainIds,
  domains,
  onToggle,
}: {
  detail: DesignSystemDetail | null;
  domainIds: string[];
  domains: Domain[];
  onToggle: (domainId: string) => void | Promise<void>;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        Assigned domains
      </span>
      {!detail ? (
        <p className="text-xs text-[var(--text-muted)]">Save the design system first to assign it to domains.</p>
      ) : domains.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No domains yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((d) => {
            const on = domainIds.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => void onToggle(d.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  on
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                )}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      )}
    </Stack>
  );
}
