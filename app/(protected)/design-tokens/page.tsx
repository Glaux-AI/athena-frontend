"use client";

/**
 * Design tokens - manage reusable design systems. Start a NEW system from a
 * curated template gallery (or blank), generate / refine with AI, edit tokens
 * structurally, preview live, and assign systems to domains so design tasks in
 * those domains can pick them up.
 *
 * Org-scale affordances: name/description search, origin filter chips, a
 * domain filter, absolute updated-at stamps on every card, and the selected
 * system id in the URL (?system=<id>) so a link opens the same system.
 * Unsaved editor drafts are guarded with a confirm before switching away.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Palette, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type DesignSystemComponentInput,
  type DesignSystemDetail,
  type DesignSystemOrigin,
  type DesignSystemSummary,
  type Domain,
  type RepoFull,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/format";
import { useUrlParam } from "@/hooks/use-url-state";
import { cn } from "@/lib/cn";
import { SystemEditor, type EditorSeed } from "@/components/design-tokens/system-editor";
import { TemplateGallery } from "@/components/design-tokens/template-gallery";
import type { DesignTemplate } from "@/lib/design/templates";

type Mode =
  | { kind: "list" }
  | { kind: "gallery" }
  | { kind: "draft"; seed: EditorSeed }
  | { kind: "edit"; detail: DesignSystemDetail };

type OriginFilter = "all" | DesignSystemOrigin;

const ORIGIN_FILTERS: { id: OriginFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "manual", label: "Manual" },
  { id: "ai", label: "AI" },
  { id: "extracted", label: "Extracted" },
];

export default function DesignTokensPage() {
  const [systems, setSystems] = useState<DesignSystemSummary[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [repos, setRepos] = useState<RepoFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [domainFilter, setDomainFilter] = useState("");
  /** Which system's detail GET is in flight - drives the right-panel skeleton. */
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  /** Distinguishes successive gallery drafts so the editor remounts per pick. */
  const [draftNonce, setDraftNonce] = useState(0);
  const [systemParam, setSystemParam] = useUrlParam("system");

  const loadSystems = useCallback(async () => {
    const list = await api.design.listSystems();
    setSystems(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [, doms, reps] = await Promise.all([
          loadSystems(),
          api.domains.list().catch(() => [] as Domain[]),
          api.repos.list().catch(() => [] as RepoFull[]),
        ]);
        if (!cancelled) {
          setDomains(doms);
          setRepos(reps);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load design systems.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSystems]);

  /** Monotonic sequence for open() - only the LATEST request may settle the
   *  editor, URL, and skeleton (rapid clicks B then C must land on C). */
  const openSeqRef = useRef(0);

  const open = useCallback(
    async (id: string, opts?: { skipParam?: boolean }) => {
      const seq = ++openSeqRef.current;
      setOpeningId(id);
      try {
        const detail = await api.design.getSystem(id);
        if (seq !== openSeqRef.current) return;
        setMode({ kind: "edit", detail });
        setEditorDirty(false);
        setError(null);
        if (!opts?.skipParam) setSystemParam(id);
      } catch (e) {
        if (seq !== openSeqRef.current) return;
        setError(e instanceof ApiError ? e.message : "Couldn't open that design system.");
      } finally {
        if (seq === openSeqRef.current) setOpeningId(null);
      }
    },
    [setSystemParam],
  );

  // Restore the ?system=<id> deep link once the initial load settles.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (loading || restoredRef.current) return;
    restoredRef.current = true;
    if (systemParam) void open(systemParam, { skipParam: true });
  }, [loading, systemParam, open]);

  const confirmDiscard = () =>
    !editorDirty ||
    window.confirm("Discard unsaved changes to this design system?");

  const select = (id: string) => {
    if (mode.kind === "edit" && mode.detail.id === id) return;
    if (!confirmDiscard()) return;
    void open(id);
  };

  const startNew = () => {
    if (mode.kind === "gallery") return;
    if (!confirmDiscard()) return;
    setMode({ kind: "gallery" });
    setEditorDirty(false);
    setSystemParam(null);
  };

  const pickTemplate = (template: DesignTemplate | null) => {
    setDraftNonce((n) => n + 1);
    setMode({
      kind: "draft",
      seed: template
        ? { css: template.css, components: template.components }
        : { css: "", components: [] as DesignSystemComponentInput[] },
    });
    setEditorDirty(false);
  };

  const onSaved = async (saved: DesignSystemDetail) => {
    // The save itself already succeeded - settle the editor on the saved
    // detail FIRST so a list-refresh failure can never read as a save failure
    // (a rethrow would leave a stale expected_updated_at behind, self-409ing
    // the next save, or duplicate the system on a create retry).
    setMode({ kind: "edit", detail: saved });
    setEditorDirty(false);
    if (systemParam !== saved.id) setSystemParam(saved.id);
    try {
      await loadSystems();
    } catch {
      toast.warning("Saved, but the list couldn't refresh - reload the page to see it in the list.");
    }
  };

  const onDeleted = async () => {
    await loadSystems();
    setMode({ kind: "list" });
    setEditorDirty(false);
    setSystemParam(null);
  };

  const onDomainsChanged = () => {
    void loadSystems();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return systems.filter(
      (s) =>
        (!q ||
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q)) &&
        (originFilter === "all" || s.origin === originFilter) &&
        (!domainFilter || s.domain_ids.includes(domainFilter)),
    );
  }, [systems, search, originFilter, domainFilter]);

  const hasFilters = search.trim() !== "" || originFilter !== "all" || domainFilter !== "";

  return (
    <Stack gap="5" className="mx-auto w-full max-w-6xl px-4 py-6">
      <Cluster justify="between" align="center" className="flex-wrap gap-3">
        <Cluster gap="2.5" align="center">
          <Palette className="size-5 text-[var(--primary)]" aria-hidden />
          <Stack gap="0">
            <h1 className="text-lg font-semibold text-[var(--text)]">Design tokens</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Reusable design systems, generated with AI or authored by hand, assignable to domains.
            </p>
          </Stack>
        </Cluster>
        <Button onClick={startNew}>
          <Plus className="size-4" />
          New design system
        </Button>
      </Cluster>

      {error && (
        <Card variant="elevated" className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        <Stack gap="3" className="min-w-0">
          <Stack gap="2">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-subtle)]"
                aria-hidden
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or description"
                aria-label="Search design systems"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
            <Cluster gap="1.5" align="center" className="flex-wrap">
              {ORIGIN_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={originFilter === f.id}
                  onClick={() => setOriginFilter(f.id)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    originFilter === f.id
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                  )}
                >
                  {f.label}
                </button>
              ))}
              {domains.length > 0 && (
                <select
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  aria-label="Filter by domain"
                  className="ml-auto max-w-[150px] truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="">All domains</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Cluster>
          </Stack>

          {loading ? (
            <Stack gap="2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--surface-2)]" />
              ))}
            </Stack>
          ) : systems.length === 0 ? (
            <EmptyState
              icon={<Palette className="size-5" />}
              title="No design systems yet"
              description="Start from a template, generate one with AI, or build it from your code."
              action={
                <Button size="sm" onClick={startNew}>
                  <Plus className="size-3.5" />
                  New design system
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title="No matches"
              description={
                hasFilters
                  ? "No design system matches these filters - clear the search or filters to see everything."
                  : "No design systems to show."
              }
            />
          ) : (
            <Stack gap="2" as="ul">
              {filtered.map((s) => (
                <SystemCard
                  key={s.id}
                  system={s}
                  active={mode.kind === "edit" && mode.detail.id === s.id}
                  onSelect={() => select(s.id)}
                />
              ))}
            </Stack>
          )}
        </Stack>

        <div className="min-w-0">
          {openingId !== null ? (
            <EditorSkeleton />
          ) : mode.kind === "list" ? (
            <Card variant="elevated">
              <EmptyState
                icon={<Palette className="size-5" />}
                title="Select or create a design system"
                description="Pick one on the left to edit, or create a new one from a template. Use AI to generate a full system from a prompt, then refine the tokens, components, or code."
                action={
                  <Button size="sm" variant="secondary" onClick={startNew}>
                    <Plus className="size-3.5" />
                    New design system
                  </Button>
                }
              />
            </Card>
          ) : mode.kind === "gallery" ? (
            <Card variant="elevated">
              <TemplateGallery onPick={pickTemplate} />
            </Card>
          ) : (
            <SystemEditor
              key={mode.kind === "edit" ? mode.detail.id : `draft-${draftNonce}`}
              detail={mode.kind === "edit" ? mode.detail : null}
              seed={mode.kind === "draft" ? mode.seed : null}
              domains={domains}
              repos={repos}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onDirtyChange={setEditorDirty}
              onDomainsChanged={onDomainsChanged}
            />
          )}
        </div>
      </div>
    </Stack>
  );
}

