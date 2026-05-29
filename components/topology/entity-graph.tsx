"use client";

/**
 * EntityGraph — capability Topology's primary visualisation.
 *
 * Per ADR-073 §4 (canonical-home rule): entity graph + top-entities ledger
 * live ONLY on the Capability Topology tab. The capability page Blueprint
 * tab does not show these; the Org Topology does not show these. This is
 * the single home.
 *
 * Wraps the existing KnowledgeMiniGraph with a typed adapter for
 * `CapabilityKnowledge.top_entities` and ledger rows underneath.
 */

import { Sparkles } from "lucide-react";

import { KnowledgeMiniGraph, type MiniGraphNode } from "@/components/knowledge/mini-graph";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { CapabilityKnowledge } from "@/lib/api/client";

import { VirtualList } from "@/components/ui/virtual-list";

type Kind = MiniGraphNode["kind"];
const ENTITY_KIND_MAP: Record<string, Kind> = {
  service:  "service",
  module:   "module",
  function: "function",
  class:    "class",
  method:   "function",
  config:   "config",
  document: "document",
  type:     "module",
};

function mapKind(raw: string): Kind {
  return ENTITY_KIND_MAP[raw.toLowerCase()] ?? "module";
}

// Architecture layer → graph band (0 = top). Bands the top entities into
// horizontal tiers — UI over API/services over domain/db over util/config
// over infra/test over docs — so the graph reads as a real architecture
// instead of an index-based scatter (was `Math.floor(i / 4)`).
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

function buildEntityNodes(knowledge: CapabilityKnowledge): MiniGraphNode[] {
  return knowledge.top_entities.slice(0, _GRAPH_MAX).map((e): MiniGraphNode => ({
    id: e.id,
    label: e.name,
    layer: LAYER_BAND[(e.layer ?? "").toLowerCase()] ?? _DEFAULT_BAND,
    kind: mapKind(e.kind),
    sublabel: e.repo,
    importance: e.importance,
  }));
}

interface EntityGraphProps {
  knowledge: CapabilityKnowledge;
  /** Called when the user clicks a graph node — open the entity's detail. */
  onSelectEntity?: (entityId: string) => void;
}

export function EntityGraph({ knowledge, onSelectEntity }: EntityGraphProps) {
  return (
    <Stack gap="3">
      <Cluster gap="2" align="center">
        <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Top entities</span>
        <span className="text-xs text-[var(--text-muted)]">
          {knowledge.top_entities.length} ranked by importance, grouped by layer · click to focus
        </span>
      </Cluster>
      <KnowledgeMiniGraph
        size="wide"
        nodes={buildEntityNodes(knowledge)}
        edges={[]}
        {...(onSelectEntity ? { onSelect: (n) => onSelectEntity(n.id) } : {})}
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
            onClick={() => onSelectEntity?.(e.id)}
            className="w-full rounded-md border border-[var(--border)] p-2.5 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
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
