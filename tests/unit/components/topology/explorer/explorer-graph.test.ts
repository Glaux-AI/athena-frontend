// @vitest-environment node

/**
 * Pure-core tests for the topology explorer graph state machine. env=node — no
 * React, no DOM (React Flow clicks don't fire headless anyway, so this is the
 * real verification seam for select / expand / bound behaviour).
 */

import { describe, it, expect } from "vitest";

import {
  seedGraph,
  bfsHops,
  selectNode,
  mergeNeighbors,
  enforceBounds,
  reconcileSeed,
  toGraphElements,
  type GNode,
  type Seed,
} from "@/components/topology/explorer/explorer-graph";
import type { NodeNeighbors } from "@/lib/api/client";

function n(id: string, over: Partial<GNode> = {}): GNode {
  return { id, node_kind: "file", name: id, ...over };
}

function seed(nodes: GNode[], edges: Array<[string, string, string?]>, rootId: string): Seed {
  return {
    rootId,
    nodes,
    edges: edges.map(([s, t, k]) => ({ source_id: s, target_id: t, kind: k ?? "contains" })),
  };
}

function neighbors(nodes: GNode[], edges: Array<[string, string, string?]>): NodeNeighbors {
  return {
    nodes: nodes.map((g) => ({
      id: g.id, node_kind: g.node_kind, name: g.name,
      layer: g.layer ?? null, repo_id: g.repo_id ?? null, tags: g.tags ?? [],
      centrality: g.centrality ?? null,
    })),
    edges: edges.map(([s, t, k]) => ({ source_id: s, target_id: t, kind: k ?? "imports" })),
    truncated: false,
  };
}

describe("seedGraph", () => {
  it("loads nodes + edges and focuses the root", () => {
    const s = seedGraph(seed([n("root", { synthetic: true }), n("a"), n("b")], [["root", "a"], ["root", "b"]], "root"));
    expect(s.focus).toBe("root");
    expect(s.nodes.size).toBe(3);
    expect(s.edges.size).toBe(2);
    expect(s.hop.get("root")).toBe(0);
    expect(s.hop.get("a")).toBe(1);
  });
});

describe("bfsHops", () => {
  it("computes undirected distances and re-roots", () => {
    const s = seedGraph(seed([n("root"), n("a"), n("b"), n("c")], [["root", "a"], ["a", "b"], ["b", "c"]], "root"));
    const h = bfsHops(s.nodes, s.edges, "root");
    expect([h.get("root"), h.get("a"), h.get("b"), h.get("c")]).toEqual([0, 1, 2, 3]);
    const h2 = bfsHops(s.nodes, s.edges, "b");
    expect(h2.get("root")).toBe(2);
    expect(h2.get("c")).toBe(1);
  });
});

describe("selectNode", () => {
  it("re-roots hops on an in-graph selection", () => {
    const s = seedGraph(seed([n("root"), n("a"), n("b")], [["root", "a"], ["a", "b"]], "root"));
    const s2 = selectNode(s, "a");
    expect(s2.focus).toBe("a");
    expect(s2.hop.get("root")).toBe(1);
    expect(s2.hop.get("b")).toBe(1);
  });

  it("injects a stub for an off-graph selection", () => {
    const s = seedGraph(seed([n("root")], [], "root"));
    const s2 = selectNode(s, "x", { stub: n("x", { name: "X" }) });
    expect(s2.focus).toBe("x");
    expect(s2.nodes.get("x")?.stub).toBe(true);
  });

  it("no-ops an off-graph selection with no stub or cache", () => {
    const s = seedGraph(seed([n("root")], [], "root"));
    expect(selectNode(s, "ghost")).toBe(s);
  });
});

describe("mergeNeighbors", () => {
  it("merges, dedupes, and is idempotent", () => {
    const s0 = seedGraph(seed([n("root"), n("a")], [["root", "a"]], "root"));
    const payload = neighbors([n("b"), n("c")], [["a", "b"], ["a", "c"]]);
    const s1 = mergeNeighbors(s0, "a", payload);
    expect(s1.nodes.size).toBe(4);
    expect(s1.edges.size).toBe(3);
    const s2 = mergeNeighbors(s1, "a", payload);
    expect(s2.nodes.size).toBe(4);
    expect(s2.edges.size).toBe(3);
  });

  it("lets real merged data clear a stub", () => {
    let s = seedGraph(seed([n("root")], [], "root"));
    s = selectNode(s, "a", { stub: n("a", { name: "stub-a" }) });
    expect(s.nodes.get("a")?.stub).toBe(true);
    s = mergeNeighbors(s, "a", neighbors([n("b", { name: "B" })], [["a", "b"]]));
    expect(s.nodes.get("a")?.stub).toBe(false);
    expect(s.nodes.size).toBe(3); // root + a + b
  });
});

