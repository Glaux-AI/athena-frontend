/**
 * Integration API wrappers — closed catalog (8 providers).
 *
 * Thin typed helpers around `apiFetch` for the per-org `/v1/...integrations`
 * surface. Mirrors the shape of `lib/api/mcp.ts` so the page + components
 * stay consistent with the MCP catalog.
 *
 * Wire fields stay snake_case per ADR-032 (BE bends to FE).
 *
 * The 8 known providers — closed at this list per ADR-027 #22 (no Jenkins
 * / CircleCI; CI ships through git platform only):
 *
 *   - github
 *   - gitlab
 *   - bitbucket
 *   - jira
 *   - linear
 *   - asana
 *   - azure_devops
 *   - slack
 */
import { apiFetch } from "@/lib/api/client";

/** Closed-set provider slug. Widening requires both a BE adapter + an
 *  entry in `PROVIDER_CATALOG` below. */
export type ProviderSlug =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "jira"
  | "linear"
  | "asana"
  | "azure_devops"
  | "slack";

/** BE `IntegrationKind` enum mirror — see
 *  `athena-backend/athena/integrations/base.py:31`. Drives the `kind`
 *  path segment on the canonical
 *  `/v1/orgs/{orgId}/integrations/{provider}/{kind}/oauth/initiate`
 *  shape. */
export type IntegrationKind = "source_control" | "work" | "chat" | "mcp";

/** Per-provider `kind` map — mirrors the `kind` attribute on each
 *  adapter in `athena-backend/athena/integrations/providers/*.py`. The
 *  connect-flow needs both `provider` and `kind` on the URL; the FE
 *  derives `kind` from the catalog so callers don't have to thread it
 *  through every layer. */
export const PROVIDER_KIND: Readonly<Record<ProviderSlug, IntegrationKind>> = {
  github: "source_control",
  gitlab: "source_control",
  bitbucket: "source_control",
  jira: "work",
  linear: "work",
  asana: "work",
  azure_devops: "work",
  slack: "chat",
} as const;

/** Closed-set lifecycle state. Mirrors
 *  `athena/integrations/lifecycle.py` + adds `disconnected` for the
 *  marketplace "never connected" rendering. */
export type IntegrationLifecycleStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "active"
  | "degraded"
  | "revoked";

/** Wire shape returned by `GET /v1/orgs/{org_id}/integrations` for the
 *  catalog page. Subset of the BE `IntegrationOut` — only the fields the
 *  new catalog actually renders. */
export interface IntegrationOut {
  id: string;
  org_id: string;
  provider: ProviderSlug;
  status: IntegrationLifecycleStatus;
  /** Last verify() check timestamp (ISO-8601). NULL when never checked. */
  last_verified_at: string | null;
  /** Pending-drift flag — true when the provider's scopes / repo list
   *  changed since the user last acknowledged the integration. */
  pending_drift?: boolean;
  /** §6.6 / F-10.1 — paired MCP server id when this integration's
   *  adapter declared `provides_mcp=true` and the BE provisioner has
   *  created the row. `null` (or absent) when the adapter doesn't
   *  provide MCP or auto-provision hasn't run yet. The card uses this
   *  to deep-link to `/mcp/{server_id}`. */
  mcp_server_id?: string | null;
}

/** Response shape for
 *  `POST /v1/orgs/{orgId}/integrations/{provider}/{kind}/oauth/initiate`. */
export interface OAuthStartResponse {
  authorize_url: string;
  state: string;
  expires_at: string;
}

/** Catalog row — one per known provider. Drives the table chrome. */
export interface ProviderCatalogEntry {
  provider: ProviderSlug;
  /** Display name shown in the table. */
  name: string;
  /** Short description shown under the name. */
  blurb: string;
}

/** Closed catalog — the 8 providers Athena knows how to talk to. The
 *  catalog is the only place that "names known providers" — every other
 *  surface derives from it. */
