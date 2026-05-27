/**
 * Unit tests for the `lib/api/integrations.ts` wrappers (Agent EEE).
 *
 * Each test stubs the shared `apiFetch` so we exercise the wrapper's
 * URL + method shape without touching the network. Tests cover:
 *   - `listIntegrations` GETs `/v1/integrations`
 *   - `oauthStart` POSTs `/v1/integrations/{provider}/oauth/start` and
 *      returns the parsed `{authorize_url, state}` body
 *   - `disconnect` POSTs `/v1/integrations/{id}/disconnect` with no body
 *      when no reason is given
 *   - `disconnect` includes the reason in the snake_case JSON body when
 *      one is provided
 *   - `acknowledgeDrift` POSTs `/v1/integrations/{id}/acknowledge-drift`
 *   - all wrappers re-throw the `ApiError` raised by `apiFetch`
 *
 * Snake_case wire-field discipline: the URLs are literal `/v1/...` and
 * any body includes only snake_case keys — no camelCase leakage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mock for the shared apiFetch — every test fully controls it.
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
  acknowledgeDrift,
  disconnect,
  listIntegrations,
  oauthStart,
} from "@/lib/api/integrations";

describe("lib/api/integrations", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("listIntegrations", () => {
    it("GETs /v1/integrations with no init", async () => {
      apiFetchMock.mockResolvedValueOnce([]);
      const result = await listIntegrations();
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe("/v1/integrations");
      expect(call[1]).toBeUndefined();
      expect(result).toEqual([]);
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(500, "internal", "boom"),
      );
      await expect(listIntegrations()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("oauthStart", () => {
    it("POSTs /v1/integrations/{provider}/oauth/start and returns the parsed body", async () => {
      apiFetchMock.mockResolvedValueOnce({
        authorize_url: "https://github.com/login/oauth/authorize?state=abc",
        state: "abc",
      });
      const result = await oauthStart("github");
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe("/v1/integrations/github/oauth/start");
      expect(call[1]).toEqual({ method: "POST", body: JSON.stringify({}) });
      expect(result).toEqual({
        authorize_url: "https://github.com/login/oauth/authorize?state=abc",
        state: "abc",
      });
    });

    it("URL-encodes the provider slug", async () => {
      apiFetchMock.mockResolvedValueOnce({ authorize_url: "x", state: "y" });
      await oauthStart("azure_devops");
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(
        `/v1/integrations/${encodeURIComponent("azure_devops")}/oauth/start`,
      );
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(404, "unknown_provider", "no adapter"),
      );
      await expect(oauthStart("github")).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("disconnect", () => {
    it("POSTs /v1/integrations/{id}/disconnect with an empty body when no reason is given", async () => {
      apiFetchMock.mockResolvedValueOnce(undefined);
      await disconnect("int_abc");
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(`/v1/integrations/${encodeURIComponent("int_abc")}/disconnect`);
      expect(call[1]).toEqual({ method: "POST", body: JSON.stringify({}) });
    });

    it("includes the reason in the snake_case JSON body when provided", async () => {
      apiFetchMock.mockResolvedValueOnce(undefined);
      await disconnect("int_xyz", "Rotating OAuth app");
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(`/v1/integrations/${encodeURIComponent("int_xyz")}/disconnect`);
      expect(call[1]!.method).toBe("POST");
      expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
        reason: "Rotating OAuth app",
      });
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(403, "forbidden", "nope"),
      );
      await expect(disconnect("int_a")).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("acknowledgeDrift", () => {
    it("POSTs /v1/integrations/{id}/acknowledge-drift", async () => {
      apiFetchMock.mockResolvedValueOnce(undefined);
      await acknowledgeDrift("int_drift");
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(
        `/v1/integrations/${encodeURIComponent("int_drift")}/acknowledge-drift`,
      );
      expect(call[1]).toEqual({ method: "POST", body: JSON.stringify({}) });
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(404, "not_found", "missing"),
      );
      await expect(acknowledgeDrift("int_missing")).rejects.toBeInstanceOf(
        ApiError,
      );
    });
  });
});
