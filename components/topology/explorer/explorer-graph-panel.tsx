"use client";

/**
 * ExplorerGraphPanel — the store's `GraphState` projected onto the shared
 * `KnowledgeGraphCanvas`. Click a node → `select(id)` (the store then re-focuses
 * + fetches that node's neighbours on demand). `focusId === selectedId` so the
 * viewport zooms to the synced selection. An inline pill shows while the
 * selected node's neighbours are loading.
 */

import { Loader2 } from "lucide-react";

import { KnowledgeGraphCanvas } from "@/components/topology/knowledge-graph-canvas";
import { useExplorer } from "@/components/topology/explorer/explorer-store";

export function ExplorerGraphPanel({ height = 520 }: { height?: number }) {
  const { canvas, selectedId, select, expanding } = useExplorer();
  const loadingSelected = selectedId != null && expanding.has(selectedId);

  return (
    <div className="relative">
      <KnowledgeGraphCanvas
        nodes={canvas.nodes}
        edges={canvas.edges}
        selectedId={selectedId}
        focusId={selectedId}
        onSelect={(id) => select(id)}
        layout="force"
        height={height}
        wrapperTestId="explorer-graph"
        emptyTestId="explorer-graph-empty"
        emptyTitle="No topology yet"
        emptyDescription="Connect a repo and run ingestion to populate this view."
      />
      {loadingSelected && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] text-[var(--text-muted)] shadow-sm">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Loading neighbours…
        </div>
      )}
    </div>
  );
}
