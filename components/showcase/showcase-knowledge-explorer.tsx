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
 * The graph is FOLDER-FIRST: it seeds from the repo's directory tree, so the
 * spine you explore is the actual folder hierarchy. A directory that holds
 * files is a real `module` node (selecting it shows its generated blueprint);
 * pass-through intermediate dirs are synthesised `folder:<path>` nodes (no
 * blueprint - their detail lists their contents). Folder expansion is a pure
 * client-side reveal from the tree (the public tree endpoint returns it whole);
 * file expansion fetches that file's dossier for its code relations.
 *
 * Layout mirrors the app's full-screen topology view: the graph fills the left
 * (~68%) and the selected node's detail the right (~32%), with a draggable
 * divider between them. The repo root is selected on open. Esc or the close
 * button exits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileCode2, Folder, Network, X } from "lucide-react";

import {
  showcaseApi,
  type ShowcaseNodeDossier,
  type ShowcaseRepoDetail,
  type ShowcaseTreeNode,
} from "@/lib/api/public-client";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
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
import { scopeRootId } from "@/components/topology/explorer/scope-seed";
import { ShowcaseNodeView } from "@/components/showcase/showcase-node-view";
import { ShowcaseBlueprint } from "@/components/showcase/showcase-blueprint";
import { ShowcaseComponents } from "@/components/showcase/showcase-components";
import {
  buildTreeIndex,
  folderChildren,
  graphIdOf,
  isFolderNodeId,
  neighborsFromDossier,
  nodeFromDossier,
  seedShowcaseRepo,
  seedShowcaseTree,
} from "@/components/showcase/showcase-graph";

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

/** Local store over the pure `explorer-graph.ts` functions. Two expansion
 *  sources: FOLDERS reveal their tree children client-side (no fetch); FILES
 *  (and off-tree refs) fetch a dossier - the public stand-in for the app's
 *  authenticated neighbour endpoint - which also backs the detail panel. */
