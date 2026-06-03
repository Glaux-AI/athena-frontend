"use client";

/**
 * RepoTopologyGraph — the repo Topology tab's primary visualisation.
 *
 * Renders the shared interactive <KnowledgeGraphCanvas> (pan / zoom, LOD cap,
 * neighbour highlight, minimap, edge-kind legend) over the repo's file-centric
 * graph: nodes are the ranked `top_files` (augmented with any file referenced
 * only by an edge), edges are `call_edges` (imports / calls / extends /
 * references). Replaces the bespoke radial <ImportsGraph>, so the repo graph
 * behaves identically to the org / capability / explorer graphs and scales the
 * same way.
 *
 * Selection is controlled by the parent (repo page) so a node click drives the
 * inline <FileBlueprintPanel> rendered directly below the graph.
 */

import { useMemo } from "react";
import { Network } from "lucide-react";

import {
  KnowledgeGraphCanvas,
  type CanvasEdge,
  type CanvasNode,
} from "@/components/topology/knowledge-graph-canvas";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { RepoKnowledge } from "@/lib/api/client";

// Architecture layer → graph band (0 = top). Mirrors entity-graph so the repo
// reads top-down by layer when the layered layout is selected.
const LAYER_BAND: Record<string, number> = {
  ui: 0, api: 1, service: 1, domain: 2, db: 2,
  util: 3, config: 3, infra: 4, test: 4, docs: 5,
};

/** Build the canvas node/edge sets from a repo knowledge payload. Exported for
 *  unit assertions (edge-only files become nodes; importance drives the cap). */
export function buildRepoGraph(knowledge: RepoKnowledge): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const byId = new Map<string, CanvasNode>();
  for (const f of knowledge.top_files) {
    byId.set(f.id, {
      id: f.id,
      label: f.name,
      kind: f.layer || "file",
      sublabel: f.path,
      band: LAYER_BAND[(f.layer ?? "").toLowerCase()] ?? null,
      importance: f.importance,
      badge: f.symbols > 0 ? `${f.symbols}` : null,
    });
  }
  // A file referenced only by an edge still needs a node for the edge to draw;
  // give it a low importance so the LOD cap drops it before a ranked top file.
  for (const e of knowledge.call_edges) {
    for (const end of [e.from, e.to]) {
      if (!byId.has(end.id)) {
        byId.set(end.id, { id: end.id, label: end.name, kind: "file", sublabel: end.path, importance: 0.35 });
      }
    }
  }
  const edges: CanvasEdge[] = knowledge.call_edges.map((e) => ({
    source: e.from.id,
    target: e.to.id,
    kind: e.kind,
  }));
  return { nodes: [...byId.values()], edges };
}

interface RepoTopologyGraphProps {
  knowledge: RepoKnowledge;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function RepoTopologyGraph({ knowledge, selectedId, onSelect }: RepoTopologyGraphProps) {
  const { nodes, edges } = useMemo(() => buildRepoGraph(knowledge), [knowledge]);
  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <Network className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">File graph</span>
        <span className="text-xs text-[var(--text-muted)]">
          {nodes.length} files · {edges.length} edges · click a node to open its blueprint
        </span>
      </Cluster>
      <KnowledgeGraphCanvas
        nodes={nodes}
        edges={edges}
        selectedId={selectedId}
        onSelect={onSelect}
        focusId={selectedId}
        layout="force"
        wrapperTestId="repo-topology-graph"
        emptyTitle="No file graph yet"
        emptyDescription="Run a sync to ingest this repo's files and their import / call edges."
      />
    </Stack>
  );
}
