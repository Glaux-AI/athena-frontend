// @vitest-environment node

/**
 * Pure-core tests for the per-scope seeds (repo / domain / org). Each builds
 * a synthetic root + its 1-hop children from page-loaded data — no fetch.
 */

import { describe, it, expect } from "vitest";

import {
  seedRepo,
  seedDomain,
  seedOrg,
  scopeRootId,
  parseScopeId,
  isSyntheticId,
} from "@/components/topology/explorer/scope-seed";
import type { RepoKnowledge, DomainKnowledge, OrgKnowledge } from "@/lib/api/client";

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

describe("seedOrg", () => {
  it("seeds domain refs + cross-cap edges", () => {
    const org = {
      org_id: "o1",
      domains: [
        { id: "c1", slug: "billing", name: "Billing", lead_user_id: null, repos_indexed: 1, open_tasks: 0, nodes_total: 0, decisions: 0, ingestion_status: "fresh", material_changes_7d: 0 },
        { id: "c2", slug: "inbox", name: "Inbox", lead_user_id: null, repos_indexed: 1, open_tasks: 0, nodes_total: 0, decisions: 0, ingestion_status: "fresh", material_changes_7d: 0 },
      ],
      cross_cap_dependencies: [{ from_domain_id: "c1", to_domain_id: "c2", kind: "data", label: "events", evidence: [] }],
    } as unknown as OrgKnowledge;
    const s = seedOrg(org, { name: "Acme" });
    expect(s.rootId).toBe("scope:org:o1");
    expect(s.nodes.map((nd) => nd.id)).toContain("scope:domain:c1");
    expect(s.edges.some((e) => e.source_id === "scope:domain:c1" && e.target_id === "scope:domain:c2")).toBe(true);
  });
});
