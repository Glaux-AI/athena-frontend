/**
 * Dependency-free, deterministic graph layout.
 *
 * The knowledge-graph transport intentionally omits x/y (ADR-041 — Postgres
 * is the store, layout is a view concern), so the FE synthesises positions.
 * Historically each surface did a naive `index-in-row` scatter; this module
 * replaces that with a real layered (Sugiyama-style) layout:
 *
 *   1. Rank assignment — each node gets a row. Callers that know the
 *      hierarchy pass an explicit `band`; otherwise ranks are derived from
 *      edge direction (BFS layering from roots).
 *   2. Crossing reduction — within each rank, nodes are reordered by the
 *      barycenter (mean index) of their neighbours over a few sweeps.
 *   3. Coordinate assignment — ranks become rows, order becomes columns,
 *      each rank centred on x=0.
 *
 * No external deps (elkjs/d3-force are not installable behind the pnpm
 * build-script guard), and fully deterministic (no Math.random) so unit
 * tests can assert the rendered set. Sized for the graphs Athena surfaces
 * (tens to a few hundred nodes), not million-node canvases.
 */

export interface LayoutNode {
  id: string;
  /** Explicit row (0 = top). When every node supplies one, ranks skip the
   *  edge-derived pass and use these directly. */
  band?: number | null;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface XY {
  x: number;
  y: number;
}

export interface LayeredLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  /** Vertical gap between rank rows. */
  rowGap?: number;
  /** Horizontal gap between nodes in a row. */
  colGap?: number;
  /** Barycenter ordering sweeps (each sweep is one down + one up pass). */
  sweeps?: number;
}

const DEFAULTS: Required<LayeredLayoutOptions> = {
  nodeWidth: 168,
  nodeHeight: 60,
  rowGap: 88,
  colGap: 28,
  sweeps: 4,
};

/**
 * Compute a layered layout. Returns a map of node id → centre coordinate.
 * Unknown edge endpoints are ignored. Disconnected nodes land on rank 0
 * (or their explicit band).
 */
export function layeredLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayeredLayoutOptions = {},
): Map<string, XY> {
  const opts = { ...DEFAULTS, ...options };
  const positions = new Map<string, XY>();
  if (nodes.length === 0) return positions;

  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const cleanEdges = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target);

  const rank = assignRanks(nodes, cleanEdges);

  // Group node ids by rank, preserving input order as the deterministic seed.
  const rows = new Map<number, string[]>();
  for (const id of ids) {
    const r = rank.get(id) ?? 0;
    const arr = rows.get(r) ?? [];
    arr.push(id);
    rows.set(r, arr);
  }
  const rankValues = Array.from(rows.keys()).sort((a, b) => a - b);

  // Adjacency for barycenter ordering (both directions).
  const neighbours = new Map<string, string[]>();
  for (const id of ids) neighbours.set(id, []);
  for (const e of cleanEdges) {
    neighbours.get(e.source)!.push(e.target);
    neighbours.get(e.target)!.push(e.source);
  }

  // Barycenter sweeps to reduce edge crossings.
  for (let s = 0; s < opts.sweeps; s++) {
    const order = s % 2 === 0 ? rankValues : [...rankValues].reverse();
    for (const r of order) {
      const row = rows.get(r)!;
      if (row.length < 2) continue;
      const indexInRow = new Map<string, number>();
      for (const [r2, arr] of rows) {
        if (r2 === r) continue;
        arr.forEach((id, i) => indexInRow.set(id, i));
      }
      const keyed = row.map((id, i) => {
        const ns = neighbours.get(id)!.filter((n) => indexInRow.has(n));
        const bary = ns.length
          ? ns.reduce((sum, n) => sum + indexInRow.get(n)!, 0) / ns.length
          : i; // keep position if no cross-rank neighbours
        return { id, bary, i };
      });
      // Stable sort by barycenter, tie-broken by original index.
      keyed.sort((a, b) => (a.bary - b.bary) || (a.i - b.i));
      rows.set(r, keyed.map((k) => k.id));
    }
  }

  // Coordinate assignment — centre each rank on x = 0.
  const colStride = opts.nodeWidth + opts.colGap;
  const rowStride = opts.nodeHeight + opts.rowGap;
  rankValues.forEach((r, rowIdx) => {
    const row = rows.get(r)!;
    const totalW = row.length * opts.nodeWidth + Math.max(0, row.length - 1) * opts.colGap;
    const startX = -totalW / 2;
    row.forEach((id, i) => {
      positions.set(id, {
        x: startX + i * colStride + opts.nodeWidth / 2,
        y: rowIdx * rowStride,
      });
    });
  });

  return positions;
}

export interface ForceLayoutOptions {
  /** Ideal edge length — connected nodes settle ~this far apart. */
  idealLength?: number;
  /** Override the (node-count-scaled) iteration budget. */
  iterations?: number;
}

/**
 * Deterministic force-directed (Fruchterman–Reingold) layout — a real 2D
 * spread driven by edges, used for dense graphs where most nodes share a
 * kind/band (e.g. a repo's symbol graph is ~all `function`s, so the layered
 * layout would collapse them onto one row). Connected nodes attract,
 * everything repels, the system cools over a fixed iteration budget. Seeded
 * from a phyllotaxis spiral (no `Math.random`) so the result is identical
 * every run — tests and reloads see the same picture.
 *
 * O(n²) per iteration. Sized for the graphs Athena surfaces (≤1000 nodes);
 * the iteration budget tapers as n grows so a maxed-out explorer stays
 * interactive.
 */
