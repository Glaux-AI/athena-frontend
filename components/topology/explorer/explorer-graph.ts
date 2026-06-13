/**
 * explorer-graph.ts - the PURE state machine behind the topology explorer.
 *
 * No React, no fetch, no DOM: every function takes a `GraphState` and returns a
 * NEW one (immutable), so it's exhaustively unit-testable under env=node and the
 * store (`explorer-store.tsx`) is a thin shell that sequences these + the
 * `api.knowledge.neighbors` call.
 *
 * The graph is on-demand: it SEEDS with a single scope root + its 1-hop
 * children (`scope-seed.ts`), then each `select(id)` → `expand(id)` pulls that
 * node's neighbours and `mergeNeighbors` folds them in. `enforceBounds` keeps
 * the visible set bounded (≤ MAX_HOPS from focus, ≤ SOFT_CAP nodes) so it stays
 * UNDER the canvas LOD ceiling (220) - the canvas relayout branch is dead code
 * for the explorer, which is what keeps it from flickering.
 */

import type { KnowledgeEdge, NodeNeighbors } from "@/lib/api/client";
import type { GraphNode, GraphLink } from "@/components/topology/graph/graph-data";

/** Hops from focus beyond which a node is dropped (kept in the LRU cache). */
const MAX_HOPS = 3;
/** Visible-node soft cap - deliberately under the canvas MAX_VISIBLE_NODES=220. */
const SOFT_CAP = 180;
/** Bound on the dropped-node side-cache (instant re-expand without a refetch). */
const CACHE_LIMIT = 400;

/** A graph node - a real KG node, or a synthetic scope node (repo/cap/org). */
export interface GNode {
  id: string;
  node_kind: string;
  name: string;
  layer?: string | null;
  repo_id?: string | null;
  path?: string | null;
  centrality?: number | null;
  tags?: string[];
  /** Synthetic scope node (repo/cap/org root or scope-ref) - no real KG row, so
   *  detail routes to <ScopeDossierPanel> (its Blueprint) and
   *  `api.knowledge.node()` is skipped. */
  synthetic?: boolean;
  /** Off-graph search hit awaiting its first expand - a real KG node, identity
   *  only until neighbours load (which overwrite it). */
  stub?: boolean;
  /** For synthetic scope nodes: which scope + the real id behind it. */
  scopeKind?: "repo" | "domain" | "org";
  scopeId?: string;
}

export interface GEdge {
  source_id: string;
  target_id: string;
  kind: string;
  cross_repo?: boolean;
  confidence?: number | null;
}

export interface GraphState {
  nodes: Map<string, GNode>;
  edges: Map<string, GEdge>;
  /** node id → BFS distance from `focus` (recomputed on select / merge). */
  hop: Map<string, number>;
  focus: string | null;
  /** LRU side-cache of nodes dropped by enforceBounds, for instant re-expand. */
  cache: Map<string, GNode>;
}

export interface Seed {
  nodes: GNode[];
  edges: GEdge[];
  rootId: string;
}

/** Stable key so the same (src,dst,kind) edge dedupes across merges. */
function edgeKey(e: { source_id: string; target_id: string; kind: string }): string {
  return `${e.source_id}|${e.target_id}|${e.kind}`;
}

function normEdge(e: KnowledgeEdge | GEdge): GEdge {
  return {
    source_id: e.source_id,
    target_id: e.target_id,
    kind: e.kind,
    cross_repo: e.cross_repo ?? false,
    confidence: e.confidence ?? null,
  };
}

/** BFS distance of every reachable node from `focusId` (undirected). */
export function bfsHops(
  nodes: Map<string, GNode>,
  edges: Map<string, GEdge>,
  focusId: string | null,
): Map<string, number> {
  const hop = new Map<string, number>();
  if (!focusId || !nodes.has(focusId)) return hop;
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const arr = adj.get(a);
    if (arr) arr.push(b);
    else adj.set(a, [b]);
  };
  for (const e of edges.values()) {
    link(e.source_id, e.target_id);
    link(e.target_id, e.source_id);
  }
  const queue: string[] = [focusId];
  hop.set(focusId, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const d = hop.get(id)!;
    for (const nb of adj.get(id) ?? []) {
      if (!nodes.has(nb) || hop.has(nb)) continue;
      hop.set(nb, d + 1);
      queue.push(nb);
    }
  }
  return hop;
}

