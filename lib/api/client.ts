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

  // Mock-mode short circuit: route through the in-process handler. Same
  // envelope contract (status code + JSON body + error envelope) the real
  // backend exposes, so call sites need no awareness of the mode.
  if (config.isMock) {
    const { handleMockRequest } = await import("./mock/handlers");
    const r = await handleMockRequest(path, init);
    if (r.status >= 400) {
      const errBody = r.body as { error?: { code?: string; message?: string; field?: string } } | undefined;
      throw new ApiError(
        r.status,
        errBody?.error?.code ?? "internal",
        errBody?.error?.message ?? `Mock request failed (${r.status})`,
        errBody?.error?.field,
      );
    }
    if (r.status === 204) return undefined as T;
    return r.body as T;
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
  /** Active org id for this session (one of `memberships[].org_id`). */
  org_id: string;
  org_name: string;
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
  /** Accent color key for the emblem — one of: violet, cyan, amber, indigo, rose, mint. */
  emblem: string;
  /** Lucide icon name rendered inside the emblem. */
  icon: string;
  /** Lightweight stats joined into the list/detail response so cards can render in one fetch. */
  repos: number;
  open_tasks: number;
  domain_notes: number;
  last_activity: string;
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

export interface CapabilityResource {
  id: string;
  title: string;
  kind: "file" | "link" | "note";
  source: string;
  format: string;
  size_kb?: number;
  uploaded_by: string;
  uploaded_at: string;
  status: "indexed" | "indexing" | "queued" | "failed";
  nodes_generated: number;
  summary: string;
  tags: string[];
  last_used: string | null;
  progress?: number;
}

export interface CapabilityConfig {
  models: Record<string, string>;
  skills: string[];
  review_policy: {
    spec_approvers: number;
    review_approvers: number;
    ci_must_pass: boolean;
    auto_merge: boolean;
  };
  context_repos: string[];
}

export interface DomainNote {
  id: string;
  title: string;
  body: string;
  promoted_from: string;
  author: string;
  date: string;
}

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_gate"
  | "completed"
  | "failed"
  | "cancelled"
  | "gate_rejected";
export type RunIntent = "chat" | "generate_prd";
export interface Run {
  id: string;
  goal: string;
  intent: RunIntent | null;
  status: RunStatus;
  spent_usd: number;
  created_at: string;
  output_summary: string | null;
  stream_url: string;
}

export interface AuthSyncResponse {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  membership_count: number;
  server_time: string;
}

export interface AuditEvent {
  id: string;
  org_id: string;
  actor_kind: string;
  actor_id: string;
  action: string;
  resource_kind: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  prev_hash: string | null;
  hash: string;
  created_at: string;
}

export interface AuditEventsPage {
  events: AuditEvent[];
  next_cursor: string | null;
}

export interface AuditEventsQuery {
  action?: string;
  actor_id?: string;
  resource_kind?: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
}

export interface ApiTokenSummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Returned only on creation. The `token` field is the raw bearer
 * value; it is shown to the user exactly once. */
export interface ApiTokenMinted extends ApiTokenSummary {
  token: string;
}

/* -------------------------------------------------------------------------- */
/* Extended types (V1.1 — adds inbox, cost, integrations, SSO, models, etc.) */
/* -------------------------------------------------------------------------- */

export type IntegrationStatus = "connected" | "available" | "coming_soon";
export type IntegrationCategory =
  | "SCM" | "Identity" | "Work mgmt" | "Comms" | "Knowledge"
  | "Incidents" | "Observability" | "Feature flags" | "Design"
  | "CRM" | "Support" | "Model provider" | "CI/CD";

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  blurb: string;
  connect_kind?: "oauth" | "token" | "key" | "saml" | "endpoint" | "keypair" | "aws" | "webhook";
  connected_as?: string;
  connected_at?: string | null;
  scope?: string;
  last_sync?: string | null;
  instructions?: string;
  flagship?: boolean;
  /** This integration publishes an MCP server. When the integration is
   * connected, Athena auto-provisions a paired MCP entry under /mcp. */
  provides_mcp?: boolean;
}

