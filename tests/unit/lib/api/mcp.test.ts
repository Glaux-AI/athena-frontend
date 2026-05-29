/**
 * Unit tests for the `lib/api/mcp.ts` wrappers (readiness §6 r3).
 *
 * Each test stubs the shared `apiFetch` so we exercise the wrapper's
 * URL + method shape without touching the network. Tests cover:
 *   - `listMcpServers` GETs `/v1/mcp`
 *   - `getMcpServer` GETs `/v1/mcp/{id}` (with `encodeURIComponent`)
 *   - `getMcpServerApprovals` includes the default `?limit=20`
 *   - `getMcpServerApprovals` accepts a custom `limit`
 *   - `disconnectMcpServer` DELETEs the right URL
 *   - all wrappers re-throw the `ApiError` raised by `apiFetch`
 *
 * Snake_case wire-field discipline: the URLs are literal `/v1/mcp...`
 * and the query string emits `limit=...` — no camelCase leakage.
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
  disconnectMcpServer,
  getMcpServer,
  getMcpServerApprovals,
  listMcpServers,
} from "@/lib/api/mcp";

describe("lib/api/mcp", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("listMcpServers", () => {
    it("GETs /v1/mcp with no init", async () => {
      apiFetchMock.mockResolvedValueOnce([]);
      const result = await listMcpServers();
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe("/v1/mcp");
      expect(call[1]).toBeUndefined();
      expect(result).toEqual([]);
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(500, "internal", "boom"),
      );
      await expect(listMcpServers()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("getMcpServer", () => {
    it("GETs /v1/mcp/{id} with encodeURIComponent on the id", async () => {
      apiFetchMock.mockResolvedValueOnce({ id: "mcp_demo" });
      await getMcpServer("mcp/with/slash");
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(`/v1/mcp/${encodeURIComponent("mcp/with/slash")}`);
      expect(call[1]).toBeUndefined();
    });

    it("re-throws ApiError on 404", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(404, "not_found", "missing"),
      );
      await expect(getMcpServer("missing")).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("getMcpServerApprovals", () => {
    it("includes the default ?limit=20 query parameter", async () => {
      apiFetchMock.mockResolvedValueOnce([]);
      await getMcpServerApprovals("srv_a");
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(`/v1/mcp/${encodeURIComponent("srv_a")}/calls?limit=20`);
    });

    it("threads the caller-supplied limit through the URL", async () => {
      apiFetchMock.mockResolvedValueOnce([]);
      await getMcpServerApprovals("srv_b", 5);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(`/v1/mcp/${encodeURIComponent("srv_b")}/calls?limit=5`);
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(403, "forbidden", "nope"),
      );
      await expect(getMcpServerApprovals("srv_c")).rejects.toBeInstanceOf(
        ApiError,
      );
    });
  });

  describe("disconnectMcpServer", () => {
    it("DELETEs /v1/mcp/{id} with method=DELETE in init", async () => {
      apiFetchMock.mockResolvedValueOnce(undefined);
      await disconnectMcpServer("srv_x");
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      const call = apiFetchMock.mock.calls[0]!;
      expect(call[0]).toBe(`/v1/mcp/${encodeURIComponent("srv_x")}`);
      expect(call[1]).toEqual({ method: "DELETE" });
    });

    it("re-throws ApiError on non-2xx", async () => {
      apiFetchMock.mockRejectedValueOnce(
        new ApiError(409, "conflict", "still in use"),
      );
      await expect(disconnectMcpServer("srv_y")).rejects.toBeInstanceOf(ApiError);
    });
  });
});
