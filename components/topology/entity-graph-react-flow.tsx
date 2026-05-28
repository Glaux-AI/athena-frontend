"use client";

/**
 * EntityGraphReactFlow — React Flow rendering of `KnowledgeGraph` on the
 * `/knowledge/graph` route (readiness §6.0 Slice 10 v1 scope).
 *
 * Pure presentation: caller fetches via `api.knowledge.graph(...)` and hands
 * us `KnowledgeNode[]` / `KnowledgeEdge[]`. Layout coordinates are
 * synthesised here (the transport contract intentionally omits x/y per
 * ADR-051 §Knowledge surfaces). Nodes are bucketed into one of five tiers
 * keyed off `node_kind` per ADR-042 5-tier (file / symbol / module / layer /
 * domain) and laid out in deterministic horizontal bands so the canvas
 * renders the same way every reload.
 *
 * Pan/zoom is honored unless `prefers-reduced-motion: reduce` is set, in
 * which case the canvas disables panOnDrag/zoomOnScroll and snaps to the
 * fit-view bounds — matching the global motion budget rule in
 * `app/globals.css` and the UX standard §motion.
 *
 * Cross-route visualization (the 6-route fan-out mentioned in the original
 * Slice 10 row) is deferred — this component is the v1 surface only.
 */

import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";

import { EmptyState } from "@/components/ui/empty-state";
import type { KnowledgeEdge, KnowledgeNode } from "@/lib/api/client";

/** ADR-042 5-tier kinds. `node_kind` from the wire is bucketed into one. */
type TierKind = "file" | "symbol" | "module" | "layer" | "domain";

const TIER_FOR_KIND: Record<string, TierKind> = {
  // file tier — concrete on-disk artifacts
  config: "file",
  document: "file",
  // symbol tier — code-level entities
  function: "symbol",
  class:    "symbol",
  method:   "symbol",
  // module tier — grouping inside a service / repo
  module:   "module",
  type:     "module",
  // layer tier — runnable services
  service:  "layer",
  // domain tier — cross-cutting concepts / decisions
  capability: "domain",
  repo:       "domain",
};

function tierFor(nodeKind: string): TierKind {
  return TIER_FOR_KIND[nodeKind.toLowerCase()] ?? "module";
}

/** Tier-keyed visual tokens. Driven by `--primary` + a fixed OKLCH palette
 *  shared with `KnowledgeMiniGraph` so the two surfaces read as one system.
 *  We keep these inline (not in tailwind.config) because they're SVG fills
 *  consumed by React Flow's renderer, not class names. */
const TIER_FILL: Record<TierKind, string> = {
  file:   "oklch(60% 0.15 75)",   // amber
  symbol: "oklch(60% 0.10 260)",  // indigo
  module: "oklch(60% 0.13 220)",  // cyan
  layer:  "var(--primary)",       // violet
  domain: "oklch(60% 0.18 20)",   // rose
};

/** Per-tier vertical band so the canvas reads top-to-bottom as
 *  "domain → layer → module → symbol → file". */
const TIER_ROW: Record<TierKind, number> = {
  domain: 0,
  layer:  1,
  module: 2,
  symbol: 3,
  file:   4,
};

const NODE_W = 160;
const NODE_H = 56;
const ROW_GAP = 96;
const COL_GAP = 28;

interface KgNodeData {
  label: string;
  tier: TierKind;
  layer: string | null;
  nodeKind: string;
}

/** Custom node renderer keyed on tier. Renders a pill with the entity name +
 *  a small sublabel showing `layer` / kind. Handles on top + bottom so React
 *  Flow can connect edges that cross tier rows. */
