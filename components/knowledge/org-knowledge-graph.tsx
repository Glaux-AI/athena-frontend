"use client";

/**
 * OrgKnowledgeGraph - the org-scope interactive entity graph with an inline
 * node dossier below it.
 *
 * This renders the SAME real knowledge graph the (now-removed) standalone
 * `/knowledge/graph` explorer rendered - `api.knowledge.graph()` projected
 * onto the shared Cytoscape `<EntityGraph>` - so the org Topology tab finally
 * shows real file/symbol/service entities instead of the coarse cap-only
 * `seedOrg` view. A filter bar (`<GraphFilters>`) narrows the set by
 * domain / repo / layer / kind / name (URL-free local state so it never
 * clobbers the page's `?tab=` param).
 *
 * Selecting a node shows that node's dossier BELOW the graph via the shared
 * `<NodeDossierBody>` - the exact render the topology explorer's detail panel
 * uses - including the file -> "Open full detail" `<FileDetailDrawer>`. Ref
 * chips inside the dossier open the GLOBAL node drawer (node->node hops)
 * without disturbing the graph selection.
 */

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityGraph } from "@/components/topology/entity-graph";
import {
  GraphFilters,
  EMPTY_FILTERS,
  type GraphFiltersState,
} from "@/components/topology/graph-filters";
import {
  api,
  ApiError,
  type KnowledgeGraph,
  type NodeDossierResponse,
} from "@/lib/api/client";
import {
  NodeDossierBody,
  isSelfBlueprint,
  resolveFileTarget,
  type FileTarget,
} from "@/components/knowledge/node-dossier-body";
import { useNodeDossier } from "@/components/knowledge/node-dossier-context";
import { FileDetailDrawer } from "@/components/repo/file-detail-drawer";

const GRAPH_HEIGHT = 420;

export function OrgKnowledgeGraph() {
  const [filters, setFilters] = useState<GraphFiltersState>(EMPTY_FILTERS);
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The endpoint accepts ONE layer; a multi-select (or zero) layer is narrowed
  // client-side, so it must not drive a refetch. Deriving the single server
  // layer keeps toggling extra layer chips a purely client-side operation.
  const serverLayer = filters.layers.length === 1 ? filters.layers[0]! : null;

  // BE call. `kind` + multi-`layer` + name `q` are narrowed client-side below.
  // No domain/repo filter => the whole org graph. The previous graph stays
  // mounted while a refetch is in flight (we only swap on success) so the live
  // Cytoscape instance - and its viewport / selection / zoom - is never thrown
  // away by a filter change; KnowledgeGraph diffs the new elements in.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params: Parameters<typeof api.knowledge.graph>[0] = { limit: filters.limit };
        if (filters.domainId) params.domain_id = filters.domainId;
        if (filters.repoId) params.repo_id = filters.repoId;
        if (serverLayer) params.layer = serverLayer;
        const g = await api.knowledge.graph(params);
        if (!cancelled) setGraph(g);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load graph");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filters.domainId, filters.repoId, filters.limit, serverLayer]);

  // Client-side narrowing: kinds + layer multi-select + name search.
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

  // Keep the selection valid as filters narrow the set; default to the first
  // visible node so the dossier panel below is populated on load.
  useEffect(() => {
    if (selectedId && !visibleNodes.some((n) => n.id === selectedId)) {
      setSelectedId(visibleNodes[0]?.id ?? null);
    } else if (!selectedId && visibleNodes.length > 0) {
      setSelectedId(visibleNodes[0]!.id);
    }
  }, [visibleNodes, selectedId]);

  // First-load failure (no graph to fall back to). A refetch that fails while a
  // prior graph is shown keeps the last-good graph rather than blanking it.
  if (error && !graph) {
    return (
      <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
        {error}
      </div>
    );
  }

  // First load only - once a graph exists, a refetch keeps it mounted (busy pill).
  if (!graph) {
    return (
      <Stack gap="4" aria-busy="true" aria-label="Loading topology">
        <Skeleton className="h-10 w-full rounded-md" />
        <Card variant="elevated" className="p-0 overflow-hidden">
          <Skeleton className="h-[420px] w-full rounded-none" />
        </Card>
        <Card variant="elevated">
          <Skeleton className="h-40 w-full rounded-md" />
        </Card>
      </Stack>
    );
  }

  // Distinguish "the org has no graph yet" (ingest CTA) from "filters excluded
  // every node" (a no-match state with the filter bar still above to adjust).
  const filteredOutAll = graph.nodes.length > 0 && visibleNodes.length === 0;

  return (
    <Stack gap="4">
      <GraphFilters
        value={filters}
        onChange={setFilters}
        filteredCount={visibleNodes.length}
        totalCount={graph.nodes.length}
      />
      <Card variant="elevated" className="p-0 overflow-hidden">
        <EntityGraph
          nodes={visibleNodes}
          edges={visibleEdges}
          selectedId={selectedId}
          onSelect={setSelectedId}
          busy={loading}
          height={GRAPH_HEIGHT}
          emptyTitle={filteredOutAll ? "No matching nodes" : "No knowledge yet"}
          emptyDescription={
            filteredOutAll
              ? "No nodes match the current filters. Adjust or clear the filters above."
              : "Connect a repo and run ingestion to populate the knowledge graph."
          }
        />
      </Card>
      <OrgNodeDossier selectedId={selectedId} />
    </Stack>
  );
}

