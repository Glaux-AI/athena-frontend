/**
 * scope-seed.ts - PURE scope → initial graph seed for the topology explorer.
 *
 * There is no `repo` / `domain` / `org` KG node (those live in
 * BlueprintSection), so the explorer synthesises ONE root per scope plus its
 * 1-hop children, all from data the page already loaded (no extra fetch):
 *
 *   • repo  → root → `containment_roots` (else `services` + top-level
 *             `modules`) as real hop-1 nodes.
 *   • cap   → root → attached repos (synthetic `scope:repo:` refs) + the cap's
 *             `top_entities` (real ids) + `top_entity_edges`.
 *   • org   → root → one `scope:domain:` ref per domain +
 *             `cross_cap_dependencies` as cap→cap edges.
 *
 * Synthetic ids are namespaced `scope:<kind>:<realId>` so they never collide
 * with a real UUID/hash node id; `synthetic: true` routes their detail to the
 * <ScopeSummaryCard> and blocks `api.knowledge.node()`.
 */

import type { RepoKnowledge, DomainKnowledge, OrgKnowledge, NodeRef } from "@/lib/api/client";
import type { GNode, GEdge, Seed } from "./explorer-graph";

export type ScopeKind = "repo" | "domain" | "org";

export function scopeRootId(kind: ScopeKind, id: string): string {
  return `scope:${kind}:${id}`;
}

/** Inverse of {@link scopeRootId} - `{kind,id}` for a synthetic scope id, else null. */
export function parseScopeId(id: string): { kind: ScopeKind; id: string } | null {
  const m = /^scope:(repo|domain|org):(.+)$/.exec(id);
  if (!m) return null;
  return { kind: m[1] as ScopeKind, id: m[2]! };
}

/** True for a synthetic scope id (so the store skips `api.knowledge.node()`). */
export function isSyntheticId(id: string): boolean {
  return id.startsWith("scope:");
}

function synthNode(kind: ScopeKind, realId: string, name: string, sublabel?: string | null): GNode {
  return {
    id: scopeRootId(kind, realId),
    node_kind: kind,
    name,
    layer: null,
    repo_id: kind === "repo" ? realId : null,
    path: sublabel ?? null,
    tags: [],
    synthetic: true,
    scopeKind: kind,
    scopeId: realId,
  };
}

function realNode(
  id: string,
  name: string,
  kind: string,
  opts: { path?: string | null; layer?: string | null; repo_id?: string | null; centrality?: number | null } = {},
): GNode {
  return {
    id,
    node_kind: kind,
    name,
    layer: opts.layer ?? null,
    repo_id: opts.repo_id ?? null,
    path: opts.path ?? null,
    centrality: opts.centrality ?? null,
    tags: [],
  };
}

function nodeFromRef(ref: NodeRef, repoId: string | null): GNode {
  return realNode(ref.node_id, ref.name, ref.kind, { path: ref.path, layer: ref.layer ?? null, repo_id: repoId });
}

function containsEdge(src: string, dst: string): GEdge {
  return { source_id: src, target_id: dst, kind: "contains" };
}

export function seedRepo(repo: RepoKnowledge): Seed {
  const rootId = scopeRootId("repo", repo.repo_id);
  const root = synthNode("repo", repo.repo_id, repo.repo_full_name, repo.primary_language);
  const children: GNode[] = [];
  const seen = new Set<string>([rootId]);
  const add = (n: GNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    children.push(n);
  };

  if (repo.containment_roots?.length) {
    for (const r of repo.containment_roots) add(nodeFromRef(r, repo.repo_id));
  } else {
    for (const s of repo.services) {
      add(realNode(s.id, s.name, "service", { path: s.path, repo_id: repo.repo_id, layer: "service" }));
    }
    for (const mo of repo.modules) {
      add(realNode(mo.id, mo.name, mo.kind || "module", { path: mo.path, repo_id: repo.repo_id }));
    }
  }

  const edges = children.map((c) => containsEdge(rootId, c.id));
  return { rootId, nodes: [root, ...children], edges };
}

export function seedDomain(
  cap: DomainKnowledge,
  opts: { name?: string; repos?: Array<{ id: string; name: string }> } = {},
): Seed {
  const rootId = scopeRootId("domain", cap.domain_id);
  const root = synthNode("domain", cap.domain_id, opts.name ?? "Domain");
  const nodes: GNode[] = [root];
  const edges: GEdge[] = [];
  const seen = new Set<string>([rootId]);

  for (const r of opts.repos ?? []) {
    const rn = synthNode("repo", r.id, r.name);
    if (seen.has(rn.id)) continue;
    seen.add(rn.id);
    nodes.push(rn);
    edges.push(containsEdge(rootId, rn.id));
  }
  for (const ent of cap.top_entities) {
    if (seen.has(ent.id)) continue;
    seen.add(ent.id);
    nodes.push(realNode(ent.id, ent.name, ent.kind, { path: ent.path, layer: ent.layer ?? null, centrality: ent.importance }));
    edges.push(containsEdge(rootId, ent.id));
  }
  for (const e of cap.top_entity_edges ?? []) {
    if (seen.has(e.source_id) && seen.has(e.target_id)) {
      edges.push({
        source_id: e.source_id,
        target_id: e.target_id,
        kind: e.kind,
        cross_repo: e.cross_repo ?? false,
        confidence: e.confidence ?? null,
      });
    }
  }
  return { rootId, nodes, edges };
}

export function seedOrg(org: OrgKnowledge, opts: { name?: string } = {}): Seed {
  const rootId = scopeRootId("org", org.org_id);
  const root = synthNode("org", org.org_id, opts.name ?? "Organization");
  const nodes: GNode[] = [root];
  const edges: GEdge[] = [];
  const seen = new Set<string>([rootId]);

  for (const c of org.domains) {
    const cn = synthNode("domain", c.id, c.name);
    if (seen.has(cn.id)) continue;
    seen.add(cn.id);
    nodes.push(cn);
    edges.push(containsEdge(rootId, cn.id));
  }
  for (const d of org.cross_cap_dependencies) {
    const s = scopeRootId("domain", d.from_domain_id);
    const t = scopeRootId("domain", d.to_domain_id);
    if (seen.has(s) && seen.has(t)) {
      // `data` deps read as event/data flow, `control` as call/gate.
      edges.push({ source_id: s, target_id: t, kind: d.kind === "data" ? "produces" : "calls" });
    }
  }
  return { rootId, nodes, edges };
}
