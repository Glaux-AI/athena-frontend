"use client";

/**
 * KnowledgeGraphCanvas — the one interactive graph surface shared by every
 * knowledge scope (org capability-dependencies, capability entity graph,
 * `/knowledge/graph` explorer). Replaces the static SVG `KnowledgeMiniGraph`
 * and the band-scatter `EntityGraphReactFlow` layout.
 *
 * What makes it interactive (the thing the old surfaces lacked):
 *   - Pan / zoom / fit-to-view + minimap (React Flow).
 *   - Real layered layout (`lib/graph/layout.ts`), not index-in-row scatter.
 *   - Click a node → `onSelect`; selection + hover highlight the 1-hop
 *     neighbourhood and fade the rest, so structure is legible.
 *   - `focusId` zooms-to a node (drives the Cmd-K `?focus=` deep-link and
 *     search-to-focus).
 *   - `overlay` paints a blast-radius (changed / affected) without changing
 *     which datapoint lives where (ADR-073 canonical homes preserved — each
 *     caller still feeds its own scope's data).
 *
 * Nodes are deliberately non-draggable: the layout is authoritative and the
 * user navigates rather than rearranges. `prefers-reduced-motion` disables
 * pan/zoom and snaps to fit-view, mirrored onto the wrapper for tests.
 *
 * Theming uses inline OKLCH/token strings because React Flow consumes SVG
 * fills, not class names (same carve-out the prior graph components used).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Handle,
  Panel,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";

import { EmptyState } from "@/components/ui/empty-state";
import { forceLayout, layeredLayout } from "@/lib/graph/layout";

export interface CanvasNode {
  id: string;
  label: string;
  /** Drives node colour + the uppercase kind label. */
  kind: string;
  /** Path / repo / layer line under the label. */
  sublabel?: string | null;
  /** Explicit row (0 = top). Omit to let edges decide the layering. */
  band?: number | null;
  /** 0–1; scales node width so important nodes read larger. */
  importance?: number | null;
  /** Small pill top-right (e.g. node count). */
  badge?: string | null;
}

export interface CanvasEdge {
  source: string;
  target: string;
  kind?: string | undefined;
  style?: "solid" | "dashed" | undefined;
  /** Cross-repo edge (kg_org_edges) — rendered dashed + accented. */
  crossRepo?: boolean | undefined;
  /** Edge confidence 0–1 (behavioral + cross-repo edges). */
  confidence?: number | null | undefined;
  /** Service/module-altitude rollup edge — aggregates `weight` underlying
   *  edges; rendered thicker + always-labelled. */
  rolledUp?: boolean | undefined;
  weight?: number | null | undefined;
}

export type OverlayRole = "changed" | "affected";

interface KnowledgeGraphCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Zoom-to this node when it changes. */
  focusId?: string | null;
  /** Blast-radius / diff overlay: node id → role. When set, non-overlay
   *  nodes fade and overlay nodes get a coloured ring. */
  overlay?: Map<string, OverlayRole> | null;
  /** Layout engine. "force" (default) is a 2D force-directed spread — right
   *  for dense graphs where nodes share a kind (e.g. a repo's symbol graph).
   *  "layered" is top-down by `band` — right for small, clearly-tiered
   *  graphs (a handful of capabilities or layer-banded entities). */
  layout?: "force" | "layered";
  height?: number;
  wrapperTestId?: string;
  emptyTestId?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Per-node test id (kept for the explorer's existing tier assertions). */
  nodeTestId?: (node: CanvasNode) => string;
}

