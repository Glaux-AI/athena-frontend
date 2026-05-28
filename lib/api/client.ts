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
    /** §7.9 — structured error metadata. Some BE error envelopes (e.g.
     *  `seats_full`, `downgrade_blocked_active_members`,
     *  `seats_release_would_displace`) attach a per-code metadata object
     *  the FE renders into the user-facing message. Optional — most
     *  errors carry nothing here. */
    public metadata?: Record<string, unknown> | null,
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
      const errBody = r.body as {
        error?: {
          code?: string;
          message?: string;
          field?: string;
          metadata?: Record<string, unknown> | null;
        };
      } | undefined;
      throw new ApiError(
        r.status,
        errBody?.error?.code ?? "internal",
        errBody?.error?.message ?? `Mock request failed (${r.status})`,
        errBody?.error?.field,
        errBody?.error?.metadata ?? null,
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
    let metadata: Record<string, unknown> | null = null;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
      field = body?.error?.field;
      metadata = body?.error?.metadata ?? null;
    } catch {
      // Non-JSON body
    }
    throw new ApiError(res.status, code, message, field, metadata);
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
  /** §5.31 — set when the org is soft-deleted. Optional so older BE
   *  builds + mock are still type-safe. The OrgSwitcher renders a
   *  "Deleted" pill on these chips. */
  deleted_at?: string | null;
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
  /** §6.1 — when `true`, this Athena instance is running in dev mode:
   * cost is tracked but budget enforcement is bypassed, Stripe billing
   * returns a synthetic subscription, and new orgs default to the
   * enterprise edition. The TopBar renders a "Free dev access" chip
   * whenever this is true so the operator never wonders whether they're
   * being billed. Optional so older BE builds (and mock) that didn't
   * yet plumb the flag are still type-safe — undefined is treated as
   * production (no badge). */
  dev_unrestricted_access?: boolean;
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
  /** §5.31 — soft-delete metadata. Both NULL when live. The owner sees
   *  Restore / Delete-forever CTAs when both are set; every non-owner
   *  member gets bounced by the BE auth middleware on their next
   *  request. */
  deleted_at?: string | null;
  deleted_by_user_id?: string | null;
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

/**
 * §5.4 row-3 — invitation mode. `'email'` is the legacy flow (mint + send
 * an addressee-bound JWT). `'link'` is the share-out-of-band flow (no
 * email; the admin copies the URL). Existing rows migrate to `'email'`
 * via BE migration 0050.
 */
export type InvitationKind = "email" | "link";

export interface Invitation {
  id: string;
  org_id: string;
  /** `null` for `kind === "link"` invitations (no addressee at mint time). */
  email: string | null;
  kind: InvitationKind;
  role: string;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  /** Present only on the CREATE response for `kind === "link"`. The raw
   * token is never re-emitted on list/get; admins who lose the URL
   * regenerate a fresh invitation. */
  invitation_url?: string | null;
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
  /** §5.31 soft-delete state. Both NULL when live; both set when in trash.
   *  The detail view renders a banner from these. */
  deleted_at?: string | null;
  deleted_by_user_id?: string | null;
}

/** §5.31 — full org-scoped repo view returned by the new `/v1/repos` endpoints. */
export interface RepoFull {
  id: string;
  org_id: string;
  integration_id: string;
  full_name: string;
  default_branch: string;
  last_indexed_sha: string | null;
  branch_head_sha: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
  current_sync_stage: SyncStage | "cancelled" | null;
  created_at: string;
  /** Capability ids currently joining this repo. Used to render
   *  the blast-radius hint on the soft-delete dialog + the trash row's
   *  child summary. */
  attached_capability_ids: string[];
}

/** §5.31 list filter — `false` (default live), `true` (live + deleted),
 *  `only` (just deleted). */
export type IncludeDeletedFilter = "false" | "true" | "only";

export type SyncStage =
  | "queued"
  | "cloning"
  | "parsing"
  | "embedding"
  | "indexing"
  | "completed"
  | "failed";

/** §3.13 row 1 — one snapshot of an ingest attempt for the FE timeline.
 *  ``duration_ms`` is null only while the attempt is still in flight AND
 *  ``completed_at`` is null — the BE projects (now - started_at) for
 *  in-flight rows so the chip can render "running for Xs". */
export interface IngestStageTransition {
  stage:
    | "queued"
    | "cloning"
    | "parsing"
    | "embedding"
    | "indexing"
    | "completed"
    | "failed"
    | "cancelled";
  entered_at: string;
  duration_ms: number | null;
  files_total: number | null;
  files_processed: number | null;
  last_processed_path: string | null;
  error: string | null;
}

/** §3.13 row 1 — ``GET /v1/repos/{repo_id}/ingest-progress`` envelope.
 *  ``current`` is the latest attempt; ``history`` carries the most-recent
 *  5 attempts newest-first. The flat ``stage`` / ``files_*`` /
 *  ``branch_sha`` / ``job_id`` / ``last_processed_path`` /
 *  ``last_heartbeat_at`` fields mirror ``current`` for at-a-glance
 *  consumers. */
export interface RepoIngestProgress {
  repo_id: string;
  current: IngestStageTransition;
  history: IngestStageTransition[];
  job_id: string | null;
  branch_sha: string;
  last_heartbeat_at: string | null;
  files_total: number | null;
  files_processed: number | null;
  last_processed_path: string | null;
}

