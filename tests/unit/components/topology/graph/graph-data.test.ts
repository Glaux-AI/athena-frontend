// @vitest-environment node

/**
 * Pure-core tests for the Cytoscape knowledge graph's data layer. env=node —
 * the canvas itself can't be asserted headless (same as the old React-Flow
 * surface), so containment derivation, the collapse filter, edge rerouting and
 * the relayout signature are verified here as plain data transforms.
 */

import { describe, it, expect } from "vitest";

import {
  deriveContainment,
  computeVisible,
  projectLinks,
  nearestVisibleAncestor,
  structureKey,
  type GraphNode,
  type GraphLink,
} from "@/components/topology/graph/graph-data";

function gn(id: string, parent?: string | null): GraphNode {
  return { id, label: id, kind: "file", parent: parent ?? null };
}

describe("deriveContainment", () => {
  it("splits `contains` into a parent map and keeps behavioural links + payload", () => {
    const nodes = [gn("repo"), gn("mod"), gn("file"), gn("other")];
    const edges = [
      { source: "repo", target: "mod", kind: "contains" },
      { source: "mod", target: "file", kind: "contains" },
      { source: "file", target: "other", kind: "calls", weight: 3 },
    ];
    const { parentOf, links } = deriveContainment(nodes, edges);
    expect(parentOf.get("mod")).toBe("repo");
    expect(parentOf.get("file")).toBe("mod");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ source: "file", target: "other", kind: "calls", weight: 3 });
  });

  it("drops edges whose endpoints aren't in the node set", () => {
    const { parentOf, links } = deriveContainment([gn("a")], [
      { source: "a", target: "ghost", kind: "contains" },
      { source: "a", target: "ghost", kind: "calls" },
    ]);
    expect(parentOf.size).toBe(0);
    expect(links).toHaveLength(0);
  });

  it("guards against a containment cycle", () => {
    const { parentOf } = deriveContainment([gn("a"), gn("b")], [
      { source: "a", target: "b", kind: "contains" },
      { source: "b", target: "a", kind: "contains" }, // would loop → ignored
    ]);
    expect(parentOf.get("b")).toBe("a");
    expect(parentOf.has("a")).toBe(false);
  });
});

describe("computeVisible", () => {
  const nodes = [gn("repo"), gn("mod", "repo"), gn("f1", "mod"), gn("f2", "mod")];
  const parentOf = new Map<string, string>([["mod", "repo"], ["f1", "mod"], ["f2", "mod"]]);

  it("shows everything when nothing is collapsed", () => {
    const { visible, hiddenCount } = computeVisible(nodes, parentOf, new Set());
    expect(visible.size).toBe(4);
    expect(hiddenCount.size).toBe(0);
  });

  it("folds a collapsed parent's descendants and counts them", () => {
    const { visible, hiddenCount } = computeVisible(nodes, parentOf, new Set(["mod"]));
    expect(visible.has("mod")).toBe(true); // the box itself stays
    expect(visible.has("f1")).toBe(false);
    expect(visible.has("f2")).toBe(false);
    expect(hiddenCount.get("mod")).toBe(2);
  });

  it("attributes folds to the nearest collapsed ancestor", () => {
    const { visible, hiddenCount } = computeVisible(nodes, parentOf, new Set(["repo"]));
    expect(visible.has("repo")).toBe(true);
    expect(visible.size).toBe(1);
    expect(hiddenCount.get("repo")).toBe(3); // mod + f1 + f2
  });
});

describe("nearestVisibleAncestor", () => {
  const parentOf = new Map<string, string>([["f1", "mod"], ["mod", "repo"]]);
  it("returns the node itself when visible", () => {
    expect(nearestVisibleAncestor("f1", parentOf, new Set(["f1"]))).toBe("f1");
  });
  it("climbs to the nearest visible box when the node is folded", () => {
    expect(nearestVisibleAncestor("f1", parentOf, new Set(["repo"]))).toBe("repo");
    expect(nearestVisibleAncestor("f1", parentOf, new Set(["mod"]))).toBe("mod");
  });
  it("returns null when nothing on the chain is visible", () => {
    expect(nearestVisibleAncestor("f1", parentOf, new Set())).toBeNull();
  });
});

describe("projectLinks", () => {
  const parentOf = new Map<string, string>([["f1", "mod"], ["f2", "mod"], ["g1", "mod2"]]);

  it("reroutes folded endpoints to their box and aggregates duplicates", () => {
    const visible = new Set(["mod", "mod2"]); // both modules collapsed
    const links: GraphLink[] = [
      { source: "f1", target: "g1", kind: "calls" },
      { source: "f2", target: "g1", kind: "calls" }, // same mod→mod2 calls → rolled up
    ];
    const out = projectLinks(links, visible, parentOf);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "mod", target: "mod2", kind: "calls", rolledUp: true });
    expect(out[0]!.weight).toBe(2);
  });

  it("drops internal edges that collapse to a self-loop", () => {
    const visible = new Set(["mod"]);
    const out = projectLinks([{ source: "f1", target: "f2", kind: "calls" }], visible, parentOf);
    expect(out).toHaveLength(0);
  });

  it("leaves fully-visible edges untouched", () => {
    const visible = new Set(["f1", "f2"]);
    const out = projectLinks([{ source: "f1", target: "f2", kind: "imports" }], visible, parentOf);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "f1", target: "f2", rolledUp: false });
  });
});

describe("structureKey", () => {
  const nodes = [gn("a"), gn("b", "a")];
  const links: GraphLink[] = [{ source: "a", target: "b", kind: "calls" }];

  it("is independent of node order", () => {
    const v = new Set(["a", "b"]);
    expect(structureKey(nodes, links, v)).toBe(structureKey([...nodes].reverse(), links, v));
  });

  it("changes when the visible set changes (collapse/expand)", () => {
    const full = structureKey(nodes, links, new Set(["a", "b"]));
    const folded = structureKey(nodes, links, new Set(["a"]));
    expect(full).not.toBe(folded);
  });
});
