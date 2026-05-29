// @vitest-environment jsdom

/**
 * Unit tests for `<McpServerTable>` (readiness §6 r3 / row 997).
 *
 * Tests cover:
 *   - renders every server row passed in,
 *   - status badge color follows the row's `health.status`,
 *   - clicking a row pushes `/mcp/{id}` via `useRouter().push`,
 *   - empty state renders "No MCP servers connected yet",
 *   - clicking a sortable column header toggles asc/desc on that key,
 *   - integration-sourced rows surface an "Open integration" link.
 *
 * `next/navigation` is mocked so we can spy on `router.push` and avoid
 * needing a Next.js app context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/mcp",
  useSearchParams: () => new URLSearchParams(),
}));

import { McpServerTable } from "@/components/mcp/mcp-server-table";
import type {
  McpServer,
  McpStatus,
  McpToolApproval,
  McpToolRisk,
} from "@/lib/api/client";

function buildServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "srv_alpha",
    org_id: "org_demo",
    slug: "alpha",
    name: "Alpha MCP",
    source: "custom",
    transport: "http",
    endpoint_url: "https://alpha.example/mcp",
    auth: { method: "none" },
    egress_policy: "any",
    version: "1.0.0",
    tools: [
      {
        id: "tl_1",
        name: "search",
        description: "Search alpha",
        enabled: true,
        approval: "none" as McpToolApproval,
        risk: "read" as McpToolRisk,
        usage_count_30d: 4,
      },
    ],
    health: {
      status: "connected" as McpStatus,
      last_check_at: "2026-05-27T10:00:00Z",
      latency_p50_ms: 12,
      latency_p95_ms: 40,
      error_rate_24h: 0,
      uptime_30d: 1,
    },
    created_by_user_id: "u_demo",
    created_at: "2026-04-01T08:00:00Z",
    ...overrides,
  };
}

describe("<McpServerTable>", () => {
  beforeEach(() => {
    cleanup();
    pushMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a row for every server passed in", () => {
    const servers = [
      buildServer({ id: "srv_a", name: "Alpha" }),
      buildServer({ id: "srv_b", name: "Beta" }),
      buildServer({ id: "srv_c", name: "Gamma" }),
    ];
    render(<McpServerTable servers={servers} />);
    expect(screen.queryByText("Alpha")).not.toBeNull();
    expect(screen.queryByText("Beta")).not.toBeNull();
    expect(screen.queryByText("Gamma")).not.toBeNull();
    // Header + 3 body rows.
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(4);
  });

  it("renders status badges with color classes matching the status", () => {
    const servers = [
      buildServer({ id: "srv_ok", name: "Healthy", health: { ...buildServer().health, status: "connected" } }),
      buildServer({ id: "srv_err", name: "Broken", health: { ...buildServer().health, status: "error" } }),
    ];
    render(<McpServerTable servers={servers} />);
    const okBadge = screen.getByLabelText("MCP server status: Connected");
    const errBadge = screen.getByLabelText("MCP server status: Error");
    expect(okBadge.className).toContain("--success");
    expect(errBadge.className).toContain("--danger");
  });

  it("navigates to /mcp/{id} when a row is clicked", () => {
    const server = buildServer({ id: "srv_click", name: "Clickable" });
    render(<McpServerTable servers={[server]} />);
    const row = screen.getByTestId(`mcp-server-row-${server.id}`);
    fireEvent.click(row);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith(`/mcp/${encodeURIComponent(server.id)}`);
  });

  it("renders the 'No MCP servers connected yet' empty state when servers is empty", () => {
    render(<McpServerTable servers={[]} />);
    expect(screen.queryByText("No MCP servers connected yet")).not.toBeNull();
    expect(screen.queryByRole("row")).toBeNull();
  });

  it("toggles asc/desc on the sorted column when its header button is clicked", () => {
    const servers = [
      buildServer({ id: "srv_a", name: "Charlie" }),
      buildServer({ id: "srv_b", name: "Alpha" }),
      buildServer({ id: "srv_c", name: "Bravo" }),
    ];
    render(<McpServerTable servers={servers} />);

    // Initial sort = name asc → Alpha, Bravo, Charlie.
    let rows = screen.getAllByRole("row");
    let bodyRows = rows.slice(1);
    expect(within(bodyRows[0]!).queryByText("Alpha")).not.toBeNull();
    expect(within(bodyRows[1]!).queryByText("Bravo")).not.toBeNull();
    expect(within(bodyRows[2]!).queryByText("Charlie")).not.toBeNull();

    // Click "Name" header → flip to desc.
    const nameHeader = screen.getByRole("button", { name: /sort by name/i });
    fireEvent.click(nameHeader);

    rows = screen.getAllByRole("row");
    bodyRows = rows.slice(1);
    expect(within(bodyRows[0]!).queryByText("Charlie")).not.toBeNull();
    expect(within(bodyRows[1]!).queryByText("Bravo")).not.toBeNull();
    expect(within(bodyRows[2]!).queryByText("Alpha")).not.toBeNull();
  });

  it("surfaces an 'Open integration' link on integration-sourced rows only", () => {
    const servers = [
      buildServer({
        id: "srv_int",
        name: "GitHub MCP",
        source: "integration",
        integration_id: "int_github",
      }),
      buildServer({
        id: "srv_custom",
        name: "Local MCP",
        source: "custom",
      }),
    ];
    render(<McpServerTable servers={servers} />);
    const links = screen.queryAllByTestId("mcp-open-integration-link");
    // Exactly one — the integration row.
    expect(links.length).toBe(1);
    expect(links[0]!.getAttribute("href")).toContain("/settings/integrations");
    expect(links[0]!.getAttribute("href")).toContain("focus=int_github");
  });
});
