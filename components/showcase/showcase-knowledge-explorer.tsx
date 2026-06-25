"use client";

/**
 * ShowcaseKnowledgeExplorer - the public, fullscreen topology surface for a
 * showcase repo. Opened from the repo page's "Knowledge explorer" button, it
 * reuses the EXACT same Cytoscape `<KnowledgeGraph>` + `explorer-graph.ts` pure
 * state machine the authenticated app uses - the only difference is the data
 * source: instead of the authenticated `api.knowledge.*` endpoints it derives
 * the seed + on-demand expansion from the public showcase payloads (see
 * `showcase-graph.ts`).
 *
 * Layout mirrors the app's full-screen topology view: the graph fills the left
 * (~68%) and the selected node's detail the right (~32%), with a draggable
 * divider between them. The repo root is selected on open; clicking any node
 * focuses it, pulls its 1-hop neighbours (from its dossier) into the graph, and
 * renders its dossier on the right via the shared `<ShowcaseNodeView>`. Esc or
 * the close button exits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, Sparkles, X } from "lucide-react";

import {
  showcaseApi,
  type ShowcaseNodeDossier,
  type ShowcaseRepoDetail,
  type ShowcaseTreeNode,
} from "@/lib/api/public-client";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KnowledgeGraph } from "@/components/topology/graph/knowledge-graph";
import {
  enforceBounds,
  mergeNeighbors,
  seedGraph,
  selectNode,
  toGraphElements,
  type GraphState,
} from "@/components/topology/explorer/explorer-graph";
import { isSyntheticId } from "@/components/topology/explorer/scope-seed";
import { ShowcaseNodeView } from "@/components/showcase/showcase-node-view";
import {
  neighborsFromDossier,
  nodeFromDossier,
  seedShowcaseRepo,
} from "@/components/showcase/showcase-graph";
import { compact } from "@/components/showcase/format";

/** Full-screen split: graph keeps `leftPct`% of the row, detail the rest. */
const SPLIT_MIN = 50;
const SPLIT_MAX = 82;
const SPLIT_DEFAULT = 68;
const clampSplit = (p: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, p));

interface ShowcaseKnowledgeExplorerProps {
  /** The repo ref (slug / id) used for the public node-dossier fetch. */
  repoRef: string;
  detail: ShowcaseRepoDetail;
  tree: ShowcaseTreeNode | null;
  onClose: () => void;
}

/** Local store: seed → select → expand(fetch dossier) → merge neighbours. A
 *  thin shell over the pure `explorer-graph.ts` functions + the public dossier
 *  fetch (the public stand-in for the app's authenticated neighbour endpoint). */
