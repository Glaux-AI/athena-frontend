/**
 * Auth API wrappers - Supabase-session management surface for
 * `/settings/security` (readiness §5.7.3 row `/settings/security`).
 *
 * Thin typed helpers around `apiFetch` for the `/v1/auth/sessions`
 * routes the BE exposes. WebAuthn passkey management goes directly
 * against the browser Supabase client - see `lib/supabase/browser.ts`
 * + `app/(protected)/settings/security/security-client.tsx`. This file
 * only owns the session surface because the Supabase SDK does NOT
 * surface "list my own sessions" to the browser - only the server-side
 * Admin API can, which is what the BE proxies.
 *
 * Wire fields stay snake_case (ADR-032 - BE bends to FE).
 */
import { apiFetch } from "@/lib/api/client";

/** One row in the active-sessions table on /settings/security. The
 *  raw IP is intentionally never on the wire - `ip_region` is a
 *  coarse label (or `null` when the BE has no geoip lookup yet). */
export interface AuthSession {
  id: string;
  /** ISO-8601 timestamp the Supabase session row was created. */
  created_at: string;
  /** ISO-8601 timestamp Supabase last refreshed the row (GoTrue's
   *  `updated_at`). Treated as "last active" by the FE. */
  last_active_at: string;
  /** Raw UA string - the FE parses it into a device label so the parser
   *  stays with the component that renders it. Null when GoTrue didn't
   *  record a UA (rare). */
  user_agent: string | null;
  /** Coarse region label (e.g. `"US-CA"`). Null today because the BE
   *  has no geoip dep yet - the FE renders "Unknown region" then. */
  ip_region: string | null;
  /** True for the session whose JWT was used to make this request. The
   *  Revoke button is hidden for this row; bulk revoke-others preserves
   *  it. */
  is_current: boolean;
}

/** Response shape for `GET /v1/auth/sessions`. */
export interface AuthSessionListResponse {
  sessions: AuthSession[];
  /** The current session id reported by the BE - useful when the FE
   *  wants to sanity-check `is_current` against the access-token's
   *  claim. Null on legacy HS256 tokens that predate the claim. */
  current_session_id: string | null;
}

/** Response shape for `POST /v1/auth/sessions/{id}:revoke`. */
export interface RevokeSessionResponse {
  id: string;
  revoked: boolean;
}

/** Response shape for `POST /v1/auth/sessions:revoke-others`. */
export interface RevokeOthersResponse {
  revoked_count: number;
}

/**
 * List every active Supabase session for the current user. GET
 * `/v1/auth/sessions` → `AuthSessionListResponse`. Returns an empty
 * list when the BE's Supabase-admin client isn't configured (e.g. in
 * mock mode) - the page renders the "no other sessions" copy.
 *
 * Throws `ApiError` on non-2xx.
 */
export function listSessions(): Promise<AuthSessionListResponse> {
  return apiFetch<AuthSessionListResponse>("/v1/auth/sessions");
}

/**
 * Revoke one of the current user's non-current Supabase sessions. POST
 * `/v1/auth/sessions/{id}:revoke`. The BE 409s if the supplied id is
 * the current session - call `supabase.auth.signOut()` for that case.
 *
 * Throws `ApiError` on non-2xx.
 */
export function revokeSession(sessionId: string): Promise<RevokeSessionResponse> {
  return apiFetch<RevokeSessionResponse>(
    `/v1/auth/sessions/${encodeURIComponent(sessionId)}:revoke`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/**
 * Bulk-revoke every Supabase session except the current one. POST
 * `/v1/auth/sessions:revoke-others`. Returns the number of sessions
 * actually killed (0 when the user already only has one).
 *
 * Throws `ApiError` on non-2xx.
 */
export function revokeOtherSessions(): Promise<RevokeOthersResponse> {
  return apiFetch<RevokeOthersResponse>(
    "/v1/auth/sessions:revoke-others",
    { method: "POST", body: JSON.stringify({}) },
  );
}