/* ----------------------------- dossier panel ---------------------------- */

/** The "node details below the graph" surface for the org entity graph. Mirrors
 *  the topology explorer's detail panel (`explorer-detail-panel.tsx`) for real
 *  KG nodes - org graph nodes are all real, so there's no synthetic-scope
 *  branch here. */
function OrgNodeDossier({ selectedId }: { selectedId: string | null }) {
  const { open } = useNodeDossier();
  const [res, setRes] = useState<NodeDossierResponse | null>(null);
  const [fileTarget, setFileTarget] = useState<FileTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local (not URL-backed): the dossier's node selection is itself local, so a
  // deep-linked `?file=` would open this drawer against the wrong node. Back
  // exits the parent graph, not this secondary blueprint drawer.
  const [drawerFileId, setDrawerFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) { setRes(null); setFileTarget(null); setError(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRes(null);
    setFileTarget(null);
    api.knowledge
      .node(selectedId)
      .then(async (r) => {
        if (cancelled) return;
        const target = isSelfBlueprint(r) ? null : await resolveFileTarget(r);
        if (cancelled) return;
        setRes(r);
        setFileTarget(target);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load node"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  if (!selectedId) {
    return (
      <Card variant="elevated" data-testid="org-node-dossier">
        <p className="text-sm text-[var(--text-muted)]">Click a node in the graph to inspect its dossier.</p>
      </Card>
    );
  }

  const kind = res?.node_kind ?? res?.dossier?.kind ?? "Node";
  const name = res?.name ?? res?.dossier?.name ?? (loading ? "Loading…" : "-");
  const isFile = res?.node_kind === "file" && !!res.repo_id;

  return (
    <Card variant="elevated" data-testid="org-node-dossier" className="overflow-hidden p-0">
      <header className="glass-chrome flex items-center justify-between gap-3 px-4 py-3">
        <Stack gap="0" className="min-w-0">
          <Eyebrow>{kind}</Eyebrow>
          <span className="truncate text-sm font-semibold text-[var(--text)]" title={name}>{name}</span>
        </Stack>
        {isFile && (
          <Button
            size="sm"
            variant="glass"
            onClick={() => setDrawerFileId(selectedId)}
            data-testid="open-full-detail"
            className="shrink-0"
          >
            <FileText className="size-3.5" aria-hidden />
            Open full detail
          </Button>
        )}
      </header>
      <hr className="hr-horizon" aria-hidden="true" />
      <div className="p-4">
        <NodeDossierBody res={res} fileTarget={fileTarget} loading={loading} error={error} onNavigate={open} />
      </div>

      {drawerFileId && res?.repo_id && (
        <FileDetailDrawer
          repoId={res.repo_id}
          fileId={drawerFileId}
          onClose={() => setDrawerFileId(null)}
          onNavigateFile={(id) => setDrawerFileId(id)}
        />
      )}
    </Card>
  );
}