function KgNode({ data }: NodeProps<KgNodeData>) {
  const fill = TIER_FILL[data.tier];
  return (
    <div
      data-testid={`kg-node-${data.tier}`}
      className="rounded-md border px-3 py-2 text-xs shadow-[var(--shadow-1)]"
      style={{ width: NODE_W, height: NODE_H, borderColor: fill, background: "var(--surface)" }}
    >
      <Handle type="target" position={Position.Top} style={{ background: fill, opacity: 0.6 }} />
      <div className="truncate font-semibold text-[var(--text)]">{data.label}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span className="uppercase tracking-wider" style={{ color: fill }}>{data.tier}</span>
        <span className="truncate font-mono">{data.layer ?? data.nodeKind}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: fill, opacity: 0.6 }} />
    </div>
  );
}

const NODE_TYPES = { kg: KgNode } as const;

function layout(nodes: KnowledgeNode[]): Node<KgNodeData>[] {
  /* Bucket by tier row first, then index across the row. Deterministic so
   * tests can assert the rendered set. */
  const byRow = new Map<number, KnowledgeNode[]>();
  for (const n of nodes) {
    const row = TIER_ROW[tierFor(n.node_kind)];
    const arr = byRow.get(row) ?? [];
    arr.push(n);
    byRow.set(row, arr);
  }
  const out: Node<KgNodeData>[] = [];
  for (const [row, rowNodes] of byRow) {
    const totalW = rowNodes.length * NODE_W + Math.max(0, rowNodes.length - 1) * COL_GAP;
    const startX = -totalW / 2;
    rowNodes.forEach((n, i) => {
      const tier = tierFor(n.node_kind);
      out.push({
        id: n.id,
        type: "kg",
        position: {
          x: startX + i * (NODE_W + COL_GAP),
          y: row * (NODE_H + ROW_GAP),
        },
        data: { label: n.name, tier, layer: n.layer, nodeKind: n.node_kind },
      });
    });
  }
  return out;
}

function toEdges(edges: KnowledgeEdge[]): Edge[] {
  return edges.map((e, i) => ({
    id: `e-${i}-${e.source_id}-${e.target_id}`,
    source: e.source_id,
    target: e.target_id,
    label: e.kind,
    labelStyle: { fontSize: 9, fill: "var(--text-muted)" },
    style: { stroke: "var(--border-strong)", strokeWidth: 1.3 },
  }));
}

interface EntityGraphReactFlowProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  /** Optional click handler — receives the raw KnowledgeNode. */
  onSelectNode?: (node: KnowledgeNode) => void;
  /** Optional height override; defaults to 520px to match the legacy SVG. */
  height?: number;
}

export function EntityGraphReactFlow({
  nodes,
  edges,
  onSelectNode,
  height = 520,
}: EntityGraphReactFlowProps) {
  const rfNodes = useMemo(() => layout(nodes), [nodes]);
  const rfEdges = useMemo(() => toEdges(edges), [edges]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /* Honor prefers-reduced-motion: snap to fit-view, no zoom-on-scroll,
   * no pan-on-drag. Re-evaluated only on mount — the user's OS setting
   * doesn't flip mid-session in practice. */
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
  }, []);

  if (nodes.length === 0) {
    return (
      <div data-testid="kg-empty" style={{ height }}>
        <EmptyState
          title="No knowledge yet"
          description="Connect a repo and run ingestion to populate the knowledge graph."
        />
      </div>
    );
  }

  return (
    <div
      data-testid="entity-graph-react-flow"
      data-reduced-motion={reduceMotion ? "true" : "false"}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)]"
      style={{ height, width: "100%" }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        fitView
        proOptions={{ hideAttribution: true }}
        panOnDrag={!reduceMotion}
        zoomOnScroll={!reduceMotion}
        zoomOnPinch={!reduceMotion}
        panOnScroll={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={Boolean(onSelectNode)}
        onNodeClick={(_, n) => {
          const raw = byId.get(n.id);
          if (raw && onSelectNode) onSelectNode(raw);
        }}
      >
        <Background gap={20} size={1} color="var(--border)" />
        <Controls
          showInteractive={false}
          data-testid="kg-controls"
        />
      </ReactFlow>
    </div>
  );
}
