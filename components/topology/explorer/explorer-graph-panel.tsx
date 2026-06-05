"use client";

/**
 * ExplorerGraphPanel — the store's live graph projected onto the Cytoscape
 * `<KnowledgeGraph>`. One selection drives everything: tap a node → `select(id)`
 * (the store re-focuses + fetches that node's neighbours on demand), and
 * `focusId === selectedId` so the viewport eases to the synced selection.
 * Double-click a leaf calls `expand(id)`; double-click a group folds it.
 */

import { KnowledgeGraph } from "@/components/topology/graph/knowledge-graph";
import { useExplorer } from "@/components/topology/explorer/explorer-store";

export function ExplorerGraphPanel({ height = 520 }: { height?: number }) {
  const { elements, selectedId, select, expand, expanding } = useExplorer();
  const loadingSelected = selectedId != null && expanding.has(selectedId);

  return (
    <KnowledgeGraph
      nodes={elements.nodes}
      links={elements.links}
      selectedId={selectedId}
      onSelect={(id) => select(id)}
      onExpand={(id) => expand(id)}
      busy={loadingSelected}
      layout="dagre"
      height={height}
      wrapperTestId="explorer-graph"
      emptyTestId="explorer-graph-empty"
      emptyTitle="No topology yet"
      emptyDescription="Connect a repo and run ingestion to populate this view."
    />
  );
}
