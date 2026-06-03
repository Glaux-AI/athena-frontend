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
  | "degraded"
  | "failed"
  | "paused";
/** ``paused`` (item 1) — a per-file dossier LLM call exhausted its retries and
 *  the ingest stopped to ask the user: skip this file (resolve it WITHOUT the
 *  LLM, then resume) or cancel. The FE renders the file + error with
 *  **Skip this file** / **Cancel** buttons. */
/** ``degraded`` (Batch 12k) — the ingest finished but at least one
 *  per-file LLM enrichment fell through (embedding / summary / tag /
 *  glossary). The KG is usable but missing signal; the FE renders a
 *  yellow chip + a "Retry enrichments" button that calls
 *  ``POST /v1/capabilities/{cap}/repos/{repo}/knowledge:retry-enrichments``. */

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
    | "degraded"
    | "failed"
    | "cancelled"
    | "paused";
  entered_at: string;
  duration_ms: number | null;
  /** Elapsed for the CURRENT attempt only (re-stamped each run) — the FE shows
   *  this as "running for X" so a retry doesn't inflate to the cumulative
   *  ``duration_ms`` (which counts from the first attempt at this sha). Null
   *  only when the attempt start is unknown. */
  attempt_duration_ms: number | null;
  files_total: number | null;
  files_processed: number | null;
  last_processed_path: string | null;
  error: string | null;
  /** Pause (item 1): the file whose dossier LLM call failed — shown in the
   *  skip/cancel dialog. Non-null only while ``stage === "paused"``. */
  paused_path?: string | null;
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
  /** One of the in-flight stages, `completed`, `degraded`, `failed`,
   *  `cancelled` (Stop ingestion stamps this for instant FE feedback), or
   *  null when idle. */
  current_sync_stage?: SyncStage | "cancelled" | null;
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
/** The run track — selects the phase tree the backend runner walks
 * (`prd` → 4 phases, `implement` → 6, `quickfix` → 2). Mirrors the BE
 * `CreateRunIn.kind` / `RunOut.kind` exactly (ADR-032 — FE is the source
 * of truth for wire shapes). Null only for legacy M1-era rows created
 * before the run-aggregate migration; a run created without a kind never
 * advances. */
