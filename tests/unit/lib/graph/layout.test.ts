import { describe, it, expect } from "vitest";

import { forceLayout, layeredLayout, type XY } from "@/lib/graph/layout";

function bbox(positions: Map<string, XY>): { w: number; h: number } {
  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

describe("forceLayout", () => {
  it("spreads a dense same-kind graph across 2D - not one horizontal line", () => {
    // The repo symbol-graph shape: many nodes, no bands, ring + chords. The
    // layered layout would collapse these (all one band) onto a single row;
    // force must give real height AND width.
    const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` }));
    const edges: { source: string; target: string }[] = [];
    for (let i = 0; i < 30; i++) edges.push({ source: `n${i}`, target: `n${(i + 1) % 30}` });
    for (let i = 0; i < 30; i += 3) edges.push({ source: `n${i}`, target: `n${(i + 7) % 30}` });

    const pos = forceLayout(nodes, edges);
    expect(pos.size).toBe(30);
    const { w, h } = bbox(pos);
    expect(w).toBeGreaterThan(100);
    expect(h).toBeGreaterThan(100); // regression guard: NOT a flat line
  });

  it("is deterministic (no Math.random) - same input, same positions", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }));
    const edges = nodes.map((_, i) => ({ source: `n${i}`, target: `n${(i + 1) % 12}` }));
    expect(forceLayout(nodes, edges).get("n5")).toEqual(forceLayout(nodes, edges).get("n5"));
  });

  it("handles empty and single-node graphs", () => {
    expect(forceLayout([], []).size).toBe(0);
    expect(forceLayout([{ id: "a" }], []).get("a")).toEqual({ x: 0, y: 0 });
  });
});

describe("layeredLayout", () => {
  it("places banded nodes into distinct top-down rows", () => {
    const nodes = [
      { id: "a", band: 0 },
      { id: "b", band: 0 },
      { id: "c", band: 1 },
      { id: "d", band: 2 },
    ];
    const pos = layeredLayout(nodes, [
      { source: "a", target: "c" },
      { source: "c", target: "d" },
    ]);
    expect(pos.get("c")!.y).toBeGreaterThan(pos.get("a")!.y);
    expect(pos.get("d")!.y).toBeGreaterThan(pos.get("c")!.y);
  });
});
