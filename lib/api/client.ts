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
/** localStorage key holding the active org id - exported so the SSE client
 *  (`lib/sse/event-stream.ts`) sends the SAME `X-Athena-Org-Id` the REST
 *  client does. Without it, a stream request resolved the user's DEFAULT
 *  org server-side and 404'd on any resource in a non-default org. */
export const ACTIVE_ORG_KEY = "athena.activeOrgId";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    /** §7.9 - structured error metadata. Some BE error envelopes (e.g.
     *  `seats_full`, `downgrade_blocked_active_members`,
     *  `seats_release_would_displace`) attach a per-code metadata object
     *  the FE renders into the user-facing message. Optional - most
     *  errors carry nothing here. */
    public metadata?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Matches an org-scoped path (`/v1/orgs/<uuid>/...` or `/v1/orgs/<uuid>:op`)
 *  and captures the org uuid. Used to PIN the `X-Athena-Org-Id` header to the
 *  org already in the URL, so the path and the header can never disagree - a
 *  mismatch makes the backend resolve a DIFFERENT active org (from a stale /
 *  cleared localStorage) and 403 with "Cross-org access denied" (ADR: the
 *  multi-org switch bug). The backend's `_check_org` enforces path==header on
 *  every such route, so pinning is always correct. */
const ORG_PATH_RE = /^\/v1\/orgs\/([0-9a-fA-F-]{36})(?=[/:?#]|$)/;

/** Exported for unit testing the path→header pinning rule. */
export function orgIdFromPath(path: string): string | undefined {
  return ORG_PATH_RE.exec(path)?.[1];
}

async function authHeaders(orgOverride?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (config.supabase.isConfigured()) {
    try {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Server-side render - no browser client available. Server
      // components should use the server-side supabase helper instead.
    }
  }
  // Active org: an explicit override (the org already in the request PATH)
  // wins over the persisted localStorage value, because the path is what the
  // backend checks the header against. Reading localStorage here lazily (after
  // the async getSession above) is exactly what let it drift out of sync with
  // the path during an org switch.
  const orgId =
    orgOverride ??
    (typeof window !== "undefined"
      ? window.localStorage.getItem(ACTIVE_ORG_KEY)
      : null);
  if (orgId) headers["X-Athena-Org-Id"] = orgId;
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

  const auth = await authHeaders(orgIdFromPath(path));

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Per-request end-to-end trace id. The backend binds it to every
        // structlog line + echoes it, and Caddy logs it, so a single id
        // traces one request across the whole system (FE → Caddy → API →
        // worker). Surfaced in the ops dashboard's Search & Trace.
        "X-Trace-Id": crypto.randomUUID(),
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

/**
 * Multipart upload for attachments. Distinct from `apiFetch` because the
 * browser must set the `multipart/form-data` boundary itself - we deliberately
 * do NOT send a `Content-Type` header here. Same auth + org + error envelope.
 */
export async function uploadAttachment(file: File): Promise<AttachmentOut> {
  if (config.isMock) {
    // Stub so mock-mode UI dev doesn't throw; the real parse/validate is BE-only.
    const isImage = file.type.startsWith("image/");
    return {
      id: crypto.randomUUID(),
      kind: isImage ? "image" : "document",
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      status: "ready",
    };
  }
  const auth = await authHeaders();
  const form = new FormData();
  form.append("file", file, file.name);
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/attachments`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "X-Trace-Id": crypto.randomUUID(), ...auth },
      body: form,
    });
  } catch {
    throw new ApiError(0, "network_error", "Athena API server is unreachable.");
  }
  if (!res.ok) {
    let code = "internal";
    let message = res.statusText || "Upload failed";
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // Non-JSON body
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as AttachmentOut;
}

/**
 * Fetch an attachment's bytes (with auth) and return an object URL for it.
 * The bytes are streamed from `GET /v1/attachments/{id}/content`; we render
 * via a `blob:` URL rather than a cross-origin object-store URL because the
 * app authenticates with Bearer tokens (an `<img src>` to a presigned URL
 * can't carry that) and the CSP `img-src` allows `blob:`. Caller must
 * `URL.revokeObjectURL` the result when done.
 */
export async function fetchAttachmentBlobUrl(id: string): Promise<string> {
  const auth = await authHeaders();
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/attachments/${encodeURIComponent(id)}/content`, {
      credentials: "include",
      headers: { ...auth, "X-Trace-Id": crypto.randomUUID() },
    });
  } catch {
    throw new ApiError(0, "network_error", "Athena API server is unreachable.");
  }
  if (!res.ok) {
    throw new ApiError(res.status, "attachment_fetch_failed", "Couldn't load the attachment.");
  }
  return URL.createObjectURL(await res.blob());
}

/** Input for a domain Sources-tab upload. Exactly one of `file` / `url` /
 *  `note` is meaningful per `kind`; `title` + `tags` are optional metadata. */
export interface UploadResourceInput {
  kind: "file" | "link" | "note";
  file?: File;
  url?: string;
  note?: string;
  title?: string;
  tags?: string[];
}

/**
 * Multipart upload for a domain resource (Sources tab). Mirrors
 * `uploadAttachment`: the browser sets the `multipart/form-data` boundary, so
 * we deliberately do NOT send a `Content-Type` header. The backend extracts +
 * indexes the content synchronously and returns the indexed row.
 */
export async function uploadDomainResource(
  domainId: string,
  input: UploadResourceInput,
): Promise<DomainResource> {
  if (config.isMock) {
    // Multipart never goes through the JSON mock transport, so we both build
    // the row AND persist it to the in-memory mock db so a follow-up
    // `listResources` reflects the upload (matching the real BE).
    const created: DomainResource = {
      id: `res_${crypto.randomUUID().slice(0, 8)}`,
      title:
        input.title ??
        input.file?.name ??
        input.url ??
        (input.note ? input.note.split("\n")[0] : "Note") ??
        "Untitled",
      kind: input.kind,
      source: input.file?.name ?? input.url ?? "Pasted note",
      format: input.kind === "note" ? "Markdown" : input.kind === "link" ? "Link" : "File",
      uploaded_by: "You",
      uploaded_at: new Date().toISOString(),
      status: "indexed",
      nodes_generated: 1,
      summary: input.note ?? input.url ?? input.file?.name ?? "",
      tags: input.tags ?? [],
      last_used: null,
    };
    const { domainResources } = await import("./mock/db");
    // Assign a NEW array (not in-place unshift): the mock GET returns this
    // reference, and React's `setResources` bails out on an unchanged
    // reference - a fresh array guarantees the list + tab badge re-render.
    domainResources[domainId] = [created, ...(domainResources[domainId] ?? [])];
    return created;
  }
  const auth = await authHeaders();
  const form = new FormData();
  form.append("kind", input.kind);
  if (input.file) form.append("file", input.file, input.file.name);
  if (input.url) form.append("url", input.url);
  if (input.note) form.append("note", input.note);
  if (input.title) form.append("title", input.title);
  if (input.tags && input.tags.length) form.append("tags", input.tags.join(","));
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/v1/domains/${encodeURIComponent(domainId)}/resources`,
      {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "X-Trace-Id": crypto.randomUUID(), ...auth },
        body: form,
      },
    );
  } catch {
    throw new ApiError(0, "network_error", "Athena API server is unreachable.");
  }
  if (!res.ok) {
    let code = "internal";
    let message = res.statusText || "Upload failed";
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // Non-JSON body
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as DomainResource;
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
  /** §5.31 - set when the org is soft-deleted. Optional so older BE
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
  /** Effective org-level permission strings for the ACTIVE org -
   * resolved server-side from the org's role rows (owner → all).
   * Optional so older BE builds + mock stay type-safe. */
  permissions?: string[];
  server_time: string;
  memberships: MembershipOut[];
  /** §6.1 - when `true`, this Athena instance is running in dev mode:
   * cost is tracked but budget enforcement is bypassed, Razorpay billing
   * returns a synthetic subscription, and new orgs default to the
   * enterprise edition. The TopBar renders a "Free dev access" chip
   * whenever this is true so the operator never wonders whether they're
   * being billed. Optional so older BE builds (and mock) that didn't
   * yet plumb the flag are still type-safe - undefined is treated as
   * production (no badge). */
  dev_unrestricted_access?: boolean;
  /** Deployment feature flags the FE adapts copy/surfaces to.
   * `mcp_server` - the inbound /mcp mount for coding agents is live
   * (Settings → Integrations → Coding agents can mint + connect).
   * `subscription_mcp_bridge` - subscription-chat turns are
   * workspace-grounded via MCP, so the "chat only, no workspace tools"
   * caveats flip to "grounded via MCP". Optional for older BE builds. */
  features?: {
    mcp_server?: boolean;
    subscription_mcp_bridge?: boolean;
  };
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
  /** §5.31 - soft-delete metadata. Both NULL when live. The owner sees
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
 * §5.4 row-3 - invitation mode. `'email'` is the legacy flow (mint + send
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

export interface Domain {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  created_by_user_id: string | null;
  archived_at: string | null;
  created_at: string;
  /** Accent color key for the emblem - one of: violet, cyan, amber, indigo, rose, mint. */
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
  /** The CALLER's effective domain permissions (keys match the `domain`
   * half of `api.roles.catalog`). Populated only on the detail GET -
   * `[]` means read-only access. Gate per-surface controls on this,
   * not on org role names. */
  caller_permissions?: string[] | null;
}

/** §5.31 - full org-scoped repo view returned by the new `/v1/repos` endpoints. */
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
  /** Domain ids currently joining this repo. Used to render
   *  the blast-radius hint on the soft-delete dialog + the trash row's
   *  child summary. */
  attached_domain_ids: string[];
}

/** §5.31 list filter - `false` (default live), `true` (live + deleted),
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
/** ``paused`` (item 1) - a per-file dossier LLM call exhausted its retries and
 *  the ingest stopped to ask the user: skip this file (resolve it WITHOUT the
 *  LLM, then resume) or cancel. The FE renders the file + error with
 *  **Skip this file** / **Cancel** buttons. */
/** ``degraded`` (Batch 12k) - the ingest finished but at least one
 *  per-file LLM enrichment fell through (embedding / summary / tag /
 *  glossary). The KG is usable but missing signal; the FE renders a
 *  yellow chip + a "Retry enrichments" button that calls
 *  ``POST /v1/domains/{cap}/repos/{repo}/knowledge:retry-enrichments``. */

/** §3.13 row 1 - one snapshot of an ingest attempt for the FE timeline.
 *  ``duration_ms`` is null only while the attempt is still in flight AND
 *  ``completed_at`` is null - the BE projects (now - started_at) for
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
  /** Elapsed for the CURRENT attempt only (re-stamped each run) - the FE shows
   *  this as "running for X" so a retry doesn't inflate to the cumulative
   *  ``duration_ms`` (which counts from the first attempt at this sha). Null
   *  only when the attempt start is unknown. */
  attempt_duration_ms: number | null;
  files_total: number | null;
  files_processed: number | null;
  last_processed_path: string | null;
  error: string | null;
  /** Pause (item 1): the file whose dossier LLM call failed - shown in the
   *  skip/cancel dialog. Non-null only while ``stage === "paused"``. */
  paused_path?: string | null;
  /** Pause: WHY it paused - the underlying LLM error (rate limit / quota /
   *  auth / …), surfaced so the user knows the reason, not just the file. */
  paused_error?: string | null;
  /** Pause discriminator: `file_llm` (a per-file dossier LLM call failed - the
   *  FE shows skip/cancel) vs `budget` (workspace AI credits exhausted / spend
   *  cap / models kill switch - the FE shows top-up / switch-to-BYOK
   *  remediation). Null on legacy rows reads as the file-LLM pause. */
  paused_reason?: string | null;
}

/** §3.13 row 1 - ``GET /v1/repos/{repo_id}/ingest-progress`` envelope.
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

/** ADR-086 - the per-repo build+test sandbox recipe. */
export interface SandboxSpec {
  base_image: string;
  install_commands: string[];
  build_command: string | null;
  test_command: string | null;
  test_select_cmd: string | null;
  working_subdir: string | null;
  env: Record<string, string>;
  resource_profile: "default" | "large";
}

export interface SandboxConfig {
  id: string;
  repo_id: string;
  status: string;
  spec: SandboxSpec;
  created_at: string;
  updated_at: string;
}

export interface SandboxConfigInput {
  spec: SandboxSpec;
  status?: "configured" | "disabled";
}

export interface SandboxDetect {
  spec: SandboxSpec;
  confidence: "high" | "medium" | "low";
  low_confidence_fields: string[];
  detect_signature: string | null;
  note: string;
}

export interface SandboxStatus {
  state: "disabled" | "unconfigured" | "configured";
  feature_enabled: boolean;
  tier_eligible: boolean;
  has_config: boolean;
  /** Latest warm-image build state: null (never built) | building | ready | failed. */
  snapshot_status: string | null;
  snapshot_built_at: string | null;
  /** Human-facing reason when snapshot_status is "failed" (e.g. a flagged secret). */
  snapshot_error: string | null;
  message: string;
}

export interface SandboxBuild {
  status: "building";
  job_id: string;
}

export interface DomainRepo {
  id: string;
  domain_id: string;
  integration_id: string;
  repo_full_name: string;
  default_branch: string;
  attached_by_user_id: string | null;
  created_at: string;
  /** Branch SHA of the last successful KG build. NULL = never synced. */
  last_indexed_sha?: string | null;
  /** Current default-branch HEAD per most-recent webhook or sync. */
  branch_head_sha?: string | null;
  /** §5.29.11 / B7.2 - timestamp of the most recent sync enqueue. */
  last_sync_attempt_at?: string | null;
  /** One of the in-flight stages, `completed`, `degraded`, `failed`,
   *  `cancelled` (Stop ingestion stamps this for instant FE feedback), or
   *  null when idle. */
  current_sync_stage?: SyncStage | "cancelled" | null;
  /** Computed on-demand at sync time; not pre-computed on list. */
  commits_behind?: number | null;
  /** §5.31 - underlying `repos.id` (one row per `(org, integration, full_name)`)
   *  so the per-row "Delete repo" CTA can hit `api.repos.softDelete(repo_id)`.
   *  NULL during expand-migrate transition. */
  repo_id?: string | null;
  /** §5.31 - `repos.deleted_at` joined in. Drives the Deleted chip on the
   *  per-cap Repos tab. */
  repo_deleted_at?: string | null;
}

export interface DomainResource {
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

export interface DomainConfig {
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

// ──────────────────────────────────────────────────────────────────────────
// Product-Work - the recursive Task spine (supersedes the run/phase model).
// FE is the source of truth for these wire shapes (ADR-032); the BE /v1/tasks
// routers mirror them. See athena-docs/09-roadmap/product-work-rebuild.md §7.
// ──────────────────────────────────────────────────────────────────────────

export type TaskType =
  | "feature"
  | "implementation"
  | "design"
  | "bug"
  | "incident"
  | "spike"
  | "chore"
  | "test";

/** Board columns bucket these statuses. `triage` is the entry status for
 *  `bug` / `incident`. */
export type TaskStatus =
  | "backlog"
  | "triage"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** Cached delivery-risk derivation (server-computed from unmet deps / budget /
 *  due date / staleness). `at_risk` and `blocked` are the at-a-glance lenses. */
export type TaskHealth = "on_track" | "at_risk" | "blocked";

/** Why a task was removed from the board. `done` is a status (a real outcome),
 *  so the cancel reasons are the two "won't finish" cases. */
export type TaskCancelReason = "not_needed" | "obsolete";

export interface Task {
  id: string;
  /** Human-facing short id ("FEAT-12") - per-type, per-org, never recycled.
   *  This is what every surface shows; the UUID stays the routing identity. */
  display_id: string;
  org_id: string;
  /** Top-level scope (the renamed Capability). Null = unscoped / inbox. */
  domain_id: string | null;
  type: TaskType;
  /** Recursion - the parent in the task tree. Null at the top level. */
  parent_id: string | null;
  /** Coordination graph (task_deps) resolved onto the task. */
  depends_on: string[];
  blocks: string[];
  owner_user_id: string | null;
  /** `"athena"` sentinel = AI-owned; otherwise a user id. */
  assignee: string;
  /** When on, Athena auto-clears intermediate hard gates and chains the next
   *  stage; the final hard gate of each rail still needs a human. Also unlocks
   *  the elevated MCP gate-control tools (approve / request-changes / reopen)
   *  for this task. Default off. */
  auto_approve: boolean;
  /** Parent-level cascade switch. When on, every new child task created under
   *  this task (directly or transitively) inherits `auto_approve=true` and
   *  `auto_approve_descendants=true` at birth, and toggling on also propagates
   *  the same two booleans onto every existing descendant in one server
   *  transaction. Toggling off stops future inheritance but leaves existing
   *  descendants alone. Default off. */
  auto_approve_descendants: boolean;
  title: string;
  /** Markdown problem / description. */
  body: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  /** Optional delivery target (ISO date, no time). Drives the due / overdue
   *  chip on the board card. */
  target_date: string | null;
  /** Cached delivery-risk lens (at_risk / blocked surface on the card). */
  health: TaskHealth | null;
  /** Why a cancelled task was removed from the board (null otherwise). */
  cancel_reason: TaskCancelReason | null;
  /** Self spend; the subtree rollup is computed server-side. Null when the
   *  caller lacks `cost:read` (cost visibility is leadership-only). */
  spent_usd: number | null;
  budget_usd: number | null;
  /** SSE endpoint for this task's merged event stream. */
  stream_url: string;
  artifact_ids: string[];
  run_ids: string[];
  child_ids: string[];
  /** Child-status rollup over the direct children. Done = status `done`;
   *  blocked = status `blocked`; a cancelled child counts in the total only. */
  children_total: number;
  children_done: number;
  children_blocked: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A task with its children inlined - the `/v1/tasks/{id}/tree` shape. */
export interface TaskTreeNode extends Task {
  children: TaskTreeNode[];
}

/** One column of the kanban board (`GET /v1/domains/{id}/board`). */
export interface KanbanColumn {
  status: TaskStatus;
  tasks: Task[];
  total: number;
}

export interface TaskCreateInput {
  type: TaskType;
  title: string;
  body?: string;
  domain_id?: string | null;
  parent_id?: string | null;
  priority?: TaskPriority | null;
  /** Optional delivery target (ISO date). */
  target_date?: string | null;
  assignee?: string;
  depends_on?: string[];
  budget_usd?: number | null;
  /** Ids from `api.attachments.upload` to attach to the task brief. Documents
   *  fold into every stage's brief as text; images show to a stage when its
   *  model supports vision. */
  attachment_ids?: string[];
}

export type TaskPatchInput = Partial<{
  title: string;
  body: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  target_date: string | null;
  owner_user_id: string | null;
  assignee: string;
  domain_id: string | null;
  budget_usd: number | null;
  auto_approve: boolean;
  /** Parent-level cascade. Setting `true` ALSO propagates `auto_approve=true`
   *  + `auto_approve_descendants=true` onto every existing descendant in one
   *  server transaction. Setting `false` only flips this task's flag - it does
   *  not un-cascade descendants. */
  auto_approve_descendants: boolean;
}>;

/** Filters the kanban board endpoint accepts (`GET /v1/tasks/board`). The
 *  `done` column is windowed server-side, so the board stays the live work. */
export interface TaskBoardParams {
  domain_id?: string;
  type?: TaskType;
  priority?: TaskPriority;
  health?: TaskHealth;
  assignee?: string;
  /** "My tasks" fence - a user id (owner OR creator). */
  mine?: string;
  q?: string;
}

/** Filters for the completed-work history (`GET /v1/tasks/history`). */
export interface TaskHistoryParams {
  domain_id?: string;
  type?: TaskType;
  q?: string;
  limit?: number;
  offset?: number;
}

/** The signed-in user's personal queue (`GET /v1/tasks/my-work`), pre-bucketed
 *  and pre-ordered server-side (priority then due date). `on_you` = parked
 *  in_review awaiting your sign-off; `up_next` folds todo/triage/backlog;
 *  `watching` = tasks you follow that you don't own. */
export interface MyWork {
  on_you: Task[];
  in_progress: Task[];
  blocked: Task[];
  up_next: Task[];
  watching: Task[];
}

/** Whether the current user watches a task (`/v1/tasks/{id}/watch`). */
export interface WatchState {
  watching: boolean;
}

/** Live task counts bucketed by status (`GET /v1/tasks/count`) - the cheap
 *  badge feed (no row bodies fetched). */
export interface TaskCounts {
  by_status: Record<string, number>;
  total: number;
}

/** Artifact kinds a task produces (backend `task_registry.py`) - each stage's
 *  primary deliverable plus its subphase working kinds (stage-merge redesign:
 *  e.g. feature/define saves framing_note + research_brief, then ships the
 *  prd). Every hard gate has a primary kind (something concrete to sign off);
 *  no kind repeats within a type (unambiguous upstream reads). `ThreadEntry`'s
 *  artifact_ref references this. */
export type ArtifactKind =
  | "grounding_pack"
  | "framing_note"
  | "research_brief"
  | "prd"
  | "subtask_plan"
  | "change_manifest"
  | "diff_set"
  | "pull_request"
  | "pr_build_fix"
  | "design_doc"
  | "design_handoff"
  | "repro_note"
  | "root_cause"
  | "fix_plan"
  | "mitigation"
  | "postmortem"
  | "recommendation"
  | "work_note"
  | "verification"
  | "test_plan"
  | "test_report";

export type ThreadEntryKind =
  | "agent_message"
  | "user_message"
  | "steer"
  | "input_request"
  | "input_answer"
  | "decision"
  | "artifact_ref"
  | "approval"
  | "rejection";

/** A clarification/decision request the agent surfaces in the thread. Only
 *  hard gates set `blocking`; everything else is non-blocking (the run keeps
 *  going and folds the answer in at its next turn boundary). */
/** A widget the clarify card renders one of per question. `single_select` /
 *  `multi_select` carry `options`; the rest do not. */
export type ClarifyQuestionType =
  | "text"
  | "single_select"
  | "multi_select"
  | "boolean"
  | "number";

/** One typed clarifying question the agent asked via `ask_user`. */
export interface ClarifyQuestion {
  id: string;
  prompt: string;
  type: ClarifyQuestionType;
  options?: { id: string; label: string }[];
  required?: boolean;
}

/** One human answer to a typed clarify question - exactly one value field set
 *  per `question.type`. */
export interface ClarifyAnswerItem {
  question_id: string;
  choice_id?: string;
  choice_ids?: string[];
  boolean?: boolean;
  numeric?: number;
  text?: string;
}

export interface ThreadInputRequest {
  request_id: string;
  question_kind: string;
  question: string;
  options?: { id: string; label: string }[];
  blocking: boolean;
  /** Set when this request IS a stage hard gate - resolved in the stage panel
   * (approve / request changes), never answered through the thread. */
  gate_key?: string | null;
  /** The clarify checkpoint (`question_kind: "clarification"`): the batched
   * questions and the stage that paused on them - rendered as the question
   * card on that stage's panel; answering resumes Athena. */
  questions?: string[] | null;
  /** The TYPED questions (single_select / multi_select / boolean / number /
   *  text) the card renders one widget each for. `questions` is the
   *  plain-prompt fallback for older payloads that predate typing. */
  items?: ClarifyQuestion[] | null;
  stage?: string | null;
}

export interface ThreadInputAnswer {
  request_id: string;
  choice_id?: string;
  choice_ids?: string[];
  boolean?: boolean;
  free_text?: string;
  numeric?: number;
  references?: string[];
  confirmed?: boolean;
  rationale?: string;
  /** Per-question typed answers to a clarify checkpoint (one per
   *  `input_request.items`). The backend resolves these to readable Q/A text
   *  for the resumed stage brief. */
  answers?: ClarifyAnswerItem[];
  /** Files to include with this answer (documents as text; images on a
   *  vision-capable stage). */
  attachment_ids?: string[];
}

export interface ThreadArtifactRef {
  artifact_id: string;
  kind: ArtifactKind;
}

/** One entry in a task's non-blocking thread (the clarification system
 *  generalized). Ordered by `seq` within a task. */
export interface ThreadEntry {
  id: string;
  task_id: string;
  seq: number;
  kind: ThreadEntryKind;
  /** `external_agent` = a coding agent working over MCP (the entry's
   *  `body.actor_label` carries its display name, e.g. "Claude Code"). */
  author_kind: "agent" | "user" | "system" | "external_agent";
  author_id: string | null;
  body: string | null;
  /** The gate this decision belongs to (`"{stage_key}_signoff"`) on
   *  approval/rejection/decision entries - lets the cockpit pre-fill a stage's
   *  re-run steer with the note from the last "request changes" on it. */
  gate_key?: string | null;
  created_at: string;
  /** Present on `input_request` entries. */
  status?: "pending" | "answered" | "skipped";
  input_request?: ThreadInputRequest | null;
  input_answer?: ThreadInputAnswer | null;
  artifact_ref?: ThreadArtifactRef | null;
}

// ── Transparency: stage rail, work ledger, provenance, related artifacts ──────
// Everything captured for the agent's context is reachable here so the cockpit
// can surface it seamlessly (no black box). See product-work-driver-design.md §9/§10.

/** One of a stage's saved subphase outputs (stage-merge redesign) - rendered
 *  as a tab next to the primary artifact. */
export interface WorkingArtifact {
  artifact_id: string;
  kind: string;
  version: number;
}

/** One stage in the cockpit rail - registry static spec + stored FSM state. */
export interface TaskStage {
  stage_key: string;
  title: string;
  ordinal: number;
  action: string;
  artifact_kind: string | null;
  /** `hard` = a blocking human gate; `soft` = auto-advances on success. */
  gate: "hard" | "soft";
  /** `waiting` = the clarify checkpoint - Athena paused on batched questions;
   *  answering them resumes the stage. */
  status:
    | "locked"
    | "ready"
    | "running"
    | "waiting"
    | "in_review"
    | "approved"
    | "rejected"
    | "failed";
  artifact_id: string | null;
  gate_input_id: string | null;
  /** WHO is driving a `running` stage: `athena` (internal worker) or
   *  `external` (a coding agent over MCP). Optional for older BE builds
   *  - undefined reads as `athena`. */
  executor_kind?: "athena" | "external";
  /** Display label of the external executor ("Claude Code"); null/absent
   *  when Athena's own worker drives the stage. */
  executor_label?: string | null;
  /** The stage's declared subphase output kinds (stage-merge redesign). */
  working_kinds?: string[];
  /** May the internal agent pause on clarifying questions mid-run? */
  clarify?: boolean;
  /** Saved subphase documents - populated on the rail fetch. */
  working_artifacts?: WorkingArtifact[];
}

/** One entry of the "Context loaded" strip - EXACTLY what the stage agent's
 *  brief carries for this source (same gather + caps as the backend driver). */
export interface ContextSource {
  key: string;
  label: string;
  present: boolean;
  kind?: string | null;
  artifact_id?: string | null;
  version?: number | null;
  detail?: string | null;
}

/** A compact provenance pointer - addresses detail in its natural home; the body
 *  is fetched on demand, never carried inline. */
export interface Ref {
  kind:
    | "artifact"
    | "document"
    | "prd"
    | "kg_node"
    | "file"
    | "repo"
    | "thread_input"
    | "task"
    | "run"
    | string;
  id: string;
  label?: string | null;
}

/** One work-ledger row - the visible record of what the agent actually did at
 *  one step (the foldable worklog's detail-on-expand). Refs only, never bodies. */
export interface LedgerStep {
  id: string;
  stage_key: string;
  seq: number;
  /** plan | reason | retrieve | read | draft | write | delegate | tool_call |
   *  tool_result */
  kind: string;
  tool_name: string | null;
  summary: string;
  input_refs: Ref[];
  output_refs: Ref[];
  status: "ok" | "error" | string;
  call_id: string | null;
  /** External-executor attribution ("Claude Code"); null/absent = Athena. */
  actor_label?: string | null;
  created_at: string;
}

/** One provenance bucket of a task's token usage. `internal` = Athena-run
 *  LLM calls (real provider-reported usage); `client_measured` = EXACT counts
 *  a coding-agent hook read from its own session transcript (the real meter -
 *  ADR-089); `measured_mcp_io` = server-side metering of an external executor's
 *  MCP tool-call traffic (a deterministic floor - Athena counts what it
 *  served/received); `self_reported` = the external agent's own estimate (it
 *  can't see its real meter - treat as approximate). */
export interface TaskUsageSource {
  source:
    | "internal"
    | "client_measured"
    | "measured_mcp_io"
    | "self_reported"
    | string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Token totals for one task, split by provenance - the cockpit's token
 *  readout next to the cost (`GET /v1/tasks/{id}/usage`). */
export interface TaskUsage {
  task_id: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  spent_usd: number;
  by_source: TaskUsageSource[];
  /** Tokens from EXACT-grade provenance only (`internal` + `client_measured`).
   *  The cockpit shows THIS as the headline when an exact bucket exists - never
   *  the all-bucket `total_tokens`, because the `measured_mcp_io` floor and the
   *  `self_reported` estimate overlap the exact transcript count, so adding them
   *  would double-count and inflate a number labelled "exact". */
  exact_total_tokens: number;
  /** List-price equivalent of the EXACT `client_measured` external work -
   *  DISPLAY ONLY. The org paid $0 (the user's own AI subscription did), so
   *  this is NOT part of `spent_usd` or any credit roll-up. `0` when no exact
   *  usage was reported (e.g. the agent has no usage hook installed). */
  equivalent_usd: number;
}

/** A pointer to an artifact produced by a related task (parent/sibling/child/
 *  dependency) - the "Related" affordance. Body pulled on demand. */
export interface RelatedArtifact {
  artifact_id: string;
  kind: string;
  task_id: string;
  title: string | null;
  relation: "parent" | "child" | "sibling" | "dependency" | string;
}

/** A compact summary of a child task (a decompose's subtask) - so the cockpit
 *  and the tree view show what a subtask IS (title/type/status + who owns/works
 *  it), not a bare id. `has_children` drives the tree's expand chevron without
 *  eagerly loading the grandchildren. */
export interface TaskChild {
  id: string;
  /** Human-facing short id ("IMPL-3"). */
  display_id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  /** Executor - `"athena"` or a user id. */
  assignee: string;
  /** Human owner (accountable / gates the work); null = unassigned. */
  owner_user_id: string | null;
  has_children: boolean;
}

/** A direct subtask in execution (topological) order, marked Ready or Waiting on
 *  its unmet dependencies (`GET /v1/tasks/{id}/subtree`). The dependency-aware
 *  view the cockpit's subtask panel renders. */
export interface SubtaskNode {
  id: string;
  /** Human-facing short id ("IMPL-3"). */
  display_id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  /** True when every task it depends on is done - startable now. */
  ready: boolean;
  /** Task ids this subtask depends on. */
  depends_on: string[];
  /** The not-yet-done dependencies (the "Waiting on …" reasons), as linkable
   *  pairs. `display_id` is null only when the blocking task row is gone. */
  blocked_by: { id: string; display_id: string | null; title: string }[];
}

/** A coordination edge to add/remove: this task waits on `depends_on_task_id`.
 *  `blocks` = a hard "must land first"; `relates` = a soft link. */
export interface TaskDependencyInput {
  depends_on_task_id: string;
  kind?: "blocks" | "relates";
}

/** A task's current coordination edges by id - what it waits on (`depends_on`)
 *  and what waits on it (`blocks`). */
export interface TaskDependencies {
  depends_on: string[];
  blocks: string[];
}

/** A compact provenance pointer (the "Based on") - `{kind, id, label?}`. */
export interface SourceRef {
  kind: string;
  id: string;
  label?: string;
}

/** An AI-proposed follow-up task awaiting the user's decision (`GET
 *  /v1/tasks/{id}/suggestions`). It is a proposal - the rationale + source it is
 *  grounded in - NOT a task, until accepted. */
export interface TaskSuggestion {
  id: string;
  proposed_type: TaskType;
  proposed_title: string;
  proposed_body: string;
  /** Why Athena proposes this - shown verbatim (legible, never magic). */
  rationale: string;
  /** The artifact(s) the rationale is grounded in. */
  source_refs: SourceRef[] | null;
  created_at: string;
}

/** Accept a suggestion, optionally editing the title/scope first. Omit both to
 *  accept the proposal verbatim. */
export interface AcceptSuggestionInput {
  title?: string;
  body?: string;
}

// ── AI-optional: the manual path (a task never depends on Athena AI) ──────────
// Every stage can be driven by hand - author/edit the artifact, submit it, gate
// it - with no AI run at all. See product-work-driver-design.md §11.

/** User-authored artifact content for a stage. `kind` defaults to the stage's
 *  registry artifact kind. */
export interface StageArtifactInput {
  body: string;
  kind?: string | null;
}

export interface StageGateInput {
  decision: "approve" | "reject";
  note?: string | null;
}

/** How hard Athena works one stage run - the effort dial picked next to the
 *  model. Drives the agent's tool-call budget (fast 20 · medium 40 · high 100 ·
 *  max 200 · unrestricted) and, at high+, whether it may offload read-only
 *  mini-tasks to guardrailed sub-agents. */
export type EffortLevel = "fast" | "medium" | "high" | "max" | "unrestricted";

/** Optional steer + per-action model + effort carried into an AI stage run
 *  (`api.tasks.runStage`). The agent reads `steer` before it begins;
 *  `model_provider`/`model_id` are the user's `<ModelSelector>` pick (both or
 *  neither) - omit to run on the action's default model; `effort` omitted runs
 *  at the default level. */
export interface StageRunInput {
  steer?: string;
  model_provider?: string;
  model_id?: string;
  /** Which picker rung the model was picked from - `"athena"` (platform
   *  credit) or `"byok"` (the org's key). Same pair can be on both rungs;
   *  the rung decides billing. Omit on legacy/default picks. */
  model_source?: "athena" | "byok";
  effort?: EffortLevel;
  /** Files to fold into this run's brief (documents as text; images on a
   *  vision-capable model). */
  attachment_ids?: string[];
}

/** Ask Athena to change a stage's existing artifact - the design-playground
 *  "edit by asking AI" loop (`api.tasks.refineStage`). `instruction` is the
 *  change requested (the cockpit scopes it to a clicked element when one is
 *  picked); a settled stage is reopened and re-run, an approved edit re-derives
 *  downstream. `model_provider`/`model_id`/`effort` mirror the run path. */
export interface StageRefineInput {
  instruction: string;
  model_provider?: string;
  model_id?: string;
  /** The picker rung - mirrors `StageRunInput.model_source`. */
  model_source?: "athena" | "byok";
  effort?: EffortLevel;
}

/** Scoped, token-frugal edit: rewrite ONLY the selected fragment of a stage
 *  artifact (`api.tasks.editSpan`) - the "select a part, ask AI to change just
 *  that part" loop. The cockpit sends the selected text + a little surrounding
 *  context; the model returns just the rewritten fragment, which the editor
 *  splices back in place (no stage reopen / re-run). `model_*`/`effort` mirror
 *  the run path so the user picks how hard / on which model the edit runs. */
export interface ArtifactEditSpanInput {
  selection: string;
  instruction: string;
  context_before?: string;
  context_after?: string;
  model_provider?: string;
  model_id?: string;
  model_source?: "athena" | "byok";
  effort?: EffortLevel;
}

/** The rewritten fragment the cockpit splices over the selection. */
export interface ArtifactEditSpanResult {
  replacement: string;
}

/** Advisory build+test evidence from the execution sandbox (ADR-086), paired
 *  with the execution `diff_set`. ADVISORY only - CI stays authoritative and the
 *  human gate is unchanged. Absent => the diff is reviewed exactly as before. */
export interface SandboxResult {
  status: "green" | "red" | "budget_exhausted" | "degraded" | "error";
  build_passed: boolean | null;
  tests_total: number | null;
  tests_passed: number | null;
  tests_failed: number | null;
  iterations: number;
  /** verified | not_verified | tests_red | no_tests | no_baseline | degraded */
  change_coverage: string;
  build_log_tail: string;
  test_log_tail: string;
}

/** The working (latest) body of one stage artifact - what the artifact card
 *  renders. The AI only ever uses this working version; the older revisions in
 *  `artifactVersions` are never fed into agent context. */
export interface ArtifactDetail {
  artifact_id: string;
  kind: string;
  version: number;
  /** Markdown body (rendered through `CitationRenderer` for `kn://`/`repo://`
   *  chips). */
  body: string;
  who_kind: string;
  created_at: string;
  /** Athena's self-assessed certainty (0-1) in this working version + the
   *  one-line reason behind it, surfaced by the corner `<ConfidenceBadge>`.
   *  `null`/absent on human-authored or pre-feature revisions (no badge). */
  confidence_score?: number | null;
  confidence_reason?: string;
  /** Present only on the execution `diff_set` when a sandbox run attached one. */
  sandbox_result?: SandboxResult | null;
}

