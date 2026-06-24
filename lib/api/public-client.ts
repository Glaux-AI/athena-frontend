/**
 * Public knowledge-showcase client (ADR-093).
 *
 * A deliberately tiny, UNAUTHENTICATED client for the `/v1/public/*`
 * surface. Unlike `apiFetch`, it never reads the Supabase session or the
 * active-org from localStorage and never injects an org header - the
 * backend pins the showcase org server-side. GET-only; mirrors the
 * backend wire models in `athena/api/routers/showcase.py`.
 */

import { ApiError } from "@/lib/api/client";
import { config } from "@/lib/config";

const BASE = config.apiUrl;

export interface ShowcaseModelUsage {
  model: string;
  calls: number;
  cost_usd: number;
}

export interface ShowcaseRepoMetrics {
  files_indexed: number;
  lines_of_code: number;
  node_count: number;
  edge_count: number;
  exports: number;
  primary_language: string | null;
  architectural_pattern: string | null;
  ingest_cost_usd: number;
  commit_sha: string | null;
  commit_short: string | null;
  last_synced_at: string | null;
  commits_behind: number | null;
  knowledge_models: ShowcaseModelUsage[];
}

export interface ShowcaseRepoSummary {
  repo_id: string;
  slug: string;
  full_name: string;
  owner: string;
  name: string;
  summary: string | null;
  default_branch: string;
  ready: boolean;
  ingestion_status: string;
  metrics: ShowcaseRepoMetrics;
}

export interface ShowcaseSection {
  section_key: string;
  title: string;
  summary: string;
  origin: string;
  body_markdown: string | null;
  body_json: Record<string, unknown> | null;
  body_kind: string;
  source_refs: Array<Record<string, unknown>>;
}

export interface ShowcaseRepoDetail {
  repo_id: string;
  slug: string;
  full_name: string;
  owner: string;
  name: string;
  summary: string | null;
  default_branch: string;
  blueprint_status: string;
  ready: boolean;
  ingestion_status: string;
  metrics: ShowcaseRepoMetrics;
  sections: ShowcaseSection[];
}

export interface ShowcaseTreeNode {
  name: string;
  path: string;
  kind: "repo" | "dir" | "file";
  node_id: string | null;
  language: string | null;
  loc: number;
  children: ShowcaseTreeNode[];
}

export interface DossierRef {
  node_id: string;
  name: string;
  path?: string | null;
  kind?: string;
  relation?: string | null;
  role?: string | null;
}

/** One folded symbol (function / class / method) defined in a file - the
 *  "what's actually in this file" list the ingester extracts. */
export interface ShowcaseDossierElement {
  name: string;
  kind: string;
  line_start?: number | null;
  line_end?: number | null;
  signature?: string;
  doc?: string;
  complexity?: number | null;
}

export interface ShowcaseDossier {
  headline?: string;
  what?: string;
  architecture?: {
    layer?: string | null;
    role?: string | null;
    pattern?: string | null;
    responsibilities?: string[];
  };
  signals?: {
    language?: string | null;
    loc?: number | null;
    tags?: string[];
    is_entry_point?: boolean;
    is_hub?: boolean;
    complexity_score?: number | null;
    centrality_score?: number | null;
  };
  contains?: DossierRef[];
  /** Total children (the `contains` list is capped); shown in the heading. */
  contains_count?: number;
  contained_by?: DossierRef | null;
  relations?: Record<string, DossierRef[]>;
  see_also?: DossierRef[];
  /** Folded symbol index for file nodes. Optional - non-file / simple nodes omit it. */
  elements?: ShowcaseDossierElement[];
  /** The dossier's own Mermaid diagram (file/module control-flow or architecture). */
  mermaid?: string | null;
  provenance?: {
    model?: string | null;
    llm?: boolean;
    generated_at?: string | null;
    version?: string;
  };
}

/** The real indexed file source, attached by the BE when a file has no LLM
 *  dossier (small / un-enriched), so the FE shows the full file. */
export interface ShowcaseNodeBody {
  content: string;
  language: string | null;
  truncated: boolean;
}

export interface ShowcaseNodeDossier {
  id: string;
  node_kind: string | null;
  path: string | null;
  name: string | null;
  summary: string | null;
  layer: string | null;
  tags: string[];
  repo_full_name: string | null;
  dossier: ShowcaseDossier | null;
  body?: ShowcaseNodeBody | null;
}

async function publicFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(0, "network_error", "Athena is unreachable right now.");
  }
  if (!res.ok) {
    let code = "internal";
    let message = res.statusText || "Request failed";
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // non-JSON body
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export const showcaseApi = {
  listRepos: () => publicFetch<ShowcaseRepoSummary[]>("/v1/public/repos"),
  repo: (ref: string) =>
    publicFetch<ShowcaseRepoDetail>(`/v1/public/repos/${encodeURIComponent(ref)}`),
  tree: (ref: string) =>
    publicFetch<ShowcaseTreeNode>(`/v1/public/repos/${encodeURIComponent(ref)}/tree`),
  node: (ref: string, nodeId: string) =>
    publicFetch<ShowcaseNodeDossier>(
      `/v1/public/repos/${encodeURIComponent(ref)}/nodes/${encodeURIComponent(nodeId)}`,
    ),
};