describe("enforceBounds", () => {
  it("drops nodes beyond maxHops into the cache + prunes their edges", () => {
    const s = seedGraph(seed(
      [n("root"), n("a"), n("b"), n("c"), n("d")],
      [["root", "a"], ["a", "b"], ["b", "c"], ["c", "d"]], "root",
    ));
    const e = enforceBounds(s, { maxHops: 3, softCap: 999 });
    expect(e.nodes.has("d")).toBe(false);
    expect(e.cache.has("d")).toBe(true);
    expect(e.nodes.has("c")).toBe(true);
    expect([...e.edges.values()].some((x) => x.target_id === "d")).toBe(false);
  });

  it("soft-caps farthest-then-least-central, pinning focus + 1-hop", () => {
    const nodes = [
      n("root"), n("a1"), n("a2"),
      n("b1", { centrality: 0.9 }), n("b2", { centrality: 0.1 }),
      n("b3", { centrality: 0.5 }), n("b4", { centrality: 0.2 }),
    ];
    const edges: Array<[string, string, string?]> = [
      ["root", "a1"], ["root", "a2"],
      ["a1", "b1"], ["a1", "b2"], ["a2", "b3"], ["a2", "b4"],
    ];
    const e = enforceBounds(seedGraph(seed(nodes, edges, "root")), { maxHops: 3, softCap: 4 });
    expect(e.nodes.size).toBe(4);
    // focus + both hop-1 always survive
    expect(e.nodes.has("root")).toBe(true);
    expect(e.nodes.has("a1")).toBe(true);
    expect(e.nodes.has("a2")).toBe(true);
    // the single surviving hop-2 is the most central
    expect(e.nodes.has("b1")).toBe(true);
    expect(e.nodes.has("b2")).toBe(false);
  });
});

describe("toGraphElements", () => {
  it("projects synthetic importance + stub flag, and `contains` → parent nesting", () => {
    let s = seedGraph(
      seed(
        [n("root", { synthetic: true, node_kind: "repo", name: "my/repo" }), n("child", { name: "child" })],
        [["root", "child", "contains"]],
        "root",
      ),
    );
    s = selectNode(s, "x", { stub: n("x", { name: "X", node_kind: "function" }) });
    const g = toGraphElements(s);
    expect(g.nodes.find((x) => x.id === "root")?.importance).toBe(1);
    expect(g.nodes.find((x) => x.id === "x")?.stub).toBe(true);
    // containment is nesting, not a drawn edge
    expect(g.nodes.find((x) => x.id === "child")?.parent).toBe("root");
    expect(g.links.some((l) => l.kind === "contains")).toBe(false);
  });

  it("keeps behavioral edges as links and drops dangling endpoints", () => {
    const s = seedGraph({
      rootId: "root",
      nodes: [{ ...n("root") }, { ...n("a") }],
      edges: [
        { source_id: "root", target_id: "a", kind: "calls" },
        { source_id: "root", target_id: "gone", kind: "calls" },
      ],
    });
    const g = toGraphElements(s);
    expect(g.links).toHaveLength(1);
    expect(g.links[0]).toMatchObject({ source: "root", target: "a", kind: "calls" });
  });
});

describe("reconcileSeed", () => {
  it("is a no-op (same reference) when the refreshed seed adds nothing", () => {
    const sd = seed([n("root", { synthetic: true }), n("a")], [["root", "a", "contains"]], "root");
    const s = seedGraph(sd);
    // The 3s sync poll hands an identical seed every tick — must not churn.
    expect(reconcileSeed(s, sd)).toBe(s);
  });

  it("merges new seed nodes/edges while preserving fetched neighbours", () => {
    const s = seedGraph(seed([n("root", { synthetic: true }), n("a")], [["root", "a", "contains"]], "root"));
    const expanded = mergeNeighbors(s, "a", neighbors([n("fetched")], [["a", "fetched", "calls"]]));
    const next = seed(
      [n("root", { synthetic: true }), n("a"), n("b")],
      [["root", "a", "contains"], ["root", "b", "contains"]],
      "root",
    );
    const merged = reconcileSeed(expanded, next);
    expect(merged).not.toBe(expanded); // changed → new reference
    expect(merged.nodes.has("b")).toBe(true); // new seed node folded in
    expect(merged.nodes.has("fetched")).toBe(true); // on-demand neighbour kept
  });
});
