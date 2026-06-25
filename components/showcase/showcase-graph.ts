/**
 * showcase-graph.ts - PURE adapters that let the PUBLIC knowledge showcase reuse
 * the exact same topology engine the authenticated app uses (the Cytoscape
 * `<KnowledgeGraph>` + the `explorer-graph.ts` pure state machine), without ever
 * touching the authenticated `api.knowledge.*` surface.
 *
 * Two things the app explorer gets from authenticated endpoints, derived here
 * from the public showcase payloads instead (no extra fetch beyond the ones the
 * page already makes):
 *
 *   • the initial seed - a synthetic repo root + 1-hop children - is built from
 *     the repo's semantic `components` (and, when those are sparse, top-level
 *     files from the tree), so every seed node is a real, expandable KG node.
 *   • on-demand 1-hop expansion - the app calls `GET .../neighbors`; the public
 *     showcase has no such endpoint, but the node DOSSIER already carries the
 *     same information (`contained_by` / `contains` / `relations` / `see_also`),
 *     so {@link neighborsFromDossier} reshapes a dossier into the `NodeNeighbors`
 *     envelope `mergeNeighbors` consumes.
 *
 * No React, no fetch, no DOM - pure transforms over the wire shapes.
 */

import type { KnowledgeEdge, KnowledgeNode, NodeNeighbors } from "@/lib/api/client";
import type {
  DossierRef,
  ShowcaseNodeDossier,
  ShowcaseRepoDetail,
  ShowcaseTreeNode,
} from "@/lib/api/public-client";
import type { GEdge, GNode, Seed } from "@/components/topology/explorer/explorer-graph";
import { scopeRootId } from "@/components/topology/explorer/scope-seed";

/** Per-kind cap so one busy bucket (e.g. dependencies) can't flood the seed. */
const PER_KIND_CAP = 12;
/** Total seed children - kept well under the canvas soft-cap (180). */
const SEED_CAP = 48;
/** When the repo exposes few semantic components, top up from the file tree. */
const SEED_MIN = 6;

function containsEdge(src: string, dst: string): GEdge {
  return { source_id: src, target_id: dst, kind: "contains" };
}

/** Breadth-first walk of the file tree, collecting up to `limit` real file
 *  nodes (those with a `node_id`), shallowest first. */
function collectTreeFiles(root: ShowcaseTreeNode, limit: number): GNode[] {
  const out: GNode[] = [];
  const queue: ShowcaseTreeNode[] = [...root.children];
  while (queue.length && out.length < limit) {
    const n = queue.shift()!;
    if (n.kind === "file" && n.node_id) {
      out.push({ id: n.node_id, node_kind: "file", name: n.name, path: n.path, tags: [] });
    }
    if (n.children.length) queue.push(...n.children);
  }
  return out;
}

/** Build the explorer seed for a showcase repo: one synthetic repo root focused
 *  at open, plus its 1-hop children (semantic components, supplemented with
 *  top-level files when components are sparse). Mirrors `seedRepo` in
 *  `scope-seed.ts` but reads the PUBLIC payloads. */
export function seedShowcaseRepo(detail: ShowcaseRepoDetail, tree: ShowcaseTreeNode | null): Seed {
  const rootId = scopeRootId("repo", detail.repo_id);
  const root: GNode = {
    id: rootId,
    node_kind: "repo",
    name: detail.full_name,
    path: detail.metrics.primary_language,
    repo_id: detail.repo_id,
    tags: [],
    synthetic: true,
    scopeKind: "repo",
    scopeId: detail.repo_id,
  };

  const children: GNode[] = [];
  const seen = new Set<string>([rootId]);
  const add = (n: GNode) => {
    if (seen.has(n.id) || children.length >= SEED_CAP) return;
    seen.add(n.id);
    children.push(n);
  };

  for (const [kind, comps] of Object.entries(detail.components)) {
    for (const c of comps.slice(0, PER_KIND_CAP)) {
      add({ id: c.node_id, node_kind: kind, name: c.name, path: c.path, tags: [] });
    }
  }
  if (children.length < SEED_MIN && tree) {
    for (const f of collectTreeFiles(tree, SEED_CAP - children.length)) add(f);
  }

  const edges = children.map((c) => containsEdge(rootId, c.id));
  return { rootId, nodes: [root, ...children], edges };
}

/* --------------------------------------------------------------------------- *
 * Folder-level explorer                                                        *
 *                                                                              *
 * The repo's directory tree IS the spine: a directory that holds files becomes *
 * a real `module` KG node (with a generated dossier = its "folder blueprint"), *
 * while pass-through intermediate dirs have no node, so the FE synthesises a    *
 * `folder:<path>` node for them. The PUBLIC tree endpoint returns the whole    *
 * nested tree, so folder expansion is a pure client-side reveal - no fetch.    *
 * --------------------------------------------------------------------------- */

/** Synthetic id namespace for a directory with no real `module` node. */
const FOLDER_PREFIX = "folder:";
/** Max children revealed when a folder expands (mirrors the canvas soft-cap). */
const FOLDER_CHILD_CAP = 60;

/** True for a synthesised folder node (no dossier - render its contents instead). */
export function isFolderNodeId(id: string): boolean {
  return id.startsWith(FOLDER_PREFIX);
}