/** One version of an artifact (a documents revision) - the human version history.
 *  The AI only ever uses the working (latest) version; old versions are never fed
 *  into agent context. Editing an approved artifact mints a new version and
 *  re-derives downstream artifacts into new versions. */
export interface ArtifactVersion {
  version: number;
  who_kind: string;
  who_id: string | null;
  created_at: string;
}

/** One historical version WITH its body - the compare/rollback read behind
 *  the version-history "View" affordance. Never in agent context. */
export interface ArtifactVersionDetail {
  version: number;
  body: string;
  who_kind: string;
  created_at: string;
}

// ── Model-per-action selection (replaces the agent→role→model layer) ───────

/** The model a user picked for one AI action. Composite - model ids are not
 *  unique across providers, so the provider always rides along. `source` is
 *  WHICH picker rung it was picked from: the same (provider, model) can be
 *  offered both Athena-hosted and on the org's saved key, and the rung
 *  decides billing (platform credit vs the org key). Optional for
 *  backward-compat with persisted selections predating the rung split. */
export interface ModelSelection {
  provider: string;
  model: string;
  source?: "athena" | "byok" | "subscription";
}

/** One model the org has switched on - the `<ModelSelector>` data source. */
export interface EnabledModel {
  id: string;
  provider: string;
  display_name: string;
  /** `"athena"` = platform-hosted, credit-gated; `"byok"` = the org's own key,
   *  SDK-direct, billed to the org; `"subscription"` = the CURRENT USER's own
   *  Claude/ChatGPT plan via its vendor CLI - personal, chat-only (no
   *  workspace tools), never offered on task surfaces. */
  source: "athena" | "byok" | "subscription";
  supports_tools: boolean;
  supports_vision: boolean;
  thinking: boolean;
  thinking_optional: boolean;
  context_window: number;
  input_price: number | null;
  output_price: number | null;
  model_type: string;
  enabled: boolean;
}