export interface IntegrationConnectRequest {
  /** Free-form key/value bag of provider-specific config. Mock-mode accepts
   * anything; the real backend will validate per-integration. */
  config: Record<string, string>;
}

/* ------------------------------------------------------------------- MCP
 * Model Context Protocol — tools exposed by external systems (Figma, Linear,
 * Notion, custom self-hosted servers, etc.) that Athena's agents can call
 * during spec / plan / implement / review.
 *
 * Tenancy: org-scoped. One MCP entry, all agents in the org share it.
 * Auth + tokens are stored server-side; the API only returns masked hints. */

export type McpAuthMethod = "none" | "bearer" | "oauth" | "mtls" | "header";
export type McpTransport = "http" | "sse" | "websocket";
export type McpStatus =
  | "connected"
  | "degraded"          // responding but high latency or partial errors
  | "error"             // last heartbeat failed
  | "disconnected"      // user paused or token expired
  | "pending_review";   // auto-provisioned from integration, waiting for user to enable tools

export type McpToolApproval = "none" | "per_session" | "per_call";
export type McpToolRisk = "read" | "write" | "destructive";
export type McpEgressPolicy = "any" | "region_pinned" | "vpc_peered";

export interface McpAuth {
  method: McpAuthMethod;
  /** Last-4 or domain hint for display. Real token is never returned. */
  bearer_hint?: string;
  oauth_app_id?: string;
  oauth_connected_as?: string;
  mtls_cert_subject?: string;
  /** For custom-header auth — name of the header (value is masked). */
  header_name?: string;
  last_rotated_at?: string;
}

export interface McpTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  approval: McpToolApproval;
  risk: McpToolRisk;
  /** JSON Schema describing the tool's parameters (optional, derived from MCP). */
  schema?: Record<string, unknown>;
  last_used_at?: string | null;
  usage_count_30d: number;
  /** True if this tool was added by the MCP server after the last review —
   * surfaces a "drift" warning that prompts re-approval. */
  added_since_review?: boolean;
}

export interface McpHealth {
  status: McpStatus;
  status_message?: string;
  last_check_at: string;
  latency_p50_ms: number;
  latency_p95_ms: number;
  /** Fraction 0..1 — error responses over last 24h. */
  error_rate_24h: number;
  /** Fraction 0..1 — uptime over last 30d. */
  uptime_30d: number;
}

export interface McpRecentCall {
  id: string;
  tool_id: string;
  tool_name: string;
  when: string;            // relative time string
  created_at: string;      // ISO
  actor: string;           // e.g. "agent:spec_builder" or "user:u_demo"
  task_id?: string;
  duration_ms: number;
  status: "ok" | "error" | "timeout" | "denied";
  result_preview?: string;
}

export interface McpServer {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  /** How this server got into the org's MCP catalog. */
  source: "integration" | "custom";
  /** Set when source === "integration". */
  integration_id?: string;
  transport: McpTransport;
  endpoint_url: string;
  auth: McpAuth;
  egress_policy: McpEgressPolicy;
  /** When egress_policy === "region_pinned", which region. */
  egress_region?: string;
  version?: string;
  version_last_reviewed?: string;
  tools: McpTool[];
  health: McpHealth;
  created_by_user_id: string;
  created_at: string;
  /** True when the tool list changed since the last review — review-gate it. */
  pending_drift?: boolean;
}

/** Discovery response from the wizard's "fetch tools" step — what the
 * remote MCP would advertise before the user enables anything. */
export interface McpDiscovery {
  version: string;
  tools: Array<{
    name: string;
    description: string;
    risk: McpToolRisk;        // server-suggested classification
    schema?: Record<string, unknown>;
  }>;
}

export interface McpCreateRequest {
  name: string;
  source: "custom" | "integration";
  integration_id?: string;
  transport: McpTransport;
  endpoint_url: string;
  auth: McpAuth;
  egress_policy: McpEgressPolicy;
  egress_region?: string;
  /** Tools to enable on creation (selected during wizard's permissions step). */
  enabled_tools: Array<{
    name: string;
    approval: McpToolApproval;
    risk: McpToolRisk;
  }>;
}