/** Build the initial state from a scope seed; focus = the synthetic root. */
export function seedGraph(seed: Seed): GraphState {
  const nodes = new Map<string, GNode>();
  for (const n of seed.nodes) nodes.set(n.id, n);
  const edges = new Map<string, GEdge>();
  for (const e of seed.edges) edges.set(edgeKey(e), normEdge(e));
  return { nodes, edges, hop: bfsHops(nodes, edges, seed.rootId), focus: seed.rootId, cache: new Map() };
}

export interface SelectOpts {
  /** When `id` isn't in the graph (a search hit elsewhere in the scope), inject
   *  this as the focus stub so there's something to expand from. */
  stub?: GNode;
}

/** Set focus to `id`. If it's off-graph, pull it from the LRU cache or inject
 *  the provided stub. Recomputes hops; no fetch (the store schedules expand). */
export function selectNode(state: GraphState, id: string, opts: SelectOpts = {}): GraphState {
  let nodes = state.nodes;
  if (!nodes.has(id)) {
    const cached = state.cache.get(id);
    const inject = cached ?? (opts.stub ? { ...opts.stub, stub: true } : null);
    if (!inject) return state; // can't focus a node we know nothing about
    nodes = new Map(nodes);
    nodes.set(id, inject);
  }
  return { ...state, nodes, focus: id, hop: bfsHops(nodes, state.edges, id) };
}

/** Fold an EXPANDED node's fetched neighbourhood in: add new nodes/edges, dedupe
 *  by id / edge-key, let real data overwrite a stub, clear the expanded node's
 *  own stub flag, and recompute hops FROM THE CURRENT FOCUS (the viewport
 *  centre - which may differ from `expandedId` when the tree expands an
 *  off-focus node). Idempotent - re-merging the same payload is a no-op on
 *  membership. */
export function mergeNeighbors(state: GraphState, expandedId: string, neighbors: NodeNeighbors): GraphState {
  const nodes = new Map(state.nodes);
  const edges = new Map(state.edges);
  const cache = new Map(state.cache);
  for (const n of neighbors.nodes) {
    const existing = nodes.get(n.id);
    if (!existing || existing.stub) {
      nodes.set(n.id, { ...n, stub: false });
      cache.delete(n.id);
    }
  }
  const f = nodes.get(expandedId);
  if (f?.stub) nodes.set(expandedId, { ...f, stub: false });
  for (const e of neighbors.edges) {
    const key = edgeKey(e);
    if (!edges.has(key)) edges.set(key, normEdge(e));
  }
  return { ...state, nodes, edges, cache, hop: bfsHops(nodes, edges, state.focus) };
}

/** Keep the visible set bounded: drop nodes > maxHops from focus (or unreachable)
 *  to the LRU cache, then - if still over softCap - drop farthest-then-least-
 *  central, always pinning focus + its 1-hop neighbours. Prunes now-dangling
 *  edges. Assumes `state.hop` is current (call after a select/merge). */