/** One configured ingestion-model tier - a `(provider, model_id, source)`
 *  catalog pick. `source` is the rung: `athena` (platform proxy, credit-gated)
 *  vs `byok` (the org's own key, billed to the org). */
export interface IngestModelPick {
  provider: string;
  model_id: string;
  source: "athena" | "byok";
}

/** The org's two configurable ingestion models + the Athena defaults.
 *  `file` / `synthesis` are null when the org configured nothing for that tier
 *  - the FE shows the matching `*_default` (Athena) pick pre-selected.
 *  Embeddings are deliberately absent: the embed model is fixed/platform. */
export interface IngestModels {
  file: IngestModelPick | null;
  synthesis: IngestModelPick | null;
  file_default: IngestModelPick;
  synthesis_default: IngestModelPick;
}

export interface AuthSyncResponse {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  membership_count: number;
  server_time: string;
}

/** Response from `POST /v1/auth/identity-lookup` - tells the sign-in form
 *  how an email signs in so it can steer the user to the right method
 *  (one email = one auth method). `provider` is set only when
 *  `method === "oauth"`. The `otp` branch is identical for a known
 *  passwordless account and an unknown email, so it's not an
 *  account-existence oracle. */
export interface IdentityLookupResponse {
  method: "oauth" | "otp";
  provider: "github" | "google" | null;
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
/* Extended types (V1.1 - adds inbox, cost, integrations, SSO, models, etc.) */
/* -------------------------------------------------------------------------- */

/**
 * §5.29.3 / ADR-081 - Razorpay billing types. Mirror the BE shapes in
 * `athena/api/routers/{billing,billing_orgs,billing_verify,seats,credits}.py`.
 * The gateway columns were renamed `stripe_*`→`gateway_*` (migration 0083)
 * since the gateway is now Razorpay, not Stripe. Decimal money fields
 * (invoices) arrive as strings on the wire (Pydantic v2 serializes
 * `Decimal` as `str`); the FE renders them via `Number(str)` only at the
 * leaf. Tier/seat *display* prices come from `priceCatalog()` as whole
 * `int`s in `billing_currency` (INR).
 */
export type BillingTier = "solo" | "pro" | "enterprise";
/** Canonical sentinel value the BE returns when ATHENA_DEV_UNRESTRICTED_ACCESS
 * is on; the FE detects this and renders the dev-mode empty state. */
export const DEV_UNRESTRICTED_TIER = "dev_unrestricted" as const;

export interface Subscription {
  id: string;
  /** Razorpay subscription id (renamed from `stripe_subscription_id`,
   *  migration 0083). Under Standard Checkout this is a synthetic id. */
  gateway_subscription_id: string;
  /** Purchase-intent / plan key (renamed from `stripe_price_id`). */
  gateway_plan_id: string;
  /** One of BillingTier or DEV_UNRESTRICTED_TIER. */
  tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * ADR-081 - one-time Razorpay Order payload returned by every billing
 * *write* endpoint (`checkout-order`, `orgs/{id}/billing/upgrade`,
 * `seats/buy`, `credits/topup`). The FE opens Checkout.js with this via
 * `lib/billing/razorpay-checkout.ts:openRazorpayCheckout`.
 *
 * `amount` is the charge-currency **subunit** (paise for INR).
 * `razorpay_key_id` is the browser-safe Key ID - there is no
 * `NEXT_PUBLIC_*` env var; the key rides in each order response.
 * `checkout_options` is the server-built Checkout.js `options` object
 * (key/order_id/amount/currency/name/description/notes); the FE layers
 * its own `handler` + `modal.ondismiss` on top.
 */
export interface OrderPayload {
  order_id: string;
  razorpay_key_id: string;
  amount: number;
  currency: string;
  /** Purchase intent (`tier_solo` / `tier_pro` / `seats` / `credit_topup`).
   *  Absent on the seats/topup variants that don't echo it. */
  purchase?: string;
  checkout_options: Record<string, unknown>;
}

/** ADR-081 - `POST /v1/billing/verify` body: the Checkout.js success triple. */
export interface VerifyRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** ADR-081 - `POST /v1/billing/verify` response. `verified:true` is UX
 *  confirmation only; the webhook is the entitlement source of truth, so
 *  the caller then polls credits/subscription. */
export interface VerifyResult {
  verified: boolean;
  order_id: string;
  payment_id: string;
}

/**
 * §7.9 - Seat-billing surface. Mirrors `athena/api/schemas/seats.py:SeatsOut`.
 *
 * `pro_upgrade_quote` is non-null only on solo orgs - it carries the
 * price comparison the FE renders in the "Upgrade to Pro" tab of the
 * BuySeatsModal + the "ask owner to upgrade to Pro" copy on the
 * accept-invite seat-full card. Seat prices are whole INR ints (ADR-081)
 * and `null` when the catalog is unconfigured (dev mode) or Enterprise.
 */
export interface ProUpgradeQuote {
  pro_included_seats: number;
  /** Display price (INR/month) for one Pro extra seat. */
  pro_extra_seat_price_per_month: number;
  /** Seat count above which Pro is cheaper than Solo + extras. */
  breakeven_seats: number;
}

export interface SeatsOut {
  /** Mirrors `Subscription.tier` - solo/pro/enterprise/dev_unrestricted. */
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
  /** Display price (INR/month) for one extra seat at this tier. `null`
   *  when the catalog is unconfigured (dev mode) or tier is Enterprise. */
  extra_seat_price_per_month: number | null;
  /** Only set on solo orgs. */
  pro_upgrade_quote: ProUpgradeQuote | null;
}

export interface BuySeatsRequest {
  /** 1..50 - BE enforces. */
  count: number;
}

/** ADR-081 - `POST .../seats/buy` returns a one-time Order payload plus
 *  the projected seat total once the webhook applies the increment. */
export interface BuySeatsResponse extends OrderPayload {
  tier: string;
  requested_seats: number;
  projected_total: number;
}

/** ADR-081 - `POST .../seats/release` is in-app (no charge). */
export interface ReleaseSeatsResponse {
  tier: string;
  additional_seats: number;
  total_seats: number;
}

export interface UpgradeToProRequest {
  /** Optional 0..50 - paid extras to bake into the upgrade order. */
  additional_seats?: number;
}

/** ADR-081 - `POST .../billing/upgrade` returns a one-time Order payload. */
export type UpgradeToProResponse = OrderPayload;

/** ADR-081 - `POST .../billing/downgrade-to-solo` is in-app (no charge). */
export interface DowngradeToSoloResponse {
  tier: string;
  status: string;
}

/** ADR-081 - `POST /v1/billing/cancel` is an in-app cancel (Razorpay has
 *  no hosted portal); the org keeps its tier until the period ends. */
export interface CancelResponse {
  tier: string;
  status: string;
  cancel_at_period_end: boolean;
}

/** Body for `POST /v1/billing/checkout-order` (renamed from `checkout-session`). */
export interface CheckoutOrderRequest {
  tier: "solo" | "pro";
  /** 0..50 - seats to pre-buy above the tier's included bucket. */
  requested_extra_seats: number;
}

/**
 * §7.9.5 / ADR-081 - public price-catalog endpoint. Prices are whole
 * `int`s in `billing_currency` (INR), or `null` when an env var is unset
 * (dev mode). Mirrors `billing.py:PriceCatalogOut`. The FE renders these
 * via `formatInr`. Call-site falls back to `lib/billing/price-catalog.ts`
 * constants when the endpoint is unreachable.
 */
export interface PriceCatalog {
  /** ISO currency code (e.g. `INR`). */
  currency: string;
  solo_base: number | null;
  solo_extra_seat: number | null;
  pro_base: number | null;
  pro_extra_seat: number | null;
  /** Fixed USD→INR rate (e.g. 100). The credit ledger + prices are USD;
   *  the FE multiplies by this to DISPLAY rupees on billing surfaces. */
  usd_to_inr: number;
}

/**
 * §7.10 - Credit-based billing balance shape returned by
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
  /** Convenience flag - true when remaining credit dipped below the
   *  80% warning threshold. BE-computed so the FE doesn't recompute the
   *  arithmetic on every render. */
  over_80_pct_threshold: boolean;
  tier: string;
  /** Fixed USD→INR rate (e.g. 100). The ledger is USD; the FE multiplies
   *  these USD amounts by this to DISPLAY them in INR on the credit/billing
   *  surfaces (the Cost dashboard stays USD). */
  usd_to_inr: number;
}

/**
 * §7.9.7 - preview shape returned by `GET /v1/invitations/{token}/preview`.
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
 * §7.9.6 row 2471 - soft-cap warning the BE attaches to an invite-mint
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
 * F-07.1 - expanded enum mirrors the backend integration framework
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
 * F-07.5 - structured scope replaces the free-form string ("15 repos · 4
 * domains") so the FE can render typed chips and drive a "manage scope"
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
 * F-07.3 - adds `github_app` and `pat` to the existing kinds so the
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
  | "pat";         // F-09.1 - Jira Server / DC, GitLab self-managed PAT, etc.

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  blurb: string;
  connect_kind?: IntegrationConnectKind;
  connected_as?: string;
  connected_at?: string | null;
  /** F-07.5 - structured scope shape (replaces free-form string). */
  scope?: IntegrationScope;
  last_sync?: string | null;
  instructions?: string;
  flagship?: boolean;
  /** F-07.4 - required (default `false` on the backend). When `true`, Athena
   * auto-provisions a paired MCP entry under /mcp on connect. */
  provides_mcp: boolean;
  /** Real-BE fields surfaced by `GET /v1/orgs/{id}/integrations`
   * (`IntegrationOut` shape). Optional so the mock-mode marketplace
   * payload - which carries `name`/`category`/`blurb` for tile chrome
   * instead of `provider`/`config` - still satisfies the type. Filters
   * that need to distinguish a server-side-OAuth GitHub integration
   * from a marketplace github_app tile should key off
   * `provider === "github" && config.connect_kind === "oauth"`. */
  provider?: string;
  config?: Record<string, unknown>;
}

/** §5.29.11 / B7.4 - one row in the `AttachRepoDialog`'s candidate list.
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
 * Model Context Protocol - tools exposed by external systems (Figma, Linear,
 * Notion, custom self-hosted servers, etc.) that Athena's agents can call
 * during spec / plan / implement / review.
 *
 * Tenancy: org-scoped. One MCP entry, all agents in the org share it.
 * Auth + tokens are stored server-side; the API only returns masked hints. */

export type McpAuthMethod = "none" | "bearer" | "oauth" | "mtls" | "header";
export type McpTransport = "http" | "sse" | "websocket";
export type McpStatus =
  | "connected"
  | "healthy"           // BE `/test` probe passed (synonym of connected)
  | "degraded"          // responding but high latency or partial errors
  | "error"             // last heartbeat failed
  | "disconnected"      // user paused or token expired
  | "pending_review"    // auto-provisioned from integration, waiting for user to enable tools
  | "unknown";          // auto-provisioned, not yet health-checked (provisioner default)

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
  /** For custom-header auth - name of the header (value is masked). */
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
  /** True if this tool was added by the MCP server after the last review -
   * surfaces a "drift" warning that prompts re-approval. */
  added_since_review?: boolean;
}

export interface McpHealth {
  status: McpStatus;
  status_message?: string;
  last_check_at: string;
  latency_p50_ms: number;
  latency_p95_ms: number;
  /** Fraction 0..1 - error responses over last 24h. */
  error_rate_24h: number;
  /** Fraction 0..1 - uptime over last 30d. */
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
  /** True when the tool list changed since the last review - review-gate it. */
  pending_drift?: boolean;
}

/** Discovery response from the wizard's "fetch tools" step - what the
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
  created_at: string;      // ISO 8601 - for sorting and SLA computation
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
  /** Readiness §5.28 row 1783 - for `kind === "approval_needed"` items
   * raised by a paused run that hit the large-change classifier, the BE
   * surfaces the gate id + projected cost + scope here so the FE renders
   * the dedicated Approve / Skip card instead of the generic kind row.
   * Older BE builds omit the payload - the card falls back to the generic
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
 * Cost summary wire shape - the `/v1/cost/summary` response.
 *
 * `athena/billing/cost_summary.py` returns this full month-to-date shape:
 * spend + forecast + budget, per-day spend & tokens, per-model spend with
 * token split, per-domain, per-phase, top tasks, the token totals, and
 * budget-derived alerts. Every metric is derived from data Athena tracks
 * today (the `cost_rollups_daily` MV + `token_usage`).
 *
 * Fields stay optional so mock mode and forward/backward-compat callers
 * can omit any of them; the /cost page normalizes to a guaranteed shape.
 * Money fields are plain numbers (not Decimal-as-string) - safe to do
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
  // running calendar month) - the only case where a forecast is meaningful.
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
  spend_by_domain?: { id: string; name: string; usd: number; pct: number; budget: number; trend: string; top_task: string }[];
  spend_by_model?: { id: string; name: string; provider: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
  // Per-vendor rollup (OpenAI / Google / …) from token_usage.provider. Shown
  // on the "All" tab only - answers "which vendor did we pay".
  spend_by_provider?: { provider: string; name: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
  // BYO spend per saved provider key (cost_borne_by_org). Shown on the
  // "Your keys" tab only. `has_key=false` = spend on a since-revoked key.
  spend_by_key?: { provider: string; name: string; key_last4: string | null; has_key: boolean; usd: number; pct: number; calls: number; models: number; last_used: string }[];
  // By LiteLLM role/intent (e.g. workhorse-cheap) - complements spend_by_model
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

/** Per-sync-cycle ingestion cost for one repo - the cost dashboard's per-repo
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

/** §5.29.12 r1 - per-day spend split by model. The FE renders one line
 *  per model so a regression in any one model surfaces immediately.
 *  ``spent_usd`` is Decimal-as-string on the wire (Pydantic v2 default);
 *  consumers must ``Number(...)`` it before arithmetic. */
export interface PerModelBurndown {
  range_start: string;
  range_end: string;
  models: { model: string; daily: { day: string; spent_usd: string }[] }[];
}

/** One configurable budget-alert rule (migration 0099). `domain_id` is
 *  required for `domain_budget` and forbidden for `org_budget`.
 *  `audience_roles` holds membership role NAMES; empty = owner only.
 *  Fires once per (rule, calendar month). */
export interface AlertRule {
  id?: string;
  kind: "org_budget" | "domain_budget";
  domain_id?: string | null;
  threshold_pct: number;
  channels: ("in_app" | "email")[];
  audience_roles: string[];
  enabled: boolean;
}

/** Org-wide alert-category switches (migration 0100). Every alert
 *  surface is OPT-IN: a category that was never enabled fires nothing -
 *  no cost badges, no anomaly inbox alerts, no credit-warning banner.
 *  (Credit exhausted / spend-cap hard-stops are usage blockers, not
 *  alerts, and always render.) */
export interface AlertSettings {
  cost_badges: boolean;
  ingest_anomaly: boolean;
  credit_warning: boolean;
}

