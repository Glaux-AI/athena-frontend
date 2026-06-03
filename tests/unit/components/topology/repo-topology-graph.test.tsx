// @vitest-environment jsdom

/**
 * buildRepoGraph unit tests — the repo Topology tab's file-graph projection
 * (top_files -> canvas nodes, call_edges -> canvas edges). Replaces the old
 * imports-graph.test.tsx now that the repo graph routes through the shared
 * KnowledgeGraphCanvas (whose rendering is covered by the canvas suites).
 */

import { describe, expect, it } from "vitest";

import { buildRepoGraph } from "@/components/topology/repo-topology-graph";
import type { CallEdge, RepoKnowledge, TopFile } from "@/lib/api/client";

function file(over: Partial<TopFile> = {}): TopFile {
  return {
    id: "f1", name: "a.ts", path: "src/a.ts", language: "TypeScript",
    layer: "service", summary: null, loc: 100, symbols: 3, importance: 0.8,
    is_entry_point: false, ...over,
  };
}

function edge(from: string, to: string, kind: CallEdge["kind"] = "imports"): CallEdge {
  return {
    kind,
    from: { id: from, name: from, path: `src/${from}.ts` },
    to: { id: to, name: to, path: `src/${to}.ts` },
    occurrences: 1,
  };
}

function kn(top_files: TopFile[], call_edges: CallEdge[]): RepoKnowledge {
  return { top_files, call_edges } as unknown as RepoKnowledge;
}

describe("buildRepoGraph", () => {
  it("builds one node per top file with layer as kind + symbol-count badge", () => {
    const { nodes } = buildRepoGraph(kn([file({ id: "f1", name: "a.ts", layer: "ui", symbols: 5, importance: 0.9 })], []));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: "f1", label: "a.ts", kind: "ui", sublabel: "src/a.ts", importance: 0.9, badge: "5" });
  });

  it("falls back to kind 'file' and null badge when layer/symbols are empty", () => {
    const { nodes } = buildRepoGraph(kn([file({ id: "f2", layer: "", symbols: 0 })], []));
    expect(nodes[0]!.kind).toBe("file");
    expect(nodes[0]!.badge).toBeNull();
  });

  it("adds edge-only files as low-importance nodes so edges can render", () => {
    const { nodes, edges } = buildRepoGraph(kn([file({ id: "f1" })], [edge("f1", "ghost")]));
    const ghost = nodes.find((n) => n.id === "ghost");
    expect(ghost).toBeDefined();
    expect(ghost!.importance).toBeLessThan(0.5);
    expect(edges).toEqual([{ source: "f1", target: "ghost", kind: "imports" }]);
  });

  it("does not duplicate a node already present in top_files", () => {
    const { nodes } = buildRepoGraph(
      kn([file({ id: "f1" }), file({ id: "f2", name: "b.ts", path: "src/b.ts" })], [edge("f1", "f2")]),
    );
    expect(nodes.filter((n) => n.id === "f2")).toHaveLength(1);
  });
});