export function enforceBounds(
  state: GraphState,
  opts: { maxHops?: number; softCap?: number } = {},
): GraphState {
  const maxHops = opts.maxHops ?? MAX_HOPS;
  const softCap = opts.softCap ?? SOFT_CAP;
  const { focus, hop } = state;
  const cache = new Map(state.cache);
  const keep = new Map<string, GNode>();
  const dropped: GNode[] = [];

  for (const [id, n] of state.nodes) {
    if (id === focus) { keep.set(id, n); continue; }
    const d = hop.get(id);
    if (d === undefined || d > maxHops) dropped.push(n);
    else keep.set(id, n);
  }

  if (keep.size > softCap) {
    const pinned = (id: string) => id === focus || (hop.get(id) ?? Infinity) <= 1;
    const candidates = [...keep.values()]
      .filter((n) => !pinned(n.id))
      .sort((a, b) => {
        const ha = hop.get(a.id) ?? Infinity;
        const hb = hop.get(b.id) ?? Infinity;
        if (ha !== hb) return hb - ha;                       // farthest first
        return (a.centrality ?? 0) - (b.centrality ?? 0);    // least central first
      });
    let over = keep.size - softCap;
    for (const n of candidates) {
      if (over <= 0) break;
      keep.delete(n.id);
      dropped.push(n);
      over--;
    }
  }

  const edges = new Map<string, GEdge>();
  for (const [k, e] of state.edges) {
    if (keep.has(e.source_id) && keep.has(e.target_id)) edges.set(k, e);
  }

  for (const n of dropped) {
    cache.delete(n.id); // re-insert at the tail (LRU recency)
    cache.set(n.id, n);
  }
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }

  return { ...state, nodes: keep, edges, cache };
}

/** Merge a freshly-built scope seed into the LIVE graph WITHOUT resetting it:
 *  add any seed nodes/edges we don't already have, keep everything fetched on
 *  demand, and - crucially - return the SAME reference when nothing is new so
 *  React bails out. This is what lets a same-scope data refresh (the 3s sync
 *  poll) flow through without wiping the user's selection / expansion / zoom.
 *  A genuine scope change is handled by the store re-seeding instead. */
export function reconcileSeed(state: GraphState, seed: Seed): GraphState {
  const nodes = new Map(state.nodes);
  const edges = new Map(state.edges);
  let changed = false;
  for (const n of seed.nodes) {
    if (!nodes.has(n.id)) { nodes.set(n.id, n); changed = true; }
  }
  for (const e of seed.edges) {
    const k = edgeKey(e);
    if (!edges.has(k)) { edges.set(k, normEdge(e)); changed = true; }
  }
  if (!changed) return state;
  return { ...state, nodes, edges, hop: bfsHops(nodes, edges, state.focus) };
}

/** Project the live graph onto the Cytoscape component's {nodes, links} shape.
 *  Containment (`contains` edges) becomes node nesting (`parent`) - the spine
 *  is rendered as boxes, not lines - and behavioural edges become the links.
 *  A `contains` parent is honoured only when it doesn't introduce a cycle. */
export function toGraphElements(state: GraphState): { nodes: GraphNode[]; links: GraphLink[] } {
  const ids = state.nodes;
  const parentOf = new Map<string, string>();
  const links: GraphLink[] = [];
  const wouldCycle = (child: string, parent: string): boolean => {
    let cur: string | undefined = parent;
    const seen = new Set<string>();
    while (cur) {
      if (cur === child) return true;
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };
  for (const e of state.edges.values()) {
    if (!ids.has(e.source_id) || !ids.has(e.target_id)) continue;
    if (e.kind === "contains") {
      if (e.source_id !== e.target_id && !parentOf.has(e.target_id) && !wouldCycle(e.target_id, e.source_id)) {
        parentOf.set(e.target_id, e.source_id);
      }
    } else {
      links.push({
        source: e.source_id,
        target: e.target_id,
        kind: e.kind,
        crossRepo: e.cross_repo ?? false,
        dashed: e.cross_repo ?? false,
      });
    }
  }
  const nodes: GraphNode[] = [];
  for (const n of state.nodes.values()) {
    nodes.push({
      id: n.id,
      label: n.name,
      kind: n.node_kind,
      sublabel: n.path ?? n.layer ?? null,
      parent: parentOf.get(n.id) ?? null,
      importance: n.synthetic ? 1 : n.centrality ?? 0.4,
      stub: n.stub ?? false,
      synthetic: n.synthetic ?? false,
    });
  }
  return { nodes, links };
}
