"use client";

/**
 * /knowledge/graph — spatial knowledge-graph explorer (readiness §6.0 Slice
 * 10, upgraded in Phase 6K FE-surface work).
 *
 * The canvas is the shared `<KnowledgeGraphCanvas>` via `<EntityGraphReactFlow>`
 * (real layered layout, pan/zoom, neighbour highlight, focus-to-node). This
 * page owns: data fetching, the loading skeleton + error/empty states, the
 * filter bar, the `?focus=` deep-link (consumed here — previously ignored),
 * the blast-radius toggle, and the right-hand inspector with the evidence
 * cite (path:line), complexity, centrality, tags, and clickable connections.
 *
 * URL is the source of truth so the view is shareable.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Radius } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { EntityGraphReactFlow } from "@/components/topology/entity-graph-react-flow";
import type { OverlayRole } from "@/components/topology/knowledge-graph-canvas";
import {
  GraphFilters,
  parseFiltersFromQuery,
  serializeFiltersToQuery,
  type GraphFiltersState,
} from "@/components/topology/graph-filters";
import { api, ApiError, type KnowledgeEdge, type KnowledgeGraph } from "@/lib/api/client";

/** Group a node's incident edges by `kind` for the relationship inspector,
 *  so "handles → 2", "reads → 3" reads as a typed summary, not a flat list. */