export interface InboxItem {
  id: string;
  kind: "review_requested" | "mention" | "approval_needed" | "ci_failed" | "comment" | "budget_alert" | "digest";
  priority: "high" | "normal" | "low";
  when: string;            // human-readable relative time; client may localize
  created_at: string;      // ISO 8601 — for sorting and SLA computation
  read: boolean;
  task_id: string | null;
  title: string;
  actor: string;
  actor_avatar: string | null;
  actor_kind: "agent" | "human";
  context: string;
  cta: string;
  phase: string | null;
  /** Optional override URL when item links somewhere other than the task. */
  to: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  unread_count: number;
  next_cursor: string | null;
}

export interface CostSummary {
  month: string;
  spend_usd: number;
  forecast_usd: number;
  budget_usd: number;
  budget_utilization: number;
  trend: string;
  spend_daily: { day: string; usd: number }[];
  spend_by_capability: { id: string; name: string; usd: number; pct: number; budget: number; trend: string; top_task: string }[];
  spend_by_model: { id: string; name: string; provider: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
  spend_by_phase: { name: string; usd: number; pct: number }[];
  top_tasks: { id: string; title: string; usd: number; runs: number; last_used: string }[];
  alerts: { level: "info" | "warning" | "danger"; text: string }[];
}

export interface SsoConfig {
  provider_id: string;
  provider_name: string;
  method: "SAML 2.0" | "OIDC";
  status: "enforced" | "optional" | "disabled";
  enforced_since: string | null;
  domains: string[];
  scim_enabled: boolean;
  scim_last_sync: string | null;
  scim_users_provisioned: number;
  scim_groups_mapped: number;
  jit_provisioning: boolean;
  session_timeout_hours: number;
  group_role_map: { group: string; role: string; count: number }[];
  cert_expires: string | null;
  metadata_url: string;
}

export interface ModelProvider {
  id: string;
  provider: string;
  via: string;
  region: string;
  status: "primary" | "available" | "enabled";
  enabled_models: string[];
  request_count: number;
  cost_mtd: number;
  residency_note: string;
}

export interface PrivacySettings {
  redaction: {
    enabled: boolean;
    classes: { id: string; label: string; enabled: boolean; description: string }[];
    last_updated: string;
    last_updated_by: string;
  };
  data_retention: {
    task_artifacts: string;
    chat_history: string;
    audit_events: string;
    raw_customer_context_in_prompts: string;
  };
  encryption: {
    at_rest: string;
    in_transit: string;
    byok: { enabled: boolean; status: string; provider: string };
  };
  residency: {
    primary_region: string;
    available: string[];
    model_egress: string;
  };
}

export interface RunDetail extends Run {
  kind: "implement" | "prd";
  capability_id: string;
  current_phase: number;
  progress: number;
  assignee: string;
  requested_by: string;
  source: { kind: "prd" | "jira" | "raw" | "linear"; label: string };
  summary: string;
}

/** Per-phase data is shaped per phase key. Backend should return the slice for
 * the requested phase; the union keeps each phase narrowly typed. */
export interface RunPhaseData {
  phase: string;
  data: Record<string, unknown>;
}

export interface TaskDecision {
  id: string;
  when: string;
  who_name: string;
  who_avatar: string;
  who_kind: "agent" | "human";
  phase: string;
  kind: "clarify" | "manual" | "selection" | "iterate";
  title: string;
  body: string;
  source: string;
}

export interface PrFeedbackItem {
  id: string;
  repo: string;
  pr_number: number;
  reviewer: string;
  reviewer_avatar: string | null;
  at: string;
  file: string;
  line: number;
  body: string;
  status: "addressed" | "in_progress" | "awaiting_athena";
  athena_response: {
    at: string;
    summary: string;
    commits: { sha: string; msg: string; files_changed: number }[];
  } | null;
}

export interface Skill {
  id: string;
  name: string;
  slug: string;
  version: string;
  status: "active" | "draft";
  description: string;
  icon: string;
  phases: string[];
  attached_capabilities: string[];
  usage_count: number;
  last_used: string;
}

export interface SkillDetail extends Skill {
  system_prompt?: string;
  knowledge_refs?: { kind: string; id: string; title: string }[];
  author?: string;
  last_updated?: string;
}

export interface ActivityItem {
  id: string;
  cap_id: string | null;
  who: string;
  who_avatar: string | null;
  who_kind: "agent" | "human";
  text_html: string;     // safe pre-rendered HTML — no user-supplied input
  tech: string;
  when: string;
  task_id: string | null;
}

export interface ChatThread {
  id: string;
  title: string;
  scope: { kind: "capability" | "org"; id?: string; label: string };
  preview: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  who: string;
  avatar: string;
  content: string;
  created_at: string;
}

export interface KnowledgeNode { id: string; kind: string; name: string; path: string; layer: string; x: number; y: number; color: string }
export interface KnowledgeEdge { src: string; dst: string; kind: string }
export interface KnowledgeGraph { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }

/** Per-capability knowledge summary produced by ingestion + the hierarchical KG (ADR-042). */
export interface CapabilityKnowledge {
  capability_id: string;
  /** Sum of all node kinds. */
  nodes_total: number;
  /** Histogram of node kinds (service/module/function/class/config/document). */
  nodes_by_kind: Record<string, number>;
  edges_total: number;
  repos_indexed: number;
  decision_records: number;
  domain_concepts: number;
  /** Capability overlay summary (LLM-generated, refreshed on debounced rebuild per ADR-049). */
  capability_summary: string;
  /** Top entities by importance (0..1), surfaced to give "what is this capability mostly about". */
  top_entities: Array<{
    id: string;
    name: string;
    kind: string;
    path: string;
    importance: number;
    description: string;
    repo: string;
  }>;
  /** Recent ingestion activity (most-recent first, ~5 items). */
  recent_changes: Array<{
    when: string;
    repo: string;
    summary: string;
    nodes_affected: number;
  }>;
  /** Overlay freshness per ADR-049. */
  ingestion_status: "fresh" | "debouncing" | "stale_but_usable" | "ingesting" | "failed";
  last_ingested_at: string;
}

/** Per-repo knowledge produced by ingestion for one repo inside a capability. */
export interface RepoKnowledge {
  repo_id: string;
  repo_full_name: string;
  primary_language: string;
  files_indexed: number;
  loc: number;
  /** Most recent commit Athena has processed; used for the "what's been ingested" claim. */
  last_commit: { sha: string; when: string; author: string; message: string };
  /** Repo-level summary (LLM-generated, per ADR-042 service-tier summary). */
  summary: string;
  /** Top services inferred in this repo. */
  services: Array<{ id: string; name: string; path: string; description: string; symbols: number }>;
  /** Top modules / files. */
  modules: Array<{ id: string; name: string; path: string; kind: string; symbols: number }>;
  exports: number;
  decision_records_referenced: number;
  ingestion_status: "fresh" | "debouncing" | "stale_but_usable" | "ingesting" | "failed";
  last_ingested_at: string;
  recent_commits: Array<{ sha: string; author: string; when: string; nodes_affected: number; message: string }>;
}

export interface NotificationRule {
  event: string;
  channels: ("email" | "slack" | "pagerduty" | "teams" | "webhook")[];
  audience: string;
}

export interface DecisionRecord {
  id: string;
  title: string;
  tag: string;
  author: string;
  date: string;
  kind: "ADR" | "Convention" | "Domain note";
  summary: string;
}

export interface OnboardingState {
  current: "first_run" | "in_progress" | "complete";
  completed_at: string | null;
  completed_by: string | null;
  steps: { id: string; title: string; status: "pending" | "in_progress" | "done"; detail: string }[];
}

/* --- Auth (mock-mode-only fast paths; real backend uses Supabase) ----- */

export interface MockAuthRequest {
  email: string;
  password?: string;
}

export interface MockAuthResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  display_name: string;
  expires_at: string;
}

