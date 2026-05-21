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
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

export interface Me {
  id: string;
  email: string;
  display_name: string;
  tenant_id: string;
  tenant_name: string;
  role: string;
  is_employee: boolean;
  server_time: string;
}

/* -------------------------------------------------------------------------- */
/* Runs                                                                       */
/* -------------------------------------------------------------------------- */

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Run {
  id: string;
  goal: string;
  intent: "chat" | "generate_prd" | null;
  status: RunStatus;
  spent_usd: number;
  created_at: string;
  output_summary: string | null;
  stream_url: string;
}

export const api = {
  me: () => apiFetch<Me>("/v1/me"),

  runs: {
    create: (goal: string) =>
      apiFetch<Run>("/v1/runs", {
        method: "POST",
        body: JSON.stringify({ goal }),
      }),

    list: () => apiFetch<Run[]>("/v1/runs"),

    get: (id: string) => apiFetch<Run>(`/v1/runs/${encodeURIComponent(id)}`),

    streamUrl: (id: string) =>
      `${BASE}/v1/runs/${encodeURIComponent(id)}/events`,

    approveGate: (id: string, gate: string, note?: string) =>
      apiFetch<{ accepted: boolean }>(
        `/v1/runs/${encodeURIComponent(id)}/gates/${encodeURIComponent(gate)}/approve`,
        { method: "POST", body: JSON.stringify({ note }) },
      ),

    rejectGate: (id: string, gate: string, note?: string) =>
      apiFetch<{ accepted: boolean }>(
        `/v1/runs/${encodeURIComponent(id)}/gates/${encodeURIComponent(gate)}/reject`,
        { method: "POST", body: JSON.stringify({ note }) },
      ),
  },
};
