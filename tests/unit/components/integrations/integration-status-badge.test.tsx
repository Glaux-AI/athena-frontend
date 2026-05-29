// @vitest-environment jsdom

/**
 * Unit tests for `<IntegrationStatusBadge>` (Agent EEE).
 *
 * The badge mirrors the FE-canonical `IntegrationLifecycleStatus` closed
 * enum from `@/lib/api/integrations`. Tests cover:
 *   - each of the 6 statuses renders a distinct label,
 *   - each status binds a distinct color class,
 *   - the aria-label always names the human-readable label,
 *   - an unknown status falls back to a muted "Unknown" badge — never
 *     throws (defensive against BE shape drift).
 *
 * Per repo convention (no `@testing-library/jest-dom`): assertions use
 * plain DOM property / attribute checks.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { IntegrationStatusBadge } from "@/components/integrations/integration-status-badge";
import type { IntegrationLifecycleStatus } from "@/lib/api/integrations";

describe("<IntegrationStatusBadge>", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders distinct labels for each of the six canonical statuses", () => {
    const statuses: Array<{ status: IntegrationLifecycleStatus; label: string }> = [
      { status: "disconnected", label: "Disconnected" },
      { status: "pending",      label: "Pending" },
      { status: "connected",    label: "Connected" },
      { status: "active",       label: "Active" },
      { status: "degraded",     label: "Degraded" },
      { status: "revoked",      label: "Revoked" },
    ];

    for (const { status, label } of statuses) {
      cleanup();
      render(<IntegrationStatusBadge status={status} />);
      expect(screen.queryByText(label)).not.toBeNull();
    }
  });

  it("binds a distinct color class per status", () => {
    const classOf = (status: IntegrationLifecycleStatus): string => {
      cleanup();
      render(<IntegrationStatusBadge status={status} />);
      const badge = screen.getByRole("status");
      return badge.className;
    };

    expect(classOf("connected")).toContain("--success");
    expect(classOf("active")).toContain("--success");
    expect(classOf("degraded")).toContain("--warning");
    expect(classOf("revoked")).toContain("--danger");
    expect(classOf("pending")).toContain("--info");
    expect(classOf("disconnected")).toContain("--text-muted");
  });

  it("exposes an aria-label so screen readers announce the status", () => {
    render(<IntegrationStatusBadge status="connected" />);
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("aria-label")).toBe("Integration status: Connected");
  });

  it("falls back to an 'Unknown' badge without throwing on a non-enum value", () => {
    // Intentional cast — simulates a BE shape drift the FE shouldn't crash on.
    render(
      <IntegrationStatusBadge
        status={"completely_unknown_status" as IntegrationLifecycleStatus}
      />,
    );
    expect(screen.queryByText("Unknown")).not.toBeNull();
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("aria-label")).toBe("Integration status: Unknown");
  });
});
