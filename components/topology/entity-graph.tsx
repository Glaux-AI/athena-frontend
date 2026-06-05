"use client";

/**
 * EntityGraph — the `/knowledge/graph` explorer's graph, a thin adapter over
 * the shared Cytoscape `<KnowledgeGraph>`. Maps the wire `KnowledgeNode` /
 * `KnowledgeEdge` onto the component's {nodes, links} shape: `contains` edges
 * become containment nesting (so modules visually hold their files), everything
 * else stays a typed behavioural link (cross-repo / rolled-up payload kept).
 * A minimap is shown because this surface has no structure tree to orient by.
 */

import { useMemo } from "react";

import {
  KnowledgeGraph,
  type GraphLink,
  type GraphNode,
  type OverlayRole,
} from "@/components/topology/graph/knowledge-graph";
import { deriveContainment } from "@/components/topology/graph/graph-data";
import type { KnowledgeEdge, KnowledgeNode } from "@/lib/api/client";

interface EntityGraphProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  focusId?: string | null;
  overlay?: Map<string, OverlayRole> | null;
  height?: number;
}

export function EntityGraph({ nodes, edges, selectedId, onSelect, focusId, overlay, height = 560 }: EntityGraphProps) {
  const { graphNodes, graphLinks } = useMemo(() => {
    const mapped: GraphLink[] = edges.map((e) => ({
      source: e.source_id,
      target: e.target_id,
      kind: e.kind,
      crossRepo: e.cross_repo ?? false,
      rolledUp: e.rolled_up ?? false,
      weight: e.weight ?? null,
      dashed: e.cross_repo ?? false,
    }));
    const { parentOf, links } = deriveContainment(
      nodes.map((n) => ({ id: n.id })),
      mapped,
    );
    const graphNodes: GraphNode[] = nodes.map((n) => ({
      id: n.id,
      label: n.name,
      kind: n.node_kind,
      sublabel: n.layer ?? n.path ?? null,
      parent: parentOf.get(n.id) ?? null,
      importance: n.centrality ?? 0.4,
    }));
    return { graphNodes, graphLinks: links };
  }, [nodes, edges]);

  return (
    <KnowledgeGraph
      nodes={graphNodes}
      links={graphLinks}
      {...(selectedId !== undefined ? { selectedId } : {})}
      {...(onSelect ? { onSelect } : {})}
      {...(focusId !== undefined ? { focusId } : {})}
      {...(overlay !== undefined ? { overlay } : {})}
      height={height}
      showMinimap
      layout="cose"
      wrapperTestId="entity-graph"
      emptyTestId="kg-empty"
      emptyTitle="No knowledge yet"
      emptyDescription="Connect a repo and run ingestion to populate the knowledge graph."
    />
  );
}
