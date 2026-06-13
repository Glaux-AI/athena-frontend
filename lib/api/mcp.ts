/**
 * MCP server API wrappers (readiness §6 r3 / row 997).
 *
 * Thin typed helpers around `apiFetch` for the `/v1/mcp` surface - list,
 * detail, recent-calls (used as the approval-history proxy on the detail
 * page until a dedicated server-scoped approvals endpoint lands), and
 * disconnect. The component layer (`components/mcp/*`) and the MCP pages
 * consume these.
 *
 * Wire shape stays snake_case (ADR-032 - BE bends to FE). The types are
 * the canonical FE truth re-exported from `@/lib/api/client`; this file
 * adds no new wire types - it only narrows the surface that the new
 * `/mcp` components need.
 */
import {
  apiFetch,
  type McpServer,
  type McpRecentCall,
} from "@/lib/api/client";

/**
 * List all MCP servers for the current org (resolved server-side via the
 * `X-Athena-Org-Id` header that `apiFetch` injects).
 *
 * GET `/v1/mcp` → `McpServer[]`. Throws `ApiError` on non-2xx.
 */
export function listMcpServers(): Promise<McpServer[]> {
  return apiFetch<McpServer[]>("/v1/mcp");
}

/**
 * Fetch one MCP server by id, scoped to the current org.
 *
 * GET `/v1/mcp/{id}` → `McpServer`. Throws `ApiError` on non-2xx
 * (callers route 404 → `notFound()` at the page level).
 */
export function getMcpServer(id: string): Promise<McpServer> {
  return apiFetch<McpServer>(`/v1/mcp/${encodeURIComponent(id)}`);
}

/**
 * Recent tool-call rows for a server (used by the detail page as the
 * server-scoped "approval history" proxy until a dedicated grants
 * endpoint exists at this level - the BE today only exposes per-tool
 * approvals at `/v1/mcp/{server_id}/tools/{tool_id}/approvals`).
 *
 * GET `/v1/mcp/{id}/calls?limit={limit}` → `McpRecentCall[]`. The
 * default `limit=20` matches what the detail page renders.
 */
export function getMcpServerApprovals(
  id: string,
  limit = 20,
): Promise<McpRecentCall[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  return apiFetch<McpRecentCall[]>(
    `/v1/mcp/${encodeURIComponent(id)}/calls?${qs.toString()}`,
  );
}

/**
 * Disconnect (delete) a manually-added MCP server. Integration-sourced
 * servers should be disconnected via their owning integration instead
 * - the FE detail surface hides the button for `source === "integration"`.
 *
 * DELETE `/v1/mcp/{id}` → 204. Throws `ApiError` on non-2xx.
 */
export function disconnectMcpServer(id: string): Promise<void> {
  return apiFetch<void>(`/v1/mcp/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