/* ---- kind → colour. Covers the union of kinds across all scopes. ---- */
const KIND_COLOR: Record<string, string> = {
  // structural code
  file: "oklch(60% 0.15 75)",
  function: "oklch(60% 0.10 260)",
  class: "oklch(60% 0.13 265)",
  method: "oklch(60% 0.10 260)",
  module: "oklch(60% 0.13 220)",
  type: "oklch(60% 0.13 220)",
  concept: "oklch(62% 0.09 300)",
  schema: "oklch(58% 0.12 200)",
  // infra / runtime
  service: "var(--primary)",
  config: "oklch(60% 0.15 75)",
  resource: "oklch(58% 0.10 150)",
  pipeline: "oklch(58% 0.12 190)",
  api_endpoint: "oklch(62% 0.14 145)",
  endpoint: "oklch(62% 0.14 145)",
  env_var: "oklch(60% 0.12 95)",
  dependency: "oklch(55% 0.08 250)",
  // data
  db_table: "oklch(58% 0.12 200)",
  db_column: "oklch(58% 0.09 200)",
  migration: "oklch(58% 0.12 210)",
  event: "oklch(62% 0.15 30)",
  test: "oklch(60% 0.13 155)",
  // docs / domain
  document: "oklch(60% 0.13 155)",
  domain: "oklch(60% 0.18 20)",
  flow: "oklch(60% 0.16 40)",
  step: "oklch(62% 0.12 50)",
  // scope nodes
  capability: "oklch(60% 0.18 20)",
  repo: "oklch(55% 0.10 200)",
};

function kindColor(kind: string): string {
  return KIND_COLOR[kind.toLowerCase()] ?? "oklch(58% 0.04 260)";
}

/* ---- edge kind → colour. Behavioral edges (P0) get distinct hues so the
   topology reads as typed relationships, not undifferentiated lines.
   `contains` stays neutral (it's the structural skeleton); cross-repo
   edges override to --warning regardless of kind. ---- */
const EDGE_KIND_COLOR: Record<string, string> = {
  contains: "var(--border)",
  calls: "oklch(60% 0.12 260)",
  references: "oklch(58% 0.05 260)",
  imports: "oklch(58% 0.08 220)",
  handles: "oklch(62% 0.14 145)",
  produces: "oklch(62% 0.15 30)",
  consumes: "oklch(60% 0.13 50)",
  reads: "oklch(58% 0.12 200)",
  writes: "oklch(55% 0.15 25)",
  extends: "oklch(60% 0.13 300)",
  integrates_with: "oklch(60% 0.16 320)",
};

function edgeKindColor(kind?: string | null): string {
  return (kind && EDGE_KIND_COLOR[kind]) || "var(--border-strong)";
}

const BASE_W = 168;
const NODE_H = 60;

// Level-of-detail ceiling: above this many simultaneously-visible nodes the
// canvas keeps only the most-important ones (see CanvasInner). Tuned so React
// Flow stays smooth (pan / zoom / hover-highlight) on a large
// `/knowledge/graph` result while still showing the structural backbone.
const MAX_VISIBLE_NODES = 220;

interface KgNodeData {
  label: string;
  kind: string;
  sublabel?: string | null;
  badge?: string | null;
  color: string;
  width: number;
  dim: boolean;
  ring: "primary" | "danger" | "warning" | null;
  /** Has `contains` children — shows a drill-down chevron. */
  collapsible: boolean;
  collapsed: boolean;
  /** Hidden-descendant count, shown as a +N pill when collapsed. */
  descCount: number;
  testId?: string | undefined;
}

function ringShadow(ring: KgNodeData["ring"]): string | undefined {
  switch (ring) {
    case "primary": return "0 0 0 2px var(--primary), var(--shadow-1)";
    case "danger":  return "0 0 0 2px var(--danger), 0 0 12px var(--danger-soft)";
    case "warning": return "0 0 0 2px var(--warning)";
    default:        return "var(--shadow-1)";
  }
}

function KgNode({ data }: NodeProps<KgNodeData>) {
  return (
    <div
      data-testid={data.testId}
      className="rounded-md border px-3 py-2 text-xs transition-[opacity,box-shadow] duration-150"
      style={{
        width: data.width,
        height: NODE_H,
        borderColor: data.color,
        background: "var(--surface)",
        opacity: data.dim ? 0.26 : 1,
        boxShadow: ringShadow(data.ring),
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.color, opacity: 0.55 }} />
      <div className="flex items-start justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1 font-semibold text-[var(--text)]">
          {data.collapsible ? (
            <span aria-hidden className="shrink-0 text-[var(--text-subtle)]" title="Double-click to expand / collapse">
              {data.collapsed ? "▸" : "▾"}
            </span>
          ) : null}
          <span className="truncate">{data.label}</span>
        </span>
        {data.collapsible && data.collapsed && data.descCount > 0 ? (
          <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-1.5 text-[9px] font-bold tabular-nums text-[var(--primary)]">
            +{data.descCount}
          </span>
        ) : data.badge ? (
          <span className="shrink-0 rounded-full border px-1 text-[9px] font-bold tabular-nums text-[var(--text-muted)]" style={{ borderColor: data.color }}>
            {data.badge}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span className="uppercase tracking-wider" style={{ color: data.color }}>{data.kind}</span>
        {data.sublabel ? <span className="truncate font-mono">{data.sublabel}</span> : null}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.color, opacity: 0.55 }} />
    </div>
  );
}

