"use client";

/**
 * FileDetailDrawer - right-side slide-over for one `knowledge_nodes` file.
 * Fetches BOTH the file row (`/v1/repos/{repo}/files/{id}`) and its full KG
 * dossier (`/v1/knowledge/nodes/{id}` - a file's repo-file id IS its node id),
 * so the Overview tab renders the whole at-a-glance card (headline / what /
 * architecture / responsibilities / diagram / folded symbol elements /
 * relations / see-also) via the shared `<NodeDossierBody>`, not just the flat
 * summary. The remaining tabs are focused drill-downs (Content / Symbols /
 * Imports / TODOs / graph-walk panels). Mirrors `<CitationDrawer>` patterns
 * (Esc, backdrop, focus-on-Close, prefers-reduced-motion).
 */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Hash, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type RepoFileDetail, type NodeDossierResponse } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { FileDependentsPanel } from "@/components/repo/file-dependents-panel";
import { FileContentViewer } from "@/components/repo/file-content-viewer";
import { NodeDossierBody } from "@/components/knowledge/node-dossier-body";
import { useNodeDossier } from "@/components/knowledge/node-dossier-context";

type DrawerTab =
  | "content"
  | "summary"
  | "symbols"
  | "imports"
  | "todos"
  | "dependents"
  | "dependencies"
  | "neighborhood";
const TABS: DrawerTab[] = [
  "summary",
  "content",
  "symbols",
  "imports",
  "todos",
  "dependents",
  "dependencies",
  "neighborhood",
];

const _TAB_LABEL: Record<DrawerTab, string> = {
  content: "Content",
  summary: "Overview",
  symbols: "Symbols",
  imports: "Imports",
  todos: "TODOs",
  dependents: "Dependents",
  dependencies: "Dependencies",
  neighborhood: "Slice",
};

interface FileDetailDrawerProps {
  repoId: string;
  fileId: string;
  onClose: () => void;
  /** Echo an import name back into the parent's search field. */
  onImportClick?: (name: string) => void;
  /** Replace the drawer's `fileId` (caller owns routing). Used by the
   *  dependents / dependencies / neighborhood panels to navigate to a
   *  picked peer file without closing the drawer. */
  onNavigateFile?: (fileId: string) => void;
}