export function forceLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: ForceLayoutOptions = {},
): Map<string, XY> {
  const positions = new Map<string, XY>();
  const n = nodes.length;
  if (n === 0) return positions;
  if (n === 1) {
    positions.set(nodes[0]!.id, { x: 0, y: 0 });
    return positions;
  }

  const L = options.idealLength ?? 260;
  const ids = nodes.map((nd) => nd.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const px = new Float64Array(n);
  const py = new Float64Array(n);

  // Phyllotaxis spiral seed — even, deterministic, no clustering bias.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const seedR = (L * Math.sqrt(n)) / 2;
  for (let i = 0; i < n; i++) {
    const r = seedR * Math.sqrt((i + 0.5) / n);
    const a = i * goldenAngle;
    px[i] = r * Math.cos(a);
    py[i] = r * Math.sin(a);
  }

  const E: Array<[number, number]> = [];
  for (const e of edges) {
    const u = idx.get(e.source);
    const v = idx.get(e.target);
    if (u === undefined || v === undefined || u === v) continue;
    E.push([u, v]);
  }

  const iterations =
    options.iterations ?? (n <= 250 ? 300 : n <= 600 ? 180 : 100);
  const k2 = L * L;
  // Gravity toward the centroid. Plain Fruchterman–Reingold has no
  // counter-force for *disconnected* nodes (sparse file→file graphs have many),
  // so repulsion drifts them to the temperature-limited maximum each iteration
  // and the layout explodes to ±10k+ — fitView then zooms to its floor and the
  // nodes render a few px tall. A gentle inward pull bounds the layout to a
  // compact disk (outer radius ≈ k·√(n/GRAVITY)) while edge attraction still
  // holds connected nodes ~L apart. Deterministic (position-proportional).
  const GRAVITY = 2;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temp = L * 1.5;
  const cool = temp / (iterations + 1);

  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);
    // Repulsion between every pair (fr = k²/d).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = px[i]! - px[j]!;
        let ddy = py[i]! - py[j]!;
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 0.01) {
          // Coincident seed — nudge deterministically by index.
          ddx = (i - j) * 0.01 + 0.01;
          ddy = 0.013;
          d2 = ddx * ddx + ddy * ddy;
        }
        const d = Math.sqrt(d2);
        const f = k2 / d;
        const fx = (ddx / d) * f;
        const fy = (ddy / d) * f;
        dx[i]! += fx;
        dy[i]! += fy;
        dx[j]! -= fx;
        dy[j]! -= fy;
      }
    }
    // Attraction along edges (fa = d²/k), pulling endpoints together.
    for (const [u, v] of E) {
      const ddx = px[u]! - px[v]!;
      const ddy = py[u]! - py[v]!;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      const f = (d * d) / L;
      const fx = (ddx / d) * f;
      const fy = (ddy / d) * f;
      dx[u]! -= fx;
      dy[u]! -= fy;
      dx[v]! += fx;
      dy[v]! += fy;
    }
    // Gravity — pull every node toward the centroid so disconnected nodes
    // can't escape to infinity (bounds the layout to a readable size).
    for (let i = 0; i < n; i++) {
      dx[i]! -= px[i]! * GRAVITY;
      dy[i]! -= py[i]! * GRAVITY;
    }
    // Apply, capped by the current temperature.
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(dx[i]! * dx[i]! + dy[i]! * dy[i]!) || 0.01;
      const lim = Math.min(d, temp);
      px[i]! += (dx[i]! / d) * lim;
      py[i]! += (dy[i]! / d) * lim;
    }
    temp = Math.max(temp - cool, L * 0.05);
  }

  // Centre on the origin.
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += px[i]!;
    cy += py[i]!;
  }
  cx /= n;
  cy /= n;
  for (let i = 0; i < n; i++) positions.set(ids[i]!, { x: px[i]! - cx, y: py[i]! - cy });
  return positions;
}

/**
 * Assign a rank (row index) to every node. If all nodes carry an explicit
 * `band`, those are used (compacted to 0..k). Otherwise ranks are derived by
 * BFS layering from roots (in-degree 0), which gives a stable top-down flow
 * along edge direction and terminates on cycles.
 */
function assignRanks(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): Map<string, number> {
  const rank = new Map<string, number>();

  const allBanded = nodes.every((n) => typeof n.band === "number" && Number.isFinite(n.band));
  if (allBanded) {
    const uniq = Array.from(new Set(nodes.map((n) => n.band as number))).sort((a, b) => a - b);
    const compact = new Map(uniq.map((b, i) => [b, i]));
    for (const n of nodes) rank.set(n.id, compact.get(n.band as number) ?? 0);
    return rank;
  }

  // Edge-derived layering. Build out-adjacency + in-degree.
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    out.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of edges) {
    out.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  // Roots: in-degree 0. If none (every node is in a cycle), seed with the
  // first node so the BFS still covers the component.
  const queue: string[] = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0]!.id);
  for (const id of queue) rank.set(id, 0);

  // BFS — a node's rank is the max over the ranks of its visited parents + 1.
  // Capped at nodes.length to guarantee termination on cycles.
  const cap = nodes.length;
  let head = 0;
  const seen = new Set(queue);
  while (head < queue.length) {
    const id = queue[head++]!;
    const r = rank.get(id) ?? 0;
    for (const next of out.get(id) ?? []) {
      const proposed = Math.min(r + 1, cap);
      if (!rank.has(next) || proposed > (rank.get(next) ?? 0)) rank.set(next, proposed);
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  // Any node never reached (isolated with no in/out, or unreachable) → rank 0.
  for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, 0);

  return rank;
}
