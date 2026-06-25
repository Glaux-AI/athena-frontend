// @vitest-environment node

/**
 * Pure-core tests for the per-scope seeds (repo / domain). Each builds a
 * synthetic root + its 1-hop children from page-loaded data - no fetch.
 * (The org scope no longer seeds the explorer - its Topology tab renders the
 * real entity graph via `<OrgKnowledgeGraph>` - so `seedOrg` was removed.)
 */

import { describe, it, expect } from "vitest";

import {
  seedRepo,
  seedDomain,
  scopeRootId,
  parseScopeId,
  isSyntheticId,
} from "@/components/topology/explorer/scope-seed";
import type { RepoKnowledge, DomainKnowledge } from "@/lib/api/client";

function repoKnowledge(over: Partial<RepoKnowledge> = {}): RepoKnowledge {
  return {
    repo_id: "r1", repo_full_name: "acme/billing", primary_language: "TypeScript",
    services: [], modules: [],
    ...over,
  } as unknown as RepoKnowledge;
}

describe("scope id helpers", () => {
  it("round-trips synthetic ids", () => {
    expect(scopeRootId("repo", "abc")).toBe("scope:repo:abc");
    expect(parseScopeId("scope:domain:xyz")).toEqual({ kind: "domain", id: "xyz" });
    expect(parseScopeId("real-uuid")).toBeNull();
    expect(isSyntheticId("scope:org:1")).toBe(true);
    expect(isSyntheticId("uuid")).toBe(false);
  });
});

describe("seedRepo", () => {
  it("uses containment_roots when present", () => {
    const s = seedRepo(repoKnowledge({
      containment_roots: [
        { node_id: "svc1", name: "checkout", path: "svc/checkout", kind: "service" },
        { node_id: "mod1", name: "invoice", path: "svc/invoice", kind: "module" },
      ],
    }));
    expect(s.rootId).toBe("scope:repo:r1");
    expect(s.nodes[0]?.synthetic).toBe(true);
    expect(s.nodes.map((nd) => nd.id)).toEqual(["scope:repo:r1", "svc1", "mod1"]);
    expect(s.edges).toHaveLength(2);
    expect(s.edges.every((e) => e.source_id === "scope:repo:r1" && e.kind === "contains")).toBe(true);
  });

  it("seeds repo-root files but leaves nested files to arrive via neighbours", () => {
    const s = seedRepo(repoKnowledge({
      containment_roots: [{ node_id: "m1", name: "src", path: "src", kind: "module" }],
      top_files: [
        { id: "f1", name: "README.md", path: "README.md", language: "md", layer: "", summary: null, loc: 10, symbols: 0, importance: 0.3, is_entry_point: false },
        { id: "f2", name: "app.ts", path: "src/app.ts", language: "ts", layer: "", summary: null, loc: 20, symbols: 2, importance: 0.9, is_entry_point: true },
      ],
    }));
    const ids = s.nodes.map((nd) => nd.id);
    expect(ids).toContain("f1"); // repo-root file
    expect(ids).not.toContain("f2"); // nested file - parented under its module on expand
    expect(s.edges).toContainEqual({ source_id: "scope:repo:r1", target_id: "f1", kind: "contains" });
  });

  it("falls back to services + modules", () => {
    const s = seedRepo(repoKnowledge({
      services: [{ id: "svc1", name: "checkout", path: "p", description: "", symbols: 3, tier_summary: "", public_endpoints: 1 }],
      modules: [{ id: "mod1", name: "invoice", path: "p2", kind: "module", symbols: 4, tier_summary: "", hot: false }],
    }));
    expect(s.nodes.map((nd) => nd.id)).toEqual(["scope:repo:r1", "svc1", "mod1"]);
    expect(s.nodes[1]?.node_kind).toBe("service");
  });
});

describe("seedDomain", () => {
  it("seeds repos + top_entities + entity edges", () => {
    const cap = {
      domain_id: "c1", nodes_total: 0, nodes_by_kind: {}, edges_total: 0, repos_indexed: 1,
      decision_records: 0, domain_concepts: 0,
      top_entities: [
        { id: "e1", name: "Invoice", kind: "class", path: "p", importance: 0.8, description: "", repo: "r1" },
        { id: "e2", name: "Charge", kind: "class", path: "p2", importance: 0.6, description: "", repo: "r1" },
      ],
      top_entity_edges: [{ source_id: "e1", target_id: "e2", kind: "references" }],
      overlay_terms: [], recent_changes: [], ingestion_status: "fresh", last_ingested_at: "",
    } as unknown as DomainKnowledge;
    const s = seedDomain(cap, { name: "Billing", repos: [{ id: "r1", name: "acme/billing" }] });
    expect(s.rootId).toBe("scope:domain:c1");
    expect(s.nodes.find((nd) => nd.id === "scope:repo:r1")?.synthetic).toBe(true);
    expect(s.nodes.some((nd) => nd.id === "e1")).toBe(true);
    expect(s.edges.some((e) => e.source_id === "e1" && e.target_id === "e2")).toBe(true);
  });
});
