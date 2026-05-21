/**
 * Typed API client for the Athena API server.
 *
 * Every call:
 *   - injects the Supabase access token as `Authorization: Bearer <jwt>`
 *     (read fresh from the browser client; the SDK auto-refreshes)
 *   - injects the active org as `X-Athena-Org-Id` (read from localStorage)
 *   - surfaces `error.code` / `error.message` / `error.field` from the
 *     server envelope, never the raw URL
 */

import { config } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const BASE = config.apiUrl;
const ACTIVE_ORG_KEY = "athena.activeOrgId";

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

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (config.supabase.isConfigured()) {
    try {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Server-side render — no browser client available. Server
      // components should use the server-side supabase helper instead.
    }
  }
  if (typeof window !== "undefined") {
    const orgId = window.localStorage.getItem(ACTIVE_ORG_KEY);
    if (orgId) headers["X-Athena-Org-Id"] = orgId;
  }
  return headers;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/")) {
    throw new Error(`apiFetch path must start with '/'; got ${JSON.stringify(path)}`);
  }
  const auth = await authHeaders();

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...auth,
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
      // Non-JSON body
    }
    throw new ApiError(res.status, code, message, field);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface MembershipOut {
  org_id: string;
  org_name: string;
  org_slug: string;
  org_edition: string;
  role: string;
  is_owner: boolean;
}

export interface Me {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_employee: boolean;
  tenant_id: string;
  tenant_name: string;
  role: string;
  server_time: string;
  memberships: MembershipOut[];
}

export interface Org {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  edition: string;
  verified_domains: string[];
  auto_join_for_verified_domain: boolean;
  default_role_for_invite: string;
  created_at: string;
}

export interface Member {
  user_id: string;
  membership_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  is_owner: boolean;
  joined_at: string | null;
  deactivated_at: string | null;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: string;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface DomainVerification {
  id: string;
  domain: string;
  dns_txt_record_name: string;
  dns_txt_value: string;
  verified_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
}

export interface Capability {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  created_by_user_id: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface CapabilityRepo {
  id: string;
  capability_id: string;
  integration_id: string;
  repo_full_name: string;
  default_branch: string;
  attached_by_user_id: string | null;
  created_at: string;
}

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
  auth: {
    sync: () => apiFetch<{ user_id: string; membership_count: number }>("/v1/auth/sync", { method: "POST" }),
    logout: () => apiFetch<{ accepted: boolean }>("/v1/auth/logout", { method: "POST" }),
  },
  orgs: {
    list: () => apiFetch<Org[]>("/v1/orgs"),
    get: (id: string) => apiFetch<Org>(`/v1/orgs/${encodeURIComponent(id)}`),
    create: (body: { name: string; slug: string; display_name?: string; edition?: string }) =>
      apiFetch<Org>("/v1/orgs", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Pick<Org, "display_name" | "default_role_for_invite" | "edition" | "auto_join_for_verified_domain">>) =>
      apiFetch<Org>(`/v1/orgs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string, confirmSlug: string) =>
      apiFetch<void>(`/v1/orgs/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm_slug: confirmSlug }),
      }),
  },
  members: {
    list: (orgId: string) => apiFetch<Member[]>(`/v1/orgs/${encodeURIComponent(orgId)}/members`),
    changeRole: (orgId: string, userId: string, role: string) =>
      apiFetch<Member>(`/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    deactivate: (orgId: string, userId: string) =>
      apiFetch<Member>(`/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/deactivate`, { method: "POST" }),
    reactivate: (orgId: string, userId: string) =>
      apiFetch<Member>(`/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/reactivate`, { method: "POST" }),
    transferOwnership: (orgId: string, newOwnerUserId: string, confirmSlug: string) =>
      apiFetch<Member>(`/v1/orgs/${encodeURIComponent(orgId)}/members/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ new_owner_user_id: newOwnerUserId, confirm_slug: confirmSlug }),
      }),
  },
  invitations: {
    list: (orgId: string) => apiFetch<Invitation[]>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations`),
    create: (orgId: string, body: { email: string; role: string }) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    revoke: (orgId: string, invitationId: string) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: "POST" }),
    accept: (token: string) =>
      apiFetch<{ org_id: string; role: string }>(`/v1/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
  },
  domains: {
    list: (orgId: string) => apiFetch<DomainVerification[]>(`/v1/orgs/${encodeURIComponent(orgId)}/domains`),
    claim: (orgId: string, domain: string) =>
      apiFetch<DomainVerification>(`/v1/orgs/${encodeURIComponent(orgId)}/domains`, {
        method: "POST",
        body: JSON.stringify({ domain }),
      }),
    verify: (orgId: string, verificationId: string) =>
      apiFetch<DomainVerification>(`/v1/orgs/${encodeURIComponent(orgId)}/domains/${encodeURIComponent(verificationId)}/verify`, { method: "POST" }),
    unclaim: (orgId: string, verificationId: string) =>
      apiFetch<void>(`/v1/orgs/${encodeURIComponent(orgId)}/domains/${encodeURIComponent(verificationId)}`, { method: "DELETE" }),
  },
  capabilities: {
    list: () => apiFetch<Capability[]>("/v1/capabilities"),
    create: (body: { slug: string; name: string; description?: string }) =>
      apiFetch<Capability>("/v1/capabilities", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}`),
    patch: (id: string, body: Partial<Pick<Capability, "name" | "description">>) =>
      apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    archive: (id: string) =>
      apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}/archive`, { method: "POST" }),
    listRepos: (id: string) => apiFetch<CapabilityRepo[]>(`/v1/capabilities/${encodeURIComponent(id)}/repos`),
    attachRepo: (id: string, body: { integration_id: string; repo_full_name: string; default_branch?: string }) =>
      apiFetch<CapabilityRepo>(`/v1/capabilities/${encodeURIComponent(id)}/repos`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    detachRepo: (id: string, repoId: string) =>
      apiFetch<void>(`/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}`, { method: "DELETE" }),
  },
  runs: {
    create: (goal: string, capabilityId?: string) =>
      apiFetch<Run>("/v1/runs", { method: "POST", body: JSON.stringify({ goal, capability_id: capabilityId ?? null }) }),
    list: () => apiFetch<Run[]>("/v1/runs"),
    get: (id: string) => apiFetch<Run>(`/v1/runs/${encodeURIComponent(id)}`),
    streamUrl: (id: string) => `${BASE}/v1/runs/${encodeURIComponent(id)}/events`,
    approveGate: (id: string, gate: string, note?: string) =>
      apiFetch<{ accepted: boolean }>(`/v1/runs/${encodeURIComponent(id)}/gates/${encodeURIComponent(gate)}/approve`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    rejectGate: (id: string, gate: string, note?: string) =>
      apiFetch<{ accepted: boolean }>(`/v1/runs/${encodeURIComponent(id)}/gates/${encodeURIComponent(gate)}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
  },
};
