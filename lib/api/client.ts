/**
 * Minimal typed API client for the Athena BE.
 *
 * No code-gen yet (the OpenAPI client comes in M1 when endpoints stabilise);
 * we write thin wrappers per resource. Every call goes through `apiFetch`
 * which applies credentials + propagates error envelopes.
 */

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

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let code = "internal";
    let message = res.statusText;
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

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Demo runs                                                                   */
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
/* Project knowledge (ADR-029)                                                 */
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
  me: () => apiFetch<{ id: string; email: string; display_name: string; tenant_name: string }>("/v1/me"),

  demo: {
    create: (goal?: string) =>
      apiFetch<DemoRun>("/v1/demo/runs", {
        method: "POST",
        body: JSON.stringify({ goal: goal ?? "Add a 'remind me later' option to the payment-failure email" }),
      }),

    list: () => apiFetch<DemoRun[]>("/v1/demo/runs"),

    get: (id: string) => apiFetch<DemoRun>(`/v1/demo/runs/${id}`),

    streamUrl: (id: string) => `${BASE}/v1/demo/runs/${id}/events`,
  },

  projects: {
    knowledge: (projectId: string) =>
      apiFetch<ProjectKnowledgeState>(`/v1/projects/${projectId}/knowledge`),

    sync: (projectId: string) =>
      apiFetch<SyncResult>(`/v1/projects/${projectId}/knowledge:sync`, { method: "POST" }),

    // Dev-only — simulates a push so the Sync UI has something to do.
    simulatePush: (projectId: string) =>
      apiFetch<ProjectKnowledgeState>(`/v1/projects/${projectId}/knowledge:simulate-push`, { method: "POST" }),
  },
};
