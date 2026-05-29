"use client";

/**
 * EntityGraphReactFlow — the `/knowledge/graph` explorer's graph, now a thin
 * adapter over the shared `<KnowledgeGraphCanvas>` (real layered layout,
 * pan/zoom, neighbour highlight, focus-to-node, blast-radius overlay).
 *
 * Its job is the explorer-specific mapping: bucket each `node_kind` into one
 * of the ADR-042 five tiers (file / symbol / module / layer / domain) so the
 * graph reads top-to-bottom domain → layer → module → symbol → file, and
 * expose the per-tier `data-testid` the slice-10 tests assert on. All the
 * interaction lives in the canvas.
 */

import { useMemo } from "react";

import {
  KnowledgeGraphCanvas,
  type CanvasEdge,
  type CanvasNode,
  type OverlayRole,
} from "@/components/topology/knowledge-graph-canvas";
import type { KnowledgeEdge, KnowledgeNode } from "@/lib/api/client";

/** ADR-042 5-tier kinds. `node_kind` from the wire is bucketed into one. */
type TierKind = "file" | "symbol" | "module" | "layer" | "domain";

const TIER_FOR_KIND: Record<string, TierKind> = {
  // file tier — concrete on-disk artifacts
  file: "file",
  config: "file",
  document: "file",
  // symbol tier — code-level entities
  function: "symbol",
  class: "symbol",
  method: "symbol",
  api_endpoint: "symbol",
  endpoint: "symbol",
  event: "symbol",
  // module tier — grouping inside a service / repo
  module: "module",
  type: "module",
  db_table: "module",
  // layer tier — runnable services
  service: "layer",
  // domain tier — cross-cutting concepts / decisions
  capability: "domain",
  repo: "domain",
};

function tierFor(nodeKind: string): TierKind {
  return TIER_FOR_KIND[nodeKind.toLowerCase()] ?? "module";
}

/** Per-tier vertical band so the canvas reads top-to-bottom. */
const TIER_ROW: Record<TierKind, number> = {
  domain: 0,
  layer: 1,
  module: 2,
  symbol: 3,
  file: 4,
};

interface EntityGraphReactFlowProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  /** Currently-selected node id (drives the inspector + highlight). */
  selectedId?: string | null;
  /** Fires with the clicked node id, or null on pane click. */
  onSelect?: (id: string | null) => void;
  /** Zoom-to this node (the `?focus=` deep-link + search-to-focus). */
  focusId?: string | null;
  /** Blast-radius overlay: node id → role. */
  overlay?: Map<string, OverlayRole> | null;
  height?: number;
}

export function EntityGraphReactFlow({
  nodes,
  edges,
  selectedId,
  onSelect,
  focusId,
  overlay,
  height = 520,
}: EntityGraphReactFlowProps) {
  const canvasNodes = useMemo<CanvasNode[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        label: n.name,
        kind: n.node_kind,
        sublabel: n.layer ?? n.node_kind,
        band: TIER_ROW[tierFor(n.node_kind)],
        importance: n.centrality ?? null,
      })),
    [nodes],
  );

  const canvasEdges = useMemo<CanvasEdge[]>(
    () =>
      edges.map((e) => ({
        source: e.source_id,
        target: e.target_id,
        kind: e.kind,
        crossRepo: e.cross_repo ?? false,
        confidence: e.confidence ?? null,
        rolledUp: e.rolled_up ?? false,
        weight: e.weight ?? null,
      })),
    [edges],
  );

  return (
    <KnowledgeGraphCanvas
      nodes={canvasNodes}
      edges={canvasEdges}
      {...(selectedId !== undefined ? { selectedId } : {})}
      {...(onSelect ? { onSelect } : {})}
      {...(focusId !== undefined ? { focusId } : {})}
      {...(overlay !== undefined ? { overlay } : {})}
      height={height}
      wrapperTestId="entity-graph-react-flow"
      emptyTestId="kg-empty"
      nodeTestId={(n) => `kg-node-${tierFor(n.kind)}`}
    />
  );
}