function groupByKind(edges: KnowledgeEdge[]): Array<[string, KnowledgeEdge[]]> {
  const m = new Map<string, KnowledgeEdge[]>();
  for (const e of edges) {
    const arr = m.get(e.kind);
    if (arr) arr.push(e);
    else m.set(e.kind, [e]);
  }
  return Array.from(m.entries());
}

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters: GraphFiltersState = useMemo(
    () => parseFiltersFromQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const focusParam = searchParams.get("focus");

  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [blast, setBlast] = useState(false);
  const [view, setView] = useState<"detail" | "architecture">("detail");
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
        if (view === "architecture") params.rollup = true;
        const g = await api.knowledge.graph(params);
        setGraph(g);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load graph");
      }
    })();
  }, [filters.capabilityId, filters.repoId, filters.limit, filters.layers, view]);

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

  /* Consume the `?focus=` deep-link (from Cmd-K search): select + zoom-to. */
  useEffect(() => {
    if (!focusParam || !graph) return;
    if (graph.nodes.some((n) => n.id === focusParam)) {
      setSelectedId(focusParam);
      setFocusId(focusParam);
    }
  }, [focusParam, graph]);

  /* Keep the selection valid as filters narrow the visible set. */
  useEffect(() => {
    if (selectedId && !visibleNodes.some((n) => n.id === selectedId)) {
      setSelectedId(visibleNodes[0]?.id ?? null);
    } else if (!selectedId && visibleNodes.length > 0) {
      setSelectedId(visibleNodes[0]!.id);
    }
  }, [visibleNodes, selectedId]);

  /* Blast radius: reverse-reachable set from the selected node (everything
   * that transitively depends on it), incl. cross-repo edges. */
  const overlay = useMemo<Map<string, OverlayRole> | null>(() => {
    if (!blast || !selectedId) return null;
    const rev = new Map<string, string[]>();
    for (const e of visibleEdges) {
      const arr = rev.get(e.target_id) ?? [];
      arr.push(e.source_id);
      rev.set(e.target_id, arr);
    }
    const seen = new Set<string>([selectedId]);
    const queue = [selectedId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const dep of rev.get(cur) ?? []) {
        if (!seen.has(dep)) { seen.add(dep); queue.push(dep); }
      }
    }
    const m = new Map<string, OverlayRole>();
    m.set(selectedId, "changed");
    for (const id of seen) if (id !== selectedId) m.set(id, "affected");
    return m;
  }, [blast, selectedId, visibleEdges]);

  const onFiltersChange = useCallback((next: GraphFiltersState) => {
    const qs = serializeFiltersToQuery(next);
    router.replace(`/knowledge/graph${qs ? `?${qs}` : ""}`);
  }, [router]);

  if (error) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger-ink)]">{error}</p></Card>;
  if (!graph) return (
    <Stack gap="6" aria-busy="true" aria-label="Loading knowledge graph">
      <Stack gap="1">
        <div className="h-7 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
      <div className="flex gap-4">
        <Card variant="elevated" className="flex-1 p-0 overflow-hidden">
          <div className="h-[520px] w-full animate-pulse bg-[var(--surface-2)]" />
        </Card>
        <Card variant="elevated" className="w-80 shrink-0">
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
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const outgoing = selected ? visibleEdges.filter((e) => e.source_id === selected.id) : [];
  const incoming = selected ? visibleEdges.filter((e) => e.target_id === selected.id) : [];
  const outGroups = groupByKind(outgoing);
  const inGroups = groupByKind(incoming);
  const affectedCount = overlay ? overlay.size - 1 : 0;
  const affectedRepos = overlay
    ? new Set(Array.from(overlay.keys()).map((id) => nodeById.get(id)?.repo_id).filter(Boolean)).size
    : 0;

  const pick = (id: string) => { setSelectedId(id); setFocusId(id); };

  return (
    <Stack gap="6">
      <Cluster justify="between" align="start">
        <Stack gap="1">
          <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            <ArrowLeft className="size-4" />
            Back to org knowledge
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {visibleNodes.length} of {graph.nodes.length} nodes shown · {visibleEdges.length} of {graph.edges.length} edges.{" "}
            {view === "architecture"
              ? "Service / module topology — typed edges show how groups interconnect."
              : "Double-click a module to drill into its files and symbols."}
            {graph.truncated && " · result truncated — narrow with filters."}
          </p>
        </Stack>
        <Cluster gap="1" align="center">
          <Button
            variant={view === "detail" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("detail")}
            aria-pressed={view === "detail"}
            data-testid="graph-view-detail"
          >
            Detail
          </Button>
          <Button
            variant={view === "architecture" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("architecture")}
            aria-pressed={view === "architecture"}
            data-testid="graph-view-architecture"
          >
            Architecture
          </Button>
        </Cluster>
      </Cluster>

      <GraphFilters
        value={filters}
        onChange={onFiltersChange}
        filteredCount={visibleNodes.length}
        totalCount={graph.nodes.length}
      />

      <div className="flex gap-4">
        <Card variant="elevated" className="flex-1 p-0 overflow-hidden">
          <EntityGraphReactFlow
            nodes={visibleNodes}
            edges={visibleEdges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusId={focusId}
            overlay={overlay}
          />
        </Card>

        <Card variant="elevated" className="w-80 shrink-0">
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

              {selected.summary && (
                <p className="text-sm text-[var(--text-muted)]">{selected.summary}</p>
              )}

              {/* Evidence cite + signals */}
              {(selected.path || selected.complexity != null || selected.centrality != null) && (
                <Cluster gap="1" align="center" className="flex-wrap text-[10px]">
                  {selected.path && (
                    <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[var(--text-subtle)]">
                      {selected.path}{selected.line_start != null ? `:${selected.line_start}${selected.line_end != null ? `-${selected.line_end}` : ""}` : ""}
                    </code>
                  )}
                  {selected.complexity != null && (
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 tabular-nums text-[var(--text-muted)]" title="McCabe cyclomatic complexity">cx {selected.complexity}</span>
                  )}
                  {selected.centrality != null && (
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 tabular-nums text-[var(--text-muted)]" title="PageRank centrality">central {(selected.centrality * 100).toFixed(0)}</span>
                  )}
                </Cluster>
              )}

              {/* Blast-radius toggle — Athena's cross-repo differentiator */}
              <Button
                variant={blast ? "default" : "ghost"}
                size="sm"
                onClick={() => setBlast((b) => !b)}
                aria-pressed={blast}
                data-testid="blast-radius-toggle"
              >
                <Radius className="size-3.5" />
                {blast ? "Hide blast radius" : "Show blast radius"}
              </Button>
              {blast && (
                <p className="text-xs text-[var(--text-muted)]" data-testid="blast-radius-summary">
                  <span className="font-semibold text-[var(--warning)]">{affectedCount}</span> node{affectedCount === 1 ? "" : "s"} affected across <span className="font-semibold">{affectedRepos}</span> repo{affectedRepos === 1 ? "" : "s"} if this changes.
                </p>
              )}

              <Stack gap="2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Connected to</span>
                {outGroups.length === 0 && inGroups.length === 0 ? (
                  <span className="text-sm text-[var(--text-subtle)]">No edges in view.</span>
                ) : (
                  <Stack gap="2">
                    {outGroups.map(([kind, items]) => (
                      <Stack gap="1" key={`out_${kind}`}>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                          {kind} → <span className="tabular-nums">{items.length}</span>
                        </span>
                        <ul className="space-y-0.5 pl-2 text-sm">
                          {items.map((e, i) => {
                            const dst = nodeById.get(e.target_id);
                            return dst ? (
                              <li key={`o_${kind}_${i}`}>
                                <button type="button" onClick={() => pick(dst.id)} className="block w-full rounded px-1.5 py-0.5 text-left text-[var(--text-muted)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                                  <span className="text-[var(--text)]">{dst.name}</span>
                                  {e.cross_repo ? <span className="text-[var(--warning)]" title="cross-repo edge"> ⇢</span> : null}
                                  {e.weight && e.weight > 1 ? <span className="tabular-nums text-[var(--text-subtle)]"> ×{e.weight}</span> : null}
                                </button>
                              </li>
                            ) : null;
                          })}
                        </ul>
                      </Stack>
                    ))}
                    {inGroups.map(([kind, items]) => (
                      <Stack gap="1" key={`in_${kind}`}>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                          ← {kind} <span className="tabular-nums">{items.length}</span>
                        </span>
                        <ul className="space-y-0.5 pl-2 text-sm">
                          {items.map((e, i) => {
                            const src = nodeById.get(e.source_id);
                            return src ? (
                              <li key={`i_${kind}_${i}`}>
                                <button type="button" onClick={() => pick(src.id)} className="block w-full rounded px-1.5 py-0.5 text-left text-[var(--text-muted)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                                  <span className="text-[var(--text)]">{src.name}</span>
                                  {e.cross_repo ? <span className="text-[var(--warning)]" title="cross-repo edge"> ⇢</span> : null}
                                </button>
                              </li>
                            ) : null;
                          })}
                        </ul>
                      </Stack>
                    ))}
                  </Stack>
                )}
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
