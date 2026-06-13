/**
 * Unit tests for `lib/api/auth.ts` - typed wrappers around the BE
 * `/v1/auth/sessions` surface that backs `/settings/security`.
 *
 * Strategy mirrors `lib/api/integrations.test.ts`: stub the shared
 * `apiFetch` so we exercise URL + method + body shape without touching
 * the network. Tests cover:
 *   - `listSessions` GETs `/v1/auth/sessions`
 *   - `revokeSession` POSTs `/v1/auth/sessions/{id}:revoke` with an
 *      empty body and URL-encodes the id
 *   - `revokeOtherSessions` POSTs `/v1/auth/sessions:revoke-others`
 *      with an empty body (path literally contains the colon)
 *   - every wrapper re-throws the `ApiError` raised by `apiFetch`
 *
 * Snake_case wire-field discipline: URL paths are literal `/v1/...`
 * and bodies are `{}` JSON only - no camelCase leakage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.fn();

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    apiFetch: (path: string, init?: RequestInit) => apiFetchMock(path, init),
  };
});

import { ApiError } from "@/lib/api/client";
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  type AuthSessionListResponse,
  type RevokeOthersResponse,
  type RevokeSessionResponse,
} from "@/lib/api/auth";

describe("lib/api/auth", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("listSessions", () => {
    it("GETs /v1/auth/sessions with no init", async () => {
      const fixture: AuthSessionListResponse = {
        sessions: [
          {
            id: "ses_1",
            created_at: "2026-05-20T10:00:00Z",
            last_active_at: "2026-05-26T12:00:00Z",
            user_agent: "Mozilla/5.0 (Macintosh) Chrome/124",
            ip_region: null,
            is_current: true,
          },
        ],
        current_session_id: "ses_1",
      };
      apiFetchMock.mockResolvedValueOnce(fixture);

      const result = await listSessions();
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe("/v1/auth/sessions");
      expect(call[1]).toBeUndefined();
      expect(result).toEqual(fixture);
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(500, "internal", "boom"),
      );
      await expect(listSessions()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("revokeSession", () => {
    it("POSTs /v1/auth/sessions/{id}:revoke with an empty JSON body", async () => {
      const reply: RevokeSessionResponse = { id: "ses_2", revoked: true };
      apiFetchMock.mockResolvedValueOnce(reply);

      const result = await revokeSession("ses_2");
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(`/v1/auth/sessions/${encodeURIComponent("ses_2")}:revoke`);
      expect(call[1]).toEqual({ method: "POST", body: JSON.stringify({}) });
      expect(result).toEqual(reply);
    });

    it("URL-encodes the session id (defensive against UUID dashes)", async () => {
      apiFetchMock.mockResolvedValueOnce({ id: "abc", revoked: true });
      await revokeSession("abc def");
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(
        `/v1/auth/sessions/${encodeURIComponent("abc def")}:revoke`,
      );
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(409, "conflict", "cannot revoke current"),
      );
      await expect(revokeSession("ses_current")).rejects.toBeInstanceOf(
        ApiError,
      );
    });
  });

  describe("revokeOtherSessions", () => {
    it("POSTs /v1/auth/sessions:revoke-others with an empty JSON body", async () => {
      const reply: RevokeOthersResponse = { revoked_count: 3 };
      apiFetchMock.mockResolvedValueOnce(reply);

      const result = await revokeOtherSessions();
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe("/v1/auth/sessions:revoke-others");
      expect(call[1]).toEqual({ method: "POST", body: JSON.stringify({}) });
      expect(result).toEqual(reply);
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(409, "conflict", "no session id"),
      );
      await expect(revokeOtherSessions()).rejects.toBeInstanceOf(ApiError);
    });
  });
});