function SystemCard({
  system,
  active,
  onSelect,
}: {
  system: DesignSystemSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
          active
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
        )}
      >
        <Cluster justify="between" align="center" gap="2">
          <span className="truncate text-sm font-medium text-[var(--text)]">{system.name}</span>
          <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
            {system.origin}
          </span>
        </Cluster>
        {system.description && (
          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{system.description}</p>
        )}
        <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
          {system.domain_ids.length} domain{system.domain_ids.length === 1 ? "" : "s"}
          {" · "}
          {system.component_count} component{system.component_count === 1 ? "" : "s"}
          {" · "}
          updated {formatDateTime(system.updated_at)}
        </p>
      </button>
    </li>
  );
}

/** Content-shaped placeholder while a system's detail GET is in flight -
 *  mirrors the editor layout (AI panel, name fields, tabbed body, actions). */
function EditorSkeleton() {
  return (
    <Card variant="elevated" aria-hidden>
      <Stack gap="4">
        <div className="h-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <Stack gap="2">
          <div className="h-10 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-8 w-2/3 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <div className="h-8 animate-pulse border-b border-[var(--border)] bg-[var(--surface-2)]" />
          <div className="p-3">
            <div className="h-[420px] animate-pulse rounded-md bg-[var(--surface-2)]" />
          </div>
        </div>
        <Cluster gap="2" align="center">
          <div className="h-9 w-36 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Cluster>
      </Stack>
    </Card>
  );
}