export function FileDetailDrawer({ repoId, fileId, onClose, onImportClick, onNavigateFile }: FileDetailDrawerProps) {
  const [detail, setDetail] = useState<RepoFileDetail | null>(null);
  const [dossierRes, setDossierRes] = useState<NodeDossierResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>("summary");
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  // "Open in graph" → switch to the repo Topology tab with this file
  // focused, so the imports graph highlights it (was a dead `#kg-…`
  // anchor that only mutated the URL hash and opened nothing).
  //
  // Close FIRST, navigate LAST: when the parent's `onClose` is URL-backed
  // (file-browser's `?focus`), it issues its own history write; the tab-switch
  // navigation must be the final write or the close would clobber it. The
  // merge base is the live URL so it never drops a concurrently-set param.
  const openInGraph = () => {
    onClose();
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", "topology");
    sp.set("focus", fileId);
    router.push(`?${sp.toString()}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus-trap entry - land on Close so SR + keyboard users have a
  // dismiss path before any tab content is announced.
  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setDetail(null); setDossierRes(null);
    // The file row is required (drives header / meta / focused tabs); the
    // dossier is best-effort enrichment for the Overview tab - a leaf payload,
    // an un-enriched node, or a 404 just falls back to the flat summary.
    Promise.allSettled([
      api.repos.files.get(repoId, fileId),
      api.knowledge.node(fileId),
    ]).then(([detailRes, nodeRes]) => {
      if (cancelled) return;
      if (detailRes.status === "fulfilled") setDetail(detailRes.value);
      else setError(detailRes.reason instanceof Error ? detailRes.reason.message : "Failed to load file");
      if (nodeRes.status === "fulfilled") setDossierRes(nodeRes.value);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId, fileId]);

  const counts: Record<DrawerTab, number> = {
    content: 0,
    summary: 0,
    symbols: detail?.symbols.length ?? 0,
    imports: detail?.imports.length ?? 0,
    todos: detail?.todos.length ?? 0,
    dependents: 0,
    dependencies: 0,
    neighborhood: 0,
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="file-detail-drawer">
      <button
        type="button"
        aria-label="Close file detail"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm animate-in fade-in"
        data-testid="file-detail-drawer-backdrop"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[600px] flex-col",
          "glass border-l border-[var(--border-strong)] shadow-[var(--shadow-3)]",
          "motion-safe:animate-in motion-safe:slide-in-from-right",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <DrawerHeader titleId={titleId} path={detail?.path ?? null} loading={loading} onClose={onClose} closeRef={closeRef} onOpenInGraph={openInGraph} />
        <MetaStrip detail={detail} loading={loading} />
        <DrawerTabs tab={tab} counts={counts} onChange={setTab} />
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <Skeleton />}
          {!loading && error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
          {!loading && !error && detail && (
            <TabBody
              tab={tab}
              detail={detail}
              dossierRes={dossierRes}
              repoId={repoId}
              fileId={fileId}
              {...(onImportClick ? { onImportClick } : {})}
              {...(onNavigateFile ? { onNavigateFile } : {})}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function DrawerHeader({
  titleId, path, loading, onClose, closeRef, onOpenInGraph,
}: {
  titleId: string; path: string | null; loading: boolean;
  onClose: () => void; closeRef: React.Ref<HTMLButtonElement>;
  onOpenInGraph: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-4 py-3 shadow-[var(--inner-highlight)]">
      <Stack gap="0" className="min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">File</span>
        <code id={titleId} className="truncate font-mono text-xs text-[var(--text)]" title={path ?? undefined}>
          {loading ? "Loading…" : (path ?? "-")}
        </code>
      </Stack>
      <Cluster gap="1" align="center">
        <button
          type="button"
          onClick={onOpenInGraph}
          disabled={!path}
          title="Show this file in the repo topology graph"
          className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="file-detail-open-in-graph"
        >
          <ExternalLink className="size-3.5" aria-hidden /> Open in graph
        </button>
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
    <nav
      role="tablist"
      aria-label="File detail tabs"
      className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-2"
    >
      {TABS.map((t) => {
        const active = tab === t;
        const showBadge = !["content", "summary", "dependents", "dependencies", "neighborhood"].includes(t) && counts[t] > 0;
        return (
          <button key={t} role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
            onClick={() => onChange(t)} data-tab={t}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium",
              "transition-[color,background-color,border-color] duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                     : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            )}>
            <span>{_TAB_LABEL[t]}</span>
            {showBadge && (
              <span className={cn(
                "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                active ? "bg-[var(--primary)] text-[var(--primary-fg)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]",
              )}>
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
  tab, detail, dossierRes, repoId, fileId, onImportClick, onNavigateFile,
}: {
  tab: DrawerTab;
  detail: RepoFileDetail;
  dossierRes: NodeDossierResponse | null;
  repoId: string;
  fileId: string;
  onImportClick?: (name: string) => void;
  onNavigateFile?: (fileId: string) => void;
}) {
  // Overview ref clicks (relations / contains / see-also) open the shared
  // global node-dossier drawer on top, with its own back-stack.
  const { open: openDossier } = useNodeDossier();
  if (tab === "content") {
    return <FileContentViewer repoId={repoId} fileId={fileId} />;
  }
  if (tab === "dependents") {
    return (
      <FileDependentsPanel
        repoId={repoId}
        fileId={fileId}
        mode="dependents"
        {...(onNavigateFile ? { onNavigate: onNavigateFile } : {})}
      />
    );
  }
  if (tab === "dependencies") {
    return (
      <FileDependentsPanel
        repoId={repoId}
        fileId={fileId}
        mode="dependencies"
        {...(onNavigateFile ? { onNavigate: onNavigateFile } : {})}
      />
    );
  }
  if (tab === "neighborhood") {
    return (
      <FileDependentsPanel
        repoId={repoId}
        fileId={fileId}
        mode="neighborhood"
        {...(onNavigateFile ? { onNavigate: onNavigateFile } : {})}
      />
    );
  }
  if (tab === "summary") {
    // Rich dossier when the node was enriched (the common case); otherwise fall
    // back to the flat summary so the tab is never blank.
    if (dossierRes?.dossier) {
      return (
        <NodeDossierBody
          res={dossierRes}
          fileTarget={null}
          loading={false}
          onNavigate={openDossier}
        />
      );
    }
    return detail.summary ? (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
        {detail.summary}
      </p>
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