const NODE_TYPES = { kg: KgNode } as const;

/** Zooms the viewport to `focusId` when it changes. Rendered inside
 *  <ReactFlow> so the store is populated before fitView runs. */
function FocusController({ focusId, reduceMotion }: { focusId?: string | null; reduceMotion: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      try {
        fitView({ nodes: [{ id: focusId }], duration: reduceMotion ? 0 : 400, maxZoom: 1.4, padding: 0.4 });
      } catch { /* node not mounted yet — ignore */ }
    }, 50);
    return () => clearTimeout(t);
  }, [focusId, fitView, reduceMotion]);
  return null;
}

function CanvasInner({
  nodes,
  edges,
  selectedId,
  onSelect,
  focusId,
  overlay,
  layout = "force",
  wrapperTestId = "knowledge-graph-canvas",
  nodeTestId,
  hiddenEdgeKinds,
}: KnowledgeGraphCanvasProps & { hiddenEdgeKinds: Set<string> }) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // --- Containment drill-down -------------------------------------------- //
  // Build the `contains` forest. When present (the ingested module tree) the
  // graph starts collapsed at the top level and the user drills in. Surfaces
  // with no contains edges (org cap-deps, capability entities) skip this and
  // show every node, so their behaviour is unchanged.
  const forest = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string>();
    for (const e of edges) {
      if (e.kind !== "contains") continue;
      const arr = childrenOf.get(e.source) ?? [];
      arr.push(e.target);
      childrenOf.set(e.source, arr);
      parentOf.set(e.target, e.source);
    }
    const descCount = new Map<string, number>();
    const countDesc = (id: string, seen: Set<string>): number => {
      const cached = descCount.get(id);
      if (cached !== undefined) return cached;
      if (seen.has(id)) return 0;
      seen.add(id);
      let n = 0;
      for (const c of childrenOf.get(id) ?? []) n += 1 + countDesc(c, seen);
      descCount.set(id, n);
      return n;
    };
    for (const id of childrenOf.keys()) countDesc(id, new Set());
    return { childrenOf, parentOf, hasChildren: new Set(childrenOf.keys()), descCount };
  }, [edges]);

  const hasContains = forest.hasChildren.size > 0;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const graphKey = useMemo(() => `${nodes.length}:${edges.length}`, [nodes, edges]);
  useEffect(() => {
    // Default: every internal node collapsed → open on the top-level map.
    setCollapsed(hasContains ? new Set(forest.hasChildren) : new Set());
  }, [graphKey, hasContains, forest.hasChildren]);

  // Reveal a focused node by expanding its ancestors (search-to-focus).
  useEffect(() => {
    if (!focusId || !hasContains) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      let cur = forest.parentOf.get(focusId);
      while (cur) {
        next.delete(cur);
        cur = forest.parentOf.get(cur);
      }
      return next;
    });
  }, [focusId, hasContains, forest.parentOf]);

  const toggleCollapse = useCallback(
    (id: string) => {
      if (!forest.hasChildren.has(id)) return;
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [forest.hasChildren],
  );

  // Visible = roots + descendants whose ancestors are all expanded.
  const visibleIds = useMemo(() => {
    if (!hasContains) return new Set(nodes.map((n) => n.id));
    const vis = new Set<string>();
    const stack = nodes.filter((n) => !forest.parentOf.has(n.id)).map((n) => n.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (vis.has(id)) continue;
      vis.add(id);
      if (!collapsed.has(id)) for (const c of forest.childrenOf.get(id) ?? []) stack.push(c);
    }
    return vis;
  }, [nodes, hasContains, forest, collapsed]);

  const visNodes = useMemo(() => nodes.filter((n) => visibleIds.has(n.id)), [nodes, visibleIds]);
  const visEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edges, visibleIds],
  );

  // --- Level-of-detail cap, split so SELECTION never triggers a relayout ---- //
  // A flat graph (e.g. the topology explorer expanded a few hops) can exceed
  // the LOD ceiling; rendering everything melts React Flow and buries the
  // structure. The cap is split into two memos so `focusId` — which changes on
  // every selection — can never reach the force layout:
  //
  //   • `baseCapped` — the importance-ranked top-MAX_VISIBLE_NODES. Depends on
  //     `visNodes` ONLY, so it (and the layout computed from it) stays stable
  //     across selection / focus / hover.
  //   • `cappedNodes` — `baseCapped` plus the focus node and its 1-hop
  //     neighbours when the cap dropped them (so a ?focus= / selected target
  //     always shows its context). The few injected nodes get a cheap fallback
  //     position; they never enter the force layout.
  //
  // Below the cap (the explorer's normal case) `baseCapped === visNodes` and
  // `cappedNodes === baseCapped`, so selecting a node recomputes only the
  // rfNodes map (already layout-free) — zero relayout, zero flicker.
  const baseCapped = useMemo(() => {
    if (visNodes.length <= MAX_VISIBLE_NODES) return visNodes;
    return [...visNodes]
      .sort((a, b) => (b.importance ?? 0.5) - (a.importance ?? 0.5))
      .slice(0, MAX_VISIBLE_NODES);
  }, [visNodes]);

  const baseIds = useMemo(() => new Set(baseCapped.map((n) => n.id)), [baseCapped]);

  // Edges within the stable base — the layout's edge input, also focus-free.
  const edgesOverBase = useMemo(
    () => visEdges.filter((e) => baseIds.has(e.source) && baseIds.has(e.target)),
    [visEdges, baseIds],
  );

  const { cappedNodes, hiddenCount } = useMemo(() => {
    if (baseCapped.length >= visNodes.length) {
      return { cappedNodes: baseCapped, hiddenCount: 0 };
    }
    const keep = new Set(baseIds);
    if (focusId && !keep.has(focusId)) {
      keep.add(focusId);
      for (const e of visEdges) {
        if (e.source === focusId) keep.add(e.target);
        else if (e.target === focusId) keep.add(e.source);
      }
    }
    if (keep.size === baseIds.size) {
      // Nothing injected — return the stable base reference so the downstream
      // ids / edges / positions memos don't churn on a mere selection.
      return { cappedNodes: baseCapped, hiddenCount: visNodes.length - baseIds.size };
    }
    const extras = visNodes.filter((n) => keep.has(n.id) && !baseIds.has(n.id));
    return {
      cappedNodes: [...baseCapped, ...extras],
      hiddenCount: visNodes.length - keep.size,
    };
  }, [baseCapped, baseIds, visNodes, visEdges, focusId]);

  const cappedIds = useMemo(() => new Set(cappedNodes.map((n) => n.id)), [cappedNodes]);
  const cappedEdges = useMemo(
    () => visEdges.filter((e) => cappedIds.has(e.source) && cappedIds.has(e.target)),
    [visEdges, cappedIds],
  );

  // Force/layered layout over the STABLE base set only — so it fires when the
  // node set actually changes (expand / collapse / new data), never on a mere
  // selection or focus change.
  const basePositions = useMemo(() => {
    const ln = baseCapped.map((n) => ({ id: n.id, band: n.band ?? null }));
    const le = edgesOverBase.map((e) => ({ source: e.source, target: e.target }));
    return layout === "layered" ? layeredLayout(ln, le) : forceLayout(ln, le);
  }, [baseCapped, edgesOverBase, layout]);

  // Final positions = the stable layout, plus a cheap fallback for any
  // focus-injected extra (placed beside a laid-out neighbour, else origin). No
  // relayout — below the cap this returns `basePositions` untouched (stable
  // identity), so selection doesn't even re-key the rfNodes positions.
  const positions = useMemo(() => {
    if (cappedNodes.length === baseCapped.length) return basePositions;
    const merged = new Map(basePositions);
    for (const n of cappedNodes) {
      if (merged.has(n.id)) continue;
      let pos = { x: 0, y: 0 };
      for (const e of visEdges) {
        const other = e.source === n.id ? e.target : e.target === n.id ? e.source : null;
        const np = other ? basePositions.get(other) : undefined;
        if (np) { pos = { x: np.x + 48, y: np.y + 48 }; break; }
      }
      merged.set(n.id, pos);
    }
    return merged;
  }, [basePositions, cappedNodes, baseCapped, visEdges]);

  /** 1-hop adjacency for hover/selection highlighting (visible set). */
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of cappedNodes) m.set(n.id, new Set());
    for (const e of cappedEdges) {
      m.get(e.source)?.add(e.target);
      m.get(e.target)?.add(e.source);
    }
    return m;
  }, [cappedNodes, cappedEdges]);

  const activeId = hoverId ?? selectedId ?? null;
  const hasOverlay = !!overlay && overlay.size > 0;

  const rfNodes: Node<KgNodeData>[] = useMemo(() => {
    const neighbourhood = activeId
      ? new Set<string>([activeId, ...(adjacency.get(activeId) ?? [])])
      : null;
    return cappedNodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      const role = overlay?.get(n.id) ?? null;
      let dim = false;
      let ring: KgNodeData["ring"] = null;
      if (hasOverlay) {
        if (role === "changed") ring = "danger";
        else if (role === "affected") ring = "warning";
        else dim = true;
      } else if (neighbourhood) {
        dim = !neighbourhood.has(n.id);
        if (n.id === selectedId) ring = "primary";
      } else if (n.id === selectedId) {
        ring = "primary";
      }
      const importance = n.importance ?? 0.5;
      return {
        id: n.id,
        type: "kg",
        position: pos,
        draggable: false,
        data: {
          label: n.label,
          kind: n.kind,
          sublabel: n.sublabel ?? null,
          badge: n.badge ?? null,
          color: kindColor(n.kind),
          width: Math.round(BASE_W * (0.82 + 0.42 * Math.max(0, Math.min(1, importance)))),
          dim,
          ring,
          collapsible: forest.hasChildren.has(n.id),
          collapsed: collapsed.has(n.id),
          descCount: forest.descCount.get(n.id) ?? 0,
          testId: nodeTestId?.(n),
        },
      };
    });
  }, [cappedNodes, positions, adjacency, activeId, selectedId, overlay, hasOverlay, nodeTestId, forest, collapsed]);

  const rfEdges: Edge[] = useMemo(() => {
    const neighbourhood = activeId
      ? new Set<string>([activeId, ...(adjacency.get(activeId) ?? [])])
      : null;
    return cappedEdges
      .filter((e) => !(e.kind && hiddenEdgeKinds.has(e.kind)))
      .map((e, i) => {
        const incidentToActive = activeId != null && (e.source === activeId || e.target === activeId);
        const inOverlay = hasOverlay && !!overlay?.get(e.source) && !!overlay?.get(e.target);
        const isContains = e.kind === "contains";
        const highlighted = incidentToActive || inOverlay;
        let dim = false;
        if (hasOverlay) dim = !inOverlay;
        else if (neighbourhood) dim = !incidentToActive;
        // Typed colour: cross-repo wins (warning), else per-kind hue.
        const baseColor = e.crossRepo ? "var(--warning)" : edgeKindColor(e.kind);
        const color = highlighted ? "var(--primary)" : baseColor;
        // Rolled-up topology edges + highlighted edges carry a label; a
        // rolled-up edge with weight > 1 shows the aggregate count.
        const showLabel = highlighted || e.rolledUp;
        const label = showLabel
          ? e.rolledUp && e.weight && e.weight > 1
            ? `${e.kind} ×${e.weight}`
            : e.kind
          : undefined;
        return {
          id: `e-${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          label,
          labelStyle: { fontSize: 9, fill: "var(--text-muted)" },
          labelBgStyle: { fill: "var(--surface)" },
          animated: highlighted && !reduceMotion,
          style: {
            stroke: color,
            strokeWidth: highlighted ? 2.2 : e.rolledUp ? 1.7 : isContains ? 1 : 1.3,
            strokeDasharray:
              e.style === "dashed" || e.crossRepo ? "5 4" : isContains ? "2 3" : undefined,
            opacity: dim ? 0.12 : isContains ? 0.5 : 0.78,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        };
      });
  }, [cappedEdges, adjacency, activeId, overlay, hasOverlay, reduceMotion, hiddenEdgeKinds]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.1}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      panOnDrag={!reduceMotion}
      zoomOnScroll={!reduceMotion}
      zoomOnPinch={!reduceMotion}
      panOnScroll={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      zoomOnDoubleClick={false}
      onNodeClick={(_, n) => onSelect?.(n.id)}
      onNodeDoubleClick={(_, n) => toggleCollapse(n.id)}
      onNodeMouseEnter={(_, n) => setHoverId(n.id)}
      onNodeMouseLeave={() => setHoverId(null)}
      onPaneClick={() => onSelect?.(null)}
      data-testid={`${wrapperTestId}-flow`}
    >
      <Background gap={20} size={1} color="var(--border)" />
      {hiddenCount > 0 ? (
        <Panel position="top-center">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[10px] text-[var(--text-muted)] shadow-sm">
            Showing the {cappedNodes.length} most-connected nodes · {hiddenCount} hidden — narrow with filters to see the rest
          </div>
        </Panel>
      ) : null}
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => kindColor((n.data as KgNodeData | undefined)?.kind ?? "")}
        maskColor="color-mix(in oklch, var(--surface) 70%, transparent)"
        style={{ background: "var(--surface-2)" }}
      />
      <FocusController focusId={focusId ?? null} reduceMotion={reduceMotion} />
    </ReactFlow>
  );
}

export function KnowledgeGraphCanvas(props: KnowledgeGraphCanvasProps) {
  const {
    nodes,
    height = 520,
    wrapperTestId = "knowledge-graph-canvas",
    emptyTestId = "knowledge-graph-empty",
    emptyTitle = "No knowledge yet",
    emptyDescription = "Connect a repo and run ingestion to populate the knowledge graph.",
  } = props;

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const [hiddenEdgeKinds, setHiddenEdgeKinds] = useState<Set<string>>(new Set());
  const toggleEdgeKind = useCallback((kind: string) => {
    setHiddenEdgeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  if (nodes.length === 0) {
    return (
      <div data-testid={emptyTestId} style={{ height }}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const uniqueKinds = Array.from(new Set(nodes.map((n) => n.kind)));
  // Edge kinds for the legend/filter — `contains` is structural (drives the
  // drill-down tree, not a semantic relationship) so it's excluded.
  const edgeKinds = Array.from(
    new Set(
      props.edges.map((e) => e.kind).filter((k): k is string => !!k && k !== "contains"),
    ),
  );

  return (
    <div
      data-testid={wrapperTestId}
      data-reduced-motion={reduceMotion ? "true" : "false"}
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
    >
      <div style={{ height, width: "100%" }}>
        <ReactFlowProvider>
          <CanvasInner {...props} hiddenEdgeKinds={hiddenEdgeKinds} />
        </ReactFlowProvider>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
        {uniqueKinds.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm" style={{ background: kindColor(kind), opacity: 0.8 }} />
            <span className="capitalize">{kind.replace(/_/g, " ")}</span>
          </span>
        ))}
        {edgeKinds.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-2 border-l border-[var(--border)] pl-3">
            <span className="text-[var(--text-subtle)]">edges</span>
            {edgeKinds.map((kind) => {
              const hidden = hiddenEdgeKinds.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleEdgeKind(kind)}
                  aria-pressed={!hidden}
                  data-testid={`edge-legend-${kind}`}
                  title={hidden ? "Show these edges" : "Hide these edges"}
                  className={`inline-flex items-center gap-1 rounded px-1 hover:bg-[var(--surface-2)] ${hidden ? "opacity-40 line-through" : ""}`}
                >
                  <span className="inline-block h-[2px] w-3 rounded" style={{ background: edgeKindColor(kind) }} />
                  <span>{kind.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </span>
        )}
        <span className="ml-auto tabular-nums text-[var(--text-subtle)]">
          {props.nodes.length} node{props.nodes.length === 1 ? "" : "s"} · {props.edges.length} edge{props.edges.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
