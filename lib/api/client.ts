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

/**
 * F-07.1 — expanded enum mirrors the backend integration framework
 * (`06-integrations/integration-framework.md` §2). `pending` covers the gap
 * between "user clicked Connect" and "OAuth callback returned"; `degraded`
 * surfaces "needs reauth" without ambiguity; `active` distinguishes "recently
 * synced" from the merely "credentials stored" `connected` state.
 */
export type IntegrationStatus =
  | "available"      // not yet connected (marketplace)
  | "coming_soon"    // adapter not built yet
  | "pending"        // user clicked Connect, awaiting OAuth callback
  | "connected"      // credentials stored, verify() passed
  | "active"         // last sync within freshness window
  | "degraded"       // verify() failing, needs reauth
  | "revoked"        // user or admin disconnected
  ;

export type IntegrationCategory =
  | "SCM" | "Identity" | "Work mgmt" | "Comms" | "Knowledge"
  | "Incidents" | "Observability" | "Feature flags" | "Design"
  | "CRM" | "Support" | "Model provider" | "CI/CD";

/**
 * F-07.5 — structured scope replaces the free-form string ("15 repos · 4
 * capabilities") so the FE can render typed chips and drive a "manage scope"
 * action without parsing prose.
 */
export interface IntegrationScope {
  kind: "repos" | "projects" | "channels" | "workspaces" | "models" | "other";
  count: number;
  /** Up to 3 names shown as chips. */
  preview: string[];
  /** Overflow count (count - preview.length when > 0). */
  more: number;
}

/**
 * F-07.3 — adds `github_app` and `pat` to the existing kinds so the
 * source-control adapter (Phase 08) can express GitHub-App install + Jira
 * Server / DC PAT flows distinctly.
 */
export type IntegrationConnectKind =
  | "oauth"
  | "token"
  | "key"
  | "saml"
  | "endpoint"
  | "keypair"
  | "aws"
  | "webhook"
  | "github_app"   // F-08.1
  | "pat";         // F-09.1 — Jira Server / DC, GitLab self-managed PAT, etc.

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  blurb: string;
  connect_kind?: IntegrationConnectKind;
  connected_as?: string;
  connected_at?: string | null;
  /** F-07.5 — structured scope shape (replaces free-form string). */
  scope?: IntegrationScope;
  last_sync?: string | null;
  instructions?: string;
  flagship?: boolean;
  /** F-07.4 — required (default `false` on the backend). When `true`, Athena
   * auto-provisions a paired MCP entry under /mcp on connect. */
  provides_mcp: boolean;
}

