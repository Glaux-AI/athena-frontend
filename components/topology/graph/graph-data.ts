/**
 * graph-data.ts — PURE, framework-free helpers for the Cytoscape knowledge
 * graph. No React, no `cytoscape` import, no DOM: every function is a plain
 * data transform so it's exhaustively unit-testable under env=node (the canvas
 * itself can't be asserted headless, exactly as the old React-Flow surface
 * couldn't — so all real logic lives here).
 *
 * The component (`knowledge-graph.tsx`) renders whatever {nodes, links} it's
 * handed; containment is expressed as a per-node `parent` (Cytoscape compound
 * nesting), and "collapse" is a pure render-time filter over that tree — never
 * a mutation of the source data. Keeping both here means the graph stays a
 * projection of state, which is what kills the old flicker.
 */

/** A node for the graph. `parent` (when set + present in the same set) nests
 *  this node inside a Cytoscape compound — the containment spine
 *  (org ▸ capability ▸ repo ▸ module ▸ file). */
export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  sublabel?: string | null;
  parent?: string | null;
  /** 0–1 centrality → node size. */
  importance?: number | null;
  /** Off-graph search hit awaiting expansion (rendered with a "…" affordance). */
  stub?: boolean;
  /** Synthetic scope node (repo/cap/org root or ref) — no real KG row. */
  synthetic?: boolean;
}

/** A behavioral edge (calls/imports/handles/…). Containment is NOT an edge here
 *  — it's nesting (`GraphNode.parent`), so the graph reads as typed
 *  relationships rather than an undifferentiated `contains` thicket. */
export interface GraphLink {
  source: string;
  target: string;
  kind?: string | null;
  crossRepo?: boolean;
  rolledUp?: boolean;
  weight?: number | null;
  /** Dashed render (cross-repo / low-confidence). */
  dashed?: boolean;
}

export type OverlayRole = "changed" | "affected";

/** Split a typed edge list into the containment forest (`parent` map) + the
 *  behavioral links to actually draw. A node takes the FIRST `contains` parent
 *  that doesn't introduce a cycle (the seed spine is a tree; on-demand merges
 *  could in theory cross, so we guard). Endpoints absent from the node set are
 *  dropped. Generic over the edge shape so callers keep their own payload
 *  (cross-repo / weight / confidence) on the returned links. */
export function deriveContainment<E extends { source: string; target: string; kind?: string | null }>(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<E>,
): { parentOf: Map<string, string>; links: E[] } {
  const ids = new Set(nodes.map((n) => n.id));
  const parentOf = new Map<string, string>();
  const links: E[] = [];

  const wouldCycle = (child: string, parent: string): boolean => {
    // Walk parent's ancestry; if we reach `child`, nesting would loop.
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

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    if (e.kind === "contains") {
      if (e.source !== e.target && !parentOf.has(e.target) && !wouldCycle(e.target, e.source)) {
        parentOf.set(e.target, e.source);
      }
    } else {
      links.push(e);
    }
  }
  return { parentOf, links };
}

/** Set of node ids that are a containment parent of at least one node. */
export function parentSet(parentOf: ReadonlyMap<string, string>): Set<string> {
  return new Set(parentOf.values());
}