export interface CapabilityRepo {
  id: string;
  capability_id: string;
  integration_id: string;
  repo_full_name: string;
  default_branch: string;
  attached_by_user_id: string | null;
  created_at: string;
  /** Branch SHA of the last successful KG build. NULL = never synced. */
  last_indexed_sha?: string | null;
  /** Current default-branch HEAD per most-recent webhook or sync. */
  branch_head_sha?: string | null;
  /** §5.29.11 / B7.2 — timestamp of the most recent sync enqueue. */
  last_sync_attempt_at?: string | null;
  /** One of the 4 in-flight stages, `completed`, `failed`, or null when idle. */
  current_sync_stage?: SyncStage | null;
  /** Computed on-demand at sync time; not pre-computed on list. */
  commits_behind?: number | null;
  /** §5.31 — underlying `repos.id` (one row per `(org, integration, full_name)`)
   *  so the per-row "Delete repo" CTA can hit `api.repos.softDelete(repo_id)`.
   *  NULL during expand-migrate transition. */
  repo_id?: string | null;
  /** §5.31 — `repos.deleted_at` joined in. Drives the Deleted chip on the
   *  per-cap Repos tab. */
  repo_deleted_at?: string | null;
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
 * §5.29.3 — Stripe billing types. Mirror the BE shapes in
 * `athena/api/routers/billing.py:{SubscriptionOut,InvoiceOut,…}`.
 * Decimal fields arrive as strings on the wire (Pydantic v2 serializes
 * `Decimal` as `str` by default) so we keep that type — the FE renders
 * them via `Number(str)` only at the leaf.
 */
export type BillingTier = "solo" | "pro" | "enterprise";
/** Canonical sentinel value the BE returns when ATHENA_DEV_UNRESTRICTED_ACCESS
 * is on; the FE detects this and renders the dev-mode empty state. */
export const DEV_UNRESTRICTED_TIER = "dev_unrestricted" as const;

export interface Subscription {
  id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  /** One of BillingTier or DEV_UNRESTRICTED_TIER. */
  tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface Invoice {
  id: string;
  stripe_invoice_id: string;
  amount_due_usd: string;
  amount_paid_usd: string;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
  pdf_url: string | null;
  period_start: string | null;
  period_end: string | null;
  issued_at: string | null;
  paid_at: string | null;
}

export interface PaymentMethod {
  id: string;
  stripe_payment_method_id: string;
  kind: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

export interface UsageRecord {
  kind: string;
  quantity: number;
  occurred_at: string;
  reported_to_stripe_at: string | null;
}

/**
 * §7.9 — Seat-billing surface. Mirrors the BE shape from
 * `athena/api/routers/billing.py:SeatsOut` (IIII landing).
 *
 * `pro_upgrade_quote` is non-null only on solo orgs — it carries the
 * price comparison FE needs to render the "Upgrade to Pro" tab in the
 * (deferred) BuySeatsModal + the "ask owner to upgrade to Pro" copy on
 * the accept-invite seat-full card.
 */
export interface ProUpgradeQuote {
  pro_included_seats: number;
  pro_extra_seat_price_per_month_usd: number;
  /** Seat count above which Pro is cheaper than Solo + extras. */
  breakeven_seats: number;
}

export interface SeatsOut {
  /** Mirrors `Subscription.tier` — solo/pro/enterprise/dev_unrestricted. */
  tier: string;
  /** Seats included with the base subscription (1 for solo, 5 for pro). */
  included_seats: number;
  /** Paid extras stacked on top of `included_seats`. */
  additional_seats: number;
  /** `included_seats + additional_seats`. */
  total_seats: number;
  /** Active members (excluding deactivated). */
  active_seats: number;
  /** Outstanding invitations (not yet accepted / revoked / expired). */
  pending_invitations: number;
  /** `total_seats - active_seats` (BE truth; do not recompute FE-side). */
  available_seats: number;
  extra_seat_price_per_month_usd: number;
  /** Only set on solo orgs. */
  pro_upgrade_quote: ProUpgradeQuote | null;
}

export interface BuySeatsRequest {
  /** 1..50 — BE enforces. */
  count: number;
}

export interface BuySeatsResponse {
  additional_seats: number;
  total_seats: number;
  stripe_invoice_url: string;
  tier: string;
}

export interface ReleaseSeatsResponse {
  additional_seats: number;
  total_seats: number;
  tier: string;
}

export interface UpgradeToProRequest {
  /** Optional 0..50 — paid extras to bake into the upgrade checkout. */
  additional_seats?: number;
}

export interface UpgradeToProResponse {
  checkout_url: string;
}

export interface DowngradeToSoloResponse {
  checkout_url: string;
}

/**
 * §7.9.5 row 2464 — price catalog endpoint. IIII may not have landed
 * this yet; FE call-site falls back to a constants file when the live
 * endpoint 404s. Shape is the FE truth either way.
 */
export interface PriceCatalog {
  solo_base_usd: number;
  solo_extra_seat_usd: number;
  pro_base_usd: number;
  pro_extra_seat_usd: number;
}

/**
 * §7.10 — Credit-based billing balance shape returned by
 * `GET /v1/orgs/{id}/credits`. Decimal money fields arrive as strings
 * (Pydantic v2 default for `Decimal`); the leaf renderer coerces via
 * `Number(...)`. Mirrors PPPP's `CreditBalanceOut` per ADR-032
 * FE-truth shape (snake_case wire).
 *
 * `tier` is `'free' | 'solo' | 'pro' | 'enterprise'` plus the
 * `'dev_unrestricted'` synthetic sentinel; widened to `string` to keep
 * the FE non-fragile when the BE adds a new tier label.
 */
export interface CreditBalance {
  /** Remaining credit for the current period. Negative when in overage. */
  credits_remaining_usd: string;
  /** Tier-default monthly credit allocation (TIER_LIMITS[tier]). */
  monthly_credit_usd: number;
  period_start: string;
  period_end: string;
  overage_enabled: boolean;
  /** Cap for overage charges (null = uncapped). Only relevant when
   *  `overage_enabled === true`. */
  overage_cap_usd: number | null;
  /** Owner-set hard spend cap; null when no cap is configured. */
  hard_cap_usd: number | null;
  /** Month-to-date spend across all sources (Decimal-as-string). */
  mtd_spend_usd: string;
  /** Convenience flag — true when remaining credit dipped below the
   *  80% warning threshold. BE-computed so the FE doesn't recompute the
   *  arithmetic on every render. */
  over_80_pct_threshold: boolean;
  tier: string;
}

/**
 * §7.9.7 — preview shape returned by `GET /v1/invitations/{token}/preview`.
 * HHHH already landed this on the BE side. The accept-invite page reads
 * this first so the seat-full path renders BEFORE the user clicks Accept.
 */
export interface InvitationPreview {
  org_slug: string;
  org_name: string;
  role: string;
  inviter_email: string;
  seats_available: boolean;
  owner_email: string;
  /** One of BillingTier; drives the tier-specific copy on the seat-full card. */
  tier: string;
}

/**
 * §7.9.6 row 2471 — soft-cap warning the BE attaches to an invite-mint
 * response when `active + pending + 1 > total_seats`. Older BE builds
 * (and the no-op mock path) simply omit the field.
 */
export interface InvitationWithWarning extends Invitation {
  warning?: {
    code: "over_seat_cap";
    message: string;
    metadata?: {
      active_seats?: number;
      total_seats?: number;
      pending_invitations?: number;
    } | null;
  } | null;
}

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
  /** Real-BE fields surfaced by `GET /v1/orgs/{id}/integrations`
   * (`IntegrationOut` shape). Optional so the mock-mode marketplace
   * payload — which carries `name`/`category`/`blurb` for tile chrome
   * instead of `provider`/`config` — still satisfies the type. Filters
   * that need to distinguish a server-side-OAuth GitHub integration
   * from a marketplace github_app tile should key off
   * `provider === "github" && config.connect_kind === "oauth"`. */
  provider?: string;
  config?: Record<string, unknown>;
}

/** §5.29.11 / B7.4 — one row in the `AttachRepoDialog`'s candidate list.
 * Returned by `GET /v1/orgs/{org_id}/integrations/{integration_id}/available-repos`. */
export interface AvailableRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
  description: string | null;
  pushed_at: string | null;
  archived: boolean;
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
  /** Readiness §5.28 row 1783 — for `kind === "approval_needed"` items
   * raised by a paused run that hit the large-change classifier, the BE
   * surfaces the gate id + projected cost + scope here so the FE renders
   * the dedicated Approve / Skip card instead of the generic kind row.
   * Older BE builds omit the payload — the card falls back to the generic
   * approval_needed row. Snake_case stays FE-truth per ADR-032. */
  payload?: {
    gate_kind?: "large_change_admin_approval" | string | null;
    gate_id?: string | null;
    cost_estimate_usd?: number | null;
    scope?: {
      files_touched?: number | null;
      lines_added?: number | null;
      lines_removed?: number | null;
    } | null;
  } | null;
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

/** §5.29.12 r1 — per-day spend split by model. The FE renders one line
 *  per model so a regression in any one model surfaces immediately.
 *  ``spent_usd`` is Decimal-as-string on the wire (Pydantic v2 default);
 *  consumers must ``Number(...)`` it before arithmetic. */
export interface PerModelBurndown {
  range_start: string;
  range_end: string;
  models: { model: string; daily: { day: string; spent_usd: string }[] }[];
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
  /** True when the org has saved a BYO API key for this provider.
   * The plaintext is NEVER returned by the API — only this flag +
   * the last4 sentinel below. */
  has_api_key?: boolean;
  /** Last 4 chars of the stored plaintext API key, for "•••• ABCD"
   * rendering. Null when no key is stored. */
  api_key_last4?: string | null;
}

/** §7.8.1 — one model row from `GET /v1/llm/providers/catalog`. */
export interface CatalogModel {
  id: string;
  display_name: string;
  context_window: number;
  supports_tools: boolean;
  supports_embeddings: boolean;
}

/** §7.8.1 — one provider entry in the catalog. */
export interface CatalogProvider {
  id: string;
  display_name: string;
  tier_hint: "free" | "paid" | "mixed";
  requires_openai_compat: boolean;
  models: CatalogModel[];
}

/** §7.8.1 — per-model usage row inside ProviderUsage. */
export interface ProviderUsageModel {
  model: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  /** Display-only — BYO calls never debit the credit ledger. Many
   *  free-tier upstreams return $0 for the `usage.total_cost`
   *  field, which is what we surface here. */
  cost_usd: number;
  last_used_at: string | null;
}

/** §7.8.1 — `GET /v1/orgs/{id}/model-providers/{id}/usage` body. */
export interface ProviderUsage {
  provider: string;
  range: "mtd";
  models: ProviderUsageModel[];
}

/** §7.8.1 — one entry in a role-binding fallback chain. */
export interface RoleChainEntry {
  provider: string;
  model: string;
}

/** §7.8.1 — one row of `GET /v1/orgs/{id}/model-role-bindings`. */
export interface RoleBinding {
  role: ModelRoleAlias;
  primary_provider: string;
  primary_model: string;
  fallback_chain: RoleChainEntry[];
}

/** §7.8.1 — the closed-set of LLM role aliases the agent uses; matches
 *  the canonical 8 enforced both by the BE CHECK constraint
 *  (`ck_model_role_bindings_role_canonical`) and the router's
 *  `_CANONICAL_ROLES` set. */
export type ModelRoleAlias =
  | "planner"
  | "heavy-reasoner"
  | "chat-fast"
  | "long-context"
  | "workhorse-cheap"
  | "code-editor"
  | "code-editor-cheap"
  | "embeddings";

export const MODEL_ROLE_ALIASES: ModelRoleAlias[] = [
  "planner",
  "heavy-reasoner",
  "chat-fast",
  "long-context",
  "workhorse-cheap",
  "code-editor",
  "code-editor-cheap",
  "embeddings",
];

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
  /** Readiness §5.28 row 1782 — when `status === "queued"` and the run was
   * held back by the per-org concurrent-run cap (rather than just being
   * freshly enqueued), the BE surfaces `"org_cap_reached"` here so the FE
   * renders the "will start when a slot frees" badge on `/runs/{id}`. The
   * field is reserved (FE-truth per ADR-032) until the BE wires the
   * `tools/runs.py` capacity gate to surface a reason — older BE builds
   * simply omit the field and the badge stays hidden. */
  queueing_reason?: "org_cap_reached" | null;
}

/* -------------------------------------------------------------------------- */
/* §7 Replay UI GA — paginated event history                                  */
/* -------------------------------------------------------------------------- */

/** One persisted ``run_events`` row. The Replay UI scrubs through these
 * to drive the same `<LiveActivityStrip>` rendering used for live SSE.
 * snake_case keys per ADR-032 — wire shape is consumed directly without
 * a client-side rename layer. */
export interface ReplayEvent {
  seq: number;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Paginated event-history page returned by ``GET /v1/runs/{id}/events/replay``.
 * Keyset paginated on `seq` ascending; pass `next_cursor` back as
 * `cursor` to fetch the next page. `has_more` is the loop predicate. */
export interface ReplayEventPage {
  events: ReplayEvent[];
  next_cursor: number | null;
  has_more: boolean;
}

/**
 * §7 — Standalone Document shape returned by the run-document read endpoint.
 *
 * `RunDocument` is the union of fields the per-phase doc payloads (Spec /
 * Plan / Draft PRD / Review / PR description) project up to the same
 * read surface. It carries just what an embed (or any read-only consumer)
 * needs to render — title, kind chip, markdown body, citations, org
 * label + last-edited timestamp — without dragging the per-phase
 * structural sidecars.
 *
 * Citations carry an optional `embed_url`; when present the read-only
 * viewer renders the citation as a link to the embed URL of the source
 * (e.g. another artifact / run). When absent the citation chip is inert.
 */
export interface RunDocumentCitation {
  label: string;
  /** Citation kind — drives the icon. Mirrors `ChatCitation.kind`
   *  intentionally so chip rendering can be shared. */
  kind: "file" | "adr" | "doc" | "ticket" | "pr" | "skill" | "url" | "run" | "artifact";
  /** Optional path/identifier; not auto-rendered as a link unless
   *  `embed_url` is also set. */
  ref?: string;
  /** §7 — populated when the citation points at something that has its
   *  own embed view. Read-only consumers turn the chip into a link
   *  pointing here. */
  embed_url?: string | null;
  /** Optional tooltip text. */
  title?: string;
}

export interface RunDocument {
  id: string;
  /** Which run produced this document. Used for the "Open in Athena" CTA. */
  run_id: string;
  /** Document kind — drives the chip + the renderer's defaults.
   *  Mirrors the doc types the per-phase Doc surfaces emit. */
  kind: "prd" | "spec" | "plan" | "review" | "pr_description";
  /** Display title (e.g. "spec.md", "Billing retry PRD"). */
  title: string;
  /** Current version label (e.g. "v3"). */
  version: string;
  /** Approval / draft state. */
  status: "draft" | "needs-review" | "approved";
  /** Markdown source. The embed renderer drives off this. */
  markdown: string;
  /** Pre-rendered HTML fallback when the source isn't markdown. */
  body?: string | null;
  /** Cited sources — read-only consumers may turn these into links. */
  citations: RunDocumentCitation[];
  /** Org metadata pill — the org name as displayed to the viewer. */
  org_name: string;
  /** Last edit time (ISO-8601). */
  last_edited_at: string;
  /** Optional editor name surfaced on hover. */
  last_edited_by?: string | null;
}

/* -------------------------------------------------------------------------- */
/* §3.6 r5 + §4.x r2 — Implement-track phase document + gate state            */
/* -------------------------------------------------------------------------- */

/** Single document row keyed by run + phase. Used by the per-phase tabs
 * (Spec / Plan / Implement / Review / CI / PR) on `/runs/[id]`. The
 * `body_markdown` field carries the canonical artifact body; `gate_state`
 * is the latest review gate verdict for the phase. */
export interface RunPhaseDocument {
  id: string;
  run_id: string;
  /** The phase key the artifact belongs to — `spec`, `plan`, `implement.*`,
   *  `implement.review`, `ci.state`, `pr.authored`. */
  phase: string;
  /** Display title (e.g. `spec.md`, `Plan stages`). */
  title: string;
  /** Markdown source — passed to `<CitationRenderer>` for chip injection. */
  body_markdown: string;
  /** Pre-rendered HTML fallback when the source isn't markdown. */
  body_html?: string | null;
  /** Latest gate verdict for the phase. */
  gate_state: "pending" | "approved" | "rejected" | "idle";
  /** Section ids the FE may target with per-section feedback. */
  sections: { id: string; label: string }[];
  /** ISO-8601. */
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* §9.6 — Per-section 👍/👎 feedback                                          */
/* -------------------------------------------------------------------------- */

/** Mirror of the BE `FeedbackArtifactKind` Literal in
 *  `athena/db/models/feedback.py`. Closed set; widening requires a BE
 *  migration + Literal update. */
export type FeedbackArtifactKind =
  | "blueprint_section"
  | "document"
  | "document_section"
  | "run_decision"
  | "inbox_item"
  | "chat_message";

/** Mirror of the BE `FeedbackSentiment` Literal. Today's FE surfaces both. */
export type FeedbackSentiment = "positive" | "negative";

/** Wire shape for POST /v1/feedback. */
export interface FeedbackCreateRequest {
  artifact_kind: FeedbackArtifactKind;
  artifact_id: string;
  section_key?: string | null;
  sentiment: FeedbackSentiment;
  note?: string | null;
}

/** Wire shape returned by POST /v1/feedback. */
export interface FeedbackItem {
  id: string;
  org_id: string;
  artifact_kind: FeedbackArtifactKind;
  artifact_id: string;
  section_key: string | null;
  sentiment: FeedbackSentiment;
  note: string | null;
  actor_user_id: string;
  created_at: string;
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
  status: "active" | "draft" | "archived";
  description: string;
  icon: string;
  phases: string[];
  attached_capabilities: string[];
  usage_count: number;
  last_used: string;
}

export interface SkillDetail extends Skill {
  system_prompt?: string;
  knowledge_refs?: SkillKnowledgeRef[];
  author?: string;
  last_updated?: string;
}

export interface SkillKnowledgeRef {
  kind: string;
  id: string;
  title: string;
}

/** Matches the BE ``CreateSkillIn`` Pydantic shape — see
 *  ``athena/api/routers/skills.py``. The slug must pass the BE
 *  validator (lowercase + digits + hyphens). */
export interface CreateSkillIn {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  phases?: string[];
  version?: string;
  status?: "active" | "draft" | "archived";
  system_prompt?: string | null;
  knowledge_refs?: SkillKnowledgeRef[];
}

/** Matches the BE ``UpdateSkillIn`` Pydantic shape — every field
 *  optional, slug is immutable post-create. */
export interface UpdateSkillIn {
  name?: string;
  description?: string | null;
  icon?: string | null;
  phases?: string[];
  version?: string;
  status?: "active" | "draft" | "archived";
  system_prompt?: string | null;
  knowledge_refs?: SkillKnowledgeRef[];
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

/* Transport shapes for `GET /v1/knowledge/graph`. Mirrors the BE
 * `KnowledgeGraphOut` envelope exactly — layout (x/y), color, and any
 * derived display path are synthesised client-side, not transmitted. */
export interface KnowledgeNode { id: string; node_kind: string; name: string; layer: string | null; repo_id: string | null; tags: string[] }
export interface KnowledgeEdge { source_id: string; target_id: string; kind: string }
export interface KnowledgeGraphTotals { nodes: number; edges: number }
export interface KnowledgeGraph { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; totals: KnowledgeGraphTotals; truncated: boolean }

/* -- /v1/knowledge/search wire shape (BE: knowledge_search.py) -- */

export type SearchMode = "semantic" | "lexical" | "hybrid";
export type SearchScope = "org" | "capability" | "repo";
export type SearchKind =
  | "file" | "function" | "class" | "config" | "document"
  | "service" | "module" | "overlay";
export type SearchQuality = "exact" | "semantic" | "fuzzy" | "no_match";
export type SearchScoreBasis = "cosine_distance" | "ts_rank" | "rrf";

/** One row of the search envelope. ``score_basis`` tells the FE which
 *  retriever produced ``score`` so the chip can render the right unit
 *  (lower is better for cosine_distance; higher for ts_rank / rrf). */
export interface SearchItem {
  id: string;
  kind: "node" | "overlay";
  node_kind: string | null;
  overlay_kind: "description" | "domain_note" | "past_design" | "past_review" | null;
  name: string;
  path: string | null;
  summary: string;
  layer: string | null;
  language: string | null;
  tags: string[];
  repo_id: string | null;
  repo_full_name: string | null;
  capability_id: string | null;
  score: number;
  score_basis: SearchScoreBasis;
}

export interface KnowledgeSearchOut {
  query: string;
  mode: SearchMode;
  items: SearchItem[];
  totals: { matched: number; returned: number };
  freshness: "fresh" | "stale" | "unknown";
  search_quality: SearchQuality;
}

export interface KnowledgeSearchParams {
  q: string;
  scope?: SearchScope;
  capability_id?: string;
  repo_id?: string;
  kind?: SearchKind[];
  layer?: string[];
  mode?: SearchMode;
  limit?: number;
}

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

/** Minimal JSON-Schema-draft-07 shape the integration config endpoints
 *  return. The wizard reads `properties` + `required` to render fields;
 *  unknown keywords are ignored. */
export interface JsonSchemaProperty {
  type?: "string" | "number" | "integer" | "boolean";
  title?: string;
  description?: string;
  format?: "uri" | "email" | "uuid" | "date" | "date-time";
  pattern?: string;
  enum?: readonly string[];
  default?: string | number | boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
}
export interface JsonSchema {
  type?: "object";
  required?: readonly string[];
  properties?: Readonly<Record<string, JsonSchemaProperty>>;
  additionalProperties?: boolean;
}

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
 *  `recent_activity`, `overview`, `guardrails`, `conventions`, `stack`,
 *  `ownership`, `success_metrics`, `risks`, `runbook`,
 *  `external_references`, `maturity`) is stored as a `BlueprintSection`
 *  and rendered alongside these KG cards on the capability surface. The
 *  KG cards never carry Blueprint-section data — and vice versa. */
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
 *  that is also a Repo Blueprint section (per postgres-schema.md §5.4:
 *  `overview`, `guardrails`, `conventions`, `stack`, `api_surface`,
 *  `data_models`, `entry_points`, `hot_files`, `tests_and_ci`,
 *  `build_and_run`, `deployment_surface`, `external_deps`, `local_idioms`,
 *  `recent_activity`, `ownership`, `observability`, `secrets_handling`,
 *  `environments`) is stored as a `BlueprintSection` and rendered inline
 *  in the expanded repo row via `<RepoBlueprintSections>`. The KG fields
 *  here never duplicate a Blueprint section — and vice versa. */
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
 *  that is also an Org Blueprint section (per postgres-schema.md §5.4:
 *  `standards`, `glossary`, `security_policies`, `mission`, `principles`,
 *  `compliance`, `incident_history`, `change_log`) is stored as a
 *  `BlueprintSection` and rendered inline on `/knowledge` via the Blueprint
 *  TOC + section viewer. The KG fields here never duplicate a Blueprint
 *  section — and vice versa. */
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
  /** `in_app` was added in §5.29.5 — surfaces in `/inbox` (no external
   * webhook needed). The BE accepts any string here, so widening is
   * forward-compatible. */
  channels: ("email" | "in_app" | "slack" | "pagerduty" | "teams" | "webhook")[];
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
  /** §5.29.10 — append-only lifecycle. `active` is the current row,
   * `superseded` is an older row replaced by an edit, `reverted` means
   * the row was explicitly reverted (no successor). Default `active`
   * for older seeded rows that pre-date the column. */
  status?: "active" | "superseded" | "reverted";
  /** When this row was created (different from `date` which is the
   * human-readable display). Set by the server. */
  created_at?: string;
}

/** §5.29.10 — request body for `api.orgs.decisionList.create` /
 *  `api.capabilities.decisionList.create`. The shape mirrors the
 *  scope-page DecisionsTab. `kind` is constrained to the three
 *  governance kinds; `tag` is a short slug surfaced in the row's
 *  monospace prefix (e.g. `ADR-042`). */
export interface DecisionRecordCreateRequest {
  title: string;
  tag: string;
  kind: "ADR" | "Convention" | "Domain note";
  summary: string;
}

export type DecisionRecordPatchRequest = Partial<DecisionRecordCreateRequest>;

/** §6.0 — per-repo file browser. One row per ``knowledge_nodes`` file
 *  rolled up from the Slice-4 understanding pipeline (parser kind, LOC,
 *  symbol / import / TODO counts plus a 180-char summary preview). The
 *  detail endpoint expands the counts into full lists + summary body. */
export interface RepoFileRow {
  id: string;
  path: string;
  name: string;
  language: string | null;
  layer: string | null;
  parser: "tree_sitter" | "regex" | "skipped" | null;
  loc: number;
  symbols_count: number;
  imports_count: number;
  todos_count: number;
  summary_preview: string;
  indexed_branch_sha: string | null;
}

export interface RepoFilesTotals {
  files: number;
  filtered: number;
  by_language: Record<string, number>;
  by_layer: Record<string, number>;
}

export interface RepoFilesOut {
  repo_id: string;
  repo_full_name: string;
  items: RepoFileRow[];
  next_cursor: string | null;
  has_more: boolean;
  totals: RepoFilesTotals;
}

export interface RepoFileDetail {
  id: string;
  repo_id: string;
  path: string;
  name: string;
  language: string | null;
  layer: string | null;
  parser: "tree_sitter" | "regex" | "skipped" | null;
  loc: number;
  symbols: string[];
  imports: string[];
  todos: string[];
  summary: string;
  indexed_branch_sha: string | null;
}

/** Filter / pagination query for `api.repos.files.list`. All fields are
 *  optional; omitted values fall through to the BE defaults
 *  (limit=50, no filters, first page). */
export interface RepoFilesListQuery {
  path_prefix?: string;
  language?: string;
  layer?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

/* -------------------------------------------------------------------------- */
/* §6.5.6 — FE mirrors for BE agent tools (Batch 1-3)                         */
/*                                                                            */
/* These five rows complement BE tools shipped as `_tools/` agent factories   */
/* but NOT yet exposed as REST endpoints. The FE wires call sites today       */
/* against the canonical path the REST endpoint will land at; mock-mode       */
/* serves a synthesised envelope so the FE compiles + tests pass. The         */
/* `// TODO: BE REST endpoint not yet exposed (§6.5.6 — tool exists in        */
/* athena/agent/subagents/_tools/{knowledge,slices,repo}.py)` markers in      */
/* the api method block flag the live-mode gap.                               */
/* -------------------------------------------------------------------------- */

/** One row in a graph-walk envelope (`find_dependents` /
 *  `find_dependencies`). Mirrors the agent-tool row shape in
 *  `athena/agent/subagents/_tools/knowledge.py:_make_graph_walk_tool`.
 *  ``hops`` is the BE field; the FE consumes it directly per ADR-032
 *  snake_case truth (no rename). The `expand_slice` neighbourhood
 *  endpoint returns rows with `relation` instead of `hops` — both are
 *  optional here so a single panel renders the three modes. */
export interface FileDependentsItem {
  id: string;
  node_kind: string;
  path: string;
  name: string;
  summary: string | null;
  tags: string[];
  layer: string | null;
  repo_full_name: string;
  /** Distance from the seed node in edges (1..max_hops). Set on
   *  dependents / dependencies; absent on the slice endpoint. */
  hops?: number;
  /** Set by `expand_slice` only — "sibling" / "caller" / "callee" /
   *  "caller_and_callee". Absent on the recursive graph-walk
   *  endpoints. */
  relation?: "sibling" | "caller" | "callee" | "caller_and_callee";
}

/** Freshness signal carried by every retrieval envelope (§3.2 +
 *  knowledge-design-invariants.md). Mirrors `Freshness` TypedDict in
 *  `athena/agent/subagents/_tools/_envelope.py`. Every field is
 *  optional on the wire — older BE builds / the mock omit them and
 *  UI treats absence as "unknown". */
export interface KnowledgeFreshness {
  /** "knowledge_graph" for snapshotted reads, "live" for mutable
   *  tables. Required by BE; optional here for mock-mode tolerance. */
  source?: "knowledge_graph" | "knowledge_node" | "blueprint" | "live";
  kg_snapshot_id?: string | null;
  last_indexed_at?: string | null;
  commits_behind?: number | null;
  stale_but_usable?: boolean | null;
  /** Set when the call carried `branch_scope` — agent must disclose. */
  branch_scope?: string | null;
  /** Rows the FTS / cosine query returned filtered to `branch_scope`. */
  rows_on_branch?: number | null;
  /** Phase 6K — repos the pre-scope LLM call narrowed retrieval to. */
  scope_first_picked_repos?: string[] | null;
  /** Set by the query-memoization wrapper — true means cached envelope. */
  cache_hit?: boolean | null;
}

/** Standard retrieval envelope from `_tools/_envelope.py` — `items`
 *  list + `freshness` + `search_quality`. The dependents/dependencies/
 *  slice endpoints all return this shape. */
export interface FileDependentsEnvelope {
  items: FileDependentsItem[];
  /** BE returns `total` only on the legacy non-envelope path; new
   *  envelope tools don't surface it. Kept optional for the FE. */
  total?: number;
  freshness: KnowledgeFreshness;
  search_quality: "exact" | "fuzzy" | "empty";
}

/** Query params for `api.repos.files.dependents(...)` /
 *  `api.repos.files.dependencies(...)`. `max_hops` is 1..5 (BE clamp);
 *  `kind` is the edge kind filter — today only `"imports"` is wired. */
export interface FileGraphWalkQuery {
  max_hops?: number;
  kind?: "imports" | "calls" | "all";
  /** ADR-078 — only respected at org scope; harmless at capability/repo. */
  cross_repo?: boolean;
}

/** Query params for `api.repos.files.slice(...)` (expand_slice mode). */
export interface FileSliceQuery {
  max_hops?: number;
  limit?: number;
}

/** Wire shape for `api.repos.files.content(...)` — mirrors the
 *  `read_repo_file` tool envelope in `_tools/repo.py:170-177`. The
 *  optional `coverage_warning` is non-null while the BE is reading
 *  from the 4000-char-per-file `knowledge_nodes.summary` cache; the
 *  banner drops once full-body MinIO read lands (§6.5.5 follow-up). */
export interface RepoFileContentResponse {
  content: string;
  language: string | null;
  total_lines: number;
  indexed_branch_sha: string | null;
  /** Inline citation chip the agent / FE drops next to the body. */
  citation: string;
  truncated: boolean;
  /** Surfaces "showing summary (first 4000 chars)…" banner. */
  coverage_warning?: string | null;
}

export interface RepoFileContentQuery {
  /** 1-based inclusive line start (optional). */
  line_start?: number;
  /** 1-based inclusive line end (optional). */
  line_end?: number;
}

/** One match row in a `grep_repo` envelope. Mirrors
 *  `_tools/repo.py:253-265`. */
export interface RepoGrepResult {
  path: string;
  line: number;
  match: string;
  context_before: string;
  context_after: string;
  /** `[node:{id}:L{line}-L{line}]` chip — drives drawer deep-link. */
  citation: string;
}

/** Envelope from `api.repos.grep(...)`. `coverage_warning` mirrors
 *  the `read_repo_file` rationale — surfaces a banner. */
export interface RepoGrepEnvelope {
  items: RepoGrepResult[];
  total: number;
  truncated: boolean;
  coverage_warning?: string | null;
}

export interface RepoGrepQuery {
  pattern: string;
  max_results?: number;
  path_glob?: string;
}

/** Unified decision-detail envelope returned by `GET /v1/decisions/{id}`.
 *  The endpoint probes org / capability / repo scope tables in order and
 *  returns the first hit, so a single FE detail route can render any
 *  decision regardless of where it lives. Drives the per-decision page
 *  reached from the ADRs card on the repo route and the stale-decisions
 *  banner on the org Decisions tab. */
export interface DecisionDetail {
  id: string;
  scope: "org" | "capability" | "repo";
  /** `capability_id` / `repo_id` / `null` for org-scope. */
  scope_id: string | null;
  /** Capability slug / repo full_name / org name. */
  scope_label: string;
  title: string;
  tag: string;
  author: string;
  date: string;
  kind: "ADR" | "Convention" | "Domain note";
  summary: string;
  status: "active" | "superseded" | "reverted";
  supersedes_id: string | null;
  /** Reverse lookup — set when a successor row points back at this id. */
  superseded_by_id: string | null;
  created_at: string;
}

/**
 * §5.30 — per-capability access control. Org owners + admins keep their
 * org-wide reach; this row governs who else can manage non-admins inside
 * a single capability. Two roles: `admin` (full control of the cap's
 * surfaces) and `viewer` (read-only on the cap surfaces; can still
 * create tasks since task creation is org-wide).
 */
export type CapabilityRole = "admin" | "viewer";

export interface CapabilityMember {
  id: string;
  capability_id: string;
  user_id: string;
  role: CapabilityRole;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  added_by_user_id: string | null;
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
  /** §5.29.9 cross-scope queue fields — present on the org-wide
   * `/v1/blueprint-proposals` listing, absent on per-scope listings. */
  section_title?: string;
  blueprint_id?: string;
  scope_kind?: "org" | "capability" | "repo";
  decided_at?: string | null;
  decided_by_user_id?: string | null;
  decision_note?: string | null;
  cooldown_until?: string | null;
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

/* -----------------------------------------------------------------------
 * ADR-073 — Topology tier explorer, Activity timeline, Operations rollups
 *
 * These types support the faceted-tab redesign: a navigable five-tier KG
 * (per ADR-042) on the Repo Topology surface; a per-scope event timeline on
 * the Activity tab; an org-level Operations rollup combining cost, sync
 * health, integration health, members, audit preview, and re-embed
 * classifier metrics.
 * --------------------------------------------------------------------- */

/** Tier kind in the ADR-042 five-tier KG hierarchy. */
export type TierKind = "repo" | "service" | "module" | "component" | "file";

/** One metric rendered in a tier's header. */
export interface TierMetric {
  label: string;
  value: string;
}

/** One node in the precomputed tier tree for a repo. */
export interface TierNode {
  /** URL-safe id used to build the tier path (slug or short hash). */
  id: string;
  /** Display name (e.g. service "auth", module "handlers"). */
  name: string;
  /** Repo-relative path of the artefact this tier represents. */
  path: string;
  /** Tier kind, drives the icon and the next-tier label. */
  tier: TierKind;
  /** ADR-042 auto-summary at this tier (≈100–300 words). */
  summary: string;
  /** Per-tier counts; free-form. */
  metrics: TierMetric[];
  /** Children at the next tier down. Empty for `file` tier. */
  children: TierNode[];
}

/** Event kinds rendered in the Activity timeline. */
export type ActivityKind = "ingestion" | "run" | "decision" | "blueprint";

/** A single Activity-timeline event. */
export interface ActivityEvent {
  id: string;
  when: string;
  kind: ActivityKind;
  actor: string;
  summary: string;
  scope?: string;
  impact?: { label: string; value: string };
  /** Smart-classifier verdict per ADR-048 (ingestion events only). */
  changeClass?: "cosmetic" | "minor" | "material";
}

/** Org Operations tab rollup — single response from `api.orgs.operations`. */
export interface OrgOperationsData {
  cost: {
    spent_mtd_usd: number;
    monthly_budget_usd?: number;
    spark: Array<{ day: string; cost_usd: number }>;
    top_caps: Array<{ capability_id: string; capability_name: string; spent_usd: number }>;
  };
  sync_health: Array<{
    repo_id: string;
    repo_full_name: string;
    capability_id: string;
    freshness: "fresh" | "indexing" | "stale_minor" | "stale_major" | "failed" | "no_data";
    commits_behind: number;
    last_sync_relative: string;
  }>;
  integrations: Array<{
    id: string;
    kind: "github" | "slack" | "jira" | "linear" | "pagerduty" | "webhook" | "other";
    label: string;
    status: "connected" | "degraded" | "disconnected";
    detail?: string;
  }>;
  members: {
    total: number;
    by_role: Array<{ role: string; count: number }>;
    recent_invites: Array<{ email: string; role: string; invited_at: string }>;
  };
  audit_preview: Array<{
    id: string;
    actor: string;
    action: string;
    resource: string;
    outcome: "success" | "failure";
    when: string;
  }>;
  reembed: {
    cosmetic_pct: number;
    minor_pct: number;
    material_pct: number;
    commits_classified: number;
    saved_usd: number;
  };
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
    /** §5.31 stage-1: soft-delete the org. Owner-only. Cascades
     *  deleted_at to every cap + every repo in the org so the trash
     *  view + the KG filter all see the cascade. Idempotent. */
    softDelete: (id: string, confirmSlug: string) =>
      apiFetch<Org>(`/v1/orgs/${encodeURIComponent(id)}:soft-delete`, {
        method: "POST",
        body: JSON.stringify({ confirm_slug: confirmSlug }),
      }),
    /** §5.31 restore: owner-only. Clears deleted_at on the org and
     *  every cap/repo deleted in the same cascade (±5s window). */
    restore: (id: string) =>
      apiFetch<Org>(`/v1/orgs/${encodeURIComponent(id)}:restore`, { method: "POST" }),
    /** §5.31 stage-2: hard delete + cascade. Owner-only; 409 unless
     *  already soft-deleted; typed-slug confirm in body. */
    permanentDelete: (id: string, confirmSlug: string) =>
      apiFetch<void>(`/v1/orgs/${encodeURIComponent(id)}/permanent`, {
        method: "DELETE",
        body: JSON.stringify({ confirm_slug: confirmSlug }),
      }),
    /** Org-level knowledge — registry + cross-cap dependency model + Blueprint excerpts. */
    knowledge: (orgId: string) =>
      apiFetch<OrgKnowledge>(`/v1/orgs/${encodeURIComponent(orgId)}/knowledge`),
    /** ADR-073 Operations tab rollup — cost, sync health, integrations,
     *  members, audit preview, re-embed classifier metrics. Single round
     *  trip; the page passes each slice into the Operations card grid. */
    operations: (orgId: string) =>
      apiFetch<OrgOperationsData>(`/v1/orgs/${encodeURIComponent(orgId)}/operations`),
    /** ADR-073 Activity tab — org-wide timeline of ingestion + run +
     *  decision + blueprint-edit events. Paginated; caller passes the
     *  `before` cursor to load the next page (50/page). */
    activity: (orgId: string, query: { before?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (query.before) sp.set("before", query.before);
      if (query.limit) sp.set("limit", String(query.limit));
      const qs = sp.toString();
      return apiFetch<ActivityEvent[]>(`/v1/orgs/${encodeURIComponent(orgId)}/activity${qs ? `?${qs}` : ""}`);
    },
    /** ADR-073 Decisions tab — full org-scope decision records (separate
     *  from `OrgKnowledge.stale_decisions`, which is just the flagged set). */
    decisions: (orgId: string) =>
      apiFetch<DecisionRecord[]>(`/v1/orgs/${encodeURIComponent(orgId)}/decisions`),
    /** §5.29.10 Item 1b — CRUD namespace for org-scope decisions. The BE
     *  side of this is greenfield (currently only mock); see the readiness
     *  checklist row for the deferred backend work. */
    decisionList: {
      list: (orgId: string) =>
        apiFetch<DecisionRecord[]>(`/v1/orgs/${encodeURIComponent(orgId)}/decisions`),
      create: (orgId: string, body: DecisionRecordCreateRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/orgs/${encodeURIComponent(orgId)}/decisions`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      patch: (orgId: string, decisionId: string, body: DecisionRecordPatchRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/orgs/${encodeURIComponent(orgId)}/decisions/${encodeURIComponent(decisionId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      revert: (orgId: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/orgs/${encodeURIComponent(orgId)}/decisions/${encodeURIComponent(decisionId)}/revert`,
          { method: "POST" },
        ),
      escalate: (orgId: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/orgs/${encodeURIComponent(orgId)}/decisions/${encodeURIComponent(decisionId)}/escalate`,
          { method: "POST" },
        ),
    },
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
    /** §5.4 row-3 — mint a link-mode invitation. The response carries
     *  `invitation_url` (the share payload); the raw token is never
     *  re-emitted on list/get. */
    createLink: (orgId: string, body: { role: string }) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations/link`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** §5.4 row-2 — extend `expires_at` by another TTL window and
     *  re-send the original invitation email. 409s on link-mode rows
     *  (admin should regenerate instead). */
    resend: (orgId: string, invitationId: string) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(invitationId)}/resend`, { method: "POST" }),
    revoke: (orgId: string, invitationId: string) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: "POST" }),
    accept: (token: string) =>
      apiFetch<{ org_id: string; role: string }>(`/v1/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
    /**
     * §7.9.7 — read-only seat-aware preview. The accept-invite page calls
     * this BEFORE Accept so the seat-full card can render without burning
     * an Accept-attempt's 409. HHHH landed the BE side.
     */
    preview: (token: string) =>
      apiFetch<InvitationPreview>(`/v1/invitations/${encodeURIComponent(token)}/preview`),
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
    list: (includeDeleted: IncludeDeletedFilter = "false") => {
      const qs = includeDeleted === "false" ? "" : `?include_deleted=${includeDeleted}`;
      return apiFetch<Capability[]>(`/v1/capabilities${qs}`);
    },
    create: (body: { slug: string; name: string; description?: string }) =>
      apiFetch<Capability>("/v1/capabilities", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string, opts: { includeDeleted?: boolean } = {}) => {
      const qs = opts.includeDeleted ? "?include_deleted=true" : "";
      return apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}${qs}`);
    },
    patch: (id: string, body: Partial<Pick<Capability, "name" | "description">>) =>
      apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    archive: (id: string) =>
      apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}/archive`, { method: "POST" }),
    /** §5.31 stage-1: mark capability deleted_at; hides from default list +
     *  KG retrieval but keeps the row for restore. Idempotent. */
    softDelete: (id: string) =>
      apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}:soft-delete`, { method: "POST" }),
    /** §5.31 restore: clears deleted_at + re-enqueues ingest for every
     *  attached repo. Idempotent. */
    restore: (id: string) =>
      apiFetch<Capability>(`/v1/capabilities/${encodeURIComponent(id)}:restore`, { method: "POST" }),
    /** §5.31 stage-2: hard delete + cascade. 409s unless the cap is already
     *  soft-deleted; typed-slug confirmation required in body. */
    permanentDelete: (id: string, confirmSlug: string) =>
      apiFetch<void>(`/v1/capabilities/${encodeURIComponent(id)}/permanent`, {
        method: "DELETE",
        body: JSON.stringify({ confirm_slug: confirmSlug }),
      }),
    /** §5.29.12 — capability settings PATCH for budget + future per-cap policy
     *  knobs. Today carries `budget_mtd_usd` only (used by the /cost page's
     *  "Set budget" CTA); the BE shape stays flexible for future additions. */
    patchSettings: (id: string, body: { budget_mtd_usd?: number }) =>
      apiFetch<{ id: string; budget_mtd_usd: number | null }>(
        `/v1/capabilities/${encodeURIComponent(id)}/settings`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    listRepos: (id: string) => apiFetch<CapabilityRepo[]>(`/v1/capabilities/${encodeURIComponent(id)}/repos`),
    attachRepo: (id: string, body: { integration_id: string; repo_full_name: string; default_branch?: string }) =>
      apiFetch<CapabilityRepo>(`/v1/capabilities/${encodeURIComponent(id)}/repos`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    detachRepo: (id: string, repoId: string) =>
      apiFetch<void>(`/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}`, { method: "DELETE" }),
    /**
     * §3.5 row 3 / §5.29.11 — enqueue an ingest_repo job for this
     * capability's repo. Returns the Arq job id so callers can poll
     * `listRepos` for `last_indexed_sha` flipping. Ingest also runs
     * the inline embedding pass per §3.13.
     */
    syncRepoKnowledge: (id: string, repoId: string) =>
      apiFetch<{ job_id: string; status: string; repo_id: string; branch_sha: string }>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:sync`,
        { method: "POST" },
      ),
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
    /** ADR-073 — Topology tier tree for a repo (ADR-042 five-tier hierarchy
     *  precomputed for navigation). Returned root is the repo tier with
     *  child services → modules → components → files inline. */
    repoTierTree: (id: string, repoId: string) =>
      apiFetch<TierNode>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/tier-tree`,
      ),
    /** ADR-073 Activity tab — capability-scoped event timeline. Same shape
     *  as `api.orgs.activity` but filtered to events tied to this capability
     *  or its attached repos. */
    activity: (id: string, query: { before?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (query.before) sp.set("before", query.before);
      if (query.limit) sp.set("limit", String(query.limit));
      const qs = sp.toString();
      return apiFetch<ActivityEvent[]>(
        `/v1/capabilities/${encodeURIComponent(id)}/activity${qs ? `?${qs}` : ""}`,
      );
    },
    /** ADR-073 Decisions tab — capability-scoped decision records. */
    decisions: (id: string) =>
      apiFetch<DecisionRecord[]>(`/v1/capabilities/${encodeURIComponent(id)}/decisions`),
    /** §5.30 — per-capability access control. Org owner/admin retain
     *  implicit cap-admin reach on every cap; this namespace is what
     *  cap-admin engineers use on caps they were assigned to. */
    members: {
      list: (id: string) =>
        apiFetch<CapabilityMember[]>(
          `/v1/capabilities/${encodeURIComponent(id)}/members`,
        ),
      addByEmail: (id: string, body: { email: string; role: CapabilityRole }) =>
        apiFetch<CapabilityMember>(
          `/v1/capabilities/${encodeURIComponent(id)}/members`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      patch: (id: string, userId: string, body: { role: CapabilityRole }) =>
        apiFetch<CapabilityMember>(
          `/v1/capabilities/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      remove: (id: string, userId: string) =>
        apiFetch<void>(
          `/v1/capabilities/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
          { method: "DELETE" },
        ),
    },
    /** §5.29.10 Item 1b — CRUD namespace for capability-scope decisions.
     *  BE greenfield; mock handlers carry the demo flow today. */
    decisionList: {
      list: (id: string) =>
        apiFetch<DecisionRecord[]>(`/v1/capabilities/${encodeURIComponent(id)}/decisions`),
      create: (id: string, body: DecisionRecordCreateRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/capabilities/${encodeURIComponent(id)}/decisions`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      patch: (id: string, decisionId: string, body: DecisionRecordPatchRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/capabilities/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      revert: (id: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/capabilities/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}/revert`,
          { method: "POST" },
        ),
      escalate: (id: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/capabilities/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}/escalate`,
          { method: "POST" },
        ),
    },
    /** ADR-073 Activity tab — repo-scoped event timeline. */
    repoActivity: (id: string, repoId: string, query: { before?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (query.before) sp.set("before", query.before);
      if (query.limit) sp.set("limit", String(query.limit));
      const qs = sp.toString();
      return apiFetch<ActivityEvent[]>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/activity${qs ? `?${qs}` : ""}`,
      );
    },
  },
  /** §5.31 — org-scoped repo lifecycle. A ``Repo`` is org-deduplicated (one row
   *  per `(org_id, integration_id, full_name)`) regardless of how many caps
   *  attach it. Soft-delete affects every cap; the per-cap detach (under
   *  `api.capabilities.detachRepo`) only removes the link. */
  repos: {
    list: (includeDeleted: IncludeDeletedFilter = "false") => {
      const qs = includeDeleted === "false" ? "" : `?include_deleted=${includeDeleted}`;
      return apiFetch<RepoFull[]>(`/v1/repos${qs}`);
    },
    softDelete: (id: string) =>
      apiFetch<RepoFull>(`/v1/repos/${encodeURIComponent(id)}:soft-delete`, { method: "POST" }),
    restore: (id: string) =>
      apiFetch<RepoFull>(`/v1/repos/${encodeURIComponent(id)}:restore`, { method: "POST" }),
    permanentDelete: (id: string, confirmRepoFullName: string) =>
      apiFetch<void>(`/v1/repos/${encodeURIComponent(id)}/permanent`, {
        method: "DELETE",
        body: JSON.stringify({ confirm_repo_full_name: confirmRepoFullName }),
      }),
    /** §3.13 row 1 — latest ``current`` stage snapshot + ``history`` of
     *  the most recent 5 attempts. Returns null when the repo has never
     *  been ingest-attempted (FE renders "Never synced"). */
    ingestProgress: (repoId: string) =>
      apiFetch<RepoIngestProgress | null>(
        `/v1/repos/${encodeURIComponent(repoId)}/ingest-progress`,
      ),
    /** §5.29.10 row 1c — repo-scoped governance feed (live BE via
     *  `/v1/repos/{repo_id}/decisions`). ADR-073 §4 overridden: repos
     *  get their own Decisions tab instead of rolling up to capability. */
    decisionList: {
      list: (repoId: string) =>
        apiFetch<DecisionRecord[]>(`/v1/repos/${encodeURIComponent(repoId)}/decisions`),
      create: (repoId: string, body: DecisionRecordCreateRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/repos/${encodeURIComponent(repoId)}/decisions`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      patch: (repoId: string, decisionId: string, body: DecisionRecordPatchRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/repos/${encodeURIComponent(repoId)}/decisions/${encodeURIComponent(decisionId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      revert: (repoId: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/repos/${encodeURIComponent(repoId)}/decisions/${encodeURIComponent(decisionId)}/revert`,
          { method: "POST" },
        ),
      escalate: (repoId: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/repos/${encodeURIComponent(repoId)}/decisions/${encodeURIComponent(decisionId)}/escalate`,
          { method: "POST" },
        ),
    },
    /** §6.0 — per-repo file browser. Lists every file row produced by the
     *  Slice-4 understanding pipeline; the detail endpoint expands the
     *  per-file symbol / import / TODO lists + summary body. */
    files: {
      list: (repoId: string, query: RepoFilesListQuery = {}) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
        }
        const qs = sp.toString();
        return apiFetch<RepoFilesOut>(
          `/v1/repos/${encodeURIComponent(repoId)}/files${qs ? `?${qs}` : ""}`,
        );
      },
      get: (repoId: string, fileId: string) =>
        apiFetch<RepoFileDetail>(
          `/v1/repos/${encodeURIComponent(repoId)}/files/${encodeURIComponent(fileId)}`,
        ),
      /** §6.5.6 — "who depends on this file?" panel. Wraps
       *  `find_dependents` agent tool via `repo_files_browse.py`. */
      dependents: (
        repoId: string,
        fileId: string,
        query: FileGraphWalkQuery = {},
        init: RequestInit = {},
      ) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
        }
        const qs = sp.toString();
        return apiFetch<FileDependentsEnvelope>(
          `/v1/repos/${encodeURIComponent(repoId)}/files/${encodeURIComponent(fileId)}/dependents${qs ? `?${qs}` : ""}`,
          init,
        );
      },
      /** §6.5.6 — "what does this file depend on?" sibling panel.
       *  Wraps `find_dependencies` agent tool via `repo_files_browse.py`. */
      dependencies: (
        repoId: string,
        fileId: string,
        query: FileGraphWalkQuery = {},
        init: RequestInit = {},
      ) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
        }
        const qs = sp.toString();
        return apiFetch<FileDependentsEnvelope>(
          `/v1/repos/${encodeURIComponent(repoId)}/files/${encodeURIComponent(fileId)}/dependencies${qs ? `?${qs}` : ""}`,
          init,
        );
      },
      /** §6.5.6 — "neighborhood of this file" (expand_slice mode).
       *  Wraps `expand_slice` agent tool via `repo_files_browse.py`. */
      slice: (
        repoId: string,
        fileId: string,
        query: FileSliceQuery = {},
        init: RequestInit = {},
      ) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
        }
        const qs = sp.toString();
        return apiFetch<FileDependentsEnvelope>(
          `/v1/repos/${encodeURIComponent(repoId)}/files/${encodeURIComponent(fileId)}/slice${qs ? `?${qs}` : ""}`,
          init,
        );
      },
      /** §6.5.6 — file content viewer. Wraps `read_repo_file` agent
       *  tool via `repo_files_browse.py`. Today reads from
       *  `knowledge_nodes.summary` (first 4000 chars per file ingested);
       *  the response envelope carries `coverage_warning` until the
       *  MinIO full-body cache hit path replaces the fallback. */
      content: (
        repoId: string,
        fileId: string,
        query: RepoFileContentQuery = {},
        init: RequestInit = {},
      ) => {
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null) sp.set(k, String(v));
        }
        const qs = sp.toString();
        return apiFetch<RepoFileContentResponse>(
          `/v1/repos/${encodeURIComponent(repoId)}/files/${encodeURIComponent(fileId)}/content${qs ? `?${qs}` : ""}`,
          init,
        );
      },
    },
    /** §6.5.6 — in-repo regex grep. Wraps `grep_repo` agent tool via
     *  `repo_files_browse.py`. Accepts cancellable RequestInit so the
     *  FE can `AbortController.abort()` in-flight requests when the
     *  user types a new pattern. */
    grep: (repoId: string, query: RepoGrepQuery, init: RequestInit = {}) => {
      const sp = new URLSearchParams();
      sp.set("pattern", query.pattern);
      if (query.max_results !== undefined) sp.set("max_results", String(query.max_results));
      if (query.path_glob) sp.set("path_glob", query.path_glob);
      return apiFetch<RepoGrepEnvelope>(
        `/v1/repos/${encodeURIComponent(repoId)}/grep?${sp.toString()}`,
        init,
      );
    },
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
    /**
     * §7 Replay UI GA — paginated read of the persisted event history.
     * Drives the scrubber on `/runs/[id]/replay`. Keyset-paginated on
     * `seq`; pass the prior page's `next_cursor` as `cursor` to step
     * forward. `limit` is server-clamped (1..500, default 100).
     */
    replay: (id: string, opts: { cursor?: number; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (opts.cursor !== undefined) sp.set("cursor", String(opts.cursor));
      if (opts.limit !== undefined) sp.set("limit", String(opts.limit));
      const qs = sp.toString();
      return apiFetch<ReplayEventPage>(
        `/v1/runs/${encodeURIComponent(id)}/events/replay${qs ? `?${qs}` : ""}`,
      );
    },
    // Gate approve/reject — canonical surface lives in `lib/api/gates.ts`
    // (FE-canonical `/close` per ADR-032 + §5.28). Import { approveGate,
    // rejectGate } from "@/lib/api/gates" directly at the call site; the
    // legacy `runs.approveGate`/`runs.rejectGate` wrappers that hit
    // `/approve` and `/reject` were deleted with the BE endpoints.
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
      /**
       * §7 — Read-only document fetch. Used by the embed surface
       * (`/embed/artifacts/[id]`) and any other context that just needs
       * the rendered document without the per-phase scaffolding.
       *
       * Backend serves this through the standalone document id (not via
       * a run scoping), so the URL takes the doc id directly. Returns
       * 403 when the document belongs to an org the caller isn't a
       * member of — embed routes interpret that as "private; render the
       * sign-in empty state".
       */
      get: (docId: string) =>
        apiFetch<RunDocument>(`/v1/run-documents/${encodeURIComponent(docId)}`),
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
    /**
     * Per-run document listing — the latest `documents` row for a given phase
     * (e.g. `spec`, `plan`, `implement.*`, `implement.review`, `ci.state`,
     * `pr.authored`). Used by the new Implement-track phase tabs (§3.6 r5 +
     * §4.x r2) to render the canonical artifact for each phase plus its
     * latest gate state. ADR-032 keeps wire field names snake_case.
     *
     * Returns `null` when no document has been emitted yet for that phase —
     * the caller renders an empty state rather than an error.
     */
    runDocuments: {
      latest: (id: string, phase: string) =>
        apiFetch<RunPhaseDocument | null>(
          `/v1/runs/${encodeURIComponent(id)}/documents?phase=${encodeURIComponent(phase)}`,
        ),
    },
  },
  /**
   * Per-section 👍/👎 — §9.6 / ADR-032 BE-bends-to-FE. The backend exposes
   * a polymorphic `(artifact_kind, artifact_id, section_key, sentiment)`
   * surface (six artifact kinds today); the FE only exercises the run-doc
   * sections, so the wrapper takes the run id + section id and posts to the
   * `document_section` artifact kind. Idempotent — re-posting the same
   * (artifact, section, actor) replaces the prior row in place.
   */
  feedback: {
    record: (body: FeedbackCreateRequest) =>
      apiFetch<FeedbackItem>("/v1/feedback", {
        method: "POST",
        body: JSON.stringify(body),
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
      apiFetch<Integration | void>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}`,
        { method: "DELETE" },
      ),
    test: (orgId: string, integrationId: string) =>
      apiFetch<{ ok: boolean; latency_ms: number; detail: string }>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}/test`,
        { method: "POST" },
      ),
    /**
     * §5.29.11 / B7.4 — list repos the OAuth user / App installation can
     * attach. Used by the AttachRepoDialog on `/capabilities/[id]`. Empty
     * list when the integration has no token on file or the SCM call
     * fails (the dialog shows a friendly empty state in that case).
     */
    listAvailableRepos: (orgId: string, integrationId: string) =>
      apiFetch<AvailableRepo[]>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}/available-repos`,
      ),
    /**
     * Server-side GitHub OAuth (§6.2 / §5.29.1) — the user-token flow that
     * lets a dev test against their own repos without the GitHub App. The
     * BE owns the token end-to-end; this method only returns the URL the
     * browser top-level-navigates to.
     *
     * Usage:
     *
     *   const { authorize_url } =
     *     await api.integrations.githubOauth.start({ return_to: "/settings/integrations" });
     *   window.location.assign(authorize_url);
     */
    githubOauth: {
      start: (body: { return_to?: string } = {}) =>
        apiFetch<{ authorize_url: string; expires_at: string }>(
          "/v1/integrations/github/oauth/start",
          { method: "POST", body: JSON.stringify(body) },
        ),
    },
    /**
     * §5.16 r2 / F-08.1 — Generic OAuth + GitHub-App install flow.
     *
     * Used by the connect wizard for every adapter whose `connect_kind`
     * is `"oauth"` or `"github_app"`. The two-call shape mirrors the BE
     * routes:
     *
     *   1. `initiate({ return_to })` mints a state row + returns
     *      `authorize_url`. Browser top-level-navigates there.
     *   2. After the provider redirects back with `(state, code)` (or
     *      `installation_id` for GitHub Apps), the callback page calls
     *      `complete({ state, code })` to finalize the integration.
     *
     * `kind` is the BE `IntegrationKind` enum (`source_control` / `work`
     * / `chat` / `mcp`), NOT the FE `connect_kind` (which is the auth
     * shape the wizard renders). For GitHub App: provider=`"github"`,
     * kind=`"source_control"`.
     */
    /**
     * §5.14 r2 — JSON Schema describing the provider's `config` shape.
     * The wizard renders unknown providers by reading this schema; for
     * known providers the static `FIELDS_BY_INTEGRATION_ID` overrides
     * still own placeholder/help copy.
     */
    getSchema: (
      orgId: string,
      provider: string,
      kind: "source_control" | "work" | "chat" | "mcp",
    ) =>
      apiFetch<JsonSchema>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(provider)}/${encodeURIComponent(kind)}/schema`,
      ),
    oauth: {
      initiate: (
        orgId: string,
        provider: string,
        kind: "source_control" | "work" | "chat" | "mcp",
        body: { return_to?: string } = {},
      ) =>
        apiFetch<{ authorize_url: string; state: string; expires_at: string }>(
          `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(provider)}/${encodeURIComponent(kind)}/oauth/initiate`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      complete: (
        orgId: string,
        provider: string,
        kind: "source_control" | "work" | "chat" | "mcp",
        body: { state: string; code: string },
      ) =>
        apiFetch<{ integration_id: string; status: string }>(
          `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(provider)}/${encodeURIComponent(kind)}/oauth/complete`,
          { method: "POST", body: JSON.stringify(body) },
        ),
    },
  },
  /**
   * §5.29.3 — Stripe-backed billing surface. Reads + the customer portal
   * link work for any tier; the dev-mode synthetic subscription is also
   * returned by `subscription` so the UI always has something to render.
   * `createCheckoutSession` + `createPortalSession` raise
   * `BillingError({code:'dev_mode_active'})` when the BE is running with
   * `ATHENA_DEV_UNRESTRICTED_ACCESS=true`; FE catches the code and shows
   * a friendly empty state instead of a 500-shaped error.
   */
  billing: {
    // Org is resolved server-side via the `X-Athena-Org-Id` header that
    // `apiFetch` injects (matches the BE `OrgDep` dependency); no
    // org-id needs to land in the URL path.
    subscription: () =>
      apiFetch<Subscription | null>("/v1/billing/subscription"),
    invoices: () =>
      apiFetch<Invoice[]>("/v1/billing/invoices"),
    paymentMethods: () =>
      apiFetch<PaymentMethod[]>("/v1/billing/payment-methods"),
    usage: () =>
      apiFetch<UsageRecord[]>("/v1/billing/usage"),
    checkoutSession: (body: { tier: BillingTier; success_url: string; cancel_url: string }) =>
      apiFetch<{ session_id: string; url: string }>(
        "/v1/billing/checkout-session",
        { method: "POST", body: JSON.stringify(body) },
      ),
    portalSession: () =>
      apiFetch<{ url: string }>(
        "/v1/billing/portal-session",
        { method: "POST" },
      ),
    /**
     * §7.9.5 row 2463 — seat-summary read. Org is resolved via the
     * `X-Athena-Org-Id` header injected by `apiFetch`, matching the BE's
     * `OrgDep`. Returns null/0 fields gracefully when the BE 404s on
     * older builds so SeatsCard can render a non-fatal empty state.
     */
    getSeats: (orgId: string) =>
      apiFetch<SeatsOut>(`/v1/orgs/${encodeURIComponent(orgId)}/seats`),
    /** §7.9.5 row 2463 — POST /v1/orgs/{id}/seats/buy. Stripe Checkout URL
     *  comes back in `stripe_invoice_url`; the caller redirects to it. */
    buySeats: (orgId: string, body: BuySeatsRequest) =>
      apiFetch<BuySeatsResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/seats/buy`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** §7.9.5 row 2463 — POST /v1/orgs/{id}/seats/release. 409s with
     *  `code: "seats_release_would_displace"` when releasing would
     *  drop an active member's seat. */
    releaseSeats: (orgId: string, body: BuySeatsRequest) =>
      apiFetch<ReleaseSeatsResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/seats/release`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** §7.9.5 — POST /v1/orgs/{id}/billing/upgrade. Returns Stripe Checkout
     *  URL the caller redirects to. `additional_seats` optional 0..50. */
    upgradeToPro: (orgId: string, body: UpgradeToProRequest = {}) =>
      apiFetch<UpgradeToProResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/billing/upgrade`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** §7.9.5 row 2465 — POST /v1/orgs/{id}/billing/downgrade-to-solo.
     *  409s with `code: "downgrade_blocked_active_members"` when the
     *  org has more than one active member. */
    downgradeToSolo: (orgId: string) =>
      apiFetch<DowngradeToSoloResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/billing/downgrade-to-solo`,
        { method: "POST" },
      ),
    /** §7.9.5 row 2464 — price catalog. May 404 on builds where IIII has
     *  not yet shipped the BE endpoint; FE call-site catches and falls
     *  back to `lib/billing/price-catalog.ts` constants. */
    priceCatalog: () =>
      apiFetch<PriceCatalog>("/v1/billing/price-catalog"),
  },
  /**
   * §7.10 — Credit-based billing surface. Reads the current org's
   * credit balance, opens a Stripe Checkout session for a one-time
   * top-up, and configures overage / spend-cap policy. Owner-only
   * mutations are enforced server-side; the FE renders disabled
   * inputs as defense-in-depth.
   *
   * PPPP/NNNN land the BE side in 7.10.4; the FE renders against the
   * mock fixtures keyed by `X-Athena-Org-Id` until then.
   */
  credits: {
    /** Read the org's current credit balance — drives the meter, halt
     *  banner, and topup modal copy. */
    getBalance: (orgId: string) =>
      apiFetch<CreditBalance>(`/v1/orgs/${encodeURIComponent(orgId)}/credits`),
    /** POST /v1/orgs/{id}/credits/topup. Returns a Stripe Checkout URL
     *  the caller opens in a new tab (top-up is a deliberate one-time
     *  purchase, not a recurring subscription). `amount_usd` 10..1000
     *  per readiness §7.10.5. */
    topup: (orgId: string, body: { amount_usd: number }) =>
      apiFetch<{ checkout_url: string }>(
        `/v1/orgs/${encodeURIComponent(orgId)}/credits/topup`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** Flip `overage_enabled` + optionally set `overage_cap_usd`.
     *  Owner-only. 409 `payment_method_required` when enabling on an
     *  org with no card on file. */
    configureOverage: (
      orgId: string,
      body: { enabled: boolean; cap_usd: number | null },
    ) =>
      apiFetch<void>(
        `/v1/orgs/${encodeURIComponent(orgId)}/credits/configure-overage`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** Set / clear the owner-driven hard spend cap. `cap_usd: null`
     *  clears the cap. Owner-only. */
    setSpendCap: (orgId: string, body: { cap_usd: number | null }) =>
      apiFetch<void>(
        `/v1/orgs/${encodeURIComponent(orgId)}/spend-cap`,
        { method: "POST", body: JSON.stringify(body) },
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
    /**
     * Patch fields on a model provider — usually the BYO API key.
     * The plaintext key is sent on the wire; the server AEAD-
     * encrypts it before storage and NEVER returns the plaintext
     * back. Pass an empty body to PATCH nothing (no-op).
     */
    patch: (
      orgId: string,
      providerId: string,
      body: Partial<{
        enabled_models: string[];
        residency_note: string;
        status: "available" | "enabled" | "disabled";
        api_key: string;
      }>,
    ) =>
      apiFetch<ModelProvider>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-providers/${encodeURIComponent(providerId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    /**
     * Clear the stored BYO API key without deleting the provider
     * row. Subsequent LLM calls for this provider fall back to
     * Athena's shared LiteLLM pool.
     */
    revokeApiKey: (orgId: string, providerId: string) =>
      apiFetch<ModelProvider>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-providers/${encodeURIComponent(providerId)}/api-key`,
        { method: "DELETE" },
      ),
    /** §7.8.1 — POST `/v1/orgs/{id}/model-providers` to register a new
     *  provider key. `provider` MUST be a catalog id (lowercase) from
     *  `api.llmProviders.catalog()`. `enabled_models` lists which
     *  catalog models this org enables on this key. `api_key` is the
     *  plaintext — server AEAD-encrypts before storage. */
    create: (
      orgId: string,
      body: {
        provider: string;
        via?: string;
        region?: string;
        enabled_models?: string[];
        residency_note?: string;
        api_key?: string;
      },
    ) =>
      apiFetch<ModelProvider>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-providers`,
        {
          method: "POST",
          body: JSON.stringify({
            via: "direct",
            region: "us-east-1",
            enabled_models: [],
            ...body,
          }),
        },
      ),
    /** §7.8.1 — `GET /v1/orgs/{id}/model-providers/{id}/usage` returns
     *  the per-model usage rollup for the current month. */
    usage: (orgId: string, providerId: string) =>
      apiFetch<ProviderUsage>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-providers/${encodeURIComponent(providerId)}/usage`,
      ),
  },
  llmProviders: {
    /** §7.8.1 — `GET /v1/llm/providers/catalog` returns the static
     *  14-provider catalog (Anthropic / OpenAI / Google / DeepSeek
     *  plus 10 free-tier aggregators). Backs the "Add provider"
     *  picker and the per-provider model checkbox list. */
    catalog: () =>
      apiFetch<CatalogProvider[]>(`/v1/llm/providers/catalog`),
  },
  modelRoleBindings: {
    /** §7.8.1 — `GET /v1/orgs/{id}/model-role-bindings`. */
    list: (orgId: string) =>
      apiFetch<RoleBinding[]>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-role-bindings`,
      ),
    /** §7.8.1 — atomic upsert. Replaces the binding for `role` with
     *  the supplied `(primary, fallback_chain)`. Every pair must
     *  reference catalog entries the org has a key for; the BE
     *  rejects unknown providers / models with a 400. */
    put: (
      orgId: string,
      role: ModelRoleAlias,
      body: {
        primary_provider: string;
        primary_model: string;
        fallback_chain: RoleChainEntry[];
      },
    ) =>
      apiFetch<RoleBinding>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-role-bindings/${encodeURIComponent(role)}`,
        { method: "PUT", body: JSON.stringify(body) },
      ),
    /** §7.8.1 — clear the binding for `role`. The LLM client falls
     *  back to the shared LiteLLM pool for that role. */
    delete: (orgId: string, role: ModelRoleAlias) =>
      apiFetch<void>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-role-bindings/${encodeURIComponent(role)}`,
        { method: "DELETE" },
      ),
  },
  privacy: {
    get: (orgId: string) =>
      apiFetch<PrivacySettings>(`/v1/orgs/${encodeURIComponent(orgId)}/privacy`),
    /**
     * Partial PATCH — BE accepts any of `redaction | data_retention |
     * encryption | residency` and overwrites just the JSONB blobs in
     * the payload. Returns the full post-update PrivacySettings.
     */
    patch: (orgId: string, body: Partial<Pick<PrivacySettings, "redaction" | "data_retention" | "encryption" | "residency">>) =>
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
    /** §5.29.12 r1 — per-day burn-down split by model over the trailing
     *  `days` window (7/30/90 chip). `orgId` is reserved for future
     *  multi-org tenancy switches; the BE scopes off the request's
     *  current_org dep today. */
    perModelBurndown: (orgId: string, params: { days?: number } = {}) => {
      void orgId;
      const sp = new URLSearchParams();
      if (params.days != null) sp.set("days", String(params.days));
      const qs = sp.toString();
      return apiFetch<PerModelBurndown>(`/v1/cost/per-model-burndown${qs ? `?${qs}` : ""}`);
    },
  },
  skills: {
    list: () => apiFetch<Skill[]>("/v1/skills"),
    get: (id: string) => apiFetch<SkillDetail>(`/v1/skills/${encodeURIComponent(id)}`),
    create: (body: CreateSkillIn) =>
      apiFetch<Skill>("/v1/skills", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateSkillIn) =>
      apiFetch<Skill>(`/v1/skills/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/v1/skills/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Idempotent M:N attach. BE requires cap-admin on the capability. */
    attachCapability: (id: string, capabilityId: string) =>
      apiFetch<void>(
        `/v1/skills/${encodeURIComponent(id)}/attach/${encodeURIComponent(capabilityId)}`,
        { method: "POST" },
      ),
    detachCapability: (id: string, capabilityId: string) =>
      apiFetch<void>(
        `/v1/skills/${encodeURIComponent(id)}/attach/${encodeURIComponent(capabilityId)}`,
        { method: "DELETE" },
      ),
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
  decisions: {
    /** Cross-scope decision lookup — resolves an org / capability / repo
     *  decision by globally-unique UUID. Drives the FE detail page
     *  linked from the repo ADRs card + the org Decisions tab. */
    detail: (id: string) =>
      apiFetch<DecisionDetail>(`/v1/decisions/${encodeURIComponent(id)}`),
  },
  chat: {
    listThreads: () => apiFetch<ChatThread[]>("/v1/chat/threads"),
    getThread: (id: string) => apiFetch<{ thread: ChatThread; messages: ChatMessage[] }>(`/v1/chat/threads/${encodeURIComponent(id)}`),
    postMessage: (threadId: string, content: string) =>
      apiFetch<ChatMessage>(`/v1/chat/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    createThread: (body: { title: string; scope_kind: "capability" | "org"; scope_id?: string; initial_message?: string }) =>
      apiFetch<{ thread: ChatThread; first_message: ChatMessage | null }>("/v1/chat/threads", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  knowledge: {
    /** Sampled knowledge-graph view. BE accepts `capability_id`, `repo_id`,
     *  `layer`, and `limit` (10..1000). Old call sites that pass only
     *  `capability_id` / `limit` keep working. */
    graph: (params: { capability_id?: string; repo_id?: string; layer?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (params.capability_id) sp.set("capability_id", params.capability_id);
      if (params.repo_id) sp.set("repo_id", params.repo_id);
      if (params.layer) sp.set("layer", params.layer);
      if (params.limit != null) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return apiFetch<KnowledgeGraph>(`/v1/knowledge/graph${qs ? `?${qs}` : ""}`);
    },
    /** Knowledge search — hybrid (default) / semantic / lexical retrieval
     *  across knowledge_nodes + capability_overlays. Wraps the agent
     *  retrieval tools (BM25 + cosine + RRF) — see BE
     *  `athena/api/routers/knowledge_search.py`. */
    search: (params: KnowledgeSearchParams) => {
      const sp = new URLSearchParams();
      sp.set("q", params.q);
      if (params.scope) sp.set("scope", params.scope);
      if (params.capability_id) sp.set("capability_id", params.capability_id);
      if (params.repo_id) sp.set("repo_id", params.repo_id);
      for (const k of params.kind ?? []) sp.append("kind", k);
      for (const l of params.layer ?? []) sp.append("layer", l);
      if (params.mode) sp.set("mode", params.mode);
      if (params.limit != null) sp.set("limit", String(params.limit));
      return apiFetch<KnowledgeSearchOut>(`/v1/knowledge/search?${sp.toString()}`);
    },
  },
  notifications: {
    routing: (orgId: string) =>
      apiFetch<NotificationRule[]>(`/v1/orgs/${encodeURIComponent(orgId)}/notifications/routing`),
    /** §5.29.5 — replace the full rule set in one save (matches the BE
     * "delete-then-upsert" PATCH semantic). Disabled rules are simply
     * omitted from the payload — the BE has no per-row enable flag. */
    replaceRouting: (orgId: string, rules: NotificationRule[]) =>
      apiFetch<NotificationRule[]>(
        `/v1/orgs/${encodeURIComponent(orgId)}/notifications/routing`,
        { method: "PATCH", body: JSON.stringify({ rules }) },
      ),
  },
  onboarding: {
    state: (orgId: string) => apiFetch<OnboardingState>(`/v1/orgs/${encodeURIComponent(orgId)}/onboarding`),
    /** §5.29.4 — explicit-mark a step done (for optional steps the
     * BE's `_derive_steps` can't see). `stepId` must be one of
     * `connect_scm | create_capability | attach_repo | first_run`. */
    completeStep: (orgId: string, stepId: string) =>
      apiFetch<OnboardingState>(
        `/v1/orgs/${encodeURIComponent(orgId)}/onboarding/${encodeURIComponent(stepId)}/complete`,
        { method: "POST" },
      ),
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
  /**
   * §5.29.9 — cross-scope Blueprint proposal queue. The per-scope wrappers
   * under `api.blueprint.{capability,repo,org}.listProposals` still serve
   * the per-page panels; these flat helpers power the org-wide
   * `/blueprint-proposals` approval inbox.
   */
  blueprintProposals: {
    list: (params: {
      status?: "pending" | "accepted" | "rejected" | "all";
      scope_kind?: "org" | "capability" | "repo";
      scope_id?: string;
      limit?: number;
    } = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
      const qs = sp.toString();
      return apiFetch<BlueprintSectionProposal[]>(`/v1/blueprint-proposals${qs ? `?${qs}` : ""}`);
    },
    accept: (proposalId: string, body: { decision_note?: string } = {}) =>
      apiFetch<{ proposal_id: string; section_id: string; new_version: number }>(
        `/v1/blueprint-proposals/${encodeURIComponent(proposalId)}/accept`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    editAccept: (proposalId: string, body: BlueprintProposalEditAcceptRequest) =>
      apiFetch<{ proposal_id: string; section_id: string; new_version: number }>(
        `/v1/blueprint-proposals/${encodeURIComponent(proposalId)}/edit-accept`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    reject: (proposalId: string, body: BlueprintProposalRejectRequest = {}) =>
      apiFetch<{ proposal_id: string; section_id: string; cooldown_until: string }>(
        `/v1/blueprint-proposals/${encodeURIComponent(proposalId)}/reject`,
        { method: "POST", body: JSON.stringify(body) },
      ),
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