export interface IntegrationConnectRequest {
  /** Free-form key/value bag of provider-specific config. Mock-mode accepts
   * anything; the real backend will validate per-integration via the JSON
   * Schema returned from `GET /v1/orgs/{id}/integrations/{kind}/schema`
   * (F-07.3). */
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

/**
 * Per-phase staleness signal (F-04.13). When the upstream doc gets Improved
 * after a downstream phase ran, this carries the ISO timestamp of the change
 * that made the phase's output stale, plus which upstream doc moved.
 */
export interface RunPhaseStaleness {
  /** ISO timestamp of the upstream doc revision that invalidated this phase. */
  stale_since: string;
  /** Friendly label of the upstream doc that changed (e.g. "Spec"). */
  upstream_doc_label: string;
  /** Phase key of the upstream doc, so deep-links land on the right tab. */
  upstream_phase_key: string;
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
  /** F-04.13 — true when any downstream phase has output based on an older
   * version of an upstream doc that has since been Improved. */
  downstream_stale?: boolean;
  /** F-04.13 — per-phase staleness markers keyed by phase key. UI shows the
   * banner on each phase that has a row here. */
  phase_staleness?: Record<string, RunPhaseStaleness>;
}

/* -------------------------------------------------------------------------- */
/* F-03.1 — Run phase payloads (discriminated union)                          */
/* -------------------------------------------------------------------------- */

/** Generic doc-revision shape used across `spec`, `plan`, and PRD `draft`
 * phases. Mirrors the row written into `blueprint_section_revisions` for Blueprints
 * (knowledge-model.md §5.2) and the `documents.revisions` log for run docs. */
export interface PhaseDocRevision {
  id: string;
  author: string;
  authorKind: "agent" | "human";
  date: string;
  note: string;
  changes?: string;
}

/** Clarifying question — shared shape across phases that prompt the user. */
export interface PhaseClarifyingQuestion {
  id: string;
  status: "answered" | "pending";
  question: string;
  context: string;
  suggestedAnswers: { id: string; label: string; description: string }[];
  chosen: string | null;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
}

export interface PhaseKbSource {
  label: string;
  kind: string;
  count: number;
  icon?: string;
  detail?: string;
}

export interface PhaseCitation {
  label: string;
  icon?: string;
  title?: string;
}

/* -- Implementation track payloads ----------------------------------------- */

export interface SpecPhasePayloadV1 {
  doc: string;
  currentVersion: string;
  status: "draft" | "needs-review" | "approved";
  revisions: PhaseDocRevision[];
  body?: string;
  markdown?: string;
  approvedBy?: { name: string; role: string; avatar?: string }[];
  capabilitiesDetected?: Array<{
    id: string;
    confidence: number;
    primary: boolean;
    why: string;
    files: number;
  }>;
  blastRadius?: {
    repos: { id: string; files: number; kind: string; desc: string }[];
    services?: { name: string; impact: string; risk: string }[];
    dataStores?: { name: string; impact: string; risk: string }[];
    compliance?: string[];
  };
  kbSources?: PhaseKbSource[];
  clarifyingQuestions?: PhaseClarifyingQuestion[];
  regenerateOptions?: { id: string; label: string; description: string }[];
}

export interface PlanPhasePayloadV1 {
  doc: string;
  currentVersion: string;
  status: "draft" | "needs-review" | "approved";
  revisions: PhaseDocRevision[];
  body?: string;
  markdown?: string;
  components?: Array<{
    n: number;
    name: string;
    plainEnglish: string;
    technical: string;
    why: string;
    repo: string;
    touchpoints: {
      consumes: string[];
      publishes: string[];
      calls: string[];
      writes: string[];
      exposes: string[];
    };
    files: { name: string; change: string }[];
  }>;
  dependencyMatrix?: string[][];
  consequences?: {
    severity: string;
    summary: string;
    breakingChanges: { area: string; desc: string; risk: string }[];
    dataImpacts: { entity: string; impact: string; risk: string }[];
    runtimeRisks: { name: string; desc: string; severity: string }[];
    mitigations: { kind: string; desc: string }[];
  };
  subtasks?: Array<{
    id: string;
    title: string;
    component: string;
    status: string;
    files?: number;
    jira: string;
    dependsOn: string[];
    acceptanceCriteria: string[];
    doc?: { current: string; revisions: PhaseDocRevision[]; body: string };
    aiSuggestPromote?: boolean;
    promoteReason?: string;
  }>;
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

export interface ImplementPhasePayloadV1 {
  summaryPM: string;
  stages: Array<{ name: string; state: string; detail: string; duration: string }>;
  stats: { files: number; totalTests: number; retries: number; costSoFar: number; tokens: number };
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

export interface ReviewPhasePayloadV1 {
  diffStats: { files: number; additions: number; deletions: number; repos: number };
  reviewers: Array<{ name: string; role: string; avatar: string; state: string; note: string }>;
  approvalPolicy: Array<{ label: string; met: boolean; blocker: string }>;
  diffs: Array<{
    repo: string;
    file: string;
    additions: number;
    deletions: number;
    purposePM: string;
    hunks: Array<{
      header: string;
      lines: Array<{ type: "add" | "rem" | "ctx"; n: number; t: string }>;
    }>;
  }>;
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

export interface CiPhasePayloadV1 {
  state: "running" | "passed" | "failed" | "queued";
  elapsedSeconds: number;
  attemptsByRepo: Record<
    string,
    {
      branch: string;
      sha: string;
      ciTool: string;
      checks: Array<{
        name: string;
        state: "running" | "success" | "failure";
        startedAt: string;
        completedAt: string;
        outputSummary: string;
      }>;
      classifier: {
        category: string;
        confidence: number;
        deterministic: boolean;
        errorExcerpt: string;
        failingFiles: string[];
        triageNote: string;
        resolution: string;
      } | null;
    }
  >;
  healHistory: Array<{ n: number; outcome: string; filesModified: number; costUsd: number; note: string }>;
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

export interface PrPhasePayloadV1 {
  prs: Array<{
    repo: string;
    branch: string;
    sha: string;
    status: "open" | "merged" | "closed" | "draft";
    number: number;
    files: number;
    additions: number;
    deletions: number;
    url: string;
  }>;
  mode: "draft" | "ready";
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

/* -- PRD track payloads --------------------------------------------------- */

export interface FramePhasePayloadV1 {
  problemStatement: string;
  problemCitations: PhaseCitation[];
  whyNow: string;
  whyNowCitations: PhaseCitation[];
  affectedUsers: Array<{
    id: string;
    role: string;
    description: string;
    impact: "high" | "medium" | "low" | "blocker";
    source: string;
  }>;
  urgency: "high" | "medium" | "low";
  problemConfidence: number;
  kbSources?: PhaseKbSource[];
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

export interface ResearchPhasePayloadV1 {
  synthesis: string;
  synthesisConfidence: number;
  synthesisBreakdown: { pastPrds: number; signals: number; decisions: number };
  pastPrds: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    relevance: string;
  }>;
  customerSignals: Array<{
    source: string;
    count: number;
    trend: string;
    summary: string;
    cite: PhaseCitation;
  }>;
  relatedDecisions: Array<{ id: string; title: string; relevance: string }>;
  resourcesUsed: Array<{ title: string; kind: string; nodes: number }>;
  competitiveLandscape?: Array<{
    name: string;
    supports: string;
    notes: string;
    cite: PhaseCitation;
  }>;
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

export interface DraftPhasePayloadV1 {
  doc: string;
  currentVersion: string;
  status: "draft" | "needs-review" | "approved";
  revisions: PhaseDocRevision[];
  body: string;
  markdown: string;
  goals: Array<{ id: string; text: string; primary: boolean; cites: PhaseCitation[] }>;
  nonGoals: string[];
  users: Array<{ persona: string; goals: string; success: string }>;
  constraints: Array<{ text: string; cite?: PhaseCitation }>;
  timeline: string;
  chosenOptionId: string;
  options: Array<{
    id: string;
    title: string;
    recommended: boolean;
    effort: string;
    risk: string;
    duration: string;
    adoption: string;
    pros: string[];
    cons: string[];
    description: string;
    informedBy: PhaseCitation[];
  }>;
  chosenRationale: string;
  metrics: Array<{
    id: string;
    name: string;
    baseline: string;
    target: string;
    owner: string;
    how: string;
    cites: PhaseCitation[];
  }>;
  clarifyingQuestions?: PhaseClarifyingQuestion[];
  kbSources?: PhaseKbSource[];
}

export interface SignoffPhasePayloadV1 {
  readinessScore: number;
  readinessBreakdown: { approved: number; blockers: number; pending: number };
  stakeholders: Array<{
    name: string;
    role: string;
    avatar: string;
    state: "owner" | "approved" | "changes-requested" | "pending";
    order: number;
    source: string;
    comment: string;
    nextAction?: string;
  }>;
  commentThread: Array<{ author: string; avatar: string; date: string; text: string }>;
  clarifyingQuestions?: PhaseClarifyingQuestion[];
}

/* -- Quickfix track payloads --------------------------------------------- */

/** Quickfix Implement reuses most of the implementation track's `Implement`
 * payload but is leaner — no per-component breakdown, single stage list. */
export type QuickfixImplementPhasePayloadV1 = Pick<
  ImplementPhasePayloadV1,
  "summaryPM" | "stages" | "stats"
> & {
  clarifyingQuestions?: PhaseClarifyingQuestion[];
};

/** Quickfix PR uses the same shape as the implementation PR phase. */
export type QuickfixPrPhasePayloadV1 = PrPhasePayloadV1;

/* -- Discriminated wrapper ------------------------------------------------ */

/**
 * Map of phase key → payload shape. `api.runs.phaseData` returns the matching
 * `RunPhaseDataFor<PhaseKey>` based on the requested key. Backend writes the
 * exact slice; FE narrows by switching on `phase`.
 */
export interface RunPhasePayloadByKey {
  spec: SpecPhasePayloadV1;
  plan: PlanPhasePayloadV1;
  implement: ImplementPhasePayloadV1;
  review: ReviewPhasePayloadV1;
  ci: CiPhasePayloadV1;
  pr: PrPhasePayloadV1;
  frame: FramePhasePayloadV1;
  research: ResearchPhasePayloadV1;
  draft: DraftPhasePayloadV1;
  signoff: SignoffPhasePayloadV1;
  "quickfix.implement": QuickfixImplementPhasePayloadV1;
  "quickfix.pr": QuickfixPrPhasePayloadV1;
}

export type RunPhaseKey = keyof RunPhasePayloadByKey;

export interface RunPhaseDataFor<K extends RunPhaseKey> {
  phase: K;
  data: RunPhasePayloadByKey[K];
}

/**
 * Discriminated union of every phase's `{ phase, data }` envelope. Switch on
 * `phase` to narrow `data`.
 */
export type RunPhaseData = {
  [K in RunPhaseKey]: RunPhaseDataFor<K>;
}[RunPhaseKey];

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
  /** Set when the conversation spawned a task — drives the "Created task" pill
   * on the thread row and the link card embedded in the conversation. */
  created_task?: {
    id: string;
    kind: "implement" | "prd";
    goal: string;
  } | null;
  /** Optional capability hint surfaced as a chip in the right pane header. */
  flavour?: "prd_framing" | "bug_investigation" | "codebase_qa" | "architecture" | "knowledge_lookup" | null;
}

/** A chat message. The `role` enum has four members:
 * - `user`/`assistant`/`system` are the legacy chat roles.
 * - `task_created` is a structured event message — `content` carries the task
 *   id (e.g. `"tsk_002"`) and the UI renders a card linking to /runs/[id].
 *   Threads that produced a task always emit one of these as the last message. */
export interface ChatMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system" | "task_created";
  who: string;
  avatar: string;
  content: string;
  created_at: string;
  /** Optional citations rendered as small chips under the assistant bubble. */
  citations?: ChatCitation[];
}

export interface ChatCitation {
  label: string;
  /** Where the citation lives — drives the icon. */
  kind: "file" | "adr" | "doc" | "ticket" | "pr" | "skill" | "url";
  /** Optional path/identifier; not auto-rendered as a link, just hinted. */
  ref?: string;
}

export interface KnowledgeNode { id: string; kind: string; name: string; path: string; layer: string; x: number; y: number; color: string }
export interface KnowledgeEdge { src: string; dst: string; kind: string }
export interface KnowledgeGraph { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }

/* -------------------------------------------------------------------------- */
/* Knowledge surfaces                                                         */
/*                                                                            */
/* Three scopes mirror the backend KG model:                                  */
/*  - RepoKnowledge        per (repo, indexed_sha)                            */
/*  - CapabilityKnowledge  per capability_overlay                             */
/*  - OrgKnowledge         per org (registry + cross-cap + Blueprint excerpts) */
/*                                                                            */
/* Field shape tracks athena-docs/04-backend/knowledge-architecture.md and    */
/* athena-docs/03-data-and-storage/postgres-schema.md. Every field in these   */
/* interfaces must map to something the ingestion pipeline actually produces. */
/* -------------------------------------------------------------------------- */

/** Common ingestion-freshness pill state used at every scope. */
export type IngestionStatus = "fresh" | "debouncing" | "stale_but_usable" | "ingesting" | "failed";

/** One symbol surfaced from the symbol graph (`kg_nodes` rows of kind function/class/method).
 *  Sourced from tree-sitter + per-language analyzers (knowledge-architecture.md §9). */
export interface TopSymbol {
  id: string;
  kind: "function" | "class" | "method" | "interface" | "type" | "enum";
  name: string;
  /** Path + line range (line_start:line_end), e.g. `inbox-svc/src/conversations/hydrate.py:32:118`. */
  path: string;
  /** Declared signature with params + return type (one-line). */
  signature: string;
  /** First sentence of the docstring / leading comment, if any. */
  docstring: string | null;
  visibility: "public" | "internal" | "private";
  language: string;
  /** Symbol-graph derived counts. */
  callers_count: number;
  callees_count: number;
  /** Importance score 0..1 from PageRank-style score in the capability overlay. */
  importance: number;
  /** ADR ids referenced from this symbol's docstring or body. */
  adrs_referenced: string[];
  /** Whether at least one test exercises this symbol (per `kg_test_coverage`). */
  has_tests: boolean;
}

/** A single call / import / extends / references edge surfaced from the symbol graph. */
export interface CallEdge {
  /** Underlying edge kinds from `knowledge_edges.kind`. */
  kind: "calls" | "imports" | "extends" | "implements" | "references" | "tested_by" | "documented_by" | "contains" | "configures";
  from: { id: string; name: string; path: string };
  to: { id: string; name: string; path: string };
  /** How many concrete call/import sites underlie this edge in the latest sha. */
  occurrences: number;
}

/** Config artifact discovered during ingestion (yaml/json/toml/env templates).
 *  No corresponding Blueprint section — this is canonical for configs. */
export interface ConfigArtifact {
  id: string;
  path: string;
  format: "yaml" | "json" | "toml" | "env" | "ini" | "hcl" | "other";
  /** One-paragraph summary of what the config governs. */
  summary: string;
  /** Top keys surfaced to the UI (capped to ~6). */
  key_excerpts: string[];
  /** Referenced by these ADR ids (when the ADR text mentions the path). */
  adrs_referenced: string[];
}

/** ADR / decision-record reference resolved to title + status. Surfaced from
 *  KG cross-references (repo nodes that link to a decision record). */
export interface AdrRef {
  id: string;
  title: string;
  date: string;
  status: "proposed" | "accepted" | "superseded" | "deprecated";
  /** Where the ADR doc lives (repo path or external link). */
  path: string;
}

/** What sha + overlay version is currently pinned for retrieval at this repo. */
export interface RepoSnapshotInfo {
  indexed_sha: string;
  indexed_branch: string;
  last_full_sync: string;
  /** Pending-PR shas the snapshot is aware of but not yet folded into mainline retrieval. */
  pending_prs: Array<{ pr_number: number; sha: string; changed_files: number }>;
}

/** Per-capability knowledge produced by ingestion + the hierarchical KG (ADR-042) +
 *  the capability overlay rebuild (ADR-049).
 *
 *  IMPORTANT — this shape carries ONLY KG-distinctive ingestion data. Anything
 *  that is also a Blueprint section (per postgres-schema.md §5.4: `services`,
 *  `decisions`, `open_questions`, `domain_glossary`, `cross_repo_workflows`,
 *  `recent_activity`, `overview`, `guardrails`, `conventions`, `stack`) is
 *  rendered ONLY in the Blueprint tab. The Knowledge card never duplicates a
 *  Blueprint section. */
export interface CapabilityKnowledge {
  capability_id: string;
  /** Sum of all node kinds. */
  nodes_total: number;
  /** Histogram of node kinds (service/module/function/class/config/document/test/summary). */
  nodes_by_kind: Record<string, number>;
  edges_total: number;
  repos_indexed: number;
  /** Total decision-records referenced from this capability's nodes (count only —
   *  full titled list lives in Blueprint.decisions). */
  decision_records: number;
  domain_concepts: number;
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
  /** Capability-overlay term bridges (knowledge-architecture.md §3 / §5).
   *  Each row maps a domain term Athena learned to the graph nodes that mention it.
   *  This is the KG-overlay-derived view; NOT the same as Blueprint.domain_glossary
   *  (which is a curated narrative glossary). */
  overlay_terms: Array<{
    term: string;
    /** Confidence 0..1 — how strongly the overlay associates the term with the matched nodes. */
    confidence: number;
    /** Top KG node ids that mention this term, ordered by relevance. */
    matched_node_ids: string[];
    /** Display labels for the top-3 matched nodes (kept on FE so we don't refetch). */
    matched_node_labels: string[];
    /** Where the term was first extracted (resource_id is a CapabilityResource id). */
    extracted_from: { resource_id: string; line_range: string };
  }>;
  /** Raw KG ingestion-activity projection (most-recent first, ~5 items). The
   *  curated narrative version lives in Blueprint.recent_activity. */
  recent_changes: Array<{
    when: string;
    repo: string;
    summary: string;
    nodes_affected: number;
    /** Smart-classifier verdict per ADR-048 (governs whether overlay rebuild fired). */
    change_class: "cosmetic" | "minor" | "material";
  }>;
  /** Overlay freshness per ADR-049. */
  ingestion_status: IngestionStatus;
  last_ingested_at: string;
}

/** Per-repo knowledge produced by ingestion for one repo inside a capability.
 *
 *  IMPORTANT — this shape carries ONLY KG-distinctive ingestion data. Anything
 *  that is also a Repo Blueprint section (per postgres-schema.md §5.4: `overview`,
 *  `guardrails`, `conventions`, `stack`, `api_surface`, `data_models`,
 *  `entry_points`, `hot_files`, `tests_and_ci`, `build_and_run`,
 *  `deployment_surface`, `external_deps`, `local_idioms`, `recent_activity`)
 *  is rendered ONLY in the Blueprint tab. The Knowledge card never duplicates a
 *  Blueprint section. */
export interface RepoKnowledge {
  repo_id: string;
  repo_full_name: string;
  primary_language: string;
  files_indexed: number;
  loc: number;
  /** Most recent commit Athena has processed; used for the "what's been ingested" claim. */
  last_commit: { sha: string; when: string; author: string; message: string };
  /** Top services inferred in this repo (KG service nodes — Repo Blueprint has no
   *  services section, so this is the canonical place to surface them).
   *  `tier_summary` is the ADR-042 service-tier auto-summary (≈300 words). */
  services: Array<{
    id: string;
    name: string;
    path: string;
    description: string;
    symbols: number;
    tier_summary: string;
    public_endpoints: number;
  }>;
  /** Top modules / files (KG module nodes — Repo Blueprint has no modules section).
   *  `tier_summary` is the ADR-042 module-tier auto-summary (≈200 words).
   *  `hot` is a top-decile churn signal — Blueprint.hot_files renders the full
   *  curated list; this is just the per-module flag. */
  modules: Array<{
    id: string;
    name: string;
    path: string;
    kind: string;
    symbols: number;
    tier_summary: string;
    hot: boolean;
  }>;
  /** Top function / class / method symbols (symbol-graph) — the "what's actually
   *  in this code" view. NOT a Blueprint section. */
  top_symbols: TopSymbol[];
  /** Top edges between symbols in this repo (call / import / extends / references).
   *  NOT a Blueprint section. */
  call_edges: CallEdge[];
  /** Config artifacts discovered during ingestion. NOT explicitly a Blueprint
   *  section (Blueprint.stack covers the high-level stack; this lists each
   *  config file with its key excerpts). */
  configs: ConfigArtifact[];
  /** ADRs referenced from this repo's nodes — resolved to titles. NOT a Repo
   *  Blueprint section (Blueprint.decisions exists only at Capability scope). */
  adrs_referenced: AdrRef[];
  /** Indexed-sha + pending PR snapshot info. NOT a Blueprint section. */
  snapshot: RepoSnapshotInfo;
  exports: number;
  decision_records_referenced: number;
  ingestion_status: IngestionStatus;
  last_ingested_at: string;
  /** Raw KG commit projection (one entry per commit). Blueprint.recent_activity is
   *  the curated narrative counterpart. */
  recent_commits: Array<{
    sha: string;
    author: string;
    when: string;
    nodes_affected: number;
    files_changed: number;
    delta_lines: number;
    message: string;
  }>;
}

/** Per-org knowledge — registry + cross-capability dependency model + KG-derived
 *  health signals.
 *
 *  IMPORTANT — this shape carries ONLY KG-distinctive ingestion data. Anything
 *  that is also an Org Blueprint section (per postgres-schema.md §5.4: `standards`,
 *  `glossary`, `security_policies`) is rendered ONLY in the Blueprint tab. The
 *  org Knowledge page never duplicates a Blueprint section. */
export interface OrgKnowledge {
  org_id: string;
  /** Capability registry with the per-cap deltas that drive the registry card. */
  capabilities: Array<{
    id: string;
    slug: string;
    name: string;
    /** Lead user id (from capability ownership row, not the create-record audit field). */
    lead_user_id: string | null;
    repos_indexed: number;
    open_tasks: number;
    nodes_total: number;
    decisions: number;
    ingestion_status: IngestionStatus;
    /** Material changes in the last 7 days (smart-classifier verdict per ADR-048). */
    material_changes_7d: number;
  }>;
  /** Typed cross-capability dependencies — derived from cross-overlay edges
   *  (knowledge-architecture.md §3.1). NOT a Blueprint section. */
  cross_cap_dependencies: Array<{
    from_capability_id: string;
    to_capability_id: string;
    /** `data` = events / table reads; `control` = state gates / RLS / auth. */
    kind: "data" | "control";
    label: string;
    /** Underlying KG evidence — node ids or topic names that prove the edge. */
    evidence: string[];
  }>;
  /** Decision records flagged stale by `decision_record_health`
   *  (knowledge-architecture.md §16). NOT a Blueprint section. */
  stale_decisions: Array<{
    id: string;
    title: string;
    /** Why it's flagged stale. */
    reason: string;
    last_reviewed: string;
  }>;
  /** Org-wide totals — single source of truth that the KPI tiles render. */
  totals: {
    nodes: number;
    edges: number;
    repos: number;
    decisions: number;
    open_questions: number;
  };
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

/* -------------------------------------------------------------------------- */
/* Blueprint — the structured, multi-section knowledge document per scope     */
/*                                                                            */
/* Per knowledge-model.md §5. Lives in Athena's DB; never written to a repo. */
/* AGENTS.md / CLAUDE.md are read-only inputs that seed the synthesised       */
/* sections (`conventions`, `guardrails`). AI updates to user-edited sections */
/* go through the approval queue (§5.4); accepted proposals create new        */
/* revisions; rejected proposals cool down for 14 days on identical content.  */
/* -------------------------------------------------------------------------- */

/** Three scopes share the same shape and endpoint surface. */
export type BlueprintScope = "org" | "capability" | "repo";

/**
 * Where a section's content originated. `derived` = facts pulled from the KG
 * (e.g., dependency list); `synthesized` = AI-summarised over sources;
 * `authored` = user-only (e.g., open questions). The flag drives editability
 * defaults (derived → not editable) and approval rules (§5.4).
 */
export type BlueprintSectionOrigin = "derived" | "synthesized" | "authored";

/** Section body encoding. Most sections are markdown; structured sections
 * like `api_surface` and `data_models` may use JSON for typed rendering. */
export type BlueprintBodyKind = "markdown" | "json" | "mixed";

/**
 * Lifecycle of a proposed section change. Proposals are created when the
 * Blueprint builder detects new signal for a section that is `protected_from_ai`
 * (user has edited it) or `locked`. Users accept / edit-and-accept / reject;
 * a second proposal arriving while one is pending supersedes the older row.
 */
export type BlueprintProposalStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "superseded"
  | "obsolete";

/** Overall freshness of the Blueprint. `stale` means sources have moved since
 * `last_synced_at`; `building` means a sync is in flight. */
export type BlueprintStatus = "empty" | "building" | "ready" | "stale" | "failed";

/**
 * TOC-row shape returned by `GET /v1/{scope}/{id}/blueprint`. No body — just
 * enough for the left sidebar to render and decide which sections to fetch
 * on demand (§5.7). `token_count` lets the agent's bundle builder budget.
 */
export interface BlueprintSectionSummary {
  section_key: string;
  title: string;
  summary: string;
  token_count: number;
  origin: BlueprintSectionOrigin;
  editable: boolean;
  locked: boolean;
  /** Set true once the user has edited or accepted a proposal on this row.
   * AI may never silently overwrite a `protected_from_ai=true` section —
   * subsequent sync updates land as proposals instead. */
  protected_from_ai: boolean;
  current_version: number;
  has_pending_proposal: boolean;
  parent_section_key: string | null;
  ordering: number;
  /** F-04.9 — true when the user has edited the section directly. UI renders
   * a "✎ edited" badge + left-rule highlight on the body. */
  user_edited?: boolean;
  /** F-04.9 — display name of the most-recent editor. */
  last_edited_by_user_name?: string | null;
  /** F-04.9 — relative time of the most-recent edit. */
  last_edited_at?: string | null;
  /** F-04.9 — id of the `run_decisions` row that captured the edit, for
   * deep-linking to the decision-list pane. */
  last_decision_id?: string | null;
}

/** TOC envelope — sections + blueprint metadata. */
export interface BlueprintToc {
  blueprint_id: string;
  scope_kind: BlueprintScope;
  capability_id: string | null;
  repo_id: string | null;
  status: BlueprintStatus;
  last_synced_at: string | null;
  sections: BlueprintSectionSummary[];
  pending_proposals_count: number;
}

/**
 * F-04.6 — per-citation drift signal (per ADR-061). When the citation's source
 * has changed since the section was last synced, `drift === "stale"` and the
 * hash fields carry the at-sync vs. current short hashes for tooltip display.
 *
 * Drift is `null` for citations that don't have hashable source content (free
 * URLs, in-app decision refs already represented elsewhere). `fresh` means the
 * citation matches the at-sync content hash.
 */
export type BlueprintSourceRefDrift = "fresh" | "stale" | null;

export interface BlueprintSourceRef {
  kind: string;
  id: string;
  label: string;
  /** F-04.6 — drift state for this citation. Optional during rollout — older
   * backends will not return it; UI treats absence as `null`. */
  drift?: BlueprintSourceRefDrift;
  /** F-04.6 — short hash prefix at the time of the last sync. */
  content_hash_at_sync?: string | null;
  /** F-04.6 — short hash prefix of the source's current content. */
  current_content_hash?: string | null;
  /** F-04.6 — ISO timestamp of when the source last changed. */
  source_changed_at?: string | null;
}

/** Full section shape returned by `GET /v1/{scope}/{id}/blueprint/sections/{key}`. */
export interface BlueprintSection extends BlueprintSectionSummary {
  body_markdown: string | null;
  body_json: Record<string, unknown> | null;
  body_kind: BlueprintBodyKind;
  /** Provenance citations rendered next to the body. F-04.6 — each ref may
   * carry a `drift` signal so the FE can flag stale citations. */
  source_refs: BlueprintSourceRef[];
  last_edited_by_user_id: string | null;
  last_synced_at: string | null;
}

/** One row in the section's revision history (immutable; revert creates a
 * new revision with the old body). */
export interface BlueprintSectionRevision {
  id: string;
  version: number;
  body_markdown: string | null;
  body_json: Record<string, unknown> | null;
  author_kind: "agent" | "human" | "migration";
  author_id: string;
  change_note: string | null;
  created_at: string;
}

/** A pending (or decided) proposal in the approval queue (§5.4). */
export interface BlueprintSectionProposal {
  id: string;
  blueprint_section_id: string;
  section_key: string;
  proposed_body_markdown: string | null;
  proposed_body_json: Record<string, unknown> | null;
  proposed_summary: string | null;
  proposed_title: string | null;
  /** Human-readable diff hint, e.g. "Added 2 API endpoints; reworded overview". */
  diff_summary: string;
  /** Why the builder generated this proposal (e.g., "Sync detected new public function `charge_ach`"). */
  reason: string;
  status: BlueprintProposalStatus;
  proposed_at: string;
  proposed_by_run_id: string | null;
}

/** Request body for `PATCH .../sections/{key}` — user-edit revision. */
export interface BlueprintSectionEditRequest {
  body_markdown?: string | null;
  body_json?: Record<string, unknown> | null;
  /** Optional title override; usually left unchanged. */
  title?: string;
  summary?: string;
  /** Why the user is editing — surfaced in revision history. */
  change_note?: string;
}

/** Body for `POST .../proposals/{pid}/edit-and-accept`. */
export interface BlueprintProposalEditAcceptRequest {
  body_markdown?: string | null;
  body_json?: Record<string, unknown> | null;
  change_note?: string;
}

/** Body for `POST .../proposals/{pid}/reject` (reason surfaces in audit). */
export interface BlueprintProposalRejectRequest {
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/* F-04.7 — Decision list (ADR-064 + phase-03 Task 03.9)                      */
/* -------------------------------------------------------------------------- */

/** Scope of a decision — drives where it applies in the document tree. */
export type RunDecisionScopeKind = "global" | "section" | "selection";

/** Lifecycle state. Append-only — edits insert new rows that supersede. */
export type RunDecisionStatus = "active" | "superseded" | "reverted";

/** How loud the decision is in the agent's reasoning bundle. */
export type RunDecisionImpact = "high" | "medium" | "low";

/**
 * Decision kinds. Mirrors the backend CHECK constraint added in
 * migration 0011 (Task 03.9). `improve` and `manual_edit` are agent-emitted;
 * `comment`, `user_decision` are human-emitted via the comment composer / add
 * modal; `approve` / `reject` / `choice` / `note` mirror existing flows.
 */
export type RunDecisionKind =
  | "choice"
  | "regenerate"
  | "approve"
  | "reject"
  | "handoff"
  | "note"
  | "improve"
  | "manual_edit"
  | "comment"
  | "user_decision";

/**
 * Anchor for a selection-scoped decision. Mirrors the backend
 * `scope_selection jsonb` payload (Task 03.9).
 */
export interface RunDecisionSelection {
  start_anchor: string;
  end_anchor: string;
  /** Optional char offsets within the bounding anchors for fine-grain ranges. */
  char_offsets?: { start: number; end: number } | null;
}

/**
 * Full decision row returned by `GET /v1/runs/{id}/decisions`. Extends the
 * pre-existing `TaskDecision` (which the live SSE strip + decisions strip
 * already consume) with the additional scope / supersedure / impact fields.
 *
 * The pane code prefers `RunDecisionRow` over `TaskDecision` so the new
 * fields stay type-safe. Old call sites keep working via the lighter alias.
 */
export interface RunDecisionRow {
  id: string;
  /** Author display name; mirror of `who_name` on `TaskDecision`. */
  who_name: string;
  who_avatar: string;
  who_kind: "agent" | "human";
  /** Phase key this decision was emitted from (e.g. `spec`, `plan`). */
  phase: string;
  /** Decision kind — extended set per ADR-064. */
  kind: RunDecisionKind;
  /** One-line title for the row's heading. */
  title: string;
  /** Full body; rendered when the row is expanded. */
  body: string;
  /** Where this decision came from (free text — "Manual entry", "Improve prompt", etc.). */
  source: string;
  /** Human-readable relative time. */
  when: string;
  /** ISO timestamp for sorting. */
  created_at: string;
  scope_kind: RunDecisionScopeKind;
  /** When `scope_kind === "section"`, the section's anchor in the doc. */
  scope_doc_id: string | null;
  scope_section_anchor: string | null;
  /** When `scope_kind === "selection"`, the spliced selection bounds. */
  scope_selection: RunDecisionSelection | null;
  /** ID of the row this one supersedes; null for original entries. */
  supersedes_decision_id: string | null;
  status: RunDecisionStatus;
  impact: RunDecisionImpact;
  /** Whether the user can Edit / Revert this row. False for most agent rows. */
  user_editable: boolean;
}

export interface RunDecisionListFilters {
  status?: RunDecisionStatus;
  scope_kind?: RunDecisionScopeKind;
  kind?: RunDecisionKind;
  who_kind?: "agent" | "human";
}

export interface RunDecisionCreateRequest {
  title: string;
  body: string;
  scope_kind: RunDecisionScopeKind;
  scope_doc_id?: string | null;
  scope_section_anchor?: string | null;
  scope_selection?: RunDecisionSelection | null;
  impact?: RunDecisionImpact;
}

export interface RunDecisionPatchRequest {
  title?: string;
  body?: string;
  scope_kind?: RunDecisionScopeKind;
  scope_doc_id?: string | null;
  scope_section_anchor?: string | null;
  scope_selection?: RunDecisionSelection | null;
  impact?: RunDecisionImpact;
}

/* -------------------------------------------------------------------------- */
/* F-04.8 — Improve endpoint body (Task 03.11)                                */
/* -------------------------------------------------------------------------- */

export type ImproveScopeKind = RunDecisionScopeKind;
export type ImprovementKind = "refine" | "expand" | "narrow" | "redraft";

export interface ImproveDocumentRequest {
  feedback_text: string;
  scope_kind: ImproveScopeKind;
  /** Required when `scope_kind === "section"`. */
  scope_anchor?: string | null;
  /** Required when `scope_kind === "selection"`. */
  scope_selection?: RunDecisionSelection | null;
  improvement_kind: ImprovementKind;
}

export interface ImproveDocumentResponse {
  decision_id: string;
  /** ISO 8601 — UI shows this as an ETA on the "Improving…" chip. */
  estimated_completion_at: string;
}

/* -------------------------------------------------------------------------- */
/* F-04.14 — Clarification pause UI (ADR-065 + Task 03.4)                     */
/* -------------------------------------------------------------------------- */

export type ClarificationQuestionKind =
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "confirm"
  | "single_choice_with_free_text"
  | "free_text"
  | "numeric"
  | "reference_pick";

export type ClarificationPriority = "blocker" | "normal" | "optional";

export type ClarificationStatus =
  | "pending"
  | "answered"
  | "expired"
  | "skipped"
  | "deferred";

export type ClarificationOrigin =
  | "agent"
  | "system"
  | "reviewer"
  | "conli"
  | "scope_collisions"
  | "stale_knowledge"
  | "tie_breaker"
  | "no_unknown_term"
  | "no_unverified_reference"
  | "active_decision_conflict";

/** One option in a single/multi/choice-with-free-text question. */
export interface ClarificationOption {
  id: string;
  label: string;
  body?: string | null;
  is_default?: boolean;
  /** For `multi_choice` — option is optional within the min/max set. */
  is_optional?: boolean;
  /** Picking this option restarts the phase (premise changed). */
  requires_restart?: boolean;
  /** For `single_choice_with_free_text` — picking this option reveals the
   * free-text input and requires it to submit. `id === "other"` is also a
   * convention that triggers free-text reveal. */
  requires_free_text?: boolean;
}

/** Reference picker config (`question_kind === "reference_pick"`). */
export interface ClarificationReferencePicker {
  /** What kind of entity the picker resolves against. */
  entity_kind: "capability" | "repo" | "file" | "user" | "decision";
  /** Optional capability scope to narrow the search. */
  scope_capability_id?: string;
  /** Whether multiple selections are allowed. */
  multi: boolean;
  min_selected: number;
  max_selected: number;
  /** Pre-fetched candidate quick-picks rendered as chips. */
  candidates_hint?: Array<{ id: string; label: string; description?: string }>;
}

export interface ClarificationNumericConstraints {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface ClarificationFreeTextConstraints {
  min_length?: number;
  max_length?: number;
  /** Optional regex pattern (uncompiled — FE uses for client-side preview). */
  regex?: string;
}

/**
 * Scope collisions payload — when `origin === "scope_collisions"`, the
 * `metadata` field carries this snapshot of conflicting work so F-04.10's
 * modal can render PRs / branches / commits without an extra round-trip.
 */
export interface ScopeCollisionsPayload {
  open_prs: Array<{
    integration: string;
    number: number;
    title: string;
    author: string;
    url: string;
    touches: string[];
    state: "open" | "draft";
  }>;
  active_branches: Array<{
    name: string;
    author: string;
    ahead_of_main: number;
    touches: string[];
    url?: string;
  }>;
  recent_main_commits: Array<{
    sha: string;
    author: string;
    when: string;
    summary: string;
    touches: string[];
  }>;
}

export interface ClarificationExpiryConfig {
  action: "fail_phase" | "choose_default" | "continue_with_warning";
  default_choice_id?: string;
}

/**
 * Full clarification row — drives every input variant via discriminated
 * narrowing on `question_kind`.
 */
export interface RunClarification {
  id: string;
  /** Stable question id (e.g. `q_blast`). Used in URLs. */
  qid: string;
  run_id: string;
  phase_key: string;
  question: string;
  rationale: string | null;
  question_kind: ClarificationQuestionKind;
  priority: ClarificationPriority;
  origin: ClarificationOrigin;
  status: ClarificationStatus;
  /** ISO; null until answered/expired. */
  created_at: string;
  expires_at: string | null;
  resolved_at: string | null;
  /** Grouping id — UI stacks all members of one batch into a single card. */
  batch_id: string | null;
  /** Number of times the user has deferred this question (max 3). */
  defer_count: number;
  /** Optional doc + anchor pin for inline pause cards. */
  scope_doc_id: string | null;
  scope_section_anchor: string | null;
  /** Polymorphic config, populated per `question_kind`. */
  options: ClarificationOption[];
  reference_picker: ClarificationReferencePicker | null;
  numeric_constraints: ClarificationNumericConstraints | null;
  free_text_constraints: ClarificationFreeTextConstraints | null;
  /** Allow an "Other (specify)" escape hatch on choice kinds. */
  free_text_allowed: boolean;
  on_expire: ClarificationExpiryConfig | null;
  /** Origin-specific extra payload — `scope_collisions` carries a
   * `ScopeCollisionsPayload`; other origins may carry their own slicer
   * outputs. Loosely typed to avoid bloating the discriminator. */
  metadata: Record<string, unknown> | null;
  /** Answer once resolved. Polymorphic per `question_kind`. */
  answer: ClarificationAnswer | null;
  answered_by_user_id: string | null;
  answered_at: string | null;
}

/**
 * Polymorphic answer — exactly one of the fields is populated, matching the
 * question's `question_kind`. Mirrors backend `ClarificationAnswerInput`.
 */
export interface ClarificationAnswer {
  choice_id?: string;
  choice_ids?: string[];
  boolean?: boolean;
  free_text?: string;
  numeric?: number;
  references?: string[];
  confirmed?: boolean;
  /** Optional user explanation, audited. */
  rationale?: string;
}

/** Filters for `GET /v1/runs/{id}/clarifications`. */
export interface ClarificationListFilters {
  status?: ClarificationStatus;
  priority?: ClarificationPriority;
  phase_key?: string;
  origin?: ClarificationOrigin;
  question_kind?: ClarificationQuestionKind;
}

/** Aggregated pending-batch view; drives card / modal stacking on phase open. */
export interface ClarificationPendingBatch {
  batch_id: string | null;
  qids: string[];
  priority: ClarificationPriority;
  origin: ClarificationOrigin;
  phase_key: string;
  /** Count of `priority === "blocker"` items in this batch — Submit is
   * disabled until all are answered. */
  blocker_count: number;
}

export interface ClarificationBatchSubmitRequest {
  answers: Array<{ qid: string } & ClarificationAnswer>;
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
    /** Org-level knowledge — registry + cross-cap dependency model + Blueprint excerpts. */
    knowledge: (orgId: string) =>
      apiFetch<OrgKnowledge>(`/v1/orgs/${encodeURIComponent(orgId)}/knowledge`),
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
    create: (goal: string, capabilityId?: string, intent?: "chat" | "generate_prd") =>
      apiFetch<Run>("/v1/runs", { method: "POST", body: JSON.stringify({ goal, capability_id: capabilityId ?? null, intent: intent ?? null }) }),
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
    /**
     * F-03.1 — per-phase payload is now narrowly typed. Pass a known
     * `RunPhaseKey` and the response is `RunPhaseDataFor<K>`; pass a generic
     * string and the response falls back to the discriminated union.
     */
    phaseData: (<K extends RunPhaseKey>(id: string, phaseKey: K) =>
      apiFetch<RunPhaseDataFor<K>>(
        `/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}`,
      )) as {
      <K extends RunPhaseKey>(id: string, phaseKey: K): Promise<RunPhaseDataFor<K>>;
      (id: string, phaseKey: string): Promise<RunPhaseData>;
    },
    prFeedback: (id: string) =>
      apiFetch<PrFeedbackItem[]>(`/v1/runs/${encodeURIComponent(id)}/pr-feedback`),
    /** Pre-existing lightweight list (TaskDecision shape) — kept as-is for the
     * decisions strip + SSE rail. F-04.7's pane uses `decisionsApi.list()`
     * below which returns the richer `RunDecisionRow[]`. */
    decisions: (id: string) =>
      apiFetch<TaskDecision[]>(`/v1/runs/${encodeURIComponent(id)}/decisions`),
    regenerate: (id: string, phaseKey: string, optionId: string) =>
      apiFetch<{ accepted: boolean; new_version: string }>(`/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ option_id: optionId }),
      }),
    /**
     * F-04.7 — full decision-list CRUD per ADR-064 + phase-03 Task 03.9.
     * Returns the extended `RunDecisionRow` (with scope, supersedes, status,
     * impact, user_editable) on `list`. The lightweight `runs.decisions(id)`
     * above stays for the existing strip; new code goes through this surface.
     */
    decisionList: {
      list: (id: string, filters: RunDecisionListFilters = {}) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(filters)) {
          if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
        }
        const qs = sp.toString();
        return apiFetch<RunDecisionRow[]>(
          `/v1/runs/${encodeURIComponent(id)}/decisions${qs ? `?${qs}` : ""}`,
        );
      },
      create: (id: string, body: RunDecisionCreateRequest) =>
        apiFetch<RunDecisionRow>(
          `/v1/runs/${encodeURIComponent(id)}/decisions`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      patch: (id: string, decisionId: string, body: RunDecisionPatchRequest) =>
        apiFetch<RunDecisionRow>(
          `/v1/runs/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      revert: (id: string, decisionId: string) =>
        apiFetch<RunDecisionRow>(
          `/v1/runs/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}/revert`,
          { method: "POST" },
        ),
      escalate: (id: string, decisionId: string) =>
        apiFetch<RunDecisionRow>(
          `/v1/runs/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}/escalate`,
          { method: "POST" },
        ),
    },
    /**
     * F-04.14 — clarification list / batch / answer / skip / defer endpoints
     * (Task 03.4). Answer payload is polymorphic per `question_kind`; FE
     * sends the typed `ClarificationAnswer` shape and the backend validates.
     */
    clarifications: {
      list: (id: string, filters: ClarificationListFilters = {}) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(filters)) {
          if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
        }
        const qs = sp.toString();
        return apiFetch<RunClarification[]>(
          `/v1/runs/${encodeURIComponent(id)}/clarifications${qs ? `?${qs}` : ""}`,
        );
      },
      get: (id: string, qid: string) =>
        apiFetch<RunClarification>(
          `/v1/runs/${encodeURIComponent(id)}/clarifications/${encodeURIComponent(qid)}`,
        ),
      pendingBatches: (id: string) =>
        apiFetch<ClarificationPendingBatch[]>(
          `/v1/runs/${encodeURIComponent(id)}/clarifications/pending-batches`,
        ),
      submit: (id: string, phaseKey: string, qid: string, answer: ClarificationAnswer) =>
        apiFetch<RunClarification>(
          `/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}/clarify/${encodeURIComponent(qid)}`,
          { method: "POST", body: JSON.stringify(answer) },
        ),
      submitBatch: (id: string, body: ClarificationBatchSubmitRequest) =>
        apiFetch<RunClarification[]>(
          `/v1/runs/${encodeURIComponent(id)}/clarifications/batch`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      skip: (id: string, phaseKey: string, qid: string) =>
        apiFetch<RunClarification>(
          `/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}/clarify/${encodeURIComponent(qid)}/skip`,
          { method: "POST" },
        ),
      defer: (id: string, phaseKey: string, qid: string) =>
        apiFetch<RunClarification>(
          `/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}/clarify/${encodeURIComponent(qid)}/defer`,
          { method: "POST" },
        ),
    },
    /**
     * F-04.8 — Improve endpoint (Task 03.11). Scope picker comes from the FE;
     * worker is async — response is 202 with a `decision_id` for polling.
     */
    documents: {
      improve: (id: string, docId: string, body: ImproveDocumentRequest) =>
        apiFetch<ImproveDocumentResponse>(
          `/v1/runs/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}:improve`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      /**
       * F-04.12 — comment composer adds optional `as_decision: true`. When set,
       * backend additionally creates a `run_decisions` row with `kind='comment'`.
       */
      addComment: (
        id: string,
        docId: string,
        body: {
          text: string;
          scope_section_anchor?: string | null;
          scope_selection?: RunDecisionSelection | null;
          as_decision?: boolean;
        },
      ) =>
        apiFetch<{ id: string; created_at: string; as_decision: boolean; decision_id: string | null }>(
          `/v1/runs/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/comments`,
          { method: "POST", body: JSON.stringify(body) },
        ),
    },
    /**
     * F-04.13 — Re-run a downstream phase whose output went stale because the
     * upstream doc was Improved. Idempotent via the standard `Idempotency-Key`
     * header so duplicate clicks don't double-trigger.
     */
    phases: {
      rerun: (id: string, phaseKey: string, idempotencyKey?: string) => {
        const init: RequestInit = { method: "POST" };
        if (idempotencyKey) init.headers = { "Idempotency-Key": idempotencyKey };
        return apiFetch<{ accepted: boolean; phase_key: string; status: string }>(
          `/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}:rerun`,
          init,
        );
      },
    },
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
  /**
   * Blueprint endpoints per knowledge-model.md §5.6. Three parallel namespaces —
   * one per scope — that share the same endpoint shape. The split keeps the
   * scope-id encoding explicit at the call site (capabilityId vs repoId vs
   * orgId) rather than smuggling it through a generic argument.
   */
  blueprint: {
    capability: {
      /** TOC — section list with metadata, no bodies. */
      getToc: (capabilityId: string) =>
        apiFetch<BlueprintToc>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint`,
        ),
      /** One section, full body + metadata. */
      getSection: (capabilityId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
        ),
      /** Revision history for a single section. */
      getRevisions: (capabilityId: string, sectionKey: string) =>
        apiFetch<BlueprintSectionRevision[]>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/revisions`,
        ),
      /** User-edit a section. Creates a new revision and sets
       * `protected_from_ai=true` server-side. */
      editSection: (capabilityId: string, sectionKey: string, body: BlueprintSectionEditRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      lockSection: (capabilityId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/lock`,
          { method: "POST" },
        ),
      unlockSection: (capabilityId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/unlock`,
          { method: "POST" },
        ),
      regenerateSection: (capabilityId: string, sectionKey: string) =>
        apiFetch<BlueprintSection | BlueprintSectionProposal>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/regenerate`,
          { method: "POST" },
        ),
      /** List all pending proposals on this Blueprint. */
      listProposals: (capabilityId: string) =>
        apiFetch<BlueprintSectionProposal[]>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/proposals`,
        ),
      acceptProposal: (capabilityId: string, proposalId: string) =>
        apiFetch<BlueprintSection>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/accept`,
          { method: "POST" },
        ),
      editAndAcceptProposal: (capabilityId: string, proposalId: string, body: BlueprintProposalEditAcceptRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/edit-and-accept`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      rejectProposal: (capabilityId: string, proposalId: string, body: BlueprintProposalRejectRequest = {}) =>
        apiFetch<BlueprintSectionProposal>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/reject`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      /** Force full rebuild. Body must include `confirm_slug` matching the
       * capability's slug — server returns 422 otherwise. */
      rebuild: (capabilityId: string, confirmSlug: string) =>
        apiFetch<BlueprintToc>(
          `/v1/capabilities/${encodeURIComponent(capabilityId)}/blueprint:rebuild`,
          { method: "POST", body: JSON.stringify({ confirm_slug: confirmSlug }) },
        ),
    },
    repo: {
      getToc: (repoId: string) =>
        apiFetch<BlueprintToc>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint`,
        ),
      getSection: (repoId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
        ),
      getRevisions: (repoId: string, sectionKey: string) =>
        apiFetch<BlueprintSectionRevision[]>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/revisions`,
        ),
      editSection: (repoId: string, sectionKey: string, body: BlueprintSectionEditRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      lockSection: (repoId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/lock`,
          { method: "POST" },
        ),
      unlockSection: (repoId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/unlock`,
          { method: "POST" },
        ),
      regenerateSection: (repoId: string, sectionKey: string) =>
        apiFetch<BlueprintSection | BlueprintSectionProposal>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/regenerate`,
          { method: "POST" },
        ),
      listProposals: (repoId: string) =>
        apiFetch<BlueprintSectionProposal[]>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/proposals`,
        ),
      acceptProposal: (repoId: string, proposalId: string) =>
        apiFetch<BlueprintSection>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/accept`,
          { method: "POST" },
        ),
      editAndAcceptProposal: (repoId: string, proposalId: string, body: BlueprintProposalEditAcceptRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/edit-and-accept`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      rejectProposal: (repoId: string, proposalId: string, body: BlueprintProposalRejectRequest = {}) =>
        apiFetch<BlueprintSectionProposal>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/reject`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      rebuild: (repoId: string, confirmSlug: string) =>
        apiFetch<BlueprintToc>(
          `/v1/repos/${encodeURIComponent(repoId)}/blueprint:rebuild`,
          { method: "POST", body: JSON.stringify({ confirm_slug: confirmSlug }) },
        ),
    },
    org: {
      getToc: (orgId: string) =>
        apiFetch<BlueprintToc>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint`,
        ),
      getSection: (orgId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
        ),
      getRevisions: (orgId: string, sectionKey: string) =>
        apiFetch<BlueprintSectionRevision[]>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/revisions`,
        ),
      editSection: (orgId: string, sectionKey: string, body: BlueprintSectionEditRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      lockSection: (orgId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/lock`,
          { method: "POST" },
        ),
      unlockSection: (orgId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/unlock`,
          { method: "POST" },
        ),
      regenerateSection: (orgId: string, sectionKey: string) =>
        apiFetch<BlueprintSection | BlueprintSectionProposal>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/regenerate`,
          { method: "POST" },
        ),
      listProposals: (orgId: string) =>
        apiFetch<BlueprintSectionProposal[]>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/proposals`,
        ),
      acceptProposal: (orgId: string, proposalId: string) =>
        apiFetch<BlueprintSection>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/accept`,
          { method: "POST" },
        ),
      editAndAcceptProposal: (orgId: string, proposalId: string, body: BlueprintProposalEditAcceptRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/edit-and-accept`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      rejectProposal: (orgId: string, proposalId: string, body: BlueprintProposalRejectRequest = {}) =>
        apiFetch<BlueprintSectionProposal>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/reject`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      rebuild: (orgId: string, confirmSlug: string) =>
        apiFetch<BlueprintToc>(
          `/v1/orgs/${encodeURIComponent(orgId)}/blueprint:rebuild`,
          { method: "POST", body: JSON.stringify({ confirm_slug: confirmSlug }) },
        ),
    },
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
