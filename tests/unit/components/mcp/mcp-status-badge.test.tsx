// @vitest-environment jsdom

/**
 * Unit tests for `<McpStatusBadge>` (readiness §6 r3 / row 997).
 *
 * The badge mirrors the FE-canonical `McpStatus` closed enum from
 * `@/lib/api/client`. Tests cover:
 *   - each status renders a distinct label,
 *   - each status binds a distinct color class,
 *   - the aria-label always names the human-readable label,
 *   - an unknown status falls back to a muted "Unknown" badge - never
 *     throws (defensive against BE shape drift).
 *
 * Per repo convention (no `@testing-library/jest-dom`): assertions use
 * plain DOM property / attribute checks.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { McpStatusBadge } from "@/components/mcp/mcp-status-badge";
import type { McpStatus } from "@/lib/api/client";

describe("<McpStatusBadge>", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders distinct labels for each canonical status", () => {
    const statuses: Array<{ status: McpStatus; label: string }> = [
      { status: "connected",      label: "Connected" },
      // `healthy` (BE `/test`) + `unknown` (auto-provisioner default) are
      // real wire values that previously crashed the non-defensive list
      // pill - regression-pin them here.
      { status: "healthy",        label: "Healthy" },
      { status: "unknown",        label: "Not checked" },
      { status: "degraded",       label: "Degraded" },
      { status: "error",          label: "Error" },
      { status: "disconnected",   label: "Disconnected" },
      { status: "pending_review", label: "Pending review" },
    ];

    for (const { status, label } of statuses) {
      cleanup();
      render(<McpStatusBadge status={status} />);
      expect(screen.queryByText(label)).not.toBeNull();
    }
  });

  it("binds a distinct color class per status", () => {
    const classOf = (status: McpStatus): string => {
      cleanup();
      render(<McpStatusBadge status={status} />);
      const badge = screen.getByRole("status");
      const className = badge.className;
      return className;
    };

    expect(classOf("connected")).toContain("--success");
    expect(classOf("degraded")).toContain("--warning");
    expect(classOf("error")).toContain("--danger");
    expect(classOf("pending_review")).toContain("--info");
  });

  it("exposes an aria-label so screen readers announce the status", () => {
    render(<McpStatusBadge status="connected" />);
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("aria-label")).toBe("MCP server status: Connected");
  });

  it("falls back to an 'Unknown' badge without throwing on a non-enum value", () => {
    // Intentional cast - simulates a BE shape drift the FE shouldn't crash on.
    render(<McpStatusBadge status={"completely_unknown_status" as McpStatus} />);
    expect(screen.queryByText("Unknown")).not.toBeNull();
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("aria-label")).toBe("MCP server status: Unknown");
  });
});
