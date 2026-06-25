// @vitest-environment node

/**
 * Pure-core tests for the PUBLIC showcase topology adapters: building the seed
 * from showcase payloads and deriving a node's neighbourhood from its dossier
 * (the public stand-in for the authenticated `GET .../neighbors` endpoint).
 */

import { describe, it, expect } from "vitest";

import {
  seedShowcaseRepo,
  neighborsFromDossier,
  nodeFromDossier,
} from "@/components/showcase/showcase-graph";
import type {
  ShowcaseNodeDossier,
  ShowcaseRepoDetail,
  ShowcaseTreeNode,
} from "@/lib/api/public-client";

function repoDetail(over: Partial<ShowcaseRepoDetail> = {}): ShowcaseRepoDetail {
  return {
    repo_id: "r1",
    slug: "acme-billing",
    full_name: "acme/billing",
    owner: "acme",
    name: "billing",
    summary: "Billing service",
    default_branch: "main",
    blueprint_status: "ready",
    ready: true,
    ingestion_status: "fresh",
    metrics: {
      files_indexed: 10,
      lines_of_code: 1000,
      node_count: 50,
      edge_count: 80,
      exports: 5,
      primary_language: "TypeScript",
      architectural_pattern: "layered",
      ingest_cost_usd: 0.5,
      commit_sha: null,
      commit_short: null,
      last_synced_at: null,
      commits_behind: null,
      knowledge_models: [],
    },
    sections: [],
    components: {},
    ...over,
  };
}

function tree(children: ShowcaseTreeNode[]): ShowcaseTreeNode {
  return { name: "acme/billing", path: "", kind: "repo", node_id: null, language: null, loc: 0, children };
}

describe("seedShowcaseRepo", () => {
  it("seeds a synthetic repo root + semantic components as 1-hop children", () => {
    const s = seedShowcaseRepo(
      repoDetail({
        components: {
          api_endpoint: [{ node_id: "e1", name: "GET /charges", path: "api/charges.ts", summary: "" }],
          service: [{ node_id: "s1", name: "ChargeService", path: "svc/charge.ts", summary: "" }],
        },
      }),
      null,
    );
    expect(s.rootId).toBe("scope:repo:r1");
    expect(s.nodes[0]?.synthetic).toBe(true);
    expect(s.nodes.map((n) => n.id)).toEqual(["scope:repo:r1", "e1", "s1"]);
    expect(s.edges).toHaveLength(2);
    expect(s.edges.every((e) => e.source_id === "scope:repo:r1" && e.kind === "contains")).toBe(true);
  });

  it("supplements with top-level tree files when components are sparse", () => {
    const s = seedShowcaseRepo(
      repoDetail({ components: {} }),
      tree([
        { name: "index.ts", path: "index.ts", kind: "file", node_id: "f1", language: "ts", loc: 20, children: [] },
        {
          name: "src",
          path: "src",
          kind: "dir",
          node_id: null,
          language: null,
          loc: 0,
          children: [
            { name: "app.ts", path: "src/app.ts", kind: "file", node_id: "f2", language: "ts", loc: 40, children: [] },
          ],
        },
      ]),
    );
    const ids = s.nodes.map((n) => n.id);
    expect(ids).toContain("f1");
    expect(ids).toContain("f2"); // walked into the dir
    // dirs (no node_id) are never seeded - only real, expandable nodes
    expect(ids).not.toContain("src");
  });

  it("skips tree files once enough components exist", () => {
    const comps = Array.from({ length: 8 }, (_, i) => ({
      node_id: `c${i}`,
      name: `Comp${i}`,
      path: null,
      summary: "",
    }));
    const s = seedShowcaseRepo(
      repoDetail({ components: { service: comps } }),
      tree([{ name: "x.ts", path: "x.ts", kind: "file", node_id: "f1", language: "ts", loc: 1, children: [] }]),
    );
    expect(s.nodes.map((n) => n.id)).not.toContain("f1");
  });
});

describe("neighborsFromDossier", () => {
  function dossier(over: Partial<ShowcaseNodeDossier["dossier"]> = {}): ShowcaseNodeDossier {
    return {
      id: "n1",
      node_kind: "file",
      path: "src/charge.ts",
      name: "charge.ts",
      summary: null,
      layer: null,
      tags: [],
      repo_full_name: "acme/billing",
      dossier: { ...over },
    };
  }

  it("turns containment into contains edges (both directions)", () => {
    const n = neighborsFromDossier(
      dossier({
        contained_by: { node_id: "p1", name: "src", path: "src", kind: "module" },
        contains: [{ node_id: "c1", name: "charge", path: "src/charge.ts:1", kind: "function" }],
      }),
    );
    expect(n.nodes.map((x) => x.id).sort()).toEqual(["c1", "p1"]);
    expect(n.edges).toContainEqual({ source_id: "p1", target_id: "n1", kind: "contains" });
    expect(n.edges).toContainEqual({ source_id: "n1", target_id: "c1", kind: "contains" });
  });

  it("maps typed relations and reverses *_by buckets", () => {
    const n = neighborsFromDossier(
      dossier({
        relations: {
          calls: [{ node_id: "a1", name: "save", path: "p", kind: "function" }],
          imported_by: [{ node_id: "b1", name: "router", path: "p", kind: "file" }],
        },
      }),
    );
    // forward edge: focus -> callee
    expect(n.edges).toContainEqual({ source_id: "n1", target_id: "a1", kind: "calls" });
    // reverse edge: importer -> focus, de-reversed kind
    expect(n.edges).toContainEqual({ source_id: "b1", target_id: "n1", kind: "imports" });
  });

  it("never emits the focus as its own neighbour or a self edge", () => {
    const n = neighborsFromDossier(
      dossier({ contains: [{ node_id: "n1", name: "self", path: "p", kind: "file" }] }),
    );
    expect(n.nodes).toHaveLength(0);
    expect(n.edges).toHaveLength(0);
  });
});

describe("nodeFromDossier", () => {
  it("builds the focus node identity from the dossier", () => {
    const node = nodeFromDossier({
      id: "n1",
      node_kind: "service",
      path: "svc/charge.ts",
      name: "ChargeService",
      summary: null,
      layer: "service",
      tags: ["billing"],
      repo_full_name: "acme/billing",
      dossier: null,
    });
    expect(node).toMatchObject({ id: "n1", node_kind: "service", name: "ChargeService", path: "svc/charge.ts" });
  });
});