/** True when any ancestor of `id` is in `collapsed` (so `id` is folded away). */
export function hasCollapsedAncestor(
  id: string,
  parentOf: ReadonlyMap<string, string>,
  collapsed: ReadonlySet<string>,
): boolean {
  let cur = parentOf.get(id);
  const seen = new Set<string>();
  while (cur) {
    if (collapsed.has(cur)) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

export interface VisibleSet {
  /** Ids that render (a collapsed parent stays; its descendants drop). */
  visible: Set<string>;
  /** Collapsed-parent id → count of folded descendants (the +N badge). */
  hiddenCount: Map<string, number>;
}

/** Apply the collapse filter: a node is hidden iff an ancestor is collapsed.
 *  Collapsed parents stay visible (as a leaf) and carry their folded count. */
export function computeVisible(
  nodes: ReadonlyArray<GraphNode>,
  parentOf: ReadonlyMap<string, string>,
  collapsed: ReadonlySet<string>,
): VisibleSet {
  const visible = new Set<string>();
  const hiddenCount = new Map<string, number>();
  for (const n of nodes) {
    if (hasCollapsedAncestor(n.id, parentOf, collapsed)) {
      // Attribute the fold to the nearest collapsed ancestor for its badge.
      let cur = parentOf.get(n.id);
      while (cur && !collapsed.has(cur)) cur = parentOf.get(cur);
      if (cur) hiddenCount.set(cur, (hiddenCount.get(cur) ?? 0) + 1);
      continue;
    }
    visible.add(n.id);
  }
  return { visible, hiddenCount };
}

/** Nearest ancestor of `id` (including itself) that is visible — i.e. the box
 *  a folded node's edges should reroute to. Null if nothing on the chain shows. */
export function nearestVisibleAncestor(
  id: string,
  parentOf: ReadonlyMap<string, string>,
  visible: ReadonlySet<string>,
): string | null {
  let cur: string | undefined = id;
  const seen = new Set<string>();
  while (cur) {
    if (visible.has(cur)) return cur;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return null;
}

/** Reroute each link's endpoints to the nearest VISIBLE box (so edges into a
 *  collapsed module land on the module), drop internal self-edges, and
 *  aggregate duplicates into one rolled-up link carrying the combined weight.
 *  This is what makes collapse meaningful — a folded subtree keeps its external
 *  relationships as a single thick edge instead of vanishing. */
export function projectLinks(
  links: ReadonlyArray<GraphLink>,
  visible: ReadonlySet<string>,
  parentOf: ReadonlyMap<string, string>,
): GraphLink[] {
  const agg = new Map<string, GraphLink & { _count: number }>();
  for (const l of links) {
    const s = nearestVisibleAncestor(l.source, parentOf, visible);
    const t = nearestVisibleAncestor(l.target, parentOf, visible);
    if (!s || !t || s === t) continue;
    const key = `${s}|${t}|${l.kind ?? ""}`;
    const w = l.weight ?? 1;
    const existing = agg.get(key);
    if (existing) {
      existing._count += 1;
      existing.weight = (existing.weight ?? 1) + w;
      existing.rolledUp = true;
      existing.crossRepo = existing.crossRepo || l.crossRepo || false;
      existing.dashed = existing.dashed || l.dashed || false;
    } else {
      agg.set(key, {
        source: s,
        target: t,
        kind: l.kind ?? null,
        crossRepo: l.crossRepo ?? false,
        dashed: (l.dashed || l.crossRepo) ?? false,
        rolledUp: l.rolledUp ?? false,
        weight: w,
        _count: 1,
      });
    }
  }
  const out: GraphLink[] = [];
  for (const v of agg.values()) {
    const { _count, ...link } = v;
    if (_count > 1) link.rolledUp = true;
    out.push(link);
  }
  return out;
}

/** The node to auto-focus on first load — the "you are here" anchor. Prefers a
 *  synthetic scope root (repo/cap/org), else the most-central top-level
 *  (containment-root) node, so the view opens centred on the system's hub
 *  rather than blank or arbitrary. */
export function pickPrimaryNode(nodes: ReadonlyArray<GraphNode>): string | null {
  if (nodes.length === 0) return null;
  const ids = new Set(nodes.map((n) => n.id));
  const roots = nodes.filter((n) => !(n.parent && ids.has(n.parent)));
  const pool = roots.length ? roots : nodes;
  const score = (n: GraphNode) => (n.synthetic ? 1e6 : 0) + (n.importance ?? 0);
  let best = pool[0]!;
  for (const n of pool) if (score(n) > score(best)) best = n;
  return best.id;
}

/** A stable, order-independent signature of the visible element SET — used to
 *  decide when a structural relayout is actually needed (vs. a pure
 *  selection/hover/theme change, which must never relayout: that was the old
 *  flicker). Parent membership is part of the signature so collapse/expand
 *  triggers a relayout, but selecting a node does not. */
export function structureKey(
  nodes: ReadonlyArray<GraphNode>,
  links: ReadonlyArray<GraphLink>,
  visible: ReadonlySet<string>,
): string {
  const ns: string[] = [];
  for (const n of nodes) {
    if (!visible.has(n.id)) continue;
    ns.push(`${n.id}>${n.parent && visible.has(n.parent) ? n.parent : ""}`);
  }
  ns.sort();
  let le = 0;
  for (const l of links) if (visible.has(l.source) && visible.has(l.target)) le++;
  return `${ns.join("|")}#${le}`;
}