/** Per-domain monthly budget row for the budgets settings table. */
export interface DomainBudget {
  domain_id: string;
  name: string;
  budget_mtd_usd: number | null;
  spent_mtd_usd: number;
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
  /** Month-to-date spend for this provider. Null when the caller lacks
   *  `cost:read` (cost visibility is leadership-only). */
  cost_mtd: number | null;
  residency_note: string;
  /** True when the org has saved a BYO API key for this provider.
   * The plaintext is NEVER returned by the API - only this flag +
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

/** §7.8.1 - one model row from `GET /v1/llm/providers/catalog`. */
export interface CatalogModel {
  id: string;
  display_name: string;
  /** One-line domain + when-to-use blurb, shown on hover wherever the
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
  /** True when the model accepts image input (multimodal) - drives the
   *  "Vision" domain badge. Independent of `supports_tools`. */
  supports_vision: boolean;
  /** Hard per-model RPM/TPM cap when published; null otherwise (see the
   *  provider's `rate_limit_notes`). */
  rate_limit: CatalogRateLimit | null;
  /** Domain bucket chip: chat / chat+reasoning / reasoning / embedding /
   *  coding / agent_system. */
  model_type: string;
  /** Reasoning behaviour: toggle / effort / always / none. */
  thinking_mode: string;
  /** Reasoning / extended-thinking model - renders a "Thinking" badge and
   *  streams its chain-of-thought into the chat reasoning panel. */
  thinking: boolean;
  /** Thinking can be toggled off on this same model (its own non-thinking
   *  counterpart). Only meaningful when `thinking` is true. */
  thinking_optional: boolean;
  /** Id of a non-thinking counterpart model, when one exists. */
  non_thinking_variant: string | null;
}

/** §7.8.1 - one provider entry in the catalog. */
export interface CatalogProvider {
  id: string;
  display_name: string;
  tier_hint: "free" | "paid" | "mixed";
  /** True when Athena's shared proxy holds a key for this provider, so its
   *  models are usable on platform credit with NO bring-your-own key (the
   *  "Athena models"). False → BYO-only: usable only after the org saves its
   *  own key for this provider (managed on the provider's card). */
  platform_hosted: boolean;
  requires_openai_compat: boolean;
  /** True for subscription-harness providers (Claude Code / Codex CLI):
   *  they connect per-user on /settings/integrations - never offered in
   *  the org "Add provider" key picker. */
  subscription: boolean;
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

/** One personal AI-subscription connection (`/v1/users/me/ai-subscriptions`).
 *  Never carries the credential - only the trailing-4 hint. */
export interface AiSubscription {
  /** Subscription catalog provider id: `claude-subscription` | `codex-subscription`. */
  provider: string;
  /** `connected` (verified) | `error` (last verify/call failed - see last_error). */
  status: "connected" | "error";
  /** Catalog model ids the user switched on for this connection. */
  enabled_models: string[];
  /** Trailing 4 chars of the stored credential - the "•••• ABCD" hint. */
  credential_hint: string | null;
  last_verified_at: string | null;
  last_error: string | null;
}

/** The slugs the Coding-agents card knows connect snippets for. */
export type CodingAgentClient =
  | "claude-code"
  | "codex-cli"
  | "cursor"
  | "gemini-cli"
  | "antigravity"
  | "copilot-cli"
  | "other";

export type CodingAgentScopeBundle = "kb.read" | "work.read" | "work.write";

/** One coding-agent MCP token (`/v1/users/me/coding-agent-tokens`).
 *  Prefix-only - the raw bearer exists solely in the mint response. */
export interface CodingAgentToken {
  id: string;
  /** Display label - doubles as the live executor label in the cockpit. */
  name: string;
  client: CodingAgentClient | string;
  scope_bundle: CodingAgentScopeBundle | "custom" | string;
  prefix: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Mint response - the only time the raw token is ever visible. */
export interface CodingAgentTokenMinted extends CodingAgentToken {
  token: string;
  /** Public /mcp URL for the connect snippet; null → derive from API base. */
  mcp_url: string | null;
}

/** Everything the Coding-agents card needs in one fetch. */
export interface CodingAgentTokensOut {
  mcp_enabled: boolean;
  mcp_url: string | null;
  tokens: CodingAgentToken[];
}

/** §7.8.1 - per-model usage row inside ProviderUsage. */
export interface ProviderUsageModel {
  model: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  /** Display-only - BYO calls never debit the credit ledger. Many
   *  free-tier upstreams return $0 for the `usage.total_cost`
   *  field, which is what we surface here. */
  cost_usd: number;
  last_used_at: string | null;
}

/** §7.8.1 - `GET /v1/orgs/{id}/model-providers/{id}/usage` body. */
export interface ProviderUsage {
  provider: string;
  range: "mtd";
  models: ProviderUsageModel[];
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

/** A domain Athena detected as touched by the task. */
export interface DetectedDomain {
  domain_id: string;
  name: string;
  /** 0–1 confidence; rendered as a percentage. */
  confidence: number;
  /** True for the domain the task primarily lands in. */
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
  domains_detected: DetectedDomain[];
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
  /** Heal/retry attempts spent - present on BOTH tracks (the discriminant). */
  heal_attempts_used: number;
  last_commit_sha?: string | null;
  /** Quickfix only - the single file the quickfix targets. */
  target_file?: string | null;
  /** Quickfix only - a one-line summary of the diff. */
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
  /** Implement track only - an excerpt of the PR body. */
  pr_body_excerpt?: string | null;
  /** Implement track only - count of PR-comment responses Athena posted. */
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
 *  (always present - the BE serialises empty defaults - so the panel renders
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
/* §9.6 - Per-section 👍/👎 feedback                                          */
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

export interface Skill {
  id: string;
  name: string;
  slug: string;
  version: string;
  status: "active" | "draft" | "archived";
  description: string;
  icon: string;
  phases: string[];
  attached_domains: string[];
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

/** Matches the BE ``CreateSkillIn`` Pydantic shape - see
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

/** Matches the BE ``UpdateSkillIn`` Pydantic shape - every field
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
  dom_id: string | null;
  who: string;
  who_avatar: string | null;
  who_kind: "agent" | "human";
  text_html: string;     // safe pre-rendered HTML - no user-supplied input
  tech: string;
  when: string;
  task_id: string | null;
}

export interface ChatThread {
  id: string;
  title: string;
  scope: { kind: "domain" | "org"; id?: string; label: string };
  preview: string;
  updated_at: string;
}

/** A chat message. The `role` enum has four members:
 * - `user`/`assistant`/`system` are the legacy chat roles.
 * - `task_created` is a structured event message - `content` carries the
 *   proposal id (a UUID) and ``payload`` carries the full propose_task
 *   envelope. The FE renders a "Start task" CTA card from ``payload``;
 *   clicking opens the New-task dialog **in place** (over the chat),
 *   pre-filled from the proposal - the user confirms and the FE POSTs
 *   `/v1/tasks`. (`payload.cta_url` = `/work?new=1&proposal_id=...` still
 *   backs the standalone deep-link, but the card no longer navigates to it.)
 *   Dismissing the card DELETEs this row. Once a task is spawned from the
 *   proposal, `spawned_run_id` is populated by the backend. */
/**
 * Per-assistant-turn LLM usage, summed across every model call the agent made
 * while producing the reply. Mirrors the BE `MessageOut.token_usage` JSONB
 * (snake_case, ADR-032). Absent on user / system / task_created rows and on
 * older persisted assistant rows - always treat every field as optional.
 */
export interface ChatTokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_cost_usd?: number;
}

/** A user-uploaded attachment (image or document), as returned by
 *  `POST /v1/attachments`. The bytes come from `GET /{id}/content` (fetched
 *  with auth and rendered via a blob URL - see `api.attachments.blobUrl`);
 *  documents are parsed server-side and carry `page_count` / `truncated`.
 *  `status: "failed"` means the file stored but could not be parsed - render it
 *  with its `error`. */
export interface AttachmentOut {
  id: string;
  kind: "image" | "document";
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: "ready" | "failed";
  page_count?: number | null;
  truncated?: boolean;
  error?: string | null;
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
  /** Tool calls the agent made while producing this reply - `{name, args,
   *  result}` triples (the BE `MessageOut.tool_calls`). Drives the live
   *  activity strip during streaming and an optional "tools used" recap.
   *  Absent on user / system rows. */
  tool_calls?: ChatToolCall[];
  /** LLM token usage + cost for this assistant turn (see ChatTokenUsage).
   *  Absent on user / system / task_created rows and older persisted rows. */
  token_usage?: ChatTokenUsage;
  /** Athena's self-assessed certainty (0-1) in this answer + the one-line
   *  reason behind it, surfaced by the `<ConfidenceBadge>` in the assistant
   *  turn's header. `null`/absent on user/system rows, on answers where the
   *  model emitted no marker, and on older rows (no badge). Unlike
   *  `token_usage`, NOT cost-gated - visible to everyone. */
  confidence_score?: number | null;
  confidence_reason?: string;
  /** The model's reasoning/thinking for this turn, shown in a collapsible
   *  panel. Populated client-side from the stream's `reasoning` events; it is
   *  NOT persisted server-side yet, so it's present only for the turn's own
   *  session (absent after a reload). */
  reasoning?: string;
  /** Set on `task_created` rows once the user has clicked the CTA card and
   *  `POST /v1/runs` has minted the actual run. */
  spawned_run_id?: string | null;
  /** A renderable card envelope: the propose_task envelope on `task_created`
   *  rows, or - on `assistant` rows - an `ask_clarification` envelope
   *  (`payload.type === "clarification"`, one disambiguating question) or a
   *  `clarify_scope` envelope (`payload.type === "scope_ladder"`, three
   *  answer-depth tiers). Discriminate on `payload.type`. */
  payload?:
    | TaskProposalPayload
    | ClarificationPayload
    | ScopeLadderPayload
    | ActionProposalsPayload
    | null;
  /** Ids of files the user attached to this turn (images + documents). The FE
   *  resolves each via `api.attachments.get` to render a thumbnail / doc chip.
   *  Empty/absent on assistant + text-only rows. */
  attachment_ids?: string[];
}

/** The propose_task envelope persisted on a `task_created` ChatMessage.
 *  Mirrors the BE ``propose_task`` tool's return shape (snake_case per
 *  ADR-032). `type` is one of the Task spine's task types; `stages`
 *  carries the human-readable stage titles for that type so the card can
 *  show what the user would be agreeing to drive. No budget - stages
 *  enforce their own per-stage cost cap server-side. */
export interface TaskProposalPayload {
  proposal_id: string;
  type: TaskType;
  domain_id: string | null;
  title: string;
  goal: string;
  stages: string[];
  cta_text: string;
  cta_url: string;
}

/** The `ask_clarification` envelope on an `assistant` ChatMessage - the agent
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

/** The `clarify_scope` envelope on an `assistant` ChatMessage - the agent
 *  offered three answer-*depth* tiers for a broad topic (distinct from
 *  `ask_clarification`, which disambiguates). The FE renders an inline
 *  scope-ladder card; picking a tier sends a depth instruction as the next
 *  user message. Mirrors the BE tool's return shape (snake_case per ADR-032). */
export interface ScopeLadderPayload {
  type: "scope_ladder";
  topic: string;
  tiers: ScopeLadderTier[];
}

/** Fields shared by every chat action proposal. Chat never mutates directly:
 *  each `propose_*` tool returns one of these, the FE renders a confirm card,
 *  and on confirm calls the SAME RBAC-gated `/v1/tasks` endpoint the UI uses. */
export interface ActionProposalBase {
  proposal_id: string;
  kind: "action_proposal";
  task_id: string;
  task_display_id: string;
  task_title: string;
  /** One-line human description of what confirming will do. */
  summary: string;
  /** The org permission the FE gates the confirm CTA on (mirrors the BE gate). */
  permission: string;
}

export interface TaskUpdateProposal extends ActionProposalBase {
  action: "task_update";
  /** A subset of TaskPatchInput - the fields to change. */
  changes: TaskPatchInput;
}
export interface TaskCancelProposal extends ActionProposalBase {
  action: "task_cancel";
  reason: TaskCancelReason;
  note: string | null;
}
export interface TaskDeleteProposal extends ActionProposalBase {
  action: "task_delete";
}
export interface TaskAddDependencyProposal extends ActionProposalBase {
  action: "task_add_dependency";
  depends_on_task_id: string;
  depends_on_title: string;
  dep_kind: "blocks" | "relates";
}
export interface TaskThreadPostProposal extends ActionProposalBase {
  action: "task_thread_post";
  body: string;
}
export interface StageRunProposal extends ActionProposalBase {
  action: "stage_run";
  stage: string;
  stage_status: string;
  steer: string | null;
}
export interface StageRefineProposal extends ActionProposalBase {
  action: "stage_refine";
  stage: string;
  instruction: string;
}
export interface StageGateProposal extends ActionProposalBase {
  action: "stage_gate";
  stage: string;
  decision: "approve" | "reject";
  note: string | null;
  stage_status: string;
}

/** Discriminated on `action` - the FE confirm card switches on it. */
export type TaskActionProposal =
  | TaskUpdateProposal
  | TaskCancelProposal
  | TaskDeleteProposal
  | TaskAddDependencyProposal
  | TaskThreadPostProposal
  | StageRunProposal
  | StageRefineProposal
  | StageGateProposal;

/** The envelope on an `assistant` ChatMessage carrying one or more action
 *  proposals (usually one). The FE renders an inline confirm card per item. */
export interface ActionProposalsPayload {
  type: "action_proposals";
  proposals: TaskActionProposal[];
}

export interface ChatCitation {
  label: string;
  /** Where the citation lives - drives the icon. */
  kind: "file" | "adr" | "doc" | "ticket" | "pr" | "skill" | "url";
  /** Optional path/identifier; not auto-rendered as a link, just hinted. */
  ref?: string;
}

/** One tool invocation the chat agent made during a turn - mirrors the BE
 *  `MessageOut.tool_calls` `{name, args, result}` triple. */
export interface ChatToolCall {
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

/* Transport shapes for `GET /v1/knowledge/graph`. Mirrors the BE
 * `KnowledgeGraphOut` envelope. Layout (x/y) and colour stay synthesised
 * client-side (ADR-041 - Postgres is the store, layout is a view concern).
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
  /** LLM file/symbol summary - the embedding source-of-truth text. */
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

/** Envelope for `GET /v1/knowledge/nodes/{id}/neighbors` - the topology
 *  explorer's on-demand 1-hop expansion. `nodes` are the neighbours only (the
 *  focus node is NOT echoed back; the caller already holds it); `edges`
 *  connect the focus to each neighbour (real `contains` spine both ways, plus
 *  behavioral / cross-repo edges). `truncated` is true when the fan-out was
 *  capped server-side (hub node) - the FE soft-cap is the real guard. */
export interface NodeNeighbors { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; truncated: boolean }

/* -- /v1/knowledge/search wire shape (BE: knowledge_search.py) -- */

export type SearchMode = "semantic" | "lexical" | "hybrid";
export type SearchScope = "org" | "domain" | "repo";
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
  domain_id: string | null;
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
  domain_id?: string;
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
/*  - DomainKnowledge  per domain_overlay                             */
/*  - OrgKnowledge         per org (registry + cross-cap + Blueprint excerpts) */
/*                                                                            */
/* Field shape tracks athena-docs/04-backend/knowledge-architecture.md and    */
/* athena-docs/03-data-and-storage/postgres-schema.md. Every field in these   */
/* interfaces must map to something the ingestion pipeline actually produces. */
/* -------------------------------------------------------------------------- */

/** Common ingestion-freshness pill state used at every scope.
 *  ``degraded`` (Batch 12k) - ingest finished but at least one per-file
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
 *  atomic unit - functions/classes are folded into each file's
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
  /** Centrality score 0..1 - drives node size + the graph LOD ranking. */
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
 *  No corresponding Blueprint section - this is canonical for configs. */
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

/** Per-domain knowledge produced by ingestion + the hierarchical KG (ADR-042) +
 *  the domain overlay rebuild (ADR-049).
 *
 *  IMPORTANT - this shape carries ONLY KG-distinctive ingestion data. Anything
 *  that is also a Blueprint section (per postgres-schema.md §5.4: `services`,
 *  `decisions`, `open_questions`, `domain_glossary`, `cross_repo_workflows`,
 *  `recent_activity`, `overview`, `guardrails`, `conventions`, `stack`,
 *  `ownership`, `success_metrics`, `risks`, `runbook`,
 *  `external_references`, `maturity`) is stored as a `BlueprintSection`
 *  and rendered alongside these KG cards on the domain surface. The
 *  KG cards never carry Blueprint-section data - and vice versa. */
export interface DomainKnowledge {
  domain_id: string;
  /** Sum of all node kinds. */
  nodes_total: number;
  /** Histogram of node kinds (service/module/function/class/config/document/test/summary). */
  nodes_by_kind: Record<string, number>;
  edges_total: number;
  repos_indexed: number;
  /** Total decision-records referenced from this domain's nodes (count only -
   *  full titled list lives in Blueprint.decisions). */
  decision_records: number;
  domain_concepts: number;
  /** Top entities by importance (0..1), surfaced to give "what is this domain mostly about". */
  top_entities: Array<{
    id: string;
    name: string;
    kind: string;
    path: string;
    importance: number;
    description: string;
    repo: string;
    /** Architecture layer (ui/api/domain/db/util/config/…) - drives the
     *  Topology graph's layer banding. Optional: legacy/mock rows may omit it. */
    layer?: string;
  }>;
  /** Edges among `top_entities` (source_id/target_id reference their `id`s).
   *  ADDITIVE + optional - restores the domain Topology graph's edges
   *  (previously hard-coded to `[]`). `cross_repo` marks kg_org_edges
   *  spanning the domain's attached repos. */
  top_entity_edges?: KnowledgeEdge[];
  /** Domain-overlay term bridges (knowledge-architecture.md §3 / §5).
   *  Each row maps a domain term Athena learned to the graph nodes that mention it.
   *  This is the KG-overlay-derived view; NOT the same as Blueprint.domain_glossary
   *  (which is a curated narrative glossary). */
  overlay_terms: Array<{
    term: string;
    /** Confidence 0..1 - how strongly the overlay associates the term with the matched nodes. */
    confidence: number;
    /** Top KG node ids that mention this term, ordered by relevance. */
    matched_node_ids: string[];
    /** Display labels for the top-3 matched nodes (kept on FE so we don't refetch). */
    matched_node_labels: string[];
    /** Where the term was first extracted (resource_id is a DomainResource id). */
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

/** Per-repo knowledge produced by ingestion for one repo inside a domain.
 *
 *  IMPORTANT - this shape carries ONLY KG-distinctive ingestion data. Anything
 *  that is also a Repo Blueprint section (per postgres-schema.md §5.4:
 *  `overview`, `guardrails`, `conventions`, `stack`, `api_surface`,
 *  `data_models`, `entry_points`, `hot_files`, `tests_and_ci`,
 *  `build_and_run`, `deployment_surface`, `external_deps`, `local_idioms`,
 *  `recent_activity`, `ownership`, `observability`, `secrets_handling`,
 *  `environments`) is stored as a `BlueprintSection` and rendered inline
 *  in the expanded repo row via `<RepoBlueprintSections>`. The KG fields
 *  here never duplicate a Blueprint section - and vice versa. */
export interface RepoKnowledge {
  repo_id: string;
  repo_full_name: string;
  primary_language: string;
  files_indexed: number;
  loc: number;
  /** Most recent commit Athena has processed; used for the "what's been ingested" claim. */
  last_commit: { sha: string; when: string; author: string; message: string };
  /** Top services inferred in this repo (KG service nodes - Repo Blueprint has no
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
  /** Top modules / files (KG module nodes - Repo Blueprint has no modules section).
   *  `tier_summary` is the ADR-042 module-tier auto-summary (≈200 words).
   *  `hot` is a top-decile churn signal - Blueprint.hot_files renders the full
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
  /** Authoritative containment roots for the topology explorer seed (B2) -
   *  top-level `service` nodes + `module` nodes with no parent module (not the
   *  `dst` of any inter-module `contains` edge). Optional: older BE builds + the
   *  mock omit it, and the explorer falls back to seeding from `services` +
   *  top-level `modules` when absent. */
  containment_roots?: NodeRef[];
  /** Top files by centrality (file-centric KG) - the "what's actually in this
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
  /** ADRs referenced from this repo's nodes - resolved to titles. NOT a Repo
   *  Blueprint section (Blueprint.decisions exists only at Domain scope). */
  adrs_referenced: AdrRef[];
  /** Indexed-sha + pending PR snapshot info. NOT a Blueprint section. */
  snapshot: RepoSnapshotInfo;
  exports: number;
  decision_records_referenced: number;
  ingestion_status: IngestionStatus;
  last_ingested_at: string;
  /** Phase D - repo headline summary. Rendered prominently at the top of the
   *  repo page's Blueprint dashboard. Optional so older BE builds + mock that
   *  predate the field are still type-safe. */
  summary?: string | null;
  /** Phase D - unified sync surface. `current_sync_stage` mirrors the
   *  `DomainRepo` stage enum but adds `degraded` / `failed`. The three
   *  sha + commits_behind fields let the repo page render the SyncStatus
   *  chip without a second `listRepos` round-trip. All optional - the
   *  SyncStatus component falls back to `DomainRepo` data when absent. */
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

/** Per-org knowledge - registry + cross-domain dependency model + KG-derived
 *  health signals.
 *
 *  IMPORTANT - this shape carries ONLY KG-distinctive ingestion data. Anything
 *  that is also an Org Blueprint section (per postgres-schema.md §5.4:
 *  `standards`, `glossary`, `security_policies`, `mission`, `principles`,
 *  `compliance`, `incident_history`, `change_log`) is stored as a
 *  `BlueprintSection` and rendered inline on `/knowledge` via the Blueprint
 *  TOC + section viewer. The KG fields here never duplicate a Blueprint
 *  section - and vice versa. */
export interface OrgKnowledge {
  org_id: string;
  /** Domain registry with the per-cap deltas that drive the registry card. */
  domains: Array<{
    id: string;
    slug: string;
    name: string;
    /** Lead user id (from domain ownership row, not the create-record audit field). */
    lead_user_id: string | null;
    repos_indexed: number;
    open_tasks: number;
    nodes_total: number;
    decisions: number;
    ingestion_status: IngestionStatus;
    /** Material changes in the last 7 days (smart-classifier verdict per ADR-048). */
    material_changes_7d: number;
  }>;
  /** Typed cross-domain dependencies - derived from cross-overlay edges
   *  (knowledge-architecture.md §3.1). NOT a Blueprint section. */
  cross_cap_dependencies: Array<{
    from_domain_id: string;
    to_domain_id: string;
    /** `data` = events / table reads; `control` = state gates / RLS / auth. */
    kind: "data" | "control";
    label: string;
    /** Underlying KG evidence - node ids or topic names that prove the edge. */
    evidence: string[];
  }>;
  /** Cross-repo edges (`kg_org_edges`, ADR-078) rolled up LIVE - read
   *  straight from the edge table, not the domain-overlay projection
   *  `cross_cap_dependencies` uses, so it reflects the current spine
   *  rebuild immediately. `connections` is one row per (src,dst,kind). */
  cross_repo_edges: {
    total: number;
    by_kind: Array<{ kind: string; count: number }>;
    connections: Array<{
      src_repo_id: string;
      src_repo: string;
      dst_repo_id: string;
      dst_repo: string;
      kind: string;
      count: number;
    }>;
  };
  /** Decision records flagged stale by `decision_record_health`
   *  (knowledge-architecture.md §16). NOT a Blueprint section. */
  stale_decisions: Array<{
    id: string;
    title: string;
    /** Why it's flagged stale. */
    reason: string;
    last_reviewed: string;
  }>;
  /** Org-wide totals - single source of truth that the KPI tiles render. */
  totals: {
    nodes: number;
    edges: number;
    repos: number;
    decisions: number;
    open_questions: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Phase D - Node dossier drawer (contract #1)                                */
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
  /** Relation label for this edge ("imports" / "calls" / …) - present when
   *  the ref came out of a `relations` bucket. */
  relation?: string | null;
  /** Architecture role / layer hints for chip colouring, when known. */
  role?: string | null;
  layer?: string | null;
}

/** One folded symbol in a file dossier's `elements` block - mirrors the
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

/** The node dossier - the full at-a-glance card for one KG node. Each
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
    /** Forward-compatible bag - the BE may surface complexity / centrality /
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
  /** Folded symbol index for file nodes (functions / classes / methods) - the
   *  "what's actually in this file" list, post node-drop. Capped (~120) in the
   *  dossier; the full set lives in the node's `metadata.symbols`. Optional -
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
 *  alongside it - the shared drawer uses `node_kind` + `path` + `repo_id` to
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
/* Phase D - Live staleness gate (contract #3)                                */
/* -------------------------------------------------------------------------- */

/** `GET /v1/domains/{capId}/repos/{repoId}/knowledge/sync-status` - does
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

/** Response for `POST .../repos/{capRepoId}/knowledge:cancel` - the Stop
 *  ingestion action. `cancelled=true` → an in-flight ingest was flipped to
 *  `cancelled` (the repo's `current_sync_stage` becomes `"cancelled"` and the
 *  worker stops within a batch). `cancelled=false` → nothing was running, so
 *  the call was an idempotent no-op. */
export interface RepoCancelSyncResponse {
  repo_id: string;
  cancelled: boolean;
  branch_sha: string | null;
}

/** Response for `POST .../repos/{repoId}/knowledge:skip-file` - resume a PAUSED
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
  /** True when the caller chose "skip all failing files" - the resumed worker
   *  auto-resolves every subsequent dossier-LLM failure raw (no more pauses). */
  skip_all: boolean;
}

/* -------------------------------------------------------------------------- */
/* Phase D - Pull-request tab (contract #4)                                   */
/* -------------------------------------------------------------------------- */

/** One open PR row from
 *  `GET /v1/domains/{capId}/repos/{repoId}/pull-requests`. */
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
 *  isn't connected / the live call failed - the tab renders a "couldn't
 *  load PRs / connect integration" empty state. */
export interface RepoPullRequestsResponse {
  repo_id: string;
  available: boolean;
  pull_requests: RepoPullRequest[];
}

export interface NotificationRule {
  event: string;
  /** `in_app` was added in §5.29.5 - surfaces in `/inbox` (no external
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
  /** §5.29.10 - append-only lifecycle. `active` is the current row,
   * `superseded` is an older row replaced by an edit, `reverted` means
   * the row was explicitly reverted (no successor). Default `active`
   * for older seeded rows that pre-date the column. */
  status?: "active" | "superseded" | "reverted";
  /** When this row was created (different from `date` which is the
   * human-readable display). Set by the server. */
  created_at?: string;
}

/** §5.29.10 - request body for `api.orgs.decisionList.create` /
 *  `api.domains.decisionList.create`. The shape mirrors the
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

/** §6.0 - per-repo file browser. One row per ``knowledge_nodes`` file
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
/* §6.5.6 - FE mirrors for BE agent tools (Batch 1-3)                         */
/*                                                                            */
/* These five rows complement BE tools shipped as `_tools/` agent factories   */
/* but NOT yet exposed as REST endpoints. The FE wires call sites today       */
/* against the canonical path the REST endpoint will land at; mock-mode       */
/* serves a synthesised envelope so the FE compiles + tests pass. The         */
/* `// TODO: BE REST endpoint not yet exposed (§6.5.6 - tool exists in        */
/* athena/agent/subagents/_tools/{knowledge,slices,repo}.py)` markers in      */
/* the api method block flag the live-mode gap.                               */
/* -------------------------------------------------------------------------- */

/** One row in a graph-walk envelope (`find_dependents` /
 *  `find_dependencies`). Mirrors the agent-tool row shape in
 *  `athena/agent/subagents/_tools/knowledge.py:_make_graph_walk_tool`.
 *  ``hops`` is the BE field; the FE consumes it directly per ADR-032
 *  snake_case truth (no rename). The `expand_slice` neighbourhood
 *  endpoint returns rows with `relation` instead of `hops` - both are
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
  /** Set by `expand_slice` only - "sibling" / "caller" / "callee" /
   *  "caller_and_callee". Absent on the recursive graph-walk
   *  endpoints. */
  relation?: "sibling" | "caller" | "callee" | "caller_and_callee";
}

/** Freshness signal carried by every retrieval envelope (§3.2 +
 *  knowledge-design-invariants.md). Mirrors `Freshness` TypedDict in
 *  `athena/agent/subagents/_tools/_envelope.py`. Every field is
 *  optional on the wire - older BE builds / the mock omit them and
 *  UI treats absence as "unknown". */
export interface KnowledgeFreshness {
  /** "knowledge_graph" for snapshotted reads, "live" for mutable
   *  tables. Required by BE; optional here for mock-mode tolerance. */
  source?: "knowledge_graph" | "knowledge_node" | "blueprint" | "live";
  kg_snapshot_id?: string | null;
  last_indexed_at?: string | null;
  commits_behind?: number | null;
  stale_but_usable?: boolean | null;
  /** Set when the call carried `branch_scope` - agent must disclose. */
  branch_scope?: string | null;
  /** Rows the FTS / cosine query returned filtered to `branch_scope`. */
  rows_on_branch?: number | null;
  /** Phase 6K - repos the pre-scope LLM call narrowed retrieval to. */
  scope_first_picked_repos?: string[] | null;
  /** Set by the query-memoization wrapper - true means cached envelope. */
  cache_hit?: boolean | null;
}

/** Standard retrieval envelope from `_tools/_envelope.py` - `items`
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
 *  `kind` is the edge kind filter - today only `"imports"` is wired. */
export interface FileGraphWalkQuery {
  max_hops?: number;
  kind?: "imports" | "calls" | "all";
  /** ADR-078 - only respected at org scope; harmless at domain/repo. */
  cross_repo?: boolean;
}

/** Query params for `api.repos.files.slice(...)` (expand_slice mode). */
export interface FileSliceQuery {
  max_hops?: number;
  limit?: number;
}

/** Wire shape for `api.repos.files.content(...)` - mirrors the
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
  /** `[node:{id}:L{line}-L{line}]` chip - drives drawer deep-link. */
  citation: string;
}

/** Envelope from `api.repos.grep(...)`. `coverage_warning` mirrors
 *  the `read_repo_file` rationale - surfaces a banner. */
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
 *  The endpoint probes org / domain / repo scope tables in order and
 *  returns the first hit, so a single FE detail route can render any
 *  decision regardless of where it lives. Drives the per-decision page
 *  reached from the ADRs card on the repo route and the stale-decisions
 *  banner on the org Decisions tab. */
export interface DecisionDetail {
  id: string;
  scope: "org" | "domain" | "repo";
  /** `domain_id` / `repo_id` / `null` for org-scope. */
  scope_id: string | null;
  /** Domain slug / repo full_name / org name. */
  scope_label: string;
  title: string;
  tag: string;
  author: string;
  date: string;
  kind: "ADR" | "Convention" | "Domain note";
  summary: string;
  status: "active" | "superseded" | "reverted";
  supersedes_id: string | null;
  /** Reverse lookup - set when a successor row points back at this id. */
  superseded_by_id: string | null;
  created_at: string;
}

/**
 * §5.30 - per-domain access control, fine-grained. Org members whose
 * org role grants `domain:admin_all` (plus the owner) keep org-wide
 * reach; this row governs everyone else inside a single domain. Three
 * roles: `admin` (every domain permission), `viewer` (read-only; can
 * still create tasks since task creation is org-wide), and `custom`
 * (exactly the row's `permissions` subset, configured per member).
 */
export type DomainRole = "admin" | "viewer" | "custom";

export interface DomainMember {
  id: string;
  domain_id: string;
  user_id: string;
  role: DomainRole;
  /** Effective domain permissions: all for `admin`, none for `viewer`,
   * the configured subset for `custom`. Keys match the `domain` half of
   * the permission catalog (`api.roles.catalog`). */
  permissions: string[];
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
  steps: { id: string; title: string; status: "pending" | "in_progress" | "done"; detail: string; optional?: boolean }[];
}

/* -------------------------------------------------------------------------- */
/* Roles & permissions - the org's fully data-driven RBAC surface              */
/*                                                                            */
/* Every assignable role is an `org_roles` row; nothing is compiled in.       */
/* `owner` / `service` are structural reserved names (never listed here).     */
/* Renames cascade server-side onto memberships, pending invitations, and     */
/* `default_role_for_invite`, so the FE can treat `name` as the stable        */
/* assignment key within one response cycle.                                  */
/* -------------------------------------------------------------------------- */

export interface OrgRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  /** Seeded starter role (provenance badge only - still fully editable). */
  is_system: boolean;
  member_count: number;
  pending_invitation_count: number;
  is_default_for_invite: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermissionEntry {
  key: string;
  label: string;
  description: string;
  /** Destructive / high-blast-radius grant - render with warning styling. */
  danger: boolean;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionEntry[];
}

export interface PermissionCatalog {
  /** Org-level permissions, grouped for the role editor. */
  org: PermissionGroup[];
  /** Domain-level permissions for the per-member domain picker. */
  domain: PermissionEntry[];
}

/* -------------------------------------------------------------------------- */
/* Blueprint - the structured, multi-section knowledge document per scope     */
/*                                                                            */
/* Per knowledge-model.md §5. Lives in Athena's DB; never written to a repo. */
/* AGENTS.md / CLAUDE.md are read-only inputs that seed the synthesised       */
/* sections (`conventions`, `guardrails`). AI updates to user-edited sections */
/* go through the approval queue (§5.4); accepted proposals create new        */
/* revisions; rejected proposals cool down for 14 days on identical content.  */
/* -------------------------------------------------------------------------- */

/** Three scopes share the same shape and endpoint surface. */
export type BlueprintScope = "org" | "domain" | "repo";

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
 * TOC-row shape returned by `GET /v1/{scope}/{id}/blueprint`. No body - just
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
   * AI may never silently overwrite a `protected_from_ai=true` section -
   * subsequent sync updates land as proposals instead. */
  protected_from_ai: boolean;
  current_version: number;
  has_pending_proposal: boolean;
  parent_section_key: string | null;
  ordering: number;
  /** F-04.9 - true when the user has edited the section directly. UI renders
   * a "✎ edited" badge + left-rule highlight on the body. */
  user_edited?: boolean;
  /** F-04.9 - display name of the most-recent editor. */
  last_edited_by_user_name?: string | null;
  /** F-04.9 - relative time of the most-recent edit. */
  last_edited_at?: string | null;
  /** F-04.9 - id of the `run_decisions` row that captured the edit, for
   * deep-linking to the decision-list pane. */
  last_decision_id?: string | null;
}

/** TOC envelope - sections + blueprint metadata. */
export interface BlueprintToc {
  blueprint_id: string;
  scope_kind: BlueprintScope;
  domain_id: string | null;
  repo_id: string | null;
  status: BlueprintStatus;
  last_synced_at: string | null;
  sections: BlueprintSectionSummary[];
  pending_proposals_count: number;
}

/** Result of a `:rebuild` (deep regenerate). `queued: true` means the
 *  agentic explorer was enqueued and the blueprint is `building` - poll
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
 * F-04.6 - per-citation drift signal (per ADR-061). When the citation's source
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
  /** F-04.6 - drift state for this citation. Optional during rollout - older
   * backends will not return it; UI treats absence as `null`. */
  drift?: BlueprintSourceRefDrift;
  /** F-04.6 - short hash prefix at the time of the last sync. */
  content_hash_at_sync?: string | null;
  /** F-04.6 - short hash prefix of the source's current content. */
  current_content_hash?: string | null;
  /** F-04.6 - ISO timestamp of when the source last changed. */
  source_changed_at?: string | null;
}

/** Full section shape returned by `GET /v1/{scope}/{id}/blueprint/sections/{key}`. */
export interface BlueprintSection extends BlueprintSectionSummary {
  body_markdown: string | null;
  body_json: Record<string, unknown> | null;
  body_kind: BlueprintBodyKind;
  /** Provenance citations rendered next to the body. F-04.6 - each ref may
   * carry a `drift` signal so the FE can flag stale citations. */
  source_refs: BlueprintSourceRef[];
  last_edited_by_user_id: string | null;
  last_synced_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* Phase D - structured `body_json` shapes (contract #5)                      */
/*                                                                            */
/* Several Blueprint sections now carry clickable structure in `body_json`    */
/* instead of (or in addition to) prose. These are the typed views the FE     */
/* casts the generic `body_json: Record<string, unknown>` into per section_key */
/* - the wire stays the loose record (ADR-032), the FE narrows at the render  */
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

/** domain `overview` section body. */
export interface DomainOverviewBody extends MermaidDiagram {
  repos?: Array<{ repo_id: string; name: string }>;
}

/** org `portfolio` section body. */
export interface OrgPortfolioBody extends MermaidDiagram {
  domains?: Array<{ domain_id: string; name: string }>;
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

/** A list-key the paginated derived endpoint serves - one per Blueprint
 *  derived component section (repo: api_surface / data_models / entry_points /
 *  hot_files / external_deps; domain: services / domain_glossary). */
export type DerivedListKey =
  | "api_surface"
  | "data_models"
  | "entry_points"
  | "hot_files"
  | "external_deps"
  | "services"
  | "domain_glossary";

/** One page of a derived component list (`GET /v1/knowledge/derived`) - the
 *  WHOLE dataset paginated (not just the section's stored top-N), with the true
 *  `total` so the FE can render "page X of Y" + a 10/20/50/100 page-size
 *  selector. */
export interface DerivedListPage {
  items: DerivedItem[];
  total: number;
  offset: number;
  limit: number;
}

/** One concrete edge behind an `OrgKnowledge.cross_repo_edges` connection -
 *  the `src_symbol --[route]--> dst_symbol` path shown when a connection row is
 *  expanded. `route` is the backend's own `METHOD /path/{param}` template (the
 *  most readable label); `transport` is e.g. `"sse"` / `"grpc"` when relevant. */
export interface CrossRepoEdgeDetail {
  route: string;
  src_symbol: string | null;
  dst_symbol: string | null;
  transport: string | null;
  confidence: number;
}

/** One page of cross-repo edge drill-down + the true `total`
 *  (`GET /v1/orgs/{org_id}/knowledge/cross-repo-edges`). Default 20/page;
 *  the FE offers 10/20/50/100. */
export interface CrossRepoEdgesPage {
  items: CrossRepoEdgeDetail[];
  total: number;
  offset: number;
  limit: number;
}

/** domain `domain_glossary` section body. */
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
  /** §5.29.9 cross-scope queue fields - present on the org-wide
   * `/v1/blueprint-proposals` listing, absent on per-scope listings. */
  section_title?: string;
  blueprint_id?: string;
  scope_kind?: "org" | "domain" | "repo";
  decided_at?: string | null;
  decided_by_user_id?: string | null;
  decision_note?: string | null;
  cooldown_until?: string | null;
}

/** Request body for `PATCH .../sections/{key}` - user-edit revision. */
export interface BlueprintSectionEditRequest {
  body_markdown?: string | null;
  body_json?: Record<string, unknown> | null;
  /** Optional title override; usually left unchanged. */
  title?: string;
  summary?: string;
  /** Why the user is editing - surfaced in revision history. */
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
/* F-04.7 - Decision list (ADR-064 + phase-03 Task 03.9)                      */
/* -------------------------------------------------------------------------- */

/** Scope of a decision - drives where it applies in the document tree. */
export type RunDecisionScopeKind = "global" | "section" | "selection";

/* -------------------------------------------------------------------------- */
/* F-04.8 - Improve endpoint body (Task 03.11)                                */
/* -------------------------------------------------------------------------- */

export type ImproveScopeKind = RunDecisionScopeKind;
export type ImprovementKind = "refine" | "expand" | "narrow" | "redraft";

/**
 * Scope collisions payload - when `origin === "scope_collisions"`, the
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
 * ADR-073 - Topology tier explorer, Activity timeline, Operations rollups
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

/** Org Operations tab rollup - single response from `api.orgs.operations`. */
export interface OrgOperationsData {
  /** Null when the caller lacks `cost:read` (cost visibility is
   *  leadership-only); the rest of the rollup still renders. */
  cost: {
    spent_mtd_usd: number;
    monthly_budget_usd?: number;
    spark: Array<{ day: string; cost_usd: number }>;
    top_caps: Array<{ domain_id: string; domain_name: string; spent_usd: number }>;
  } | null;
  sync_health: Array<{
    repo_id: string;
    repo_full_name: string;
    domain_id: string;
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
  /** Persist the caller's active org server-side (`users.last_active_org_id`).
   *  The OrgSwitcher + accept-invite call this so the choice survives even when
   *  this browser doesn't keep localStorage (blocked site data / www-vs-apex
   *  origin split): the backend then resolves the right org when no
   *  `X-Athena-Org-Id` header is present. Best-effort at the call sites. */
  setActiveOrg: (orgId: string) =>
    apiFetch<void>("/v1/me/active-org", {
      method: "PUT",
      body: JSON.stringify({ org_id: orgId }),
    }),
  /** Product-Work - the recursive Task spine + per-task thread + kanban board.
   *  Supersedes `api.runs` (retired with the run/phase model). Wire shapes:
   *  athena-docs/09-roadmap/product-work-rebuild.md §7. */
  tasks: {
    list: (
      params: {
        domain_id?: string;
        type?: TaskType;
        status?: TaskStatus;
        parent_id?: string;
        /** Match `tasks.assignee` - a user id or the `athena` executor sentinel. */
        assignee?: string;
        /** "My tasks" fence - a user id matched against the human side of a task
         *  (`owner_user_id` OR `created_by_user_id`), since Athena is the executor. */
        mine?: string;
        /** Free-text title search (server ILIKE). */
        q?: string;
        limit?: number;
        offset?: number;
      } = {},
    ) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
      const qs = sp.toString();
      return apiFetch<Task[]>(`/v1/tasks${qs ? `?${qs}` : ""}`);
    },
    create: (body: TaskCreateInput) =>
      apiFetch<Task>("/v1/tasks", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => apiFetch<Task>(`/v1/tasks/${encodeURIComponent(id)}`),
    /** The task + its children inlined (`WITH RECURSIVE` server-side). */
    tree: (id: string) =>
      apiFetch<TaskTreeNode>(`/v1/tasks/${encodeURIComponent(id)}/tree`),
    patch: (id: string, body: TaskPatchInput) =>
      apiFetch<Task>(`/v1/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    /** Remove a task from the board with a structured reason (persisted to
     *  `cancel_reason`); it moves to the Cancelled view, not deleted. */
    cancel: (id: string, reason: TaskCancelReason, note?: string) =>
      apiFetch<Task>(`/v1/tasks/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason, note: note ?? null }),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/v1/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Kanban board - columns bucketed by status, windowed so the Done column
     *  stays the recent shipped work only (older done ages into `history`).
     *  Org-wide, or narrowed by domain / type / priority / health / assignee /
     *  `mine` / search. */
    board: (params: TaskBoardParams = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
      const qs = sp.toString();
      return apiFetch<KanbanColumn[]>(`/v1/tasks/board${qs ? `?${qs}` : ""}`);
    },
    /** Completed-work history - shipped (`done`) + removed (`cancelled`) tasks,
     *  most-recently-completed first. The board's Done column ages into here. */
    history: (params: TaskHistoryParams = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
      const qs = sp.toString();
      return apiFetch<Task[]>(`/v1/tasks/history${qs ? `?${qs}` : ""}`);
    },
    /** The signed-in user's personal queue (on-you / in-progress / blocked /
     *  up-next / watching), bucketed + ordered server-side. */
    myWork: () => apiFetch<MyWork>("/v1/tasks/my-work"),
    /** Live per-status task counts - a cheap badge feed (no row bodies). */
    counts: () => apiFetch<TaskCounts>("/v1/tasks/count"),
    /** Whether the current user watches this task (cockpit toggle initial state). */
    watchState: (id: string) =>
      apiFetch<WatchState>(`/v1/tasks/${encodeURIComponent(id)}/watch`),
    /** Follow this task - it then surfaces in My Work's "Watching" section. */
    watch: (id: string) =>
      apiFetch<WatchState>(`/v1/tasks/${encodeURIComponent(id)}/watch`, {
        method: "POST",
      }),
    /** Unfollow this task. */
    unwatch: (id: string) =>
      apiFetch<WatchState>(`/v1/tasks/${encodeURIComponent(id)}/watch`, {
        method: "DELETE",
      }),
    /** Live SSE stream URL for one task (EventSource / the resumable hook). */
    streamUrl: (id: string) =>
      `${BASE}/v1/tasks/${encodeURIComponent(id)}/events`,
    /** Persisted event-history replay URL (keyset-paginated on seq). */
    replayUrl: (id: string) =>
      `${BASE}/v1/tasks/${encodeURIComponent(id)}/events/replay`,
    /** The non-blocking thread (clarifications / decisions / messages). */
    thread: (id: string) =>
      apiFetch<ThreadEntry[]>(`/v1/tasks/${encodeURIComponent(id)}/thread`),
    /** Append a user message or steer (non-blocking - the agent folds it in at
     *  its next turn boundary; no suspend). */
    postThread: (id: string, body: { kind: "user_message" | "steer"; body: string }) =>
      apiFetch<ThreadEntry>(`/v1/tasks/${encodeURIComponent(id)}/thread`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** Answer a pending input request (clarification). */
    answerInput: (id: string, requestId: string, answer: ThreadInputAnswer) =>
      apiFetch<ThreadEntry>(
        `/v1/tasks/${encodeURIComponent(id)}/inputs/${encodeURIComponent(requestId)}/answer`,
        { method: "POST", body: JSON.stringify(answer) },
      ),
    /** The cockpit stage rail - registry order + each stage's stored FSM state. */
    stages: (id: string) =>
      apiFetch<TaskStage[]>(`/v1/tasks/${encodeURIComponent(id)}/stages`),
    /** The "Context loaded" strip - exactly what this stage's agent brief
     *  will carry (same gather + caps as the backend driver composes). */
    contextPreview: (id: string, stage: string) =>
      apiFetch<ContextSource[]>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/context-preview`,
      ),
    /** The agent's compact work ledger - what it actually did, step by step
     *  (the foldable worklog's detail-on-expand). Refs only; pull bodies on
     *  demand. Optionally scoped to one stage. */
    ledger: (id: string, params: { stage?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (params.stage) sp.set("stage", params.stage);
      if (params.limit) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return apiFetch<LedgerStep[]>(
        `/v1/tasks/${encodeURIComponent(id)}/ledger${qs ? `?${qs}` : ""}`,
      );
    },
    /** Token totals for the task split by provenance (internal / measured
     *  MCP I/O / self-reported) - the cockpit's token readout next to cost. */
    usage: (id: string) =>
      apiFetch<TaskUsage>(`/v1/tasks/${encodeURIComponent(id)}/usage`),
    /** The working (latest) body of a stage's artifact - what the cockpit's
     *  artifact card renders. The AI uses only this version; older revisions
     *  (see `artifactVersions`) are never in agent context. */
    artifact: (id: string, artifactId: string) =>
      apiFetch<ArtifactDetail>(
        `/v1/tasks/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}`,
      ),
    /** What generated an artifact - the source Refs of the steps that produced
     *  it (the artifact card's "Generated from" expander). */
    provenance: (id: string, artifactId: string) =>
      apiFetch<Ref[]>(
        `/v1/tasks/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/provenance`,
      ),
    /** An artifact's version history (human audit / rollback). The AI uses only
     *  the working version; old versions are never in agent context. */
    artifactVersions: (id: string, artifactId: string) =>
      apiFetch<ArtifactVersion[]>(
        `/v1/tasks/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/versions`,
      ),
    /** One historical version's body - the compare/rollback view. */
    artifactVersion: (id: string, artifactId: string, version: number) =>
      apiFetch<ArtifactVersionDetail>(
        `/v1/tasks/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/versions/${version}`,
      ),
    /** Make a previous version the WORKING version - append-only rollback (the
     *  old body is written as a NEW version; history keeps every step).
     *  Restoring over an approved stage re-derives downstream. */
    restoreArtifactVersion: (id: string, artifactId: string, version: number) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/versions/${version}/restore`,
        { method: "POST" },
      ),
    /** Artifacts from parent / sibling / child / dependency tasks, as compact
     *  pointers (the "Related" affordance). Bodies pulled on demand. */
    relatedArtifacts: (id: string) =>
      apiFetch<RelatedArtifact[]>(
        `/v1/tasks/${encodeURIComponent(id)}/related-artifacts`,
      ),
    /** This task's direct child tasks (a decompose's subtasks) as compact
     *  summaries - title/type/status, so the cockpit shows what each subtask is. */
    children: (id: string) =>
      apiFetch<TaskChild[]>(`/v1/tasks/${encodeURIComponent(id)}/children`),
    /** Direct subtasks in execution (topological) order, each marked Ready or
     *  Waiting on its unmet dependencies - the dependency-aware subtask view. */
    subtree: (id: string) =>
      apiFetch<SubtaskNode[]>(`/v1/tasks/${encodeURIComponent(id)}/subtree`),
    /** Mark this task as waiting on another (a coordination edge). The API
     *  rejects a self-edge or a cycle (the DAG invariant). Returns the task's
     *  updated dependency ids. */
    addDependency: (id: string, body: TaskDependencyInput) =>
      apiFetch<TaskDependencies>(`/v1/tasks/${encodeURIComponent(id)}/deps`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** Remove a coordination edge (no-op if it never existed). */
    removeDependency: (id: string, body: TaskDependencyInput) =>
      apiFetch<TaskDependencies>(`/v1/tasks/${encodeURIComponent(id)}/deps`, {
        method: "DELETE",
        body: JSON.stringify(body),
      }),
    /** Athena's pending follow-up proposals for a task - each with its rationale +
     *  source. Offers, not tasks, until accepted (SUG-3). */
    suggestions: (id: string) =>
      apiFetch<TaskSuggestion[]>(
        `/v1/tasks/${encodeURIComponent(id)}/suggestions`,
      ),
    /** Accept a proposal → mint a real child task on the spine (parented to this
     *  task). Returns the created task so the cockpit can navigate to it. */
    acceptSuggestion: (id: string, suggestionId: string, body: AcceptSuggestionInput = {}) =>
      apiFetch<Task>(
        `/v1/tasks/${encodeURIComponent(id)}/suggestions/${encodeURIComponent(suggestionId)}/accept`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** Decline a proposal - it drops out of the queue. */
    dismissSuggestion: (id: string, suggestionId: string) =>
      apiFetch<void>(
        `/v1/tasks/${encodeURIComponent(id)}/suggestions/${encodeURIComponent(suggestionId)}/dismiss`,
        { method: "POST" },
      ),
    /** Kick off an Athena AI run for one stage (the cockpit's "Run with Athena"
     *  CTA). Optional `body` carries pre-run steer text the agent reads before
     *  it begins. Returns the stage with its FSM advanced to `running`; live
     *  progress arrives over the task SSE stream. The manual path
     *  (authorArtifact → submitStage) does not need this - a task is always
     *  completable with zero AI. */
    runStage: (id: string, stage: string, body?: StageRunInput) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/run`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
      ),
    /** Ask Athena to change a stage's existing artifact (DSGN-1 "edit by asking
     *  AI"). Reopens a settled / in-review stage and re-runs it with the
     *  instruction; an approved edit re-derives downstream. Returns the stage
     *  advanced to `running`; progress rides the task SSE stream. */
    refineStage: (id: string, stage: string, body: StageRefineInput) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/refine`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** Scoped span edit: rewrite ONLY the selected fragment of a stage artifact
     *  (the "select a part, ask AI to change just that part" loop). Returns the
     *  rewritten fragment; the editor splices it in place and the user saves a
     *  new version. No stage reopen / re-run. */
    editSpan: (id: string, stage: string, body: ArtifactEditSpanInput) =>
      apiFetch<ArtifactEditSpanResult>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/artifact/edit-span`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** Reopen an APPROVED stage so the work can go through the process again -
     *  back to `ready` (re-run / edit / re-gate); downstream stages re-derive.
     *  Human/UI-only: agents and MCP executors can never undo an approval. */
    reopenStage: (id: string, stage: string) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/reopen`,
        { method: "POST" },
      ),
    /** Stop a running AI stage WITHOUT cancelling the task - the cockpit's
     *  "Stop Athena" control. The driver frees the stage back to `ready` at its
     *  next turn boundary (re-runnable / manual-authorable). 409 if not running. */
    stopStage: (id: string, stage: string) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/stop`,
        { method: "POST" },
      ),
    /** AI-OPTIONAL manual path - author/edit a stage's artifact by hand. Works
     *  with or without any agent run; a task never depends on Athena AI. */
    authorArtifact: (id: string, stage: string, body: StageArtifactInput) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/artifact`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** Mark a stage ready (manual or post-AI): hard gate → in_review, soft →
     *  approved + next stage unlocked. */
    submitStage: (id: string, stage: string) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/submit`,
        { method: "POST" },
      ),
    /** Resolve a stage's hard gate - the human sign-off (always manual). */
    gateStage: (id: string, stage: string, body: StageGateInput) =>
      apiFetch<TaskStage>(
        `/v1/tasks/${encodeURIComponent(id)}/stages/${encodeURIComponent(stage)}/gate`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  },
  /** The org's enabled models (the `<ModelSelector>` data source) + per-model
   *  on/off. Replaces the deleted role-routing surface. */
  models: {
    enabled: () => apiFetch<EnabledModel[]>("/v1/models/enabled"),
    setEnabled: (provider: string, modelId: string, enabled: boolean) =>
      apiFetch<EnabledModel>(
        `/v1/models/${encodeURIComponent(provider)}/${encodeURIComponent(modelId)}`,
        { method: "PATCH", body: JSON.stringify({ enabled }) },
      ),
    /** The org's two configurable ingestion models (per-file summaries + deep
     *  synthesis) + Athena defaults. Embeddings are fixed/platform, not here. */
    ingestion: () => apiFetch<IngestModels>("/v1/models/ingestion"),
    /** Set/reset the two ingestion tiers. A `null` tier resets it to the Athena
     *  default. */
    setIngestion: (body: {
      file: IngestModelPick | null;
      synthesis: IngestModelPick | null;
    }) =>
      apiFetch<IngestModels>("/v1/models/ingestion", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },
  auth: {
    sync: () => apiFetch<AuthSyncResponse>("/v1/auth/sync", { method: "POST" }),
    logout: () => apiFetch<{ accepted: boolean }>("/v1/auth/logout", { method: "POST" }),
    /** Public, pre-sign-in. Given an email, returns how it signs in so the
     *  form can redirect an OAuth account to its provider instead of
     *  emailing an OTP it can't use. No auth header required. */
    identityLookup: (email: string) =>
      apiFetch<IdentityLookupResponse>("/v1/auth/identity-lookup", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
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
    /** Org-level knowledge - registry + cross-cap dependency model + Blueprint excerpts. */
    knowledge: (orgId: string) =>
      apiFetch<OrgKnowledge>(`/v1/orgs/${encodeURIComponent(orgId)}/knowledge`),
    /** Per-route drill-down behind ONE rolled-up cross-repo connection from
     *  `OrgKnowledge.cross_repo_edges` - the concrete `src --[route]--> dst`
     *  edges for a `(src_repo, dst_repo, kind)` triple, paginated (default
     *  20/page; the FE offers 10/20/50/100) so a connection can be expanded
     *  without bloating the core knowledge payload. */
    crossRepoEdges: (
      orgId: string,
      params: {
        srcRepoId: string;
        dstRepoId: string;
        kind: string;
        offset?: number;
        limit?: number;
      },
    ) => {
      const sp = new URLSearchParams({
        src_repo_id: params.srcRepoId,
        dst_repo_id: params.dstRepoId,
        kind: params.kind,
      });
      if (params.offset != null) sp.set("offset", String(params.offset));
      if (params.limit != null) sp.set("limit", String(params.limit));
      return apiFetch<CrossRepoEdgesPage>(
        `/v1/orgs/${encodeURIComponent(orgId)}/knowledge/cross-repo-edges?${sp.toString()}`,
      );
    },
    /** ADR-073 Operations tab rollup - cost, sync health, integrations,
     *  members, audit preview, re-embed classifier metrics. Single round
     *  trip; the page passes each slice into the Operations card grid. */
    operations: (orgId: string) =>
      apiFetch<OrgOperationsData>(`/v1/orgs/${encodeURIComponent(orgId)}/operations`),
    /** ADR-073 Activity tab - org-wide timeline of ingestion + run +
     *  decision + blueprint-edit events. Paginated; caller passes the
     *  `before` cursor to load the next page (50/page). */
    activity: (orgId: string, query: { before?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (query.before) sp.set("before", query.before);
      if (query.limit) sp.set("limit", String(query.limit));
      const qs = sp.toString();
      return apiFetch<ActivityEvent[]>(`/v1/orgs/${encodeURIComponent(orgId)}/activity${qs ? `?${qs}` : ""}`);
    },
    /** ADR-073 Decisions tab - full org-scope decision records (separate
     *  from `OrgKnowledge.stale_decisions`, which is just the flagged set). */
    decisions: (orgId: string) =>
      apiFetch<DecisionRecord[]>(`/v1/orgs/${encodeURIComponent(orgId)}/decisions`),
    /** §5.29.10 Item 1b - CRUD namespace for org-scope decisions. The BE
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
  /** Roles & permissions - the org's data-driven RBAC surface. List is
   *  readable by anyone with `members:read`; every mutation needs
   *  `roles:manage`. */
  roles: {
    list: (orgId: string) => apiFetch<OrgRole[]>(`/v1/orgs/${encodeURIComponent(orgId)}/roles`),
    create: (orgId: string, body: { name: string; description?: string | null; permissions: string[] }) =>
      apiFetch<OrgRole>(`/v1/orgs/${encodeURIComponent(orgId)}/roles`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patch: (orgId: string, roleId: string, body: { name?: string; description?: string | null; permissions?: string[] }) =>
      apiFetch<OrgRole>(`/v1/orgs/${encodeURIComponent(orgId)}/roles/${encodeURIComponent(roleId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    /** Delete a role. When the role is still in use the BE 409s with
     *  `role_in_use` metadata - re-call with `reassignTo` (another
     *  role's id) to atomically repoint members + pending invitations +
     *  the org default before the row is removed. */
    remove: (orgId: string, roleId: string, reassignTo?: string) =>
      apiFetch<void>(
        `/v1/orgs/${encodeURIComponent(orgId)}/roles/${encodeURIComponent(roleId)}${reassignTo ? `?reassign_to=${encodeURIComponent(reassignTo)}` : ""}`,
        { method: "DELETE" },
      ),
    /** The full permission catalog (org groups + domain entries) with
     *  display labels - what the role editor renders. */
    catalog: (orgId: string) =>
      apiFetch<PermissionCatalog>(`/v1/orgs/${encodeURIComponent(orgId)}/permissions`),
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
    /** §5.4 row-3 - mint a link-mode invitation. The response carries
     *  `invitation_url` (the share payload); the raw token is never
     *  re-emitted on list/get. */
    createLink: (orgId: string, body: { role: string }) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations/link`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** §5.4 row-2 - extend `expires_at` by another TTL window and
     *  re-send the original invitation email. 409s on link-mode rows
     *  (admin should regenerate instead). */
    resend: (orgId: string, invitationId: string) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(invitationId)}/resend`, { method: "POST" }),
    revoke: (orgId: string, invitationId: string) =>
      apiFetch<Invitation>(`/v1/orgs/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(invitationId)}/revoke`, { method: "POST" }),
    accept: (token: string) =>
      apiFetch<{ org_id: string; role: string }>(`/v1/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
    /**
     * §7.9.7 - read-only seat-aware preview. The accept-invite page calls
     * this BEFORE Accept so the seat-full card can render without burning
     * an Accept-attempt's 409. HHHH landed the BE side.
     */
    preview: (token: string) =>
      apiFetch<InvitationPreview>(`/v1/invitations/${encodeURIComponent(token)}/preview`),
  },
  emailDomains: {
    list: (orgId: string) => apiFetch<DomainVerification[]>(`/v1/orgs/${encodeURIComponent(orgId)}/email-domains`),
    claim: (orgId: string, domain: string) =>
      apiFetch<DomainVerification>(`/v1/orgs/${encodeURIComponent(orgId)}/email-domains`, {
        method: "POST",
        body: JSON.stringify({ domain }),
      }),
    verify: (orgId: string, verificationId: string) =>
      apiFetch<DomainVerification>(`/v1/orgs/${encodeURIComponent(orgId)}/email-domains/${encodeURIComponent(verificationId)}/verify`, { method: "POST" }),
    unclaim: (orgId: string, verificationId: string) =>
      apiFetch<void>(`/v1/orgs/${encodeURIComponent(orgId)}/email-domains/${encodeURIComponent(verificationId)}`, { method: "DELETE" }),
  },
  domains: {
    list: (includeDeleted: IncludeDeletedFilter = "false") => {
      const qs = includeDeleted === "false" ? "" : `?include_deleted=${includeDeleted}`;
      return apiFetch<Domain[]>(`/v1/domains${qs}`);
    },
    create: (body: { slug: string; name: string; description?: string }) =>
      apiFetch<Domain>("/v1/domains", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string, opts: { includeDeleted?: boolean } = {}) => {
      const qs = opts.includeDeleted ? "?include_deleted=true" : "";
      return apiFetch<Domain>(`/v1/domains/${encodeURIComponent(id)}${qs}`);
    },
    patch: (id: string, body: Partial<Pick<Domain, "name" | "description">>) =>
      apiFetch<Domain>(`/v1/domains/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    archive: (id: string) =>
      apiFetch<Domain>(`/v1/domains/${encodeURIComponent(id)}/archive`, { method: "POST" }),
    /** §5.31 stage-1: mark domain deleted_at; hides from default list +
     *  KG retrieval but keeps the row for restore. Idempotent. */
    softDelete: (id: string) =>
      apiFetch<Domain>(`/v1/domains/${encodeURIComponent(id)}:soft-delete`, { method: "POST" }),
    /** §5.31 restore: clears deleted_at + re-enqueues ingest for every
     *  attached repo. Idempotent. */
    restore: (id: string) =>
      apiFetch<Domain>(`/v1/domains/${encodeURIComponent(id)}:restore`, { method: "POST" }),
    /** §5.31 stage-2: hard delete + cascade. 409s unless the cap is already
     *  soft-deleted; typed-slug confirmation required in body. */
    permanentDelete: (id: string, confirmSlug: string) =>
      apiFetch<void>(`/v1/domains/${encodeURIComponent(id)}/permanent`, {
        method: "DELETE",
        body: JSON.stringify({ confirm_slug: confirmSlug }),
      }),
    /** §5.29.12 - domain settings PATCH for budget + future per-cap policy
     *  knobs. Today carries `budget_mtd_usd` only (used by the /cost page's
     *  "Set budget" CTA); the BE shape stays flexible for future additions. */
    patchSettings: (id: string, body: { budget_mtd_usd?: number }) =>
      apiFetch<{ id: string; budget_mtd_usd: number | null }>(
        `/v1/domains/${encodeURIComponent(id)}/settings`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    listRepos: (id: string) => apiFetch<DomainRepo[]>(`/v1/domains/${encodeURIComponent(id)}/repos`),
    attachRepo: (id: string, body: { integration_id: string; repo_full_name: string; default_branch?: string }) =>
      apiFetch<DomainRepo>(`/v1/domains/${encodeURIComponent(id)}/repos`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    detachRepo: (id: string, repoId: string) =>
      apiFetch<void>(`/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}`, { method: "DELETE" }),
    /**
     * §3.5 row 3 / §5.29.11 - enqueue an ingest_repo job for this
     * domain's repo. Returns the Arq job id so callers can poll
     * `listRepos` for `last_indexed_sha` flipping. Ingest also runs
     * the inline embedding pass per §3.13.
     */
    syncRepoKnowledge: (id: string, repoId: string) =>
      apiFetch<{ job_id: string; status: string; repo_id: string; branch_sha: string }>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:sync`,
        { method: "POST" },
      ),
    /**
     * Stop ingestion - cancels an in-flight `ingest_repo` job for this
     * domain's repo. Same id args / path shape as `syncRepoKnowledge`,
     * with `:cancel` instead of `:sync`. Cooperative cancel: the endpoint
     * flips the in-flight progress row to `cancelled` and stamps
     * `current_sync_stage='cancelled'` for instant feedback; the worker
     * stops within a batch. Idempotent - `cancelled=false` when nothing
     * was running. Same auth/permission as Sync (403 surfaces as a toast).
     */
    repoCancelSync: (id: string, repoId: string) =>
      apiFetch<RepoCancelSyncResponse>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:cancel`,
        { method: "POST" },
      ),
    /**
     * Item 1 - resume a PAUSED ingest by SKIPPING the file whose dossier LLM
     * call failed. The file is appended to the skip-set (resolved WITHOUT the
     * LLM on the re-enqueued run - raw body if reasonable, else skipped) and
     * ingest re-queues. `resumed=false` is a no-op (nothing paused). To abort
     * instead, use `repoCancelSync` (it treats a paused row as in-flight).
     */
    repoSkipPausedFile: (id: string, repoId: string, opts?: { all?: boolean }) =>
      apiFetch<RepoSkipFileResponse>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:skip-file`,
        opts?.all
          ? { method: "POST", body: JSON.stringify({ skip_all: true }) }
          : { method: "POST" },
      ),
    /**
     * Resume a PAUSED ingest by RE-ATTEMPTING the failed file's dossier LLM call
     * (e.g. after a rate limit / quota clears) - the file is NOT skipped. If it
     * fails again it re-pauses. Same endpoint as skip, with `{retry:true}`.
     */
    repoRetryPausedFile: (id: string, repoId: string) =>
      apiFetch<RepoSkipFileResponse>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:skip-file`,
        { method: "POST", body: JSON.stringify({ retry: true }) },
      ),
    /**
     * Batch 12k - re-run unresolved enrichment failures for a degraded
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
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge:retry-enrichments`,
        { method: "POST", body: JSON.stringify(body ?? {}) },
      ),
    listResources: (id: string) =>
      apiFetch<DomainResource[]>(`/v1/domains/${encodeURIComponent(id)}/resources`),
    /** Sources tab - upload a file / link / note. Multipart; the backend
     *  extracts + indexes the content into the domain knowledge base
     *  synchronously and returns the indexed row. */
    uploadResource: (id: string, input: UploadResourceInput) =>
      uploadDomainResource(id, input),
    /** Sources tab - delete a resource + purge its indexed overlay chunks. */
    deleteResource: (id: string, resourceId: string) =>
      apiFetch<void>(
        `/v1/domains/${encodeURIComponent(id)}/resources/${encodeURIComponent(resourceId)}`,
        { method: "DELETE" },
      ),
    config: (id: string) =>
      apiFetch<DomainConfig>(`/v1/domains/${encodeURIComponent(id)}/config`),
    notes: (id: string) =>
      apiFetch<DomainNote[]>(`/v1/domains/${encodeURIComponent(id)}/notes`),
    /** Domain-level knowledge summary produced by ingestion + the hierarchical KG. */
    knowledge: (id: string) =>
      apiFetch<DomainKnowledge>(`/v1/domains/${encodeURIComponent(id)}/knowledge`),
    /** Per-repo knowledge inside a domain. */
    repoKnowledge: (id: string, repoId: string) =>
      apiFetch<RepoKnowledge>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge`,
      ),
    /** Phase D contract #3 - live staleness gate. Does a LIVE GitHub HEAD
     *  check; the repo page calls this on load and shows the Sync action
     *  ONLY when `is_stale` is true. `checked_live=false` → soft
     *  "couldn't verify" affordance. */
    repoSyncStatus: (id: string, repoId: string) =>
      apiFetch<RepoSyncStatus>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/knowledge/sync-status`,
      ),
    /** Phase D contract #4 - open pull requests for the repo's SCM. Renders
     *  the repo PR tab. `available=false` → "connect integration" empty
     *  state. */
    repoPullRequests: (id: string, repoId: string) =>
      apiFetch<RepoPullRequestsResponse>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/pull-requests`,
      ),
    /** ADR-073 - Topology tier tree for a repo (ADR-042 five-tier hierarchy
     *  precomputed for navigation). Returned root is the repo tier with
     *  child services → modules → components → files inline. */
    repoTierTree: (id: string, repoId: string) =>
      apiFetch<TierNode>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/tier-tree`,
      ),
    /** ADR-073 Activity tab - domain-scoped event timeline. Same shape
     *  as `api.orgs.activity` but filtered to events tied to this domain
     *  or its attached repos. */
    activity: (id: string, query: { before?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (query.before) sp.set("before", query.before);
      if (query.limit) sp.set("limit", String(query.limit));
      const qs = sp.toString();
      return apiFetch<ActivityEvent[]>(
        `/v1/domains/${encodeURIComponent(id)}/activity${qs ? `?${qs}` : ""}`,
      );
    },
    /** ADR-073 Decisions tab - domain-scoped decision records. */
    decisions: (id: string) =>
      apiFetch<DecisionRecord[]>(`/v1/domains/${encodeURIComponent(id)}/decisions`),
    /** §5.30 - per-domain access control. Org owner/admin retain
     *  implicit domain-admin reach on every domain; this namespace is what
     *  domain-admin engineers use on domains they were assigned to. */
    members: {
      list: (id: string) =>
        apiFetch<DomainMember[]>(
          `/v1/domains/${encodeURIComponent(id)}/members`,
        ),
      addByEmail: (id: string, body: { email: string; role: DomainRole; permissions?: string[] }) =>
        apiFetch<DomainMember>(
          `/v1/domains/${encodeURIComponent(id)}/members`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      patch: (id: string, userId: string, body: { role: DomainRole; permissions?: string[] }) =>
        apiFetch<DomainMember>(
          `/v1/domains/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      remove: (id: string, userId: string) =>
        apiFetch<void>(
          `/v1/domains/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
          { method: "DELETE" },
        ),
    },
    /** §5.29.10 Item 1b - CRUD namespace for domain-scope decisions.
     *  BE greenfield; mock handlers carry the demo flow today. */
    decisionList: {
      list: (id: string) =>
        apiFetch<DecisionRecord[]>(`/v1/domains/${encodeURIComponent(id)}/decisions`),
      create: (id: string, body: DecisionRecordCreateRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/domains/${encodeURIComponent(id)}/decisions`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      patch: (id: string, decisionId: string, body: DecisionRecordPatchRequest) =>
        apiFetch<DecisionRecord>(
          `/v1/domains/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      revert: (id: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/domains/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}/revert`,
          { method: "POST" },
        ),
      escalate: (id: string, decisionId: string) =>
        apiFetch<DecisionRecord>(
          `/v1/domains/${encodeURIComponent(id)}/decisions/${encodeURIComponent(decisionId)}/escalate`,
          { method: "POST" },
        ),
    },
    /** ADR-073 Activity tab - repo-scoped event timeline. */
    repoActivity: (id: string, repoId: string, query: { before?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (query.before) sp.set("before", query.before);
      if (query.limit) sp.set("limit", String(query.limit));
      const qs = sp.toString();
      return apiFetch<ActivityEvent[]>(
        `/v1/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repoId)}/activity${qs ? `?${qs}` : ""}`,
      );
    },
  },
  /** §5.31 - org-scoped repo lifecycle. A ``Repo`` is org-deduplicated (one row
   *  per `(org_id, integration_id, full_name)`) regardless of how many caps
   *  attach it. Soft-delete affects every cap; the per-cap detach (under
   *  `api.domains.detachRepo`) only removes the link. */
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
    /** §3.13 row 1 - latest ``current`` stage snapshot + ``history`` of
     *  the most recent 5 attempts. Returns null when the repo has never
     *  been ingest-attempted (FE renders "Never synced"). */
    ingestProgress: (repoId: string) =>
      apiFetch<RepoIngestProgress | null>(
        `/v1/repos/${encodeURIComponent(repoId)}/ingest-progress`,
      ),
    /** ADR-086 - the per-repo build+test sandbox (Sandbox tab). Config CRUD +
     *  derived status; the execution loop is gated off until Inc 2+. */
    sandbox: {
      status: (repoId: string) =>
        apiFetch<SandboxStatus>(
          `/v1/repos/${encodeURIComponent(repoId)}/sandbox/status`,
        ),
      getConfig: (repoId: string) =>
        apiFetch<SandboxConfig | null>(
          `/v1/repos/${encodeURIComponent(repoId)}/sandbox/config`,
        ),
      putConfig: (repoId: string, body: SandboxConfigInput) =>
        apiFetch<SandboxConfig>(
          `/v1/repos/${encodeURIComponent(repoId)}/sandbox/config`,
          { method: "PUT", body: JSON.stringify(body) },
        ),
      autodetect: (repoId: string) =>
        apiFetch<SandboxDetect>(
          `/v1/repos/${encodeURIComponent(repoId)}/sandbox/config:autodetect`,
          { method: "POST" },
        ),
      build: (repoId: string) =>
        apiFetch<SandboxBuild>(
          `/v1/repos/${encodeURIComponent(repoId)}/sandbox:build`,
          { method: "POST" },
        ),
      deleteConfig: (repoId: string) =>
        apiFetch<void>(
          `/v1/repos/${encodeURIComponent(repoId)}/sandbox/config`,
          { method: "DELETE" },
        ),
    },
    /** §5.29.10 row 1c - repo-scoped governance feed (live BE via
     *  `/v1/repos/{repo_id}/decisions`). ADR-073 §4 overridden: repos
     *  get their own Decisions tab instead of rolling up to domain. */
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
    /** §6.0 - per-repo file browser. Lists every file row produced by the
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
      /** §6.5.6 - "who depends on this file?" panel. Wraps
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
      /** §6.5.6 - "what does this file depend on?" sibling panel.
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
      /** §6.5.6 - "neighborhood of this file" (expand_slice mode).
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
      /** §6.5.6 - file content viewer. Wraps `read_repo_file` agent
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
    /** §6.5.6 - in-repo regex grep. Wraps `grep_repo` agent tool via
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
  /**
   * Per-section 👍/👎 - §9.6 / ADR-032 BE-bends-to-FE. The backend exposes
   * a polymorphic `(artifact_kind, artifact_id, section_key, sentiment)`
   * surface (six artifact kinds today); the FE only exercises the run-doc
   * sections, so the wrapper takes the run id + section id and posts to the
   * `document_section` artifact kind. Idempotent - re-posting the same
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
     * §5.29.11 / B7.4 - list repos the OAuth user / App installation can
     * attach. Used by the AttachRepoDialog on `/domains/[id]`. Empty
     * list when the integration has no token on file or the SCM call
     * fails (the dialog shows a friendly empty state in that case).
     */
    listAvailableRepos: (orgId: string, integrationId: string) =>
      apiFetch<AvailableRepo[]>(
        `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}/available-repos`,
      ),
    /**
     * §5.16 r2 / F-08.1 - Generic OAuth + GitHub-App install flow.
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
     * §5.14 r2 - JSON Schema describing the provider's `config` shape.
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
   * §5.29.3 / ADR-081 - Razorpay-backed billing surface. Reads work for
   * any tier; the dev-mode synthetic subscription is returned by
   * `subscription` so the UI always has something to render. Every *write*
   * endpoint returns a one-time Razorpay **Order** payload the FE opens
   * with Checkout.js (`lib/billing/razorpay-checkout.ts`) - there is no
   * hosted redirect URL and no `NEXT_PUBLIC_*` key (it rides in the order
   * response). `checkoutOrder` / `cancel` / `upgradeToPro` / `buySeats` /
   * `topup` raise `BillingError({code:'dev_mode_active'})` when the BE runs
   * with `ATHENA_DEV_UNRESTRICTED_ACCESS=true`; FE catches the code and
   * shows a friendly empty state instead of a 500-shaped error.
   */
  billing: {
    // Org is resolved server-side via the `X-Athena-Org-Id` header that
    // `apiFetch` injects (matches the BE `OrgDep` dependency); no
    // org-id needs to land in the URL path.
    subscription: () =>
      apiFetch<Subscription | null>("/v1/billing/subscription"),
    /** ADR-081 - POST /v1/billing/checkout-order (renamed from
     *  `checkout-session`). Brand-new tier purchase; returns a one-time
     *  Razorpay Order payload the caller opens with Checkout.js. */
    checkoutOrder: (body: CheckoutOrderRequest) =>
      apiFetch<OrderPayload>(
        "/v1/billing/checkout-order",
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** ADR-081 - POST /v1/billing/cancel (replaces `portal-session`).
     *  In-app subscription cancel; Razorpay has no hosted portal. 409s
     *  with `code: "no_active_subscription"` when there's nothing to
     *  cancel. */
    cancel: () =>
      apiFetch<CancelResponse>(
        "/v1/billing/cancel",
        { method: "POST" },
      ),
    /** ADR-081 - POST /v1/billing/verify. HMAC-confirms the Checkout.js
     *  callback triple for synchronous UX. `verified:true` is confirmation
     *  only; the webhook is the entitlement source of truth, so the caller
     *  then polls credits/subscription. */
    verify: (body: VerifyRequest) =>
      apiFetch<VerifyResult>(
        "/v1/billing/verify",
        { method: "POST", body: JSON.stringify(body) },
      ),
    /**
     * §7.9.5 row 2463 - seat-summary read. Org is resolved via the
     * `X-Athena-Org-Id` header injected by `apiFetch`, matching the BE's
     * `OrgDep`. Returns null/0 fields gracefully when the BE 404s on
     * older builds so SeatsCard can render a non-fatal empty state.
     */
    getSeats: (orgId: string) =>
      apiFetch<SeatsOut>(`/v1/orgs/${encodeURIComponent(orgId)}/seats`),
    /** §7.9.5 row 2463 / ADR-081 - POST /v1/orgs/{id}/seats/buy. Returns a
     *  one-time Razorpay Order payload; the webhook applies the seat
     *  increment on `payment.captured`. */
    buySeats: (orgId: string, body: BuySeatsRequest) =>
      apiFetch<BuySeatsResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/seats/buy`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** §7.9.5 row 2463 - POST /v1/orgs/{id}/seats/release (in-app, no
     *  charge). 409s with `code: "seats_release_would_displace"` when
     *  releasing would drop an active member's seat. */
    releaseSeats: (orgId: string, body: BuySeatsRequest) =>
      apiFetch<ReleaseSeatsResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/seats/release`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** §7.9.5 / ADR-081 - POST /v1/orgs/{id}/billing/upgrade. Returns a
     *  one-time Razorpay Order payload the caller opens with Checkout.js.
     *  `additional_seats` optional 0..50. */
    upgradeToPro: (orgId: string, body: UpgradeToProRequest = {}) =>
      apiFetch<UpgradeToProResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/billing/upgrade`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    /** §7.9.5 row 2465 / ADR-081 - POST /v1/orgs/{id}/billing/downgrade-to-solo.
     *  In-app, no charge (Standard Checkout has no proration). 409s with
     *  `code: "downgrade_blocked_active_members"` when the org has more
     *  than one active member. */
    downgradeToSolo: (orgId: string) =>
      apiFetch<DowngradeToSoloResponse>(
        `/v1/orgs/${encodeURIComponent(orgId)}/billing/downgrade-to-solo`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    /** §7.9.5 row 2464 - public price catalog (INR ints, or null in dev).
     *  No auth required; FE call-site catches an unreachable endpoint and
     *  falls back to `lib/billing/price-catalog.ts` constants. */
    priceCatalog: () =>
      apiFetch<PriceCatalog>("/v1/billing/price-catalog"),
  },
  /**
   * §7.10 / ADR-081 - Credit-based billing surface. Reads the current
   * org's credit balance, mints a one-time Razorpay top-up Order (opened
   * with Checkout.js), and configures overage / spend-cap policy.
   * Owner-only mutations are enforced server-side; the FE renders disabled
   * inputs as defense-in-depth.
   */
  credits: {
    /** Read the org's current credit balance - drives the meter, halt
     *  banner, and topup modal copy. */
    getBalance: (orgId: string) =>
      apiFetch<CreditBalance>(`/v1/orgs/${encodeURIComponent(orgId)}/credits`),
    /** ADR-081 - POST /v1/orgs/{id}/credits/topup. Returns a one-time
     *  Razorpay Order payload the caller opens with Checkout.js; the grant
     *  lands via the `payment.captured` webhook. `amount_usd` 10..1000 per
     *  readiness §7.10.5 (charged in INR; ledger stays USD). */
    topup: (orgId: string, body: { amount_usd: number }) =>
      apiFetch<OrderPayload>(
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
    /** Lightweight ping - fires the configured auth and reports latency. */
    test: (id: string) =>
      apiFetch<{ ok: boolean; latency_ms: number; tool_count: number; detail: string }>(
        `/v1/mcp/${encodeURIComponent(id)}/test`,
        { method: "POST" },
      ),
    /** Wizard step 3 - introspect a candidate MCP without saving. */
    discover: (body: { transport: McpTransport; endpoint_url: string; auth: McpAuth }) =>
      apiFetch<McpDiscovery>("/v1/mcp/discover", { method: "POST", body: JSON.stringify(body) }),
    /** Refresh the cached tool list from a live `tools/list` probe.
     *  New tools land with read-heuristic defaults (reads auto, writes
     *  prompt); admin enabled/approval choices are preserved. */
    syncTools: (id: string) =>
      apiFetch<{ synced: number; detail: string }>(
        `/v1/mcp/${encodeURIComponent(id)}/sync-tools`,
        { method: "POST" },
      ),
    /** Accept the current tool list as "reviewed" - clears pending_drift. */
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
     * Patch fields on a model provider - usually the BYO API key.
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
    /** §7.8.1 - POST `/v1/orgs/{id}/model-providers` to register a new
     *  provider key. `provider` MUST be a catalog id (lowercase) from
     *  `api.llmProviders.catalog()`. `enabled_models` lists which
     *  catalog models this org enables on this key. `api_key` is the
     *  plaintext - server AEAD-encrypts before storage. */
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
    /** §7.8.1 - `GET /v1/orgs/{id}/model-providers/{id}/usage` returns
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
    /** §7.8.1 - `GET /v1/llm/providers/catalog` returns the static
     *  14-provider catalog (Anthropic / OpenAI / Google / DeepSeek
     *  plus 10 free-tier aggregators). Backs the "Add provider"
     *  picker and the per-provider model checkbox list. */
    catalog: () =>
      apiFetch<CatalogProvider[]>(`/v1/llm/providers/catalog`),
  },
  /** Personal AI-subscription connections (Claude Pro/Max, ChatGPT Codex) -
   *  `/v1/users/me/ai-subscriptions`. PERSONAL: rows belong to the current
   *  user, usable in chat only, never pooled across the org. Connect
   *  live-verifies the pasted CLI credential through the vendor binary
   *  before anything is stored. */
  aiSubscriptions: {
    list: () => apiFetch<AiSubscription[]>(`/v1/users/me/ai-subscriptions`),
    /** Verify + save (or replace) a connection. 422 with an actionable
     *  message when the credential fails live verification - nothing is
     *  stored in that case. */
    connect: (provider: string, credential: string) =>
      apiFetch<AiSubscription>(
        `/v1/users/me/ai-subscriptions/${encodeURIComponent(provider)}`,
        { method: "PUT", body: JSON.stringify({ credential }) },
      ),
    /** Re-verify the stored credential; a failure flips the row to
     *  `error` (with the message) rather than throwing. */
    verify: (provider: string) =>
      apiFetch<AiSubscription>(
        `/v1/users/me/ai-subscriptions/${encodeURIComponent(provider)}/verify`,
        { method: "POST" },
      ),
    /** Per-user model toggles for one connection. */
    setModels: (provider: string, enabled_models: string[]) =>
      apiFetch<AiSubscription>(
        `/v1/users/me/ai-subscriptions/${encodeURIComponent(provider)}`,
        { method: "PATCH", body: JSON.stringify({ enabled_models }) },
      ),
    /** Disconnect - deletes the row and the stored credential. */
    disconnect: (provider: string) =>
      apiFetch<void>(
        `/v1/users/me/ai-subscriptions/${encodeURIComponent(provider)}`,
        { method: "DELETE" },
      ),
  },
  /** Coding agents over MCP - per-user `ath_*` tokens that let Claude
   *  Code / Codex / Gemini / Copilot drive Athena's knowledge + task
   *  spine through the inbound /mcp server. */
  codingAgents: {
    /** One fetch for the whole card: feature flag, public /mcp URL, my tokens. */
    status: () =>
      apiFetch<CodingAgentTokensOut>(`/v1/users/me/coding-agent-tokens`),
    /** Mint a token (raw value returned exactly once). */
    mint: (body: {
      client: CodingAgentClient;
      name?: string;
      scope_bundle: CodingAgentScopeBundle;
      expires_in_days?: number | null;
    }) =>
      apiFetch<CodingAgentTokenMinted>(`/v1/users/me/coding-agent-tokens`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    revoke: (tokenId: string) =>
      apiFetch<CodingAgentToken>(
        `/v1/users/me/coding-agent-tokens/${encodeURIComponent(tokenId)}/revoke`,
        { method: "POST" },
      ),
  },
  privacy: {
    get: (orgId: string) =>
      apiFetch<PrivacySettings>(`/v1/orgs/${encodeURIComponent(orgId)}/privacy`),
    /**
     * Partial PATCH - BE accepts any of `redaction | data_retention |
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
        // Human label + preset key for the selected window - echoed back in
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
    /** Set (or clear with `usd: null`) the monthly budget cap for the org
     *  (no `domain_id`) or one domain. Returns the refreshed summary. */
    setBudget: (orgId: string, body: { domain_id?: string; usd: number | null }) =>
      apiFetch<CostSummary>(`/v1/orgs/${encodeURIComponent(orgId)}/cost/budget`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    /** Every live domain with its monthly cap + MTD spend - the budgets
     *  settings table. */
    domainBudgets: (orgId: string) =>
      apiFetch<DomainBudget[]>(`/v1/orgs/${encodeURIComponent(orgId)}/cost/domain-budgets`),
    /** §5.29.12 r1 - per-day burn-down split by model over the trailing
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
  alerts: {
    /** The org's budget-alert rules, stable order. */
    listRules: (orgId: string) =>
      apiFetch<AlertRule[]>(`/v1/orgs/${encodeURIComponent(orgId)}/alert-rules`),
    /** Replace the whole rule set (single-save form, mirrors
     *  notifications routing). Editing a rule re-arms its
     *  once-per-month firing on purpose. */
    replaceRules: (orgId: string, rules: AlertRule[]) =>
      apiFetch<AlertRule[]>(`/v1/orgs/${encodeURIComponent(orgId)}/alert-rules`, {
        method: "PUT",
        body: JSON.stringify({
          rules: rules.map((r) => ({
            kind: r.kind,
            domain_id: r.domain_id ?? null,
            threshold_pct: r.threshold_pct,
            channels: r.channels,
            audience_roles: r.audience_roles,
            enabled: r.enabled,
          })),
        }),
      }),
    /** Alert-category switches - everything defaults to off. */
    getSettings: (orgId: string) =>
      apiFetch<AlertSettings>(`/v1/orgs/${encodeURIComponent(orgId)}/alert-settings`),
    replaceSettings: (orgId: string, body: AlertSettings) =>
      apiFetch<AlertSettings>(`/v1/orgs/${encodeURIComponent(orgId)}/alert-settings`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    /** Danger-zone "turn off all models" switch state. */
    getKillSwitch: (orgId: string) =>
      apiFetch<{ disabled: boolean }>(`/v1/orgs/${encodeURIComponent(orgId)}/models/kill-switch`),
    /** Flip the kill switch. `disabled: true` refuses every LLM call for
     *  the org (proxy, BYOK, subscriptions) until re-enabled. */
    setKillSwitch: (orgId: string, disabled: boolean) =>
      apiFetch<{ disabled: boolean }>(`/v1/orgs/${encodeURIComponent(orgId)}/models/kill-switch`, {
        method: "POST",
        body: JSON.stringify({ disabled }),
      }),
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
    /** Idempotent M:N attach. BE requires domain-admin on the domain. */
    attachDomain: (id: string, domainId: string) =>
      apiFetch<void>(
        `/v1/skills/${encodeURIComponent(id)}/attach/${encodeURIComponent(domainId)}`,
        { method: "POST" },
      ),
    detachDomain: (id: string, domainId: string) =>
      apiFetch<void>(
        `/v1/skills/${encodeURIComponent(id)}/attach/${encodeURIComponent(domainId)}`,
        { method: "DELETE" },
      ),
  },
  activity: {
    list: (params: { cursor?: string; limit?: number; dom_id?: string } = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
      }
      const qs = sp.toString();
      return apiFetch<{ items: ActivityItem[]; next_cursor: string | null }>(`/v1/activity${qs ? `?${qs}` : ""}`);
    },
  },
  decisions: {
    /** Cross-scope decision lookup - resolves an org / domain / repo
     *  decision by globally-unique UUID. Drives the FE detail page
     *  linked from the repo ADRs card + the org Decisions tab. */
    detail: (id: string) =>
      apiFetch<DecisionDetail>(`/v1/decisions/${encodeURIComponent(id)}`),
  },
  chat: {
    listThreads: () => apiFetch<ChatThread[]>("/v1/chat/threads"),
    getThread: (id: string) => apiFetch<{ thread: ChatThread; messages: ChatMessage[] }>(`/v1/chat/threads/${encodeURIComponent(id)}`),
    postMessage: (
      threadId: string,
      content: string,
      model?: ModelSelection | null,
      effort?: EffortLevel | null,
      attachmentIds?: string[],
    ) =>
      apiFetch<ChatMessage>(`/v1/chat/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          ...(model ? { model_provider: model.provider, model_id: model.model } : {}),
          ...(model?.source ? { model_source: model.source } : {}),
          ...(effort ? { effort } : {}),
          ...(attachmentIds && attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
        }),
      }),
    createThread: (body: { title: string; scope_kind: "domain" | "org"; scope_id?: string; initial_message?: string }) =>
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
    /**
     * Dismiss a single `task_created` proposal - the user declined the agent's
     * "Start task" suggestion. Deletes only that one message (unlike `rewind`,
     * which also removes everything after it). DELETE
     * /v1/chat/threads/{id}/messages/{message_id} → 204.
     */
    dismissProposal: (threadId: string, messageId: string) =>
      apiFetch<void>(`/v1/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
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
  attachments: {
    /** Upload one file (image or document). The BE validates, normalises
     *  images, and parses documents to text; returns the stored metadata. */
    upload: (file: File) => uploadAttachment(file),
    /** Fetch one attachment's metadata. */
    get: (id: string) =>
      apiFetch<AttachmentOut>(`/v1/attachments/${encodeURIComponent(id)}`),
    /** Fetch the bytes (auth'd) and return a blob URL to render/open. Caller
     *  revokes it when done. */
    blobUrl: (id: string) => fetchAttachmentBlobUrl(id),
  },
  knowledge: {
    /** Sampled knowledge-graph view. BE accepts `domain_id`, `repo_id`,
     *  `layer`, and `limit` (10..1000). Old call sites that pass only
     *  `domain_id` / `limit` keep working. */
    graph: (params: { domain_id?: string; repo_id?: string; layer?: string; limit?: number; rollup?: boolean } = {}) => {
      const sp = new URLSearchParams();
      if (params.domain_id) sp.set("domain_id", params.domain_id);
      if (params.repo_id) sp.set("repo_id", params.repo_id);
      if (params.layer) sp.set("layer", params.layer);
      if (params.limit != null) sp.set("limit", String(params.limit));
      if (params.rollup) sp.set("rollup", "true");
      const qs = sp.toString();
      return apiFetch<KnowledgeGraph>(`/v1/knowledge/graph${qs ? `?${qs}` : ""}`);
    },
    /** Knowledge search - hybrid (default) / semantic / lexical retrieval
     *  across knowledge_nodes + domain_overlays. Wraps the agent
     *  retrieval tools (BM25 + cosine + RRF) - see BE
     *  `athena/api/routers/knowledge_search.py`. */
    search: (params: KnowledgeSearchParams) => {
      const sp = new URLSearchParams();
      sp.set("q", params.q);
      if (params.scope) sp.set("scope", params.scope);
      if (params.domain_id) sp.set("domain_id", params.domain_id);
      if (params.repo_id) sp.set("repo_id", params.repo_id);
      for (const k of params.kind ?? []) sp.append("kind", k);
      for (const l of params.layer ?? []) sp.append("layer", l);
      if (params.mode) sp.set("mode", params.mode);
      if (params.limit != null) sp.set("limit", String(params.limit));
      return apiFetch<KnowledgeSearchOut>(`/v1/knowledge/search?${sp.toString()}`);
    },
    /** Phase D contract #1 - node dossier. `GET /v1/knowledge/nodes/{id}`
     *  returns the full at-a-glance card for one KG node; every ref inside
     *  is a clickable node-id. Powers the shared `<NodeDossierDrawer>` that
     *  any node-id anywhere opens. */
    node: (nodeId: string) =>
      apiFetch<NodeDossierResponse>(`/v1/knowledge/nodes/${encodeURIComponent(nodeId)}`),
    /** On-demand 1-hop neighbourhood of a node - the topology explorer's
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
    /** One page of a Blueprint derived component list - the WHOLE dataset,
     *  paginated. `GET /v1/knowledge/derived`. `scope` is the Blueprint scope
     *  (`repo` | `domain`); `list` selects the section (api_surface,
     *  services, …). Default page size 10; the FE offers 10/20/50/100. */
    derivedList: (params: {
      scope: "repo" | "domain";
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
    /** §5.29.5 - replace the full rule set in one save (matches the BE
     * "delete-then-upsert" PATCH semantic). Disabled rules are simply
     * omitted from the payload - the BE has no per-row enable flag. */
    replaceRouting: (orgId: string, rules: NotificationRule[]) =>
      apiFetch<NotificationRule[]>(
        `/v1/orgs/${encodeURIComponent(orgId)}/notifications/routing`,
        { method: "PATCH", body: JSON.stringify({ rules }) },
      ),
  },
  onboarding: {
    state: (orgId: string) => apiFetch<OnboardingState>(`/v1/orgs/${encodeURIComponent(orgId)}/onboarding`),
    /** §5.29.4 - explicit-mark a step done (for optional steps the
     * BE's `_derive_steps` can't see). `stepId` must be one of
     * `connect_scm | create_domain | attach_repo | first_run`. */
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
   * Blueprint endpoints per knowledge-model.md §5.6. Three parallel namespaces -
   * one per scope - that share the same endpoint shape. The split keeps the
   * scope-id encoding explicit at the call site (domainId vs repoId vs
   * orgId) rather than smuggling it through a generic argument.
   */
  blueprint: {
    domain: {
      /** TOC - section list with metadata, no bodies. */
      getToc: (domainId: string) =>
        apiFetch<BlueprintToc>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint`,
        ),
      /** One section, full body + metadata. */
      getSection: (domainId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
        ),
      /** Revision history for a single section. */
      getRevisions: (domainId: string, sectionKey: string) =>
        apiFetch<BlueprintSectionRevision[]>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/revisions`,
        ),
      /** User-edit a section. Creates a new revision and sets
       * `protected_from_ai=true` server-side. */
      editSection: (domainId: string, sectionKey: string, body: BlueprintSectionEditRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/sections/${encodeURIComponent(sectionKey)}`,
          { method: "PATCH", body: JSON.stringify(body) },
        ),
      lockSection: (domainId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/lock`,
          { method: "POST" },
        ),
      unlockSection: (domainId: string, sectionKey: string) =>
        apiFetch<BlueprintSection>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/unlock`,
          { method: "POST" },
        ),
      regenerateSection: (domainId: string, sectionKey: string) =>
        apiFetch<BlueprintSection | BlueprintSectionProposal>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/sections/${encodeURIComponent(sectionKey)}/regenerate`,
          { method: "POST" },
        ),
      /** List all pending proposals on this Blueprint. */
      listProposals: (domainId: string) =>
        apiFetch<BlueprintSectionProposal[]>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/proposals`,
        ),
      acceptProposal: (domainId: string, proposalId: string) =>
        apiFetch<BlueprintSection>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/accept`,
          { method: "POST" },
        ),
      editAndAcceptProposal: (domainId: string, proposalId: string, body: BlueprintProposalEditAcceptRequest) =>
        apiFetch<BlueprintSection>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/edit-and-accept`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      rejectProposal: (domainId: string, proposalId: string, body: BlueprintProposalRejectRequest = {}) =>
        apiFetch<BlueprintSectionProposal>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint/proposals/${encodeURIComponent(proposalId)}/reject`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      /** Deep regenerate - enqueues the agentic explorer (the blueprint
       * goes `building`; poll `getToc().status` until `ready`). Body must
       * include `confirm_slug` matching the domain's slug. */
      rebuild: (domainId: string, confirmSlug: string) =>
        apiFetch<BlueprintRebuildResult>(
          `/v1/domains/${encodeURIComponent(domainId)}/blueprint:rebuild`,
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
   * §5.29.9 - cross-scope Blueprint proposal queue. The per-scope wrappers
   * under `api.blueprint.{domain,repo,org}.listProposals` still serve
   * the per-page panels; these flat helpers power the org-wide
   * `/blueprint-proposals` approval inbox.
   */
  blueprintProposals: {
    list: (params: {
      status?: "pending" | "accepted" | "rejected" | "all";
      scope_kind?: "org" | "domain" | "repo";
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
