"use client";

/**
 * Design system editor: name + description, an AI prompt to generate / refine the
 * system or BUILD it from the org's existing code, a Preview|Code toggle (preview
 * by default) over the token primitives, a components editor (add / edit / remove),
 * save / delete, and domain assignment. The canonical body is the CSS + the
 * components; the preview and saved tokens derive from them.
 */

import { useEffect, useMemo, useState } from "react";
import { Code2, Library, MonitorPlay, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type DesignSystemDetail,
  type DesignSystemComponentInput,
  type DesignSystemOrigin,
  type Domain,
  type GenerateDesignSystemResult,
  type RepoFull,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

import { ComponentsEditor, type ComponentDraft } from "./components-editor";
import { ShowcasePreview } from "./showcase-preview";

const STARTER_CSS = `:root {
  --color-primary: #31628F;
  --color-accent: #B0532F;
  --surface: #F6F3EC;
  --text: #262420;
  --border: #E2DDD2;
  --radius-md: 10px;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --space-4: 1rem;
}
.dark {
  --surface: #15130F;
  --text: #F6F3EC;
  --border: #2A2620;
}`;

const FROM_CODE_PROMPT =
  "Build a complete, detailed, accessible design system from our existing code " +
  "tokens, staying faithful to them and expanding across all the components we ship.";

function toDrafts(components: DesignSystemDetail["components"]): ComponentDraft[] {
  return components.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    css: c.css,
    markup: c.markup,
  }));
}

function fromResult(components: DesignSystemComponentInput[]): ComponentDraft[] {
  return components.map((c) => ({
    name: c.name,
    description: c.description ?? "",
    css: c.css ?? "",
    markup: c.markup ?? "",
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

export function SystemEditor({
  detail,
  domains,
  repos,
  onSaved,
  onDeleted,
}: {
  /** The system being edited, or null for a brand-new draft. */
  detail: DesignSystemDetail | null;
  domains: Domain[];
  /** The org's repos, for the "build from existing code" source picker. */
  repos: RepoFull[];
  onSaved: (saved: DesignSystemDetail) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [css, setCss] = useState(STARTER_CSS);
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [origin, setOrigin] = useState<DesignSystemOrigin>("manual");
  const [view, setView] = useState<"preview" | "code">("preview");
  const [prompt, setPrompt] = useState("");
  // Source repo for "build from existing code" ("" = all the org's repos).
  const [seedRepoId, setSeedRepoId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(detail?.name ?? "");
    setDescription(detail?.description ?? "");
    setCss(detail?.css ?? STARTER_CSS);
    setComponents(detail ? toDrafts(detail.components) : []);
    setOrigin(detail?.origin ?? "manual");
    setView("preview");
    setPrompt("");
  }, [detail]);

  const previewComponents = useMemo(
    () => components.map((c) => ({ name: c.name, css: c.css, markup: c.markup })),
    [components],
  );

  const applyResult = (res: GenerateDesignSystemResult) => {
    if (!name.trim()) setName(res.name);
    if (!description.trim()) setDescription(res.description);
    setCss(res.css);
    setComponents(fromResult(res.components));
    setOrigin(res.origin);
    setView("preview");
    setPrompt("");
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const res = await api.design.generateSystem({
        prompt: prompt.trim(),
        ...(css.trim() ? { base_css: css } : {}),
      });
      applyResult(res);
      toast.success("Drafted a design system - review, tweak, and save it.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't generate right now.");
    } finally {
      setGenerating(false);
    }
  };

  const buildFromCode = async () => {
    setBuilding(true);
    try {
      const res = await api.design.generateSystem({
        prompt: prompt.trim() || FROM_CODE_PROMPT,
        from_knowledge: true,
        ...(seedRepoId ? { repo_id: seedRepoId } : {}),
      });
      applyResult(res);
      // origin='extracted' means real tokens were found + expanded; 'ai' means the
      // source had no tokens, so it is a fresh draft (be honest about which).
      toast.success(
        res.origin === "extracted"
          ? "Built a system from your code - review, tweak, and save it."
          : "No design tokens found in that code, so this is a fresh AI draft - review and save it.",
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't build from your code right now.");
    } finally {
      setBuilding(false);
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
        ? await api.design.updateSystem(detail.id, payload)
        : await api.design.createSystem(payload);
      toast.success(detail ? "Saved." : "Created.");
      await onSaved(saved);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.design.deleteSystem(detail.id);
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
    const next = detail.domain_ids.includes(domainId)
      ? detail.domain_ids.filter((d) => d !== domainId)
      : [...detail.domain_ids, domainId];
    try {
      const saved = await api.design.assignDomains(detail.id, next);
      await onSaved(saved);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update domains.");
    }
  };

  const busy = generating || building;

  return (
    <Card variant="elevated">
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
          <span className="text-[11px] text-[var(--text-subtle)]">
            Extracts the tokens already in your code, then expands them into a detailed system with AI.
          </span>
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
            </span>
            <div className="flex items-center gap-1" role="tablist" aria-label="Editor view">
              {(["preview", "code"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    view === v
                      ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  )}
                >
                  {v === "code" ? <Code2 className="size-3" aria-hidden /> : null}
                  {v}
                </button>
              ))}
            </div>
          </Cluster>
          <div className="p-3">
            {view === "preview" ? (
              <ShowcasePreview css={css} components={previewComponents} />
            ) : (
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

        <div className="rounded-lg border border-[var(--border)] p-3">
          <ComponentsEditor components={components} onChange={setComponents} />
        </div>

        <DomainAssignment detail={detail} domains={domains} onToggle={toggleDomain} />

        <Cluster gap="2" align="center">
          <Button loading={saving} disabled={saving} onClick={() => void save()}>
            <Save className="size-3.5" />
            {detail ? "Save changes" : "Create design system"}
          </Button>
          {detail && (
            <Button variant="ghost" disabled={saving} onClick={() => void remove()}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </Cluster>
      </Stack>
    </Card>
  );
}

function DomainAssignment({
  detail,
  domains,
  onToggle,
}: {
  detail: DesignSystemDetail | null;
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
            const on = detail.domain_ids.includes(d.id);
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
