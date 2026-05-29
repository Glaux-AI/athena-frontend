// @vitest-environment jsdom

/**
 * Unit tests for `<McpServerDetail>` (readiness §6 r3 / row 997).
 *
 * Tests cover:
 *   - renders the metadata grid (endpoint_url, connected_at,
 *     last_health_check, owner),
 *   - the tool catalogue table is populated from `server.tools`,
 *   - the approval-history table is populated from `approvals`,
 *   - the Disconnect button only renders for `source === "custom"`,
 *   - integration-sourced servers render the owner integration link,
 *   - the loading skeleton renders while `isLoading` is true.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(),
    refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/mcp/srv_demo",
  useSearchParams: () => new URLSearchParams(),
}));

import { McpServerDetail } from "@/components/mcp/mcp-server-detail";
import type {
  McpRecentCall,
  McpServer,
  McpStatus,
  McpToolApproval,
  McpToolRisk,
} from "@/lib/api/client";

function buildServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "srv_demo",
    org_id: "org_demo",
    slug: "demo",
    name: "Demo MCP",
    source: "custom",
    transport: "http",
    endpoint_url: "https://demo.example/mcp",
    auth: { method: "none" },
    egress_policy: "any",
    tools: [
      {
        id: "tl_1",
        name: "search",
        description: "Search demo content",
        enabled: true,
        approval: "none" as McpToolApproval,
        risk: "read" as McpToolRisk,
        usage_count_30d: 12,
      },
      {
        id: "tl_2",
        name: "write_doc",
        description: "Write a document",
        enabled: true,
        approval: "per_call" as McpToolApproval,
        risk: "write" as McpToolRisk,
        usage_count_30d: 3,
      },
    ],
    health: {
      status: "connected" as McpStatus,
      last_check_at: "2026-05-27T10:00:00Z",
      latency_p50_ms: 18,
      latency_p95_ms: 62,
      error_rate_24h: 0,
      uptime_30d: 0.999,
    },
    created_by_user_id: "u_demo",
    created_at: "2026-04-01T08:00:00Z",
    ...overrides,
  };
}

function buildApproval(overrides: Partial<McpRecentCall> = {}): McpRecentCall {
  return {
    id: "evt_1",
    tool_id: "tl_1",
    tool_name: "search",
    when: "2m ago",
    created_at: "2026-05-27T09:58:00Z",
    actor: "agent:spec_builder",
    duration_ms: 84,
    status: "ok",
    ...overrides,
  };
}

describe("<McpServerDetail>", () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the metadata grid (endpoint, connected_at, last_health_check, owner)", () => {
    const server = buildServer();
    render(<McpServerDetail server={server} approvals={[]} />);
    expect(screen.queryByText("Endpoint")).not.toBeNull();
    expect(screen.queryByText("Connected at")).not.toBeNull();
    expect(screen.queryByText("Last health check")).not.toBeNull();
    expect(screen.queryByText("Owner")).not.toBeNull();
    expect(screen.queryByText(server.endpoint_url)).not.toBeNull();
    expect(screen.queryAllByText(server.created_at).length).toBeGreaterThan(0);
  });

  it("populates the tool catalogue table from server.tools", () => {
    const server = buildServer();
    render(<McpServerDetail server={server} approvals={[]} />);
    expect(screen.queryByText("search")).not.toBeNull();
    expect(screen.queryByText("write_doc")).not.toBeNull();
    // Risk badges land.
    expect(screen.queryByLabelText("Risk level: Read")).not.toBeNull();
    expect(screen.queryByLabelText("Risk level: Write")).not.toBeNull();
  });

  it("populates the approval-history table from approvals", () => {
    const server = buildServer();
    const approvals = [
      buildApproval({ id: "evt_1", tool_name: "search",     status: "ok" }),
      buildApproval({ id: "evt_2", tool_name: "write_doc",  status: "denied" }),
    ];
    render(<McpServerDetail server={server} approvals={approvals} />);
    expect(screen.queryByLabelText("Decision: Allowed")).not.toBeNull();
    expect(screen.queryByLabelText("Decision: Denied")).not.toBeNull();
  });

  it("renders the Disconnect button only when source === 'custom' AND onDisconnect is provided", async () => {
    const server = buildServer({ source: "custom" });
    const onDisconnect = vi.fn().mockResolvedValue(undefined);

    // window.confirm always says yes here.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<McpServerDetail server={server} approvals={[]} onDisconnect={onDisconnect} />);

    const btn = screen.getByTestId("mcp-disconnect-button");
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("hides the Disconnect button and surfaces the integration link for integration-sourced servers", () => {
    const server = buildServer({
      source: "integration",
      integration_id: "int_github",
    });
    render(<McpServerDetail server={server} approvals={[]} onDisconnect={vi.fn()} />);

    expect(screen.queryByTestId("mcp-disconnect-button")).toBeNull();
    const ownerLink = screen.getByTestId("mcp-owner-integration-link");
    expect(ownerLink.getAttribute("href")).toContain("/settings/integrations");
    expect(ownerLink.getAttribute("href")).toContain("focus=int_github");
  });

  it("renders the loading skeleton while isLoading is true", () => {
    const server = buildServer();
    render(<McpServerDetail server={server} approvals={[]} isLoading={true} />);
    // Skeletons replace each section body.
    expect(screen.queryByTestId("mcp-detail-skeleton")).not.toBeNull();
    expect(screen.queryByTestId("mcp-approvals-skeleton")).not.toBeNull();
    // Catalogue/approval tables are NOT rendered while loading.
    expect(screen.queryByRole("table")).toBeNull();
  });
});