function useShowcaseGraph(repoRef: string, detail: ShowcaseRepoDetail, tree: ShowcaseTreeNode | null) {
  const seed = useMemo(() => seedShowcaseRepo(detail, tree), [detail, tree]);
  const [graph, setGraph] = useState<GraphState>(() => seedGraph(seed));
  const [selectedId, setSelectedId] = useState<string | null>(seed.rootId);
  const [expanding, setExpanding] = useState<Set<string>>(new Set());
  const [dossiers, setDossiers] = useState<Map<string, ShowcaseNodeDossier>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // Read synchronously inside the async expand without re-binding it.
  const expandedRef = useRef<Set<string>>(new Set());

  const expand = useCallback(
    async (id: string) => {
      if (isSyntheticId(id) || expandedRef.current.has(id)) return;
      expandedRef.current.add(id);
      setExpanding((s) => new Set(s).add(id));
      try {
        const d = await showcaseApi.node(repoRef, id);
        setDossiers((m) => new Map(m).set(id, d));
        // Inject the focus node itself (off-graph hops from detail chips) then
        // fold its neighbourhood in, bounded to keep the canvas under its cap.
        setGraph((g) =>
          enforceBounds(mergeNeighbors(selectNode(g, id, { stub: nodeFromDossier(d) }), id, neighborsFromDossier(d))),
        );
      } catch {
        expandedRef.current.delete(id); // allow a later retry
        setFailed((s) => new Set(s).add(id));
      } finally {
        setExpanding((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [repoRef],
  );

  const select = useCallback((id: string | null) => {
    setSelectedId((prev) => (prev === id ? prev : id));
  }, []);

  // The one side-effect site: focus the graph on the selection then expand it.
  useEffect(() => {
    const id = selectedId;
    if (!id) return;
    setGraph((g) => selectNode(g, id));
    if (!isSyntheticId(id)) void expand(id);
  }, [selectedId, expand]);

  const elements = useMemo(() => toGraphElements(graph), [graph]);
  return { elements, selectedId, select, expanding, dossiers, failed, rootId: seed.rootId };
}

export function ShowcaseKnowledgeExplorer({ repoRef, detail, tree, onClose }: ShowcaseKnowledgeExplorerProps) {
  const { elements, selectedId, select, expanding, dossiers, failed, rootId } = useShowcaseGraph(
    repoRef,
    detail,
    tree,
  );

  const [leftPct, setLeftPct] = useState(SPLIT_DEFAULT);
  const [isDesktop, setIsDesktop] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  // Esc + scroll-lock + focus while the overlay is mounted.
  useEffect(() => {
    rootRef.current?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Track the lg breakpoint so the grid template matches the responsive layout.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Divider drag - translate pointer-x into a clamped split across the row. The
  // graph's ResizeObserver reflows its canvas live as the columns change.
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const g = graphRef.current;
    const d = detailRef.current;
    if (!g || !d) return;
    const rowLeft = g.getBoundingClientRect().left;
    const span = d.getBoundingClientRect().right - rowLeft;
    if (span <= 0) return;
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      setLeftPct(clampSplit(((ev.clientX - rowLeft) / span) * 100));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const onHandleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setLeftPct((p) => clampSplit(p - 2));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setLeftPct((p) => clampSplit(p + 2));
    } else if (e.key === "Home") {
      e.preventDefault();
      setLeftPct(SPLIT_DEFAULT);
    }
  }, []);

  const gridStyle: React.CSSProperties = isDesktop
    ? {
        gridTemplateColumns: `${leftPct}fr 0.75rem ${100 - leftPct}fr`,
        gridTemplateRows: "minmax(0, 1fr)",
        gridTemplateAreas: `"graph divider detail"`,
      }
    : {
        gridTemplateRows: "minmax(0, 1fr) minmax(0, 16rem)",
        gridTemplateAreas: `"graph" "detail"`,
      };

  const isRoot = selectedId === null || selectedId === rootId;
  const dossier = selectedId ? dossiers.get(selectedId) : undefined;
  const detailLoading = !isRoot && !dossier && !!selectedId && (expanding.has(selectedId) || !failed.has(selectedId));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal
      aria-label={`Knowledge explorer - ${detail.full_name}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid gap-3 overflow-hidden bg-[var(--bg)]/95 p-4 outline-none backdrop-blur-xl sm:p-6 lg:gap-x-0"
      style={gridStyle}
    >
      {/* close - overlay corner, stays put while the detail panel scrolls */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close knowledge explorer"
        title="Close (Esc)"
        className="absolute right-4 top-4 z-20 flex size-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--text-muted)] shadow-[var(--shadow-2)] backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:right-6 sm:top-6"
      >
        <X className="size-4" aria-hidden />
      </button>

      {/* graph - the same Cytoscape engine the app uses */}
      <div ref={graphRef} className="[grid-area:graph] min-h-0 min-w-0">
        <KnowledgeGraph
          nodes={elements.nodes}
          links={elements.links}
          selectedId={selectedId}
          onSelect={(id) => select(id)}
          onExpand={(id) => select(id)}
          busy={!!selectedId && expanding.has(selectedId)}
          layout="cose"
          fill
          wrapperTestId="showcase-explorer-graph"
          emptyTestId="showcase-explorer-graph-empty"
          emptyTitle="No topology yet"
          emptyDescription="This repository has no indexed knowledge to explore."
        />
      </div>

      {/* draggable divider - desktop only */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize graph and detail panels"
        aria-valuenow={Math.round(leftPct)}
        aria-valuemin={SPLIT_MIN}
        aria-valuemax={SPLIT_MAX}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={onHandleKey}
        className="group/handle relative hidden touch-none cursor-col-resize select-none items-center justify-center rounded [grid-area:divider] focus-visible:outline-none lg:flex"
      >
        <span className="h-16 w-1 rounded-full bg-[var(--border-strong)] transition-colors duration-150 group-hover/handle:bg-[var(--primary)] group-focus-visible/handle:bg-[var(--primary)]" />
      </div>

      {/* detail - the selected node's dossier (or the repo overview at root) */}
      <div ref={detailRef} className="[grid-area:detail] min-h-0 min-w-0 overflow-y-auto">
        {isRoot ? (
          <RepoOverview detail={detail} />
        ) : dossier ? (
          <Card variant="elevated" className="p-5 pt-12">
            <ShowcaseNodeView node={dossier} onBack={() => select(rootId)} onNav={(id) => select(id)} />
          </Card>
        ) : detailLoading ? (
          <NodeSkeleton />
        ) : (
          <Card variant="elevated" className="p-5 pt-12">
            <EmptyState
              title="Knowledge unavailable"
              description="This node has no dossier to show. Pick another node on the graph."
            />
          </Card>
        )}
      </div>
    </div>
  );
}

/** Detail-panel content while nothing (or the repo root) is selected. */
function RepoOverview({ detail }: { detail: ShowcaseRepoDetail }) {
  const m = detail.metrics;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Knowledge nodes", value: compact(m.node_count) },
    { label: "Relationships", value: compact(m.edge_count) },
    { label: "Files", value: compact(m.files_indexed) },
    { label: "Lines of code", value: compact(m.lines_of_code) },
  ];
  return (
    <Card variant="elevated" className="flex flex-col gap-5 p-5 pt-12">
      <header className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Repository</span>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">{detail.full_name}</h2>
        {detail.summary && <p className="text-sm leading-relaxed text-[var(--text-muted)]">{detail.summary}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-[var(--surface-2)] p-3">
            <dd className="text-lg font-semibold tabular-nums leading-none text-[var(--text)]">{s.value}</dd>
            <dt className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
              {s.label}
            </dt>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {m.primary_language && (
          <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--primary)]">
            {m.primary_language}
          </span>
        )}
        {m.architectural_pattern && (
          <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--primary)]">
            {m.architectural_pattern}
          </span>
        )}
      </div>

      <p className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-3 text-xs text-[var(--text-muted)]">
        <Sparkles className="size-4 shrink-0 text-[var(--primary)]" aria-hidden />
        Click any node to focus it and pull in its connections. Double-click to expand a leaf.
      </p>
    </Card>
  );
}

function NodeSkeleton() {
  return (
    <Card variant="elevated" className="flex animate-pulse flex-col gap-4 p-5 pt-12">
      <div className="h-6 w-44 rounded bg-[var(--surface-2)]" />
      <div className="h-20 w-full rounded bg-[var(--surface-2)]" />
      <div className="h-32 w-full rounded bg-[var(--surface-2)]" />
    </Card>
  );
}

/** The trigger button placed on the repo page; exported here so the page stays
 *  thin. Renders the explorer overlay on click. */
export function ShowcaseKnowledgeExplorerButton({
  repoRef,
  detail,
  tree,
}: {
  repoRef: string;
  detail: ShowcaseRepoDetail;
  tree: ShowcaseTreeNode | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 bg-[var(--primary-soft)] px-3 py-1.5 text-sm font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Network className="size-3.5" aria-hidden /> Knowledge explorer
      </button>
      {open && (
        <ShowcaseKnowledgeExplorer repoRef={repoRef} detail={detail} tree={tree} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