function useShowcaseGraph(repoRef: string, detail: ShowcaseRepoDetail, tree: ShowcaseTreeNode | null) {
  const rootId = useMemo(() => scopeRootId("repo", detail.repo_id), [detail.repo_id]);
  const seed = useMemo(
    () => (tree ? seedShowcaseTree(detail.repo_id, tree) : seedShowcaseRepo(detail, null)),
    [detail, tree],
  );
  const treeIndex = useMemo(
    () => (tree ? buildTreeIndex(rootId, tree) : new Map<string, ShowcaseTreeNode>()),
    [tree, rootId],
  );

  const [graph, setGraph] = useState<GraphState>(() => seedGraph(seed));
  const [selectedId, setSelectedId] = useState<string | null>(seed.rootId);
  const [expanding, setExpanding] = useState<Set<string>>(new Set());
  const [dossiers, setDossiers] = useState<Map<string, ShowcaseNodeDossier>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // Read synchronously inside async callbacks without re-binding them. Root's
  // children are already in the seed, so it counts as expanded.
  const expandedRef = useRef<Set<string>>(new Set([seed.rootId]));
  const dossierRef = useRef<Map<string, ShowcaseNodeDossier | null>>(new Map());

  /** Fetch + cache a node's dossier (files / module folders / off-tree refs). */
  const ensureDossier = useCallback(
    async (id: string): Promise<ShowcaseNodeDossier | null> => {
      const cached = dossierRef.current.get(id);
      if (cached !== undefined) return cached;
      try {
        const d = await showcaseApi.node(repoRef, id);
        dossierRef.current.set(id, d);
        setDossiers((m) => new Map(m).set(id, d));
        return d;
      } catch {
        dossierRef.current.set(id, null);
        setFailed((s) => new Set(s).add(id));
        return null;
      }
    },
    [repoRef],
  );

  const expand = useCallback(
    async (id: string) => {
      if (expandedRef.current.has(id)) return;
      const node = treeIndex.get(id);
      // Folder (real module or synthetic) → reveal its tree children, no fetch.
      if (node && node.kind !== "file") {
        expandedRef.current.add(id);
        setGraph((g) => enforceBounds(mergeNeighbors(g, id, folderChildren(node, rootId))));
        return;
      }
      // File / off-tree ref → fetch its dossier, derive its code relations.
      expandedRef.current.add(id);
      setExpanding((s) => new Set(s).add(id));
      try {
        const d = await ensureDossier(id);
        if (d) {
          // Inject the focus node itself (off-graph chip hops) then fold its
          // neighbourhood in, bounded to keep the canvas under its cap.
          setGraph((g) =>
            enforceBounds(mergeNeighbors(selectNode(g, id, { stub: nodeFromDossier(d) }), id, neighborsFromDossier(d))),
          );
        } else {
          expandedRef.current.delete(id); // allow a later retry
        }
      } finally {
        setExpanding((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [treeIndex, rootId, ensureDossier],
  );

  const select = useCallback((id: string | null) => {
    setSelectedId((prev) => (prev === id ? prev : id));
  }, []);

  // The one side-effect site: focus the graph on the selection, expand it, and
  // - for a module folder, whose graph-expand uses the tree, not a fetch - pull
  // its dossier so the detail panel can render its blueprint.
  useEffect(() => {
    const id = selectedId;
    if (!id) return;
    setGraph((g) => selectNode(g, id));
    if (id === rootId) return; // root → blueprint; children already seeded
    void expand(id);
    const node = treeIndex.get(id);
    if (!isFolderNodeId(id) && node && node.kind !== "file") void ensureDossier(id);
  }, [selectedId, expand, ensureDossier, rootId, treeIndex]);

  const elements = useMemo(() => toGraphElements(graph), [graph]);
  return { elements, selectedId, select, expanding, dossiers, failed, rootId, treeIndex };
}

export function ShowcaseKnowledgeExplorer({ repoRef, detail, tree, onClose }: ShowcaseKnowledgeExplorerProps) {
  const { elements, selectedId, select, expanding, dossiers, failed, rootId, treeIndex } = useShowcaseGraph(
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
  const isFolder = !!selectedId && isFolderNodeId(selectedId);
  const folderNode = selectedId ? treeIndex.get(selectedId) : undefined;
  const dossier = selectedId ? dossiers.get(selectedId) : undefined;
  const detailLoading =
    !isRoot && !isFolder && !dossier && !!selectedId && (expanding.has(selectedId) || !failed.has(selectedId));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal
      aria-label={`Knowledge explorer - ${detail.full_name}`}
      tabIndex={-1}
      className="fixed inset-0 z-[var(--z-overlay)] grid gap-3 overflow-hidden bg-[var(--bg)]/95 p-4 outline-none backdrop-blur-xl sm:p-6 lg:gap-x-0"
      style={gridStyle}
    >
      {/* close - overlay corner, stays put while the detail panel scrolls */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close knowledge explorer"
        title="Close (Esc)"
        className="glass-panel absolute right-4 top-4 z-20 flex size-8 items-center justify-center text-[var(--text-muted)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:right-6 sm:top-6"
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
          <Card variant="elevated" className="p-5 pt-12">
            <header className="mb-6 flex flex-col gap-1">
              <Eyebrow>Repository</Eyebrow>
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">{detail.full_name}</h2>
            </header>
            <ShowcaseBlueprint summary={detail.summary} sections={detail.sections} onNode={(id) => select(id)} />
            <ShowcaseComponents components={detail.components} onNode={(id) => select(id)} />
          </Card>
        ) : isFolder ? (
          <FolderCard node={folderNode} rootId={rootId} onSelect={select} />
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

/** Detail for a synthesised folder node (a pass-through directory with no
 *  generated blueprint): its path, child counts, and clickable contents. */
function FolderCard({
  node,
  rootId,
  onSelect,
}: {
  node: ShowcaseTreeNode | undefined;
  rootId: string;
  onSelect: (id: string) => void;
}) {
  if (!node) {
    return (
      <Card variant="elevated" className="p-5 pt-12">
        <EmptyState title="Folder" description="No contents were indexed for this directory." />
      </Card>
    );
  }
  const dirs = node.children.filter((c) => c.kind === "dir");
  const files = node.children.filter((c) => c.kind === "file");
  return (
    <Card variant="elevated" className="flex flex-col gap-4 p-5 pt-12">
      <header className="flex flex-col gap-1">
        <Eyebrow>Folder</Eyebrow>
        <h2 className="break-all font-mono text-lg font-semibold text-[var(--text)]">{node.path || node.name}</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {dirs.length} subfolder{dirs.length === 1 ? "" : "s"} · {files.length} file{files.length === 1 ? "" : "s"}
        </p>
      </header>

      {node.children.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Contents</h3>
          <div className="flex flex-wrap gap-1.5">
            {node.children.slice(0, 100).map((c) => (
              <button
                key={graphIdOf(c, rootId)}
                type="button"
                onClick={() => onSelect(graphIdOf(c, rootId))}
                title={c.path}
                className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              >
                {c.kind === "dir" ? (
                  <Folder className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
                ) : (
                  <FileCode2 className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
                )}
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
        This is an intermediate directory. Open a folder that holds source files to see its generated blueprint.
      </p>
    </Card>
  );
}

function NodeSkeleton() {
  return (
    <Card variant="elevated" className="flex flex-col gap-4 p-5 pt-12" aria-hidden>
      <div className="skeleton h-6 w-44" />
      <div className="skeleton h-20 w-full" />
      <div className="skeleton h-32 w-full" />
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
