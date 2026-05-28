"use client";

/**
 * /knowledge/graph — spatial knowledge-graph view (readiness §6.0 Slice 10).
 *
 * The canvas is rendered by `<EntityGraphReactFlow>` (React Flow); this page
 * owns data fetching, the loading skeleton, error state, the filter bar,
 * and the right-hand inspector panel that lists connected edges for the
 * selected node.
 *
 * Filters: `<GraphFilters>` exposes the four BE query params (capability_id,
 * repo_id, layer, limit) plus a client-side `q` (search by name) and `kind`
 * multi-select. URL is the source of truth — everything serialises so the
 * view is shareable.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { EntityGraphReactFlow } from "@/components/topology/entity-graph-react-flow";
import {
  GraphFilters,
  parseFiltersFromQuery,
  serializeFiltersToQuery,
  type GraphFiltersState,
} from "@/components/topology/graph-filters";
import { api, ApiError, type KnowledgeGraph, type KnowledgeNode } from "@/lib/api/client";

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters: GraphFiltersState = useMemo(
    () => parseFiltersFromQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selected, setSelected] = useState<KnowledgeNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* BE call. Only single-layer is passed through; multi-select layer is
   * applied client-side because the endpoint accepts one layer per request. */
  useEffect(() => {
    (async () => {
      try {
        const params: Parameters<typeof api.knowledge.graph>[0] = { limit: filters.limit };
        if (filters.capabilityId) params.capability_id = filters.capabilityId;
        if (filters.repoId) params.repo_id = filters.repoId;
        if (filters.layers.length === 1) params.layer = filters.layers[0]!;
        const g = await api.knowledge.graph(params);
        setGraph(g);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load graph");
      }
    })();
  }, [filters.capabilityId, filters.repoId, filters.limit, filters.layers]);

  /* Client-side narrowing: kinds + layer multi-select + name search. */
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (!graph) return { visibleNodes: [], visibleEdges: [] };
    const q = filters.q.trim().toLowerCase();
    const kindSet = new Set<string>(filters.kinds);
    const layerSet = new Set<string>(filters.layers);
    const kept = graph.nodes.filter((n) => {
      if (kindSet.size > 0 && !kindSet.has(n.node_kind)) return false;
      if (layerSet.size > 0 && (!n.layer || !layerSet.has(n.layer))) return false;
      if (q && !n.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const keptIds = new Set(kept.map((n) => n.id));
    return {
      visibleNodes: kept,
      visibleEdges: graph.edges.filter((e) => keptIds.has(e.source_id) && keptIds.has(e.target_id)),
    };
  }, [graph, filters.kinds, filters.layers, filters.q]);

  /* Keep the selected node in sync with the visible set. */
  useEffect(() => {
    if (!selected) { setSelected(visibleNodes[0] ?? null); return; }
    if (!visibleNodes.find((n) => n.id === selected.id)) setSelected(visibleNodes[0] ?? null);
  }, [visibleNodes, selected]);

  const onFiltersChange = useCallback((next: GraphFiltersState) => {
    const qs = serializeFiltersToQuery(next);
    router.replace(`/knowledge/graph${qs ? `?${qs}` : ""}`);
  }, [router]);

  if (error) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>;
  if (!graph) return (
    <Stack gap="6" aria-busy="true" aria-label="Loading knowledge graph">
      <Stack gap="1">
        <div className="h-7 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
      <div className="flex gap-4">
        <Card className="flex-1 p-0 overflow-hidden">
          <div className="h-[520px] w-full animate-pulse bg-[var(--surface-2)]" />
        </Card>
        <Card className="w-80 shrink-0">
          <Stack gap="3">
            <div className="h-4 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-5 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="mt-2 h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
          </Stack>
        </Card>
      </div>
    </Stack>
  );

  const nodeById = new Map(visibleNodes.map((n) => [n.id, n]));

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            <ArrowLeft className="size-4" />
            Back to org knowledge
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {visibleNodes.length} of {graph.nodes.length} nodes shown · {visibleEdges.length} of {graph.edges.length} edges across services, modules, configs, and decisions.
          </p>
        </Stack>
      </Cluster>

      <GraphFilters
        value={filters}
        onChange={onFiltersChange}
        filteredCount={visibleNodes.length}
        totalCount={graph.nodes.length}
      />

      <div className="flex gap-4">
        <Card className="flex-1 p-0 overflow-hidden">
          <EntityGraphReactFlow
            nodes={visibleNodes}
            edges={visibleEdges}
            onSelectNode={setSelected}
          />
        </Card>

        <Card className="w-80 shrink-0">
          {selected ? (
            <Stack gap="3">
              <Stack gap="1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{selected.layer ?? "—"} · {selected.node_kind}</span>
                <h2 className="text-base font-semibold">{selected.name}</h2>
                {selected.tags.length > 0 && (
                  <Cluster gap="1">
                    {selected.tags.map((t) => (
                      <span key={t} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">{t}</span>
                    ))}
                  </Cluster>
                )}
              </Stack>
              <Stack gap="1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Connected to</span>
                <ul className="space-y-1 text-sm">
                  {visibleEdges.filter((e) => e.source_id === selected.id).map((e, i) => {
                    const dst = nodeById.get(e.target_id);
                    return dst ? <li key={i} className="text-[var(--text-muted)]">{e.kind} → <span className="text-[var(--text)]">{dst.name}</span></li> : null;
                  })}
                  {visibleEdges.filter((e) => e.target_id === selected.id).map((e, i) => {
                    const src = nodeById.get(e.source_id);
                    return src ? <li key={`in_${i}`} className="text-[var(--text-muted)]"><span className="text-[var(--text)]">{src.name}</span> → {e.kind}</li> : null;
                  })}
                </ul>
              </Stack>
            </Stack>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Click a node to inspect.</p>
          )}
        </Card>
      </div>
    </Stack>
  );
}