export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  { provider: "github",       name: "GitHub",        blurb: "Source control — read repos, write PRs, run CI checks." },
  { provider: "gitlab",       name: "GitLab",        blurb: "Source control — read repos, write MRs, run pipelines." },
  { provider: "bitbucket",    name: "Bitbucket",     blurb: "Source control — read repos, write PRs." },
  { provider: "jira",         name: "Jira",          blurb: "Work management — read tickets, write comments + transitions." },
  { provider: "linear",       name: "Linear",        blurb: "Work management — read issues, write updates + comments." },
  { provider: "asana",        name: "Asana",         blurb: "Work management — read tasks, write status updates." },
  { provider: "azure_devops", name: "Azure DevOps",  blurb: "Source control + work — repos, pipelines, work items." },
  { provider: "slack",        name: "Slack",         blurb: "Comms — post notifications, read mentions, respond in threads." },
] as const;

/**
 * List every integration installed on the named org.
 *
 * GET `/v1/orgs/{orgId}/integrations` → `IntegrationOut[]`. Throws
 * `ApiError` on non-2xx.
 *
 * The page combines this with `PROVIDER_CATALOG` so providers the org
 * has never connected still surface as `disconnected` cards.
 */
export function listIntegrations(
  orgId: string,
): Promise<readonly IntegrationOut[]> {
  return apiFetch<IntegrationOut[]>(
    `/v1/orgs/${encodeURIComponent(orgId)}/integrations`,
  ).then((rows) => rows as readonly IntegrationOut[]);
}

/**
 * Start the OAuth flow for a provider. The BE mints state + returns the
 * provider's authorize URL; the page opens this in a new window.
 *
 * POST `/v1/orgs/{orgId}/integrations/{provider}/{kind}/oauth/initiate`
 * → `{authorize_url, state, expires_at}`. Throws `ApiError` on non-2xx.
 *
 * `kind` is the BE `IntegrationKind` enum value matching `provider` (e.g.
 * `"source_control"` for `github`, `"chat"` for `slack`). Callers can
 * derive it from `PROVIDER_KIND[provider]` when they only have the slug.
 */
export function oauthStart(
  orgId: string,
  provider: ProviderSlug,
  kind: IntegrationKind = PROVIDER_KIND[provider],
): Promise<OAuthStartResponse> {
  return apiFetch<OAuthStartResponse>(
    `/v1/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(provider)}/${encodeURIComponent(kind)}/oauth/initiate`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/**
 * Disconnect an integration. The BE flips the row's lifecycle status to
 * `revoked`, revokes upstream tokens on a best-effort basis, and cascade-
 * deletes the row's secrets.
 *
 * POST `/v1/integrations/{integration_id}/disconnect` (with an optional
 * `reason` audit-trail payload). Org is resolved server-side via the
 * `X-Athena-Org-Id` header that `apiFetch` injects. Throws `ApiError` on
 * non-2xx.
 */
export function disconnect(
  integrationId: string,
  reason?: string,
): Promise<void> {
  const body = reason ? JSON.stringify({ reason }) : JSON.stringify({});
  return apiFetch<void>(
    `/v1/integrations/${encodeURIComponent(integrationId)}/disconnect`,
    { method: "POST", body },
  );
}

/**
 * Acknowledge drift — mark the latest detected provider drift as seen by
 * the operator. The BE flips `pending_drift` to false so the warning chrome
 * stops re-alerting until the next drift event.
 *
 * POST `/v1/integrations/{integration_id}/acknowledge-drift`. Org is
 * resolved server-side via the `X-Athena-Org-Id` header that `apiFetch`
 * injects. Throws `ApiError` on non-2xx.
 */
export function acknowledgeDrift(integrationId: string): Promise<void> {
  return apiFetch<void>(
    `/v1/integrations/${encodeURIComponent(integrationId)}/acknowledge-drift`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