export type RunKind = "prd" | "implement" | "quickfix";
export interface Run {
  id: string;
  goal: string;
  kind: RunKind | null;
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

/**
 * Cost summary wire shape — the `/v1/cost/summary` response.
 *
 * `athena/billing/cost_summary.py` returns this full month-to-date shape:
 * spend + forecast + budget, per-day spend & tokens, per-model spend with
 * token split, per-capability, per-phase, top tasks, the token totals, and
 * budget-derived alerts. Every metric is derived from data Athena tracks
 * today (the `cost_rollups_daily` MV + `token_usage`).
 *
 * Fields stay optional so mock mode and forward/backward-compat callers
 * can omit any of them; the /cost page normalizes to a guaranteed shape.
 * Money fields are plain numbers (not Decimal-as-string) — safe to do
 * arithmetic on directly.
 */
/** Billing-source filter for the cost screen toggle. `all` = both; `byo` =
 *  the org's own provider keys paid the vendor; `athena` = Athena's shared
 *  credential paid. Maps 1:1 to the All / Your keys / Athena credits tabs. */
export type CostBillingSource = "all" | "byo" | "athena";

export interface CostSummary {
  month?: string;
  // Which billing source the figures are scoped to (echoes the request).
  source?: CostBillingSource;
  // Resolved time window the figures cover (echoes the request's from/to).
  // `is_current_period` is true while the window is still accruing (e.g. the
  // running calendar month) — the only case where a forecast is meaningful.
  range?: { from: string; to: string; label: string; days: number; is_current_period: boolean };
  // Same metrics for the immediately-preceding equal-length window, so the FE
  // can render period-over-period deltas without a second round-trip.
  compare?: { label: string; spend_usd: number; total_tokens: number; total_calls: number };
  spend_usd?: number;
  forecast_usd?: number;
  budget_usd?: number;
  budget_utilization?: number;
  trend?: string;
  // Token + call totals for the month-to-date window.
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  total_cached_tokens?: number;
  total_calls?: number;
  spend_daily?: { day: string; usd: number; prompt_tokens?: number; completion_tokens?: number }[];
  spend_by_capability?: { id: string; name: string; usd: number; pct: number; budget: number; trend: string; top_task: string }[];
  spend_by_model?: { id: string; name: string; provider: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
  // Per-vendor rollup (OpenAI / Google / …) from token_usage.provider. Shown
  // on the "All" tab only — answers "which vendor did we pay".
  spend_by_provider?: { provider: string; name: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
  // BYO spend per saved provider key (cost_borne_by_org). Shown on the
  // "Your keys" tab only. `has_key=false` = spend on a since-revoked key.
  spend_by_key?: { provider: string; name: string; key_last4: string | null; has_key: boolean; usd: number; pct: number; calls: number; models: number; last_used: string }[];
  // By LiteLLM role/intent (e.g. workhorse-cheap) — complements spend_by_model
  // (actual model), since a role's backing model can change.
  spend_by_role?: { role: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
  spend_by_phase?: { name: string; usd: number; pct: number }[];
  // Per-repo INGESTION spend (phase_key='ingest', grouped by repo_id).
  // Forward-looking: rows that predate the repo_id column stay in the org-wide
  // ingest phase total. Each row drills down via `api.cost.repoIngestCycles`.
  spend_by_repo?: { repo_id: string; name: string; usd: number; pct: number; calls: number; prompt_tokens: number; completion_tokens: number; last_used: string }[];
  top_tasks?: { id: string; title: string; usd: number; runs: number; last_used: string }[];
  alerts?: { level: "info" | "warning" | "danger"; text: string }[];
}

/** Per-sync-cycle ingestion cost for one repo — the cost dashboard's per-repo
 *  drill-down. One entry per `branch_sha` (the cycle key; a pause→skip→resume
 *  keeps the same sha, so a logical sync stays one bucket), newest first. */
export interface RepoIngestCycles {
  repo_id: string;
  cycles: {
    branch_sha: string;
    started_at: string;
    usd: number;
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
  }[];
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

/** Published per-model throughput cap (Groq / Cerebras). Fields are null when
 *  the provider doesn't list a hard per-model number. */
export interface CatalogRateLimit {
  rpm: number | null;
  tpm: number | null;
  tokens_per_day: number | null;
}

/** §7.8.1 — one model row from `GET /v1/llm/providers/catalog`. */
export interface CatalogModel {
  id: string;
  display_name: string;
  /** One-line capability + when-to-use blurb, shown on hover wherever the
   *  model renders as a chip. */
  description: string;
  context_window: number;
  max_input_tokens: number;
  max_output_tokens: number;
  /** List price per 1M input tokens (provider currency); null when the
   *  provider publishes no flat per-token rate. */
  input_price: number | null;
  /** List price per 1M output tokens; 0 for embeddings, null when no flat
   *  per-token rate exists. */
  output_price: number | null;
  supports_tools: boolean;
  supports_embeddings: boolean;
  /** True when the model accepts image input (multimodal) — drives the
   *  "Vision" capability badge. Independent of `supports_tools`. */
  supports_vision: boolean;
  /** Hard per-model RPM/TPM cap when published; null otherwise (see the
   *  provider's `rate_limit_notes`). */
  rate_limit: CatalogRateLimit | null;
  /** Capability bucket chip: chat / chat+reasoning / reasoning / embedding /
   *  coding / agent_system. */
  model_type: string;
  /** Reasoning behaviour: toggle / effort / always / none. */
  thinking_mode: string;
  /** Reasoning / extended-thinking model — renders a "Thinking" badge and
   *  streams its chain-of-thought into the chat reasoning panel. */
  thinking: boolean;
  /** Thinking can be toggled off on this same model (its own non-thinking
   *  counterpart). Only meaningful when `thinking` is true. */
  thinking_optional: boolean;
  /** Id of a non-thinking counterpart model, when one exists. */
  non_thinking_variant: string | null;
}

/** §7.8.1 — one provider entry in the catalog. */
export interface CatalogProvider {
  id: string;
  display_name: string;
  tier_hint: "free" | "paid" | "mixed";
  requires_openai_compat: boolean;
  /** Currency for every model's input/output price (USD today). */
  pricing_currency: string;
  /** Denomination prices are quoted in (per 1M tokens today). */
  pricing_unit: string;
  /** Provider-level pricing caveats (batch discounts, cache rates, promos). */
  pricing_notes: string;
  /** Human-readable rate-limit story shown when no hard per-model cap exists. */
  rate_limit_notes: string;
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

/** Platform default `(provider, model)` for a role — what it resolves to
 *  when the org has saved no per-role override. From
 *  `GET /v1/llm/role-defaults`. */
export interface RoleDefault {
  role: ModelRoleAlias;
  provider: string;
  model: string;
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

/** One row of `GET /v1/orgs/{id}/agent-role-bindings` — the LLM role a
 *  given Athena agent runs on. `role` is the *effective* role (the org
 *  override if set, else `default_role`); the concrete model behind the
 *  role is configured on the role-routing card. */
export interface AgentRoleBinding {
  agent_name: string;
  role: ModelRoleAlias;
  default_role: ModelRoleAlias;
  is_overridden: boolean;
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
  kind: RunKind;
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
  /** Machine-readable phase payload backing the structured panels.
   *  `SpecStructured` when `phase === "spec"`, `PlanStructured` when
   *  `phase === "plan"`, the Implement-track shapes on their tabs
   *  (`ImplementStructured` on `implement` / `quickfix.implement`,
   *  `ReviewStructured` on `review`, `CiStructured` on `ci`, `PrStructured`
   *  on `pr` / `quickfix.pr`), one of the four `Prd*Structured` shapes on the
   *  matching PRD-track tab (`frame`/`research`/`draft`/`signoff`), and
   *  `null` until the phase agent finishes (or for phases that don't carry
   *  a structured payload). */
  structured:
    | SpecStructured
    | PlanStructured
    | ImplementStructured
    | ReviewStructured
    | CiStructured
    | PrStructured
    | PrdFrameStructured
    | PrdResearchStructured
    | PrdDraftStructured
    | PrdSignoffStructured
    | null;
  /** Revision log for the document, newest-first by convention. */
  revisions: PhaseRevision[];
}

/* -- Structured phase payloads (spec + plan) ------------------------------- */

/** Risk / severity scale shared by every structured sub-record. */
export type StructuredRiskLevel = "low" | "medium" | "high";

/** One row of the document revision log surfaced under spec + plan. */
export interface PhaseRevision {
  version: number;
  /** `agent` / `human` (BE emits the actor class, not a name). */
  who_kind: string;
  created_at: string;
}

/** A capability Athena detected as touched by the task. */
export interface DetectedCapability {
  capability_id: string;
  name: string;
  /** 0–1 confidence; rendered as a percentage. */
  confidence: number;
  /** True for the capability the task primarily lands in. */
  primary: boolean;
  why: string;
  files_estimate: number;
}

/** The estimated blast radius of the spec across repos / services / stores. */
export interface BlastRadius {
  repos: { id: string; name: string; files: number; kind: string; risk: StructuredRiskLevel }[];
  services: { name: string; impact: string; risk: StructuredRiskLevel }[];
  data_stores: { name: string; impact: string; risk: StructuredRiskLevel }[];
  compliance: string[];
}

/** Structured payload for `phase === "spec"`. */
export interface SpecStructured {
  version: 1;
  document_id: string | null;
  acceptance_criteria: string[];
  open_questions: string[];
  capabilities_detected: DetectedCapability[];
  blast_radius: BlastRadius | null;
  kb_sources: { label: string; kind: string; detail: string | null; ref: string | null }[];
}

/** One plan stage in the implementation DAG. */
export interface PlanStage {
  stage_id: string;
  title: string;
  files_in_scope: string[];
  acceptance: string;
  estimated_loc: number;
  risk_level: StructuredRiskLevel;
  /** Stage ids this stage depends on (must land first). */
  depends_on: string[];
}

/** The consequences / impact analysis attached to a plan. */
export interface PlanConsequences {
  summary: string | null;
  severity: StructuredRiskLevel | null;
  breaking_changes: { area: string; detail: string; risk: StructuredRiskLevel }[];
  data_impacts: { entity: string; impact: string; risk: StructuredRiskLevel }[];
  runtime_risks: { name: string; detail: string; severity: StructuredRiskLevel }[];
  mitigations: { kind: string; detail: string }[];
}

/** Structured payload for `phase === "plan"`. */
export interface PlanStructured {
  version: 1;
  document_id: string | null;
  stages: PlanStage[];
  consequences: PlanConsequences | null;
  max_risk_level: StructuredRiskLevel | null;
  total_estimated_loc: number;
  research_worker_count: number;
}

/* -- Structured Implement-track payloads (implement / review / ci / pr) ----- */

/** Structured payload for `implement.implement` AND `quickfix.implement`. The
 *  two tracks share `heal_attempts_used` (the discriminant); the full
 *  implement track carries the stage rollup (`stages_completed` /
 *  `stages_total` / `files_touched`), while quickfix instead carries
 *  `target_file` + `diff_summary`. Fields absent on a given track are
 *  optional so one type covers both. */
export interface ImplementStructured {
  version: 1;
  stages_completed?: number;
  stages_total?: number;
  files_touched?: string[];
  /** Heal/retry attempts spent — present on BOTH tracks (the discriminant). */
  heal_attempts_used: number;
  last_commit_sha?: string | null;
  /** Quickfix only — the single file the quickfix targets. */
  target_file?: string | null;
  /** Quickfix only — a one-line summary of the diff. */
  diff_summary?: string | null;
}

/** One reviewed file with its plain-language purpose + any issues raised. */
export interface ReviewFileRow {
  path: string;
  purpose_pm: string | null;
  issues: string[];
}

/** Structured payload for `implement.review`. Discriminated by
 *  `critic_iterations`. `spec_compliance` maps a requirement id (e.g. `R1`)
 *  to the files that satisfy it. */
export interface ReviewStructured {
  version: 1;
  files: ReviewFileRow[];
  spec_compliance: Record<string, string[]>;
  critic_iterations: number;
}

/** One CI check row (a single GitHub check / status context). */
export interface CiCheckRow {
  name: string;
  status: string;
  target_url: string | null;
  output_summary: string | null;
}

/** Structured payload for `ci.state`. Discriminated by `autofix_cap`. */
export interface CiStructured {
  version: 1;
  commit_sha: string | null;
  checks: CiCheckRow[];
  autofix_attempts_used: number;
  autofix_cap: number;
}

/** Structured payload for `pr.authored` AND `quickfix.pr` (superset). The
 *  discriminant is `pr_url` (the key is present on both tracks);
 *  `pr_body_excerpt` + `feedback_responses` are emitted by the full implement
 *  track only. */
export interface PrStructured {
  version: 1;
  pr_url: string | null;
  pr_number: number | null;
  branch_name: string | null;
  pr_title: string | null;
  /** Implement track only — an excerpt of the PR body. */
  pr_body_excerpt?: string | null;
  /** Implement track only — count of PR-comment responses Athena posted. */
  feedback_responses?: number;
}

/* -- Structured PRD-track payloads (frame / research / draft / signoff) ----- */

/** Structured payload for the PRD `frame` tab. Discriminated by the unique
 *  `problem_statement` field. */
export interface PrdFrameStructured {
  version: 1;
  problem_statement: string | null;
  goals: string[];
  non_goals: string[];
  stakeholders: string[];
  risks: string[];
  frame_summary: string | null;
  confidence: string | null;
  gaps: string[];
}

/** One research finding with its supporting evidence + residual gaps. */
export interface PrdResearchFinding {
  finding: string;
  /** Source ids backing the finding (rendered as chips). */
  evidence: string[];
  gaps: string[];
  confidence: string | null;
}

/** Structured payload for the PRD `research` tab. Discriminated by the unique
 *  `findings` field. */
export interface PrdResearchStructured {
  version: 1;
  findings: PrdResearchFinding[];
  citations: string[];
  findings_summary: string | null;
  confidence: string | null;
  outstanding_gaps: string[];
}

/** One product goal the PRD commits to (drafter-distilled from the body).
 *  `metric` is the success signal this goal maps to, or null. */
export interface PrdDraftGoal {
  goal: string;
  metric: string | null;
}

/** One measurable success signal the PRD will be judged on. */
export interface PrdDraftSuccessMetric {
  metric: string;
  /** The numeric/qualitative target when the research surfaced one, else null. */
  target: string | null;
  /** How it is measured / where the data comes from, or null. */
  signal: string | null;
}

/** One option the drafter weighed; exactly one row carries `chosen: true`. */
export interface PrdDraftAlternative {
  option: string;
  /** Why it lost (null / rationale on the chosen one). */
  why_not: string | null;
  chosen: boolean;
}

/** The in-/out-of-scope ladder distilled from proposed_solution + non_goals. */
export interface PrdDraftScope {
  in_scope: string[];
  out_of_scope: string[];
}

/** Structured payload for the PRD `draft` tab. Discriminated by the unique
 *  `conli_flags_remaining` field. `sections` is the subset PRESENT of the
 *  10-key closed PRD section catalogue; `goals` / `success_metrics` /
 *  `alternatives` / `scope` are the agent-generated structured components
 *  (always present — the BE serialises empty defaults — so the panel renders
 *  whichever the drafter could ground and omits the rest). */
export interface PrdDraftStructured {
  version: 1;
  document_id: string | null;
  conli_flags_remaining: number;
  sections: string[];
  goals: PrdDraftGoal[];
  success_metrics: PrdDraftSuccessMetric[];
  alternatives: PrdDraftAlternative[];
  scope: PrdDraftScope | null;
}

/** One stakeholder approval on the PRD sign-off tab. */
export interface PrdSignoffApproval {
  stakeholder_id: string;
  /** `approve` / `reject` / `defer` (BE emits the decision verb). */
  decision: string;
  note: string | null;
  /** ISO-8601 timestamp of the decision, or null when not yet decided. */
  at: string | null;
}

/** One blocking rejection on the PRD sign-off tab. */
export interface PrdSignoffRejection {
  stakeholder_id: string;
  reason_text: string;
  summarised_reason: string | null;
}

/** Structured payload for the PRD `signoff` tab. Discriminated by the unique
 *  `approvals` + `status` fields. */
export interface PrdSignoffStructured {
  version: 1;
  stakeholders: string[];
  approvals: PrdSignoffApproval[];
  rejections: PrdSignoffRejection[];
  status: string | null;
  approved_count: number;
  total_count: number;
  handoff_target: string | null;
  handoff_run_id: string | null;
  approver_user_id: string | null;
  note: string | null;
}

/** The closed PRD draft section catalogue, in canonical order. Shared by the
 *  Draft coverage display so the FE can show present-vs-missing across the
 *  full set rather than only the keys the BE happened to populate. */
export const PRD_DRAFT_SECTION_CATALOGUE = [
  "problem",
  "users",
  "success_metrics",
  "non_goals",
  "proposed_solution",
  "alternatives_considered",
  "risks_and_mitigations",
  "open_questions",
  "rollout_plan",
  "appendix",
] as const;

/** A single canonical PRD draft section key. */
export type PrdDraftSectionKey = (typeof PRD_DRAFT_SECTION_CATALOGUE)[number];

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
 * - `task_created` is a structured event message — `content` carries the
 *   proposal id (a UUID) and ``payload`` carries the full propose_task
 *   envelope. The FE renders a "Start task" CTA card from ``payload``;
 *   clicking links to `/runs/new?proposal_id=...` which POSTs `/v1/runs`
 *   with the `proposal_id` field set. Once a run is spawned from the
 *   proposal, `spawned_run_id` is populated by the backend. */
/**
 * Per-assistant-turn LLM usage, summed across every model call the agent made
 * while producing the reply. Mirrors the BE `MessageOut.token_usage` JSONB
 * (snake_case, ADR-032). Absent on user / system / task_created rows and on
 * older persisted assistant rows — always treat every field as optional.
 */
export interface ChatTokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_cost_usd?: number;
}

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
  /** Tool calls the agent made while producing this reply — `{name, args,
   *  result}` triples (the BE `MessageOut.tool_calls`). Drives the live
   *  activity strip during streaming and an optional "tools used" recap.
   *  Absent on user / system rows. */
  tool_calls?: ChatToolCall[];
  /** LLM token usage + cost for this assistant turn (see ChatTokenUsage).
   *  Absent on user / system / task_created rows and older persisted rows. */
  token_usage?: ChatTokenUsage;
  /** The model's reasoning/thinking for this turn, shown in a collapsible
   *  panel. Populated client-side from the stream's `reasoning` events; it is
   *  NOT persisted server-side yet, so it's present only for the turn's own
   *  session (absent after a reload). */
  reasoning?: string;
  /** Set on `task_created` rows once the user has clicked the CTA card and
   *  `POST /v1/runs` has minted the actual run. */
  spawned_run_id?: string | null;
  /** A renderable card envelope: the propose_task envelope on `task_created`
   *  rows, or — on `assistant` rows — an `ask_clarification` envelope
   *  (`payload.type === "clarification"`, one disambiguating question) or a
   *  `clarify_scope` envelope (`payload.type === "scope_ladder"`, three
   *  answer-depth tiers). Discriminate on `payload.type`. */
  payload?: TaskProposalPayload | ClarificationPayload | ScopeLadderPayload | null;
}

/** The propose_task envelope persisted on a `task_created` ChatMessage.
 *  Mirrors the BE ``propose_task`` tool's return shape (snake_case per
 *  ADR-032). */
export interface TaskProposalPayload {
  proposal_id: string;
  kind: "prd" | "implement" | "quickfix";
  capability_id: string;
  goal: string;
  budget_usd: number;
  cta_url: string;
  estimated_phases?: string[];
  cta_text?: string;
}

/** The `ask_clarification` envelope on an `assistant` ChatMessage — the agent
 *  asked one disambiguating multiple-choice question instead of fanning out
 *  exploratory tool calls. The FE renders an inline card; picking an option
 *  sends its `value` as the next user message. Mirrors the BE tool's return
 *  shape (snake_case per ADR-032). */
export interface ClarificationPayload {
  type: "clarification";
  clarification_id: string;
  question: string;
  options: { label: string; value: string }[];
}

/** One answer-depth tier of a `clarify_scope` scope ladder. */
export interface ScopeLadderTier {
  /** Stable tier key (`one_paragraph` | `five_section` | `per_service`). */
  name: string;
  /** Human label for the button (e.g. "Structured overview (5 sections)"). */
  label: string;
  /** Conservative upper-bound token estimate for answering at this depth. */
  estimated_tokens: number;
  /** One-sentence preview of the top match at this depth. */
  preview: string;
}

/** The `clarify_scope` envelope on an `assistant` ChatMessage — the agent
 *  offered three answer-*depth* tiers for a broad topic (distinct from
 *  `ask_clarification`, which disambiguates). The FE renders an inline
 *  scope-ladder card; picking a tier sends a depth instruction as the next
 *  user message. Mirrors the BE tool's return shape (snake_case per ADR-032). */
export interface ScopeLadderPayload {
  type: "scope_ladder";
  topic: string;
  tiers: ScopeLadderTier[];
}

export interface ChatCitation {
  label: string;
  /** Where the citation lives — drives the icon. */
  kind: "file" | "adr" | "doc" | "ticket" | "pr" | "skill" | "url";
  /** Optional path/identifier; not auto-rendered as a link, just hinted. */
  ref?: string;
}

/** One tool invocation the chat agent made during a turn — mirrors the BE
 *  `MessageOut.tool_calls` `{name, args, result}` triple. */
export interface ChatToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

/* Transport shapes for `GET /v1/knowledge/graph`. Mirrors the BE
 * `KnowledgeGraphOut` envelope. Layout (x/y) and colour stay synthesised
 * client-side (ADR-041 — Postgres is the store, layout is a view concern).
 *
 * The enriched fields below are ADDITIVE and optional: the BE serializer
 * already stores all of them (summary, layer, complexity_score McCabe,
 * centrality_score PageRank, metadata_.parent_node_id, path + line range),
 * so surfacing them is a serializer change (readiness Phase 6K), not new
 * extraction. Older payloads that omit them degrade gracefully. Privacy
 * invariant holds: no field here carries a person (knowledge-base-coverage
 * §1.1). */
export interface KnowledgeNode {
  id: string;
  node_kind: string;
  name: string;
  layer: string | null;
  repo_id: string | null;
  tags: string[];
  /** LLM file/symbol summary — the embedding source-of-truth text. */
  summary?: string | null;
  /** Source path + line range for the evidence-first cite. */
  path?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  /** McCabe cyclomatic complexity (deterministic at AST level). */
  complexity?: number | null;
  /** PageRank centrality 0–1; drives node sizing. */
  centrality?: number | null;
  /** Containment parent (file→symbol, class→method) from metadata_. */
  parent_id?: string | null;
}
export interface KnowledgeEdge {
  source_id: string;
  target_id: string;
  kind: string;
  /** Edge confidence 0–1. Cross-repo edges (kg_org_edges, ADR-078) carry it;
   *  intra-repo behavioral edges (handles/produces/reads/…) also surface it. */
  confidence?: number | null;
  /** True when this edge spans repos (kg_org_edges UNION at org scope). */
  cross_repo?: boolean;
  /** Service/module-altitude rollup (P1): aggregates N underlying
   *  file/symbol edges into one group→group / group→entity link. */
  rolled_up?: boolean;
  /** Underlying-edge count for a `rolled_up` edge. */
  weight?: number | null;
}
export interface KnowledgeGraphTotals { nodes: number; edges: number }
export interface KnowledgeGraph { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; totals: KnowledgeGraphTotals; truncated: boolean }

/** Envelope for `GET /v1/knowledge/nodes/{id}/neighbors` — the topology
 *  explorer's on-demand 1-hop expansion. `nodes` are the neighbours only (the
 *  focus node is NOT echoed back; the caller already holds it); `edges`
 *  connect the focus to each neighbour (real `contains` spine both ways, plus
 *  behavioral / cross-repo edges). `truncated` is true when the fan-out was
 *  capped server-side (hub node) — the FE soft-cap is the real guard. */
export interface NodeNeighbors { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; truncated: boolean }

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

/** Common ingestion-freshness pill state used at every scope.
 *  ``degraded`` (Batch 12k) — ingest finished but at least one per-file
 *  enrichment fell through; KG is usable but the FE shows the Retry
 *  Enrichments CTA. */
export type IngestionStatus = "fresh" | "debouncing" | "stale_but_usable" | "ingesting" | "failed" | "degraded";

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

/** One file surfaced from the file-centric knowledge graph (`knowledge_nodes`
 *  rows of `node_kind = 'file'`). Post node-drop (ADR-079) the FILE is the
 *  atomic unit — functions/classes are folded into each file's
 *  `metadata.symbols`, so the repo "what's actually in this code" view ranks
 *  FILES by centrality rather than individual symbols. Mirrors the BE
 *  `TopFile` model in `athena/api/routers/knowledge_repo.py`. */
export interface TopFile {
  id: string;
  name: string;
  path: string;
  language: string;
  layer: string;
  /** File-dossier headline (first paragraph), if synthesised. */
  summary: string | null;
  loc: number;
  /** Count of folded symbols (functions / classes / methods) in this file. */
  symbols: number;
  /** Centrality score 0..1 — drives node size + the graph LOD ranking. */
  importance: number;
  /** True when the file is a detected entry point (CLI / main / route root). */
  is_entry_point: boolean;
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
    /** Architecture layer (ui/api/domain/db/util/config/…) — drives the
     *  Topology graph's layer banding. Optional: legacy/mock rows may omit it. */
    layer?: string;
  }>;
  /** Edges among `top_entities` (source_id/target_id reference their `id`s).
   *  ADDITIVE + optional — restores the capability Topology graph's edges
   *  (previously hard-coded to `[]`). `cross_repo` marks kg_org_edges
   *  spanning the capability's attached repos. */
  top_entity_edges?: KnowledgeEdge[];
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
  /** Authoritative containment roots for the topology explorer seed (B2) —
   *  top-level `service` nodes + `module` nodes with no parent module (not the
   *  `dst` of any inter-module `contains` edge). Optional: older BE builds + the
   *  mock omit it, and the explorer falls back to seeding from `services` +
   *  top-level `modules` when absent. */
  containment_roots?: NodeRef[];
  /** Top files by centrality (file-centric KG) — the "what's actually in this
   *  code" view, post node-drop (ADR-079). Replaces the former `top_symbols`
   *  (functions / classes are now folded into each file's `metadata.symbols`).
   *  NOT a Blueprint section. */
  top_files: TopFile[];
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
  /** Phase D — repo headline summary. Rendered prominently at the top of the
   *  repo page's Blueprint dashboard. Optional so older BE builds + mock that
   *  predate the field are still type-safe. */
  summary?: string | null;
  /** Phase D — unified sync surface. `current_sync_stage` mirrors the
   *  `CapabilityRepo` stage enum but adds `degraded` / `failed`. The three
   *  sha + commits_behind fields let the repo page render the SyncStatus
   *  chip without a second `listRepos` round-trip. All optional — the
   *  SyncStatus component falls back to `CapabilityRepo` data when absent. */
  current_sync_stage?: SyncStage | "cancelled" | null;
  commits_behind?: number | null;
  last_indexed_sha?: string | null;
  branch_head_sha?: string | null;
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

/* -------------------------------------------------------------------------- */
/* Phase D — Node dossier drawer (contract #1)                                */
/*                                                                            */
/* `GET /v1/knowledge/nodes/{node_id}` → { dossier: NodeDossier }. Powers the */
/* SHARED node-dossier drawer: any node-id anywhere opens it, and every ref   */
/* inside is itself a clickable node-id (one-click navigation). Every ref is  */
/* the same `NodeRef` shape so the drawer renders + links them uniformly.     */
/* -------------------------------------------------------------------------- */

/** A clickable reference to another KG node. Returned everywhere a node
 *  points at another node (children, containers, relations, see-also,
 *  Mermaid diagram tokens, derived-section rows). Clicking it re-opens the
 *  dossier drawer on `node_id`. */
export interface NodeRef {
  node_id: string;
  name: string;
  path: string;
  kind: string;
  /** Relation label for this edge ("imports" / "calls" / …) — present when
   *  the ref came out of a `relations` bucket. */
  relation?: string | null;
  /** Architecture role / layer hints for chip colouring, when known. */
  role?: string | null;
  layer?: string | null;
}

/** One folded symbol in a file dossier's `elements` block — mirrors the
 *  records `build_symbol_index` writes to `metadata.symbols` (the FILE is the
 *  atomic node now, so its functions/classes ride here, not as nodes). */
export interface NodeDossierElement {
  name: string;
  kind: string;
  line_start: number | null;
  line_end: number | null;
  signature?: string;
  doc?: string;
  complexity?: number;
}

/** The node dossier — the full at-a-glance card for one KG node. Each
 *  `relations` value is a list of {@link NodeRef}; `contains` / `see_also`
 *  are lists; `contained_by` is a single ref or null. */
export interface NodeDossier {
  node_id: string;
  name: string;
  kind: string;
  path: string | null;
  /** One-line headline + a longer "what is this" paragraph. */
  headline: string;
  what: string;
  architecture: {
    layer: string | null;
    role: string | null;
    pattern: string | null;
    responsibilities: string[];
  };
  signals: {
    language: string | null;
    loc: number | null;
    tags: string[];
    /** Forward-compatible bag — the BE may surface complexity / centrality /
     *  test-coverage / churn here without an FE shape change. */
    [key: string]: unknown;
  };
  /** Children (file→symbols, module→files). Each is a clickable ref. */
  contains: NodeRef[];
  /** Containment parent, when any. */
  contained_by: NodeRef | null;
  /** Typed relation buckets (imports / imported_by / calls / called_by /
   *  references / …). Keys vary by node kind; each value is a list of refs. */
  relations: Record<string, NodeRef[]>;
  /** Curated "you may also want to look at" refs. */
  see_also: NodeRef[];
  /** Folded symbol index for file nodes (functions / classes / methods) — the
   *  "what's actually in this file" list, post node-drop. Capped (~120) in the
   *  dossier; the full set lives in the node's `metadata.symbols`. Optional —
   *  non-file nodes + older payloads omit it. */
  elements?: NodeDossierElement[];
  /** Optional Mermaid diagram the dossier LLM emitted (validated server-side
   *  by `_dossier_prompt._clean_mermaid`). */
  mermaid?: string | null;
}

/** Envelope for `GET /v1/knowledge/nodes/{node_id}`.
 *
 *  `dossier` is `null` for LEAF nodes (api_endpoint / db_table / db_column /
 *  dependency / env_var / event / external_system / glossary_term): enrichment
 *  only builds a dossier for `file` / `module` / apex nodes, so a leaf node has
 *  no blueprint of its own. The BE still returns the row's own columns
 *  alongside it — the shared drawer uses `node_kind` + `path` + `repo_id` to
 *  render an identity header AND to resolve + open the node's home FILE
 *  blueprint (a file's repo-file id IS its knowledge-node id). These top-level
 *  fields are optional so older payloads / tests that send only `{ dossier }`
 *  still type-check. */
export interface NodeDossierResponse {
  dossier: NodeDossier | null;
  node_kind?: string;
  name?: string;
  path?: string | null;
  summary?: string | null;
  layer?: string | null;
  repo_id?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Phase D — Live staleness gate (contract #3)                                */
/* -------------------------------------------------------------------------- */

/** `GET /v1/capabilities/{capId}/repos/{repoId}/knowledge/sync-status` — does
 *  a LIVE GitHub HEAD check. Drives the gated Sync action on the repo page:
 *  show Sync ONLY when `is_stale`. When `checked_live` is false the live
 *  HEAD lookup failed (rate-limit / token), so the FE shows a softer
 *  "couldn't verify" affordance that still allows a manual sync. */
export interface RepoSyncStatus {
  repo_id: string;
  is_stale: boolean;
  commits_behind: number | null;
  last_indexed_sha: string | null;
  current_head_sha: string | null;
  /** True when the GitHub HEAD check actually ran. False → couldn't verify. */
  checked_live: boolean;
}

/** Response for `POST .../repos/{capRepoId}/knowledge:cancel` — the Stop
 *  ingestion action. `cancelled=true` → an in-flight ingest was flipped to
 *  `cancelled` (the repo's `current_sync_stage` becomes `"cancelled"` and the
 *  worker stops within a batch). `cancelled=false` → nothing was running, so
 *  the call was an idempotent no-op. */
export interface RepoCancelSyncResponse {
  repo_id: string;
  cancelled: boolean;
  branch_sha: string | null;
}

/** Response for `POST .../repos/{repoId}/knowledge:skip-file` — resume a PAUSED
 *  ingest by skipping the file whose dossier LLM call failed. `resumed=true` →
 *  the file was appended to the skip-set (it resolves WITHOUT the LLM on the
 *  re-enqueued run) and ingest was re-queued. `resumed=false` → nothing was
 *  paused (idempotent no-op). */
export interface RepoSkipFileResponse {
  repo_id: string;
  resumed: boolean;
  skipped_path: string | null;
  job_id: string | null;
  branch_sha: string | null;
}

/* -------------------------------------------------------------------------- */
/* Phase D — Pull-request tab (contract #4)                                   */
/* -------------------------------------------------------------------------- */

/** One open PR row from
 *  `GET /v1/capabilities/{capId}/repos/{repoId}/pull-requests`. */
export interface RepoPullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  draft: boolean;
  author: string;
  head_branch: string;
  base_branch: string;
  created_at: string;
  updated_at: string;
}

/** Envelope for the PR tab. `available` is false when the SCM integration
 *  isn't connected / the live call failed — the tab renders a "couldn't
 *  load PRs / connect integration" empty state. */
export interface RepoPullRequestsResponse {
  repo_id: string;
  available: boolean;
  pull_requests: RepoPullRequest[];
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

/** Result of a `:rebuild` (deep regenerate). `queued: true` means the
 *  agentic explorer was enqueued and the blueprint is `building` — poll
 *  `getToc().status` until `ready`. `mode` is `deep_queued` normally, or
 *  `single_shot_fallback` when the job queue was unreachable. */
export interface BlueprintRebuildResult {
  blueprint_id: string;
  derived_writes: number;
  queued: boolean;
  status: BlueprintStatus;
  mode: "deep_queued" | "single_shot_fallback";
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

/* -------------------------------------------------------------------------- */
/* Phase D — structured `body_json` shapes (contract #5)                      */
/*                                                                            */
/* Several Blueprint sections now carry clickable structure in `body_json`    */
/* instead of (or in addition to) prose. These are the typed views the FE     */
/* casts the generic `body_json: Record<string, unknown>` into per section_key */
/* — the wire stays the loose record (ADR-032), the FE narrows at the render  */
/* boundary. Every node-bearing row is a {@link NodeRef}-compatible shape so   */
/* it deep-links into the node dossier drawer.                                */
/* -------------------------------------------------------------------------- */

/** `mermaid` is a ready-to-render Mermaid source string; `mermaid_nodes`
 *  maps a diagram token (the id used inside the Mermaid source) → a KG
 *  node_id, so clicking a diagram node opens the dossier drawer. Shared by
 *  every section that ships a diagram. */
export interface MermaidDiagram {
  mermaid?: string | null;
  mermaid_nodes?: Record<string, string> | null;
}

/** repo `architecture` section body. */
export interface RepoArchitectureBody extends MermaidDiagram {
  hubs?: Array<{ node_id: string; name: string; kind: string; path: string; layer?: string | null }>;
  entry_points?: Array<{ node_id: string; path: string; name: string }>;
  services?: Array<{ node_id: string; name: string; summary?: string | null }>;
}

/** capability `overview` section body. */
export interface CapabilityOverviewBody extends MermaidDiagram {
  repos?: Array<{ repo_id: string; name: string }>;
}

/** org `portfolio` section body. */
export interface OrgPortfolioBody extends MermaidDiagram {
  capabilities?: Array<{ capability_id: string; name: string }>;
}

/** One row in a `derived_*` section (api_surface / data_models / services /
 *  hot_files / entry_points / external_deps). Rendered as a clickable linked
 *  table row, never as prose. Extra per-section columns ride the index
 *  signature. */
export interface DerivedItem {
  node_id: string;
  name: string;
  path?: string | null;
  headline?: string | null;
  kind: string;
  [key: string]: unknown;
}

/** body shape for every `derived_*` section. */
export interface DerivedItemsBody {
  items: DerivedItem[];
}

/** A list-key the paginated derived endpoint serves — one per Blueprint
 *  derived component section (repo: api_surface / data_models / entry_points /
 *  hot_files / external_deps; capability: services / domain_glossary). */
export type DerivedListKey =
  | "api_surface"
  | "data_models"
  | "entry_points"
  | "hot_files"
  | "external_deps"
  | "services"
  | "domain_glossary";

/** One page of a derived component list (`GET /v1/knowledge/derived`) — the
 *  WHOLE dataset paginated (not just the section's stored top-N), with the true
 *  `total` so the FE can render "page X of Y" + a 10/20/50/100 page-size
 *  selector. */
export interface DerivedListPage {
  items: DerivedItem[];
  total: number;
  offset: number;
  limit: number;
}

/** capability `domain_glossary` section body. */
export interface DomainGlossaryBody {
  items: Array<{
    node_id: string;
    name: string;
    headline?: string | null;
    kind: "glossary_term";
    aliases?: string[] | null;
  }>;
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
    /**
     * Stop ingestion — cancels an in-flight `ingest_repo` job for this
     * capability's repo. Same id args / path shape as `syncRepoKnowledge`,
     * with `:cancel` instead of `:sync`. Cooperative cancel: the endpoint
     * flips the in-flight progress row to `cancelled` and stamps
     * `current_sync_stage='cancelled'` for instant feedback; the worker
     * stops within a batch. Idempotent — `cancelled=false` when nothing
     * was running. Same auth/permission as Sync (403 surfaces as a toast).
     */
    repoCancelSync: (id: string, repoId: string) =>
      apiFetch<RepoCancelSyncResponse>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:cancel`,
        { method: "POST" },
      ),
    /**
     * Item 1 — resume a PAUSED ingest by SKIPPING the file whose dossier LLM
     * call failed. The file is appended to the skip-set (resolved WITHOUT the
     * LLM on the re-enqueued run — raw body if reasonable, else skipped) and
     * ingest re-queues. `resumed=false` is a no-op (nothing paused). To abort
     * instead, use `repoCancelSync` (it treats a paused row as in-flight).
     */
    repoSkipPausedFile: (id: string, repoId: string) =>
      apiFetch<RepoSkipFileResponse>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:skip-file`,
        { method: "POST" },
      ),
    /**
     * Batch 12k — re-run unresolved enrichment failures for a degraded
     * repo. ``kinds=null`` (or omitted) retries every kind; passing an
     * explicit subset narrows the work. Returns total counts +
     * per-kind histogram so the FE toast can summarise the result.
     */
    retryRepoEnrichments: (
      id: string,
      repoId: string,
      body?: { kinds?: ("embedding" | "summary" | "tag" | "glossary" | "layer")[] | null },
    ) =>
      apiFetch<{
        retried: number;
        succeeded: number;
        still_failed: number;
        by_kind: Record<string, { retried: number; succeeded: number; still_failed: number }>;
      }>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:retry-enrichments`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
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
    /** Phase D contract #3 — live staleness gate. Does a LIVE GitHub HEAD
     *  check; the repo page calls this on load and shows the Sync action
     *  ONLY when `is_stale` is true. `checked_live=false` → soft
     *  "couldn't verify" affordance. */
    repoSyncStatus: (id: string, repoId: string) =>
      apiFetch<RepoSyncStatus>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge/sync-status`,
      ),
    /** Phase D contract #4 — open pull requests for the repo's SCM. Renders
     *  the repo PR tab. `available=false` → "connect integration" empty
     *  state. */
    repoPullRequests: (id: string, repoId: string) =>
      apiFetch<RepoPullRequestsResponse>(
        `/v1/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/pull-requests`,
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
    // ``kind`` is the run track the BE routes on (``CreateRunIn.kind`` —
    // ``prd | implement | quickfix``); it selects the phase tree the runner
    // walks. The BE rejects an unknown/extra field with 422, so the body
    // must carry exactly the wire contract. A run created without a kind
    // never advances.
    create: (goal: string, capabilityId?: string, kind?: RunKind, proposalId?: string) =>
      apiFetch<Run>("/v1/runs", { method: "POST", body: JSON.stringify({ goal, capability_id: capabilityId ?? null, kind: kind ?? null, proposal_id: proposalId ?? null }) }),
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
    /**
     * Cancel a non-terminal run (queued / running / awaiting-gate). The BE
     * flips the durable `runs.status` to `cancelled`, writes the terminal
     * `run_status` SSE event, and the agent-worker driving the run reads the
     * cancelled status at its next phase boundary and stops — so the agent
     * does no further work, not just a greyed-out UI. The optional `reason`
     * is recorded on the cancel decision + surfaced in the terminal event.
     * Throws `ApiError` (409) when the run is already terminal.
     */
    cancel: (id: string, reason?: string) =>
      apiFetch<{ id: string; status: "cancelled"; cancelled_at: string }>(
        `/v1/runs/${encodeURIComponent(id)}/cancel`,
        { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
      ),
    /**
     * Permanently delete a TERMINAL run (and its events/decisions/gates,
     * which cascade at the DB). Irreversible — there is no soft-delete /
     * restore for runs. The BE 409s if the run is still active, so the UI
     * only offers Delete on a finished/cancelled run (`isRunDeletable`).
     * Resolves to void on the 204.
     */
    delete: (id: string) =>
      apiFetch<void>(`/v1/runs/${encodeURIComponent(id)}`, { method: "DELETE" }),
    // Gate approve/reject — canonical surface lives in `lib/api/gates.ts`
    // (FE-canonical `/close` per ADR-032 + §5.28). Import { approveGate,
    // rejectGate } from "@/lib/api/gates" directly at the call site; the
    // legacy `runs.approveGate`/`runs.rejectGate` wrappers that hit
    // `/approve` and `/reject` were deleted with the BE endpoints.
    prFeedback: (id: string) =>
      apiFetch<PrFeedbackItem[]>(`/v1/runs/${encodeURIComponent(id)}/pr-feedback`),
    /** Pre-existing lightweight list (TaskDecision shape) — kept as-is for the
     * decisions strip + SSE rail. F-04.7's pane uses `decisionsApi.list()`
     * below which returns the richer `RunDecisionRow[]`. */
    decisions: (id: string) =>
      apiFetch<TaskDecision[]>(`/v1/runs/${encodeURIComponent(id)}/decisions`),
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
      submit: (id: string, phaseKey: string, qid: string, answer: ClarificationAnswer) =>
        apiFetch<RunClarification>(
          `/v1/runs/${encodeURIComponent(id)}/phases/${encodeURIComponent(phaseKey)}/clarify/${encodeURIComponent(qid)}`,
          { method: "POST", body: JSON.stringify(answer) },
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
     * Per-phase document edit + improve. `save` persists a manual edit;
     * `improve` runs a synchronous LLM revision. Both key off the active
     * phase string and return the new `RunPhaseDocument` version.
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
      /**
       * Save a manual edit to the active phase's document. Returns the new
       * `RunPhaseDocument` version. The optional `revision_note` is stamped
       * onto the revision log.
       */
      save: (id: string, phase: string, body: { body_markdown: string; revision_note?: string }) =>
        apiFetch<RunPhaseDocument>(
          `/v1/runs/${encodeURIComponent(id)}/documents?phase=${encodeURIComponent(phase)}`,
          { method: "PUT", body: JSON.stringify(body) },
        ),
      /**
       * Ask Athena to revise the active phase's document from free-text
       * feedback. SYNCHRONOUS — the request runs an LLM call and may take
       * several seconds; callers must surface an in-flight state. Returns the
       * LLM-revised new `RunPhaseDocument` version.
       *
       * The optional `scope_capability_ids` / `scope_repo_ids` narrow the
       * revision to a selection of detected capabilities / blast-radius repos
       * — this is how the spec panel's `ScopeSelector` re-scopes the spec.
       */
      improve: (
        id: string,
        phase: string,
        body: {
          feedback_text: string;
          scope_capability_ids?: string[];
          scope_repo_ids?: string[];
        },
      ) =>
        apiFetch<RunPhaseDocument>(
          `/v1/runs/${encodeURIComponent(id)}/documents:improve?phase=${encodeURIComponent(phase)}`,
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
    /** Remove a BYO provider entirely (row + stored key). Role bindings
     *  that pointed at it fall back to the shared LiteLLM pool. 204 on
     *  success; 404 if it's already gone. */
    delete: (orgId: string, providerId: string) =>
      apiFetch<void>(
        `/v1/orgs/${encodeURIComponent(orgId)}/model-providers/${encodeURIComponent(providerId)}`,
        { method: "DELETE" },
      ),
  },
  llmProviders: {
    /** §7.8.1 — `GET /v1/llm/providers/catalog` returns the static
     *  14-provider catalog (Anthropic / OpenAI / Google / DeepSeek
     *  plus 10 free-tier aggregators). Backs the "Add provider"
     *  picker and the per-provider model checkbox list. */
    catalog: () =>
      apiFetch<CatalogProvider[]>(`/v1/llm/providers/catalog`),
    /** Platform default model per role — what each role resolves to when
     *  the org has no per-role override. Drives the "Platform default"
     *  baseline on /settings/models (and shows which model ingestion
     *  uses: the `workhorse-cheap` + `embeddings` rows). */
    roleDefaults: () =>
      apiFetch<RoleDefault[]>(`/v1/llm/role-defaults`),
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
  agentRoleBindings: {
    /** Every Athena agent with its effective LLM role + code default. The
     *  concrete model behind each role is configured on the role-routing
     *  card; this is purely the agent→role link. */
    list: (orgId: string) =>
      apiFetch<AgentRoleBinding[]>(
        `/v1/orgs/${encodeURIComponent(orgId)}/agent-role-bindings`,
      ),
    /** Set (upsert) the role one agent runs on. */
    put: (orgId: string, agentName: string, role: ModelRoleAlias) =>
      apiFetch<AgentRoleBinding>(
        `/v1/orgs/${encodeURIComponent(orgId)}/agent-role-bindings/${encodeURIComponent(agentName)}`,
        { method: "PUT", body: JSON.stringify({ role }) },
      ),
    /** Clear the override → revert the agent to its code default. */
    delete: (orgId: string, agentName: string) =>
      apiFetch<AgentRoleBinding>(
        `/v1/orgs/${encodeURIComponent(orgId)}/agent-role-bindings/${encodeURIComponent(agentName)}`,
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
    summary: (
      params: {
        month?: string;
        source?: CostBillingSource;
        // Inclusive ISO date window (YYYY-MM-DD). When omitted the BE defaults
        // to the running calendar month (legacy month-to-date behaviour).
        from?: string;
        to?: string;
        // Human label + preset key for the selected window — echoed back in
        // `range.label` so the header reads "This month" / "Last 30 days"
        // without the FE re-deriving it.
        label?: string;
        preset?: string;
      } = {},
    ) => {
      const sp = new URLSearchParams();
      if (params.month) sp.set("month", params.month);
      if (params.from) sp.set("from", params.from);
      if (params.to) sp.set("to", params.to);
      if (params.label) sp.set("label", params.label);
      if (params.preset) sp.set("preset", params.preset);
      // Only send a non-default source so the "All" view keeps clean URLs.
      if (params.source && params.source !== "all") sp.set("source", params.source);
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
    /** Per-sync-cycle ingestion cost for one repo (the per-repo drill-down on
     *  the cost dashboard). Honours the same from/to/source window as `summary`
     *  so the drill-down matches the rest of the page. */
    repoIngestCycles: (
      repoId: string,
      params: { from?: string; to?: string; source?: CostBillingSource } = {},
    ) => {
      const sp = new URLSearchParams();
      if (params.from) sp.set("from", params.from);
      if (params.to) sp.set("to", params.to);
      if (params.source && params.source !== "all") sp.set("source", params.source);
      const qs = sp.toString();
      return apiFetch<RepoIngestCycles>(
        `/v1/cost/repos/${encodeURIComponent(repoId)}/ingest-cycles${qs ? `?${qs}` : ""}`,
      );
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
    /**
     * Rewind a thread to (and including) `messageId`: deletes that message and
     * every message after it. Backs edit-and-resend (rewind the edited user
     * turn, then re-stream new text) and retry (rewind a dangling user turn
     * after a failed reply, then re-stream the same text). Returns 204.
     */
    rewind: (threadId: string, messageId: string) =>
      apiFetch<void>(`/v1/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/rewind`, {
        method: "POST",
      }),
    /** Rename a thread (PATCH /v1/chat/threads/{id}). Returns the updated row. */
    renameThread: (threadId: string, title: string) =>
      apiFetch<ChatThread>(`/v1/chat/threads/${encodeURIComponent(threadId)}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    /** Archive (soft-delete) a thread. DELETE /v1/chat/threads/{id} → 204. The
     *  row stops showing in the default list; messages are retained server-side. */
    deleteThread: (threadId: string) =>
      apiFetch<void>(`/v1/chat/threads/${encodeURIComponent(threadId)}`, {
        method: "DELETE",
      }),
  },
  knowledge: {
    /** Sampled knowledge-graph view. BE accepts `capability_id`, `repo_id`,
     *  `layer`, and `limit` (10..1000). Old call sites that pass only
     *  `capability_id` / `limit` keep working. */
    graph: (params: { capability_id?: string; repo_id?: string; layer?: string; limit?: number; rollup?: boolean } = {}) => {
      const sp = new URLSearchParams();
      if (params.capability_id) sp.set("capability_id", params.capability_id);
      if (params.repo_id) sp.set("repo_id", params.repo_id);
      if (params.layer) sp.set("layer", params.layer);
      if (params.limit != null) sp.set("limit", String(params.limit));
      if (params.rollup) sp.set("rollup", "true");
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
    /** Phase D contract #1 — node dossier. `GET /v1/knowledge/nodes/{id}`
     *  returns the full at-a-glance card for one KG node; every ref inside
     *  is a clickable node-id. Powers the shared `<NodeDossierDrawer>` that
     *  any node-id anywhere opens. */
    node: (nodeId: string) =>
      apiFetch<NodeDossierResponse>(`/v1/knowledge/nodes/${encodeURIComponent(nodeId)}`),
    /** On-demand 1-hop neighbourhood of a node — the topology explorer's
     *  click-to-expand source. `GET /v1/knowledge/nodes/{id}/neighbors`. The
     *  fan-out is capped server-side (`limit`, default 60) so a hub node can't
     *  return thousands; the FE merges + soft-caps on top. */
    neighbors: (nodeId: string, params: { limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (params.limit != null) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return apiFetch<NodeNeighbors>(
        `/v1/knowledge/nodes/${encodeURIComponent(nodeId)}/neighbors${qs ? `?${qs}` : ""}`,
      );
    },
    /** One page of a Blueprint derived component list — the WHOLE dataset,
     *  paginated. `GET /v1/knowledge/derived`. `scope` is the Blueprint scope
     *  (`repo` | `capability`); `list` selects the section (api_surface,
     *  services, …). Default page size 10; the FE offers 10/20/50/100. */
    derivedList: (params: {
      scope: "repo" | "capability";
      scopeId: string;
      list: DerivedListKey;
      offset?: number;
      limit?: number;
    }) => {
      const sp = new URLSearchParams({
        scope: params.scope,
        scope_id: params.scopeId,
        list: params.list,
      });
      if (params.offset != null) sp.set("offset", String(params.offset));
      if (params.limit != null) sp.set("limit", String(params.limit));
      return apiFetch<DerivedListPage>(`/v1/knowledge/derived?${sp.toString()}`);
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
      /** Deep regenerate — enqueues the agentic explorer (the blueprint
       * goes `building`; poll `getToc().status` until `ready`). Body must
       * include `confirm_slug` matching the capability's slug. */
      rebuild: (capabilityId: string, confirmSlug: string) =>
        apiFetch<BlueprintRebuildResult>(
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
        apiFetch<BlueprintRebuildResult>(
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
        apiFetch<BlueprintRebuildResult>(
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
