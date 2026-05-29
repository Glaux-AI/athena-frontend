"use client";

/**
 * EntityGraph — capability Topology's primary visualisation.
 *
 * Per ADR-073 §4 (canonical-home rule): entity graph + top-entities ledger
 * live ONLY on the Capability Topology tab. This is the single home.
 *
 * Now renders the shared interactive `<KnowledgeGraphCanvas>` (pan/zoom,
 * neighbour highlight, cross-repo edges) instead of the static SVG, and
 * draws real edges from `top_entity_edges` (previously hard-coded to `[]`).
 * Clicking a graph node or a ledger row selects + zooms-to the entity, so
 * the graph and the ledger drive each other.
 */

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import {
  KnowledgeGraphCanvas,
  type CanvasEdge,
  type CanvasNode,
} from "@/components/topology/knowledge-graph-canvas";
import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";
import type { CapabilityKnowledge } from "@/lib/api/client";

// Architecture layer → graph band (0 = top): UI over API/services over
// domain/db over util/config over infra/test over docs — so the graph reads
// as a real architecture instead of an index scatter.
const LAYER_BAND: Record<string, number> = {
  ui: 0,
  api: 1,
  service: 1,
  domain: 2,
  db: 2,
  util: 3,
  config: 3,
  infra: 4,
  test: 4,
  docs: 5,
};
const _DEFAULT_BAND = 5;
// Plotted in the graph; the ledger below still lists every entity.
const _GRAPH_MAX = 16;

function buildEntityNodes(knowledge: CapabilityKnowledge): CanvasNode[] {
  return knowledge.top_entities.slice(0, _GRAPH_MAX).map((e): CanvasNode => ({
    id: e.id,
    label: e.name,
    kind: e.kind,
    sublabel: e.repo,
    band: LAYER_BAND[(e.layer ?? "").toLowerCase()] ?? _DEFAULT_BAND,
    importance: e.importance,
  }));
}

function buildEntityEdges(knowledge: CapabilityKnowledge, nodeIds: Set<string>): CanvasEdge[] {
  return (knowledge.top_entity_edges ?? [])
    .filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
    .map((e) => ({
      source: e.source_id,
      target: e.target_id,
      kind: e.kind,
      crossRepo: e.cross_repo ?? false,
    }));
}

interface EntityGraphProps {
  knowledge: CapabilityKnowledge;
  /** Called when the user selects a graph node or ledger row. */
  onSelectEntity?: (entityId: string) => void;
}

export function EntityGraph({ knowledge, onSelectEntity }: EntityGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodes = useMemo(() => buildEntityNodes(knowledge), [knowledge]);
  const edges = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return buildEntityEdges(knowledge, ids);
  }, [knowledge, nodes]);

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) onSelectEntity?.(id);
  };

  return (
    <Stack gap="3">
      <Cluster gap="2" align="center">
        <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Top entities</span>
        <span className="text-xs text-[var(--text-muted)]">
          {knowledge.top_entities.length} ranked by importance, grouped by layer · click to focus
        </span>
      </Cluster>
      <KnowledgeGraphCanvas
        nodes={nodes}
        edges={edges}
        selectedId={selectedId}
        onSelect={select}
        focusId={selectedId}
        wrapperTestId="capability-entity-graph"
        emptyTitle="No entities yet"
        emptyDescription="Run ingestion on an attached repo to populate the entity graph."
      />
      <VirtualList
        items={knowledge.top_entities}
        estimatedItemHeight={64}
        ariaLabel="Top entities ledger"
        getKey={(e) => e.id}
        renderItem={(e) => (
          <button
            type="button"
            id={`entity-${e.id}`}
            onClick={() => select(e.id)}
            aria-pressed={selectedId === e.id}
            className={cn(
              "w-full rounded-md border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              selectedId === e.id
                ? "border-[var(--primary)] bg-[var(--surface-2)]"
                : "border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--surface-2)]",
            )}
          >
            <Cluster gap="2" align="center">
              <span className="font-semibold text-sm">{e.name}</span>
              <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {e.kind}
              </span>
              <code className="font-mono text-[10px] text-[var(--text-subtle)]">{e.path}</code>
              <span className="ml-auto text-[10px] tabular-nums text-[var(--text-subtle)]">
                {(e.importance * 100).toFixed(0)} · {e.repo}
              </span>
            </Cluster>
            {e.description && (
              <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">{e.description}</p>
            )}
          </button>
        )}
      />
    </Stack>
  );
}