export const api = {
  me: () => apiFetch<Me>("/v1/me"),
  auth: {
    sync: () => apiFetch<AuthSyncResponse>("/v1/auth/sync", { method: "POST" }),
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
    listResources: (id: string) =>
      apiFetch<CapabilityResource[]>(`/v1/capabilities/${encodeURIComponent(id)}/resources`),
    config: (id: string) =>
      apiFetch<CapabilityConfig>(`/v1/capabilities/${encodeURIComponent(id)}/config`),
    notes: (id: string) =>
      apiFetch<DomainNote[]>(`/v1/capabilities/${encodeURIComponent(id)}/notes`),
    /** Capability-level knowledge summary produced by ingestion + the hierarchical KG. */
    knowledge: (id: string) =>
      apiFetch<CapabilityKnowledge>(`/v1/capabilities/${encodeURIComponent(id)}/knowledge`),
    /** Per-repo knowledge inside a capability. */
    repoKnowledge: (id: string, repoId: string) =>
      apiFetch<RepoKnowledge>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge`,
      ),
  },
  audit: {
    events: (query: AuditEventsQuery = {}) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") {
          params.set(k, String(v));
        }
      }
      const qs = params.toString();
      return apiFetch<AuditEventsPage>(`/v1/audit/events${qs ? `?${qs}` : ""}`);
    },
    verify: () => apiFetch<{ verified: number }>("/v1/audit/verify", { method: "POST" }),
  },
  apiTokens: {
    list: (orgId: string) =>
      apiFetch<ApiTokenSummary[]>(`/v1/orgs/${encodeURIComponent(orgId)}/api-tokens`),
    create: (orgId: string, body: { name: string; scopes?: string[]; expires_at?: string | null }) =>
      apiFetch<ApiTokenMinted>(`/v1/orgs/${encodeURIComponent(orgId)}/api-tokens`, {
        method: "POST",
        body: JSON.stringify({
          name: body.name,
          scopes: body.scopes ?? [],
          expires_at: body.expires_at ?? null,
        }),
      }),
    revoke: (orgId: string, tokenId: string) =>
      apiFetch<ApiTokenSummary>(
        `/v1/orgs/${encodeURIComponent(orgId)}/api-tokens/${encodeURIComponent(tokenId)}/revoke`,
        { method: "POST" },
      ),
  },
  runs: {
    create: (goal: string, capabilityId?: string) =>
      apiFetch<Run>("/v1/runs", { method: "POST", body: JSON.stringify({ goal, capability_id: capabilityId ?? null }) }),
    list: () => apiFetch<Run[]>("/v1/runs"),
    get: (id: string) => apiFetch<RunDetail>(`/v1/runs/${encodeURIComponent(id)}`),
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
    phaseData: (id: string, phaseKey: string) =>
      apiFetch<RunPhaseData>(`/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}`),
    prFeedback: (id: string) =>
      apiFetch<PrFeedbackItem[]>(`/v1/runs/${encodeURIComponent(id)}/pr-feedback`),
    decisions: (id: string) =>
      apiFetch<TaskDecision[]>(`/v1/runs/${encodeURIComponent(id)}/decisions`),
    answerClarifyingQuestion: (id: string, phaseKey: string, qid: string, choice: string) =>
      apiFetch<{ accepted: boolean }>(`/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}/clarify/${encodeURIComponent(qid)}`, {
        method: "POST",
        body: JSON.stringify({ choice }),
      }),
    regenerate: (id: string, phaseKey: string, optionId: string) =>
      apiFetch<{ accepted: boolean; new_version: string }>(`/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ option_id: optionId }),
      }),
  },
  integrations: {
    list: (orgId: string) =>
      apiFetch<Integration[]>(`/v1/orgs/${encodeURIComponent(orgId)}/integrations`),
    connect: (orgId: string, integrationId: string, body: IntegrationConnectRequest) =>
      apiFetch<Integration>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}/connect`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    disconnect: (orgId: string, integrationId: string) =>
      apiFetch<Integration>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}/disconnect`,
        { method: "POST" },
      ),
    test: (orgId: string, integrationId: string) =>
      apiFetch<{ ok: boolean; latency_ms: number; detail: string }>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}/test`,
        { method: "POST" },
      ),
  },
  mcp: {
    list: () => apiFetch<McpServer[]>("/v1/mcp"),
    get: (id: string) => apiFetch<McpServer>(`/v1/mcp/${encodeURIComponent(id)}`),
    create: (body: McpCreateRequest) =>
      apiFetch<McpServer>("/v1/mcp", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Pick<McpServer, "name" | "endpoint_url" | "egress_policy" | "egress_region">>) =>
      apiFetch<McpServer>(`/v1/mcp/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<void>(`/v1/mcp/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Lightweight ping — fires the configured auth and reports latency. */
    test: (id: string) =>
      apiFetch<{ ok: boolean; latency_ms: number; tool_count: number; detail: string }>(
        `/v1/mcp/${encodeURIComponent(id)}/test`,
        { method: "POST" },
      ),
    /** Wizard step 3 — introspect a candidate MCP without saving. */
    discover: (body: { transport: McpTransport; endpoint_url: string; auth: McpAuth }) =>
      apiFetch<McpDiscovery>("/v1/mcp/discover", { method: "POST", body: JSON.stringify(body) }),
    /** Accept the current tool list as "reviewed" — clears pending_drift. */
    acknowledgeDrift: (id: string) =>
      apiFetch<McpServer>(`/v1/mcp/${encodeURIComponent(id)}/acknowledge-drift`, { method: "POST" }),
    /**
     * Toggle a tool's `enabled` flag. Per the MCP design
     * (../../athena-docs/04-backend/mcp-integration.md §11), enabling a
     * `risk=destructive` tool requires `confirm_slug` matching the tool's
     * `name`. The backend will respond 409 if the toggle to enabled=true on
     * a destructive tool arrives without confirm_slug; the FE prompts then
     * retries with the slug.
     */
    toggleTool: (id: string, toolId: string, enabled: boolean, confirmSlug?: string) =>
      apiFetch<McpTool>(
        `/v1/mcp/${encodeURIComponent(id)}/tools/${encodeURIComponent(toolId)}/toggle`,
        {
          method: "POST",
          body: JSON.stringify(confirmSlug ? { enabled, confirm_slug: confirmSlug } : { enabled }),
        },
      ),
    setToolApproval: (id: string, toolId: string, approval: McpToolApproval) =>
      apiFetch<McpTool>(
        `/v1/mcp/${encodeURIComponent(id)}/tools/${encodeURIComponent(toolId)}/approval`,
        { method: "POST", body: JSON.stringify({ approval }) },
      ),
    recentCalls: (id: string) =>
      apiFetch<McpRecentCall[]>(`/v1/mcp/${encodeURIComponent(id)}/calls`),
  },
  sso: {
    get: (orgId: string) =>
      apiFetch<SsoConfig>(`/v1/orgs/${encodeURIComponent(orgId)}/sso`),
    update: (orgId: string, body: Partial<SsoConfig>) =>
      apiFetch<SsoConfig>(`/v1/orgs/${encodeURIComponent(orgId)}/sso`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    syncScim: (orgId: string) =>
      apiFetch<{ users_provisioned: number; groups_mapped: number; last_sync: string }>(
        `/v1/orgs/${encodeURIComponent(orgId)}/sso/scim/sync`,
        { method: "POST" },
      ),
  },
  modelProviders: {
    list: (orgId: string) =>
      apiFetch<ModelProvider[]>(`/v1/orgs/${encodeURIComponent(orgId)}/model-providers`),
    setPrimary: (orgId: string, providerId: string) =>
      apiFetch<ModelProvider>(`/v1/orgs/${encodeURIComponent(orgId)}/model-providers/${encodeURIComponent(providerId)}/set-primary`, { method: "POST" }),
  },
  privacy: {
    get: (orgId: string) =>
      apiFetch<PrivacySettings>(`/v1/orgs/${encodeURIComponent(orgId)}/privacy`),
    update: (orgId: string, body: { redaction_class_id: string; enabled: boolean }) =>
      apiFetch<PrivacySettings>(`/v1/orgs/${encodeURIComponent(orgId)}/privacy`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  inbox: {
    list: (params: { cursor?: string; limit?: number; unread_only?: boolean } = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
      const qs = sp.toString();
      return apiFetch<InboxPage>(`/v1/inbox${qs ? `?${qs}` : ""}`);
    },
    markRead: (itemId: string) =>
      apiFetch<InboxItem>(`/v1/inbox/${encodeURIComponent(itemId)}/read`, { method: "POST" }),
    markAllRead: () =>
      apiFetch<{ marked: number }>("/v1/inbox/read-all", { method: "POST" }),
  },
  cost: {
    summary: (params: { month?: string } = {}) => {
      const sp = new URLSearchParams();
      if (params.month) sp.set("month", params.month);
      const qs = sp.toString();
      return apiFetch<CostSummary>(`/v1/cost/summary${qs ? `?${qs}` : ""}`);
    },
    setBudget: (orgId: string, body: { capability_id?: string; usd: number }) =>
      apiFetch<CostSummary>(`/v1/orgs/${encodeURIComponent(orgId)}/cost/budget`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },
  skills: {
    list: () => apiFetch<Skill[]>("/v1/skills"),
    get: (id: string) => apiFetch<SkillDetail>(`/v1/skills/${encodeURIComponent(id)}`),
  },
  activity: {
    list: (params: { cursor?: string; limit?: number; cap_id?: string } = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
      const qs = sp.toString();
      return apiFetch<{ items: ActivityItem[]; next_cursor: string | null }>(`/v1/activity${qs ? `?${qs}` : ""}`);
    },
  },
  chat: {
    listThreads: () => apiFetch<ChatThread[]>("/v1/chat/threads"),
    getThread: (id: string) => apiFetch<{ thread: ChatThread; messages: ChatMessage[] }>(`/v1/chat/threads/${encodeURIComponent(id)}`),
    postMessage: (threadId: string, content: string) =>
      apiFetch<ChatMessage>(`/v1/chat/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    createThread: (body: { title: string; scope_kind: "capability" | "org"; scope_id?: string; initial_message: string }) =>
      apiFetch<{ thread: ChatThread; first_message: ChatMessage }>("/v1/chat/threads", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  knowledge: {
    graph: (params: { capability_id?: string } = {}) => {
      const sp = new URLSearchParams();
      if (params.capability_id) sp.set("capability_id", params.capability_id);
      const qs = sp.toString();
      return apiFetch<KnowledgeGraph>(`/v1/knowledge/graph${qs ? `?${qs}` : ""}`);
    },
  },
  notifications: {
    routing: (orgId: string) =>
      apiFetch<NotificationRule[]>(`/v1/orgs/${encodeURIComponent(orgId)}/notifications/routing`),
  },
  onboarding: {
    state: (orgId: string) => apiFetch<OnboardingState>(`/v1/orgs/${encodeURIComponent(orgId)}/onboarding`),
  },
  rules: {
    list: () => apiFetch<DecisionRecord[]>("/v1/rules"),
    get: (id: string) => apiFetch<DecisionRecord>(`/v1/rules/${encodeURIComponent(id)}`),
  },
  /** Mock-only fast-path auth (real backend uses Supabase from the browser
   * client; these endpoints are never called when `config.isMock === false`). */
  mockAuth: {
    signIn: (body: MockAuthRequest) =>
      apiFetch<MockAuthResponse>("/v1/mock-auth/sign-in", { method: "POST", body: JSON.stringify(body) }),
    signUp: (body: MockAuthRequest & { display_name: string }) =>
      apiFetch<MockAuthResponse>("/v1/mock-auth/sign-up", { method: "POST", body: JSON.stringify(body) }),
    signOut: () => apiFetch<{ accepted: boolean }>("/v1/mock-auth/sign-out", { method: "POST" }),
  },
};
