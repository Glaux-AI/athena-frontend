/**
 * Typed API client for the Athena API server.
 *
 * Reads its base URL from `lib/config.ts` (which validates the env var at
 * module load and fails closed in production if missing or invalid).
 *
 * This module never reads `process.env.*` directly and never embeds any
 * credential. Auth flows through HTTP-only cookies set by the API server.
 */

import { config } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = config.apiUrl;

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error(`apiFetch path must start with '/'; got ${JSON.stringify(path)}`);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      ...init,
    });
  } catch {
    // Network error — never leak the URL or stack to the user.
    throw new ApiError(0, "network_error", "Athena API server is unreachable.");
  }

  if (!res.ok) {
    let code = "internal";
    let message = res.statusText || "Request failed";
    let field: string | undefined;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
      field = body?.error?.field;
    } catch {
      // Non-JSON body — keep the statusText.
    }
    throw new ApiError(res.status, code, message, field);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Demo runs                                                                  */
/* -------------------------------------------------------------------------- */

export interface DemoRun {
  id: string;
  goal: string;
  status: "queued" | "running" | "completed";
  created_at: string;
  spent_usd: number;
  stream_url: string;
}

/* -------------------------------------------------------------------------- */
/* Project knowledge                                                          */
/* -------------------------------------------------------------------------- */

export interface ProjectKnowledgeState {
  project_id: string;
  project_name: string;
  repo_full_name: string;
  branch: string;
  last_indexed_sha: string | null;
  branch_head_sha: string;
  commits_behind: number;
  last_synced_at: string | null;
  sync_in_progress: boolean;
}

export interface SyncResult {
  project_id: string;
  from_sha: string | null;
  to_sha: string;
  files_added: number;
  files_modified: number;
  files_deleted: number;
  chunks_upserted: number;
  chunks_removed: number;
  knowledge_docs_proposed: number;
  duration_ms: number;
}

export const api = {
  me: () =>
    apiFetch<{
      id: string;
      email: string;
      display_name: string;
      tenant_name: string;
    }>("/v1/me"),

  demo: {
    create: (goal?: string) =>
      apiFetch<DemoRun>("/v1/demo/runs", {
        method: "POST",
        body: JSON.stringify({ goal: goal ?? undefined }),
      }),

    list: () => apiFetch<DemoRun[]>("/v1/demo/runs"),

    get: (id: string) => apiFetch<DemoRun>(`/v1/demo/runs/${encodeURIComponent(id)}`),

    streamUrl: (id: string) =>
      `${BASE}/v1/demo/runs/${encodeURIComponent(id)}/events`,
  },

  projects: {
    knowledge: (projectId: string) =>
      apiFetch<ProjectKnowledgeState>(
        `/v1/projects/${encodeURIComponent(projectId)}/knowledge`,
      ),

    sync: (projectId: string) =>
      apiFetch<SyncResult>(
        `/v1/projects/${encodeURIComponent(projectId)}/knowledge:sync`,
        { method: "POST" },
      ),

    simulatePush: (projectId: string) =>
      apiFetch<ProjectKnowledgeState>(
        `/v1/projects/${encodeURIComponent(projectId)}/knowledge:simulate-push`,
        { method: "POST" },
      ),
  },
};
