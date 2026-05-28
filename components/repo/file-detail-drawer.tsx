"use client";

/**
 * FileDetailDrawer — right-side slide-over for one `knowledge_nodes` file.
 * Fetches `/v1/repos/{repo}/files/{id}` once; renders meta strip + four
 * tabs (Summary / Symbols / Imports / TODOs). Mirrors `<CitationDrawer>`
 * patterns (Esc, backdrop, focus-on-Close, prefers-reduced-motion).
 */

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Hash, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type RepoFileDetail } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type DrawerTab = "summary" | "symbols" | "imports" | "todos";
const TABS: DrawerTab[] = ["summary", "symbols", "imports", "todos"];

export interface FileDetailDrawerProps {
  repoId: string;
  fileId: string;
  onClose: () => void;
  /** Echo an import name back into the parent's search field. */
  onImportClick?: (name: string) => void;
}

export function FileDetailDrawer({ repoId, fileId, onClose, onImportClick }: FileDetailDrawerProps) {
  const [detail, setDetail] = useState<RepoFileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>("summary");
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus-trap entry — land on Close so SR + keyboard users have a
  // dismiss path before any tab content is announced.
  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    api.repos.files.get(repoId, fileId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId, fileId]);

  const counts: Record<DrawerTab, number> = {
    summary: 0,
    symbols: detail?.symbols.length ?? 0,
    imports: detail?.imports.length ?? 0,
    todos: detail?.todos.length ?? 0,
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="file-detail-drawer">
      <button
        type="button"
        aria-label="Close file detail"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px] animate-in fade-in"
        data-testid="file-detail-drawer-backdrop"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[600px] flex-col",
          "border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl",
          "motion-safe:animate-in motion-safe:slide-in-from-right",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <DrawerHeader titleId={titleId} path={detail?.path ?? null} loading={loading} onClose={onClose} closeRef={closeRef} />
        <MetaStrip detail={detail} loading={loading} />
        <DrawerTabs tab={tab} counts={counts} onChange={setTab} />
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <Skeleton />}
          {!loading && error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
          {!loading && !error && detail &&
            <TabBody tab={tab} detail={detail} {...(onImportClick ? { onImportClick } : {})} />}
        </div>
      </aside>
    </div>
  );
}

function DrawerHeader({
  titleId, path, loading, onClose, closeRef,
}: {
  titleId: string; path: string | null; loading: boolean;
  onClose: () => void; closeRef: React.Ref<HTMLButtonElement>;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
      <Stack gap="0" className="min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">File</span>
        <code id={titleId} className="truncate font-mono text-xs text-[var(--text)]" title={path ?? undefined}>
          {loading ? "Loading…" : (path ?? "—")}
        </code>
      </Stack>
      <Cluster gap="1" align="center">
        <a
          href={path ? `#kg-${encodeURIComponent(path)}` : "#"}
          className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          data-testid="file-detail-open-in-graph"
        >
          <ExternalLink className="size-3.5" aria-hidden /> Open in graph
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close file detail"
          className="rounded-md p-1 min-h-7 min-w-7 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </Cluster>
    </header>
  );
}

function MetaStrip({ detail, loading }: { detail: RepoFileDetail | null; loading: boolean }) {
  if (loading || !detail) {
    return (
      <div className="flex gap-1.5 border-b border-[var(--border)] px-4 py-2" aria-busy={loading}>
        {[...Array(3)].map((_, i) => <span key={i} className="h-5 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />)}
      </div>
    );
  }
  const chips: Array<[string, string | null | undefined]> = [
    ["lang", detail.language], ["layer", detail.layer], ["parser", detail.parser],
    ["loc", detail.loc ? detail.loc.toLocaleString() : null],
    ["sha", detail.indexed_branch_sha ? detail.indexed_branch_sha.slice(0, 7) : null],
  ];
  return (
    <Cluster gap="1.5" align="center" className="border-b border-[var(--border)] px-4 py-2">
      {chips.map(([label, value]) => value ? (
        <span key={label}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
          data-testid={`file-detail-chip-${label}`}>
          <span className="uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
          <span className="font-mono text-[var(--text)]">{value}</span>
        </span>
      ) : null)}
    </Cluster>
  );
}

function DrawerTabs({
  tab, counts, onChange,
}: { tab: DrawerTab; counts: Record<DrawerTab, number>; onChange: (t: DrawerTab) => void }) {
  return (
    <nav role="tablist" aria-label="File detail tabs" className="flex gap-1 border-b border-[var(--border)] px-2">
      {TABS.map((t) => {
        const active = tab === t;
        const showBadge = t !== "summary" && counts[t] > 0;
        return (
          <button key={t} role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
            onClick={() => onChange(t)} data-tab={t}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              active ? "border-[var(--primary)] text-[var(--text)]"
                     : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
            )}>
            <span className="capitalize">{t}</span>
            {showBadge && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--surface-2)] px-1.5 text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
                {counts[t]}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function TabBody({
  tab, detail, onImportClick,
}: { tab: DrawerTab; detail: RepoFileDetail; onImportClick?: (name: string) => void }) {
  if (tab === "summary") {
    return detail.summary ? (
      <pre className="whitespace-pre-wrap rounded-md bg-[var(--code-bg)] p-3 font-mono text-xs leading-relaxed text-[var(--text)]">
        {detail.summary}
      </pre>
    ) : <Blank label="No summary captured for this file." />;
  }
  if (tab === "symbols") {
    return detail.symbols.length === 0 ? <Blank label="No symbols extracted." /> : (
      <Cluster gap="1.5" align="center">
        {detail.symbols.map((s) => (
          <code key={s} data-testid="file-detail-symbol"
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--text)]">
            {s}
          </code>
        ))}
      </Cluster>
    );
  }
  if (tab === "imports") {
    return detail.imports.length === 0 ? <Blank label="No imports captured." /> : (
      <Stack gap="1" as="ul">
        {detail.imports.map((imp) => (
          <li key={imp}>
            <button type="button" onClick={() => onImportClick?.(imp)} data-testid="file-detail-import"
              className="block w-full min-h-7 truncate rounded-md px-2 py-1 text-left font-mono text-xs text-[var(--text)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
              {imp}
            </button>
          </li>
        ))}
      </Stack>
    );
  }
  return detail.todos.length === 0 ? <Blank label="No TODOs flagged." /> : (
    <Stack gap="1" as="ul">
      {detail.todos.map((t, i) => (
        <li key={i} data-testid="file-detail-todo"
          className="flex items-start gap-2 rounded-md px-2 py-1 text-xs text-[var(--text)]">
          <Hash className="mt-0.5 size-3 shrink-0 text-[var(--text-subtle)]" aria-hidden />
          <span className="whitespace-pre-wrap leading-relaxed">{t}</span>
        </li>
      ))}
    </Stack>
  );
}

const Blank = ({ label }: { label: string }) => <p className="text-sm italic text-[var(--text-muted)]">{label}</p>;

function Skeleton() {
  return (
    <Stack gap="2" aria-busy="true">
      {["h-3 w-1/2", "h-24 w-full", "h-3 w-1/3"].map((c, i) =>
        <div key={i} className={`${c} animate-pulse rounded-md bg-[var(--surface-2)]`} />)}
    </Stack>
  );
}