/** The graph id for a tree node: the repo root id for the root, the real KG
 *  `node_id` when present (files always; module/service folders), else a
 *  synthetic `folder:<path>` for an intermediate directory. */
export function graphIdOf(node: ShowcaseTreeNode, rootId: string): string {
  if (node.kind === "repo") return rootId;
  if (node.node_id) return node.node_id;
  if (node.kind === "file") return node.path;
  return `${FOLDER_PREFIX}${node.path}`;
}

/** One directory's direct children (subfolders + files) as a `NodeNeighbors`
 *  payload, so the same pure `mergeNeighbors` folds them into the live graph. */
export function folderChildren(node: ShowcaseTreeNode, rootId: string): NodeNeighbors {
  const parentId = graphIdOf(node, rootId);
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  for (const child of node.children.slice(0, FOLDER_CHILD_CAP)) {
    const id = graphIdOf(child, rootId);
    nodes.push({
      id,
      node_kind: child.kind === "file" ? "file" : "module",
      name: child.name,
      layer: null,
      repo_id: null,
      tags: [],
      path: child.path,
    });
    edges.push({ source_id: parentId, target_id: id, kind: "contains" });
  }
  return { nodes, edges, truncated: node.children.length > FOLDER_CHILD_CAP };
}

/** Seed the explorer from the directory tree: the synthetic repo root focused
 *  at open, plus its top-level folders + files as 1-hop children. */
export function seedShowcaseTree(repoId: string, tree: ShowcaseTreeNode): Seed {
  const rootId = scopeRootId("repo", repoId);
  const root: GNode = {
    id: rootId,
    node_kind: "repo",
    name: tree.name,
    repo_id: repoId,
    tags: [],
    synthetic: true,
    scopeKind: "repo",
    scopeId: repoId,
  };
  const { nodes, edges } = folderChildren(tree, rootId);
  return { rootId, nodes: [root, ...nodes], edges };
}

/** Index every tree node by its graph id, so the explorer can resolve a
 *  selected/expanded node back to its directory entry (children, kind). */
export function buildTreeIndex(rootId: string, tree: ShowcaseTreeNode): Map<string, ShowcaseTreeNode> {
  const index = new Map<string, ShowcaseTreeNode>();
  const walk = (n: ShowcaseTreeNode) => {
    index.set(graphIdOf(n, rootId), n);
    for (const c of n.children) walk(c);
  };
  walk(tree);
  return index;
}

/** Build the focus node itself from its dossier (the showcase has no separate
 *  node-identity call, so the dossier doubles as identity for off-graph hops
 *  navigated from the detail panel's relationship chips). */
export function nodeFromDossier(d: ShowcaseNodeDossier): GNode {
  return {
    id: d.id,
    node_kind: d.node_kind ?? d.dossier?.architecture?.layer ?? "file",
    name: d.name ?? d.id,
    path: d.path,
    layer: d.layer,
    tags: d.tags ?? [],
    centrality: d.dossier?.signals?.centrality_score ?? null,
  };
}

/** Relation buckets whose name encodes the REVERSE direction - the edge points
 *  from the neighbour back to the focus, under the de-reversed kind. */
const REVERSE_RELATIONS: Record<string, string> = {
  imported_by: "imports",
  called_by: "calls",
  referenced_by: "references",
};

function neighborNode(r: DossierRef): KnowledgeNode {
  return {
    id: r.node_id,
    node_kind: r.kind ?? "file",
    name: r.name,
    layer: r.role ?? null,
    repo_id: null,
    tags: [],
    path: r.path ?? null,
  };
}

/** Reshape a showcase node dossier into the `NodeNeighbors` envelope the pure
 *  `mergeNeighbors` expects - the public stand-in for `GET .../neighbors`.
 *  Containment (`contained_by` / `contains`) becomes `contains` edges; typed
 *  `relations` and `see_also` become behavioural edges. */
export function neighborsFromDossier(d: ShowcaseNodeDossier): NodeNeighbors {
  const focus = d.id;
  const nodes = new Map<string, KnowledgeNode>();
  const edges: KnowledgeEdge[] = [];
  const seenEdge = new Set<string>();

  const addNode = (r: DossierRef) => {
    if (r.node_id !== focus && !nodes.has(r.node_id)) nodes.set(r.node_id, neighborNode(r));
  };
  const addEdge = (src: string, tgt: string, kind: string) => {
    if (src === tgt) return;
    const k = `${src}|${tgt}|${kind}`;
    if (seenEdge.has(k)) return;
    seenEdge.add(k);
    edges.push({ source_id: src, target_id: tgt, kind });
  };

  const dossier = d.dossier ?? {};
  if (dossier.contained_by) {
    addNode(dossier.contained_by);
    addEdge(dossier.contained_by.node_id, focus, "contains");
  }
  for (const c of dossier.contains ?? []) {
    addNode(c);
    addEdge(focus, c.node_id, "contains");
  }
  for (const [key, refs] of Object.entries(dossier.relations ?? {})) {
    for (const r of refs) {
      addNode(r);
      const reverse = REVERSE_RELATIONS[key];
      if (reverse) addEdge(r.node_id, focus, reverse);
      else addEdge(focus, r.node_id, key);
    }
  }
  for (const r of dossier.see_also ?? []) {
    addNode(r);
    addEdge(focus, r.node_id, "references");
  }

  return { nodes: [...nodes.values()], edges, truncated: false };
}
