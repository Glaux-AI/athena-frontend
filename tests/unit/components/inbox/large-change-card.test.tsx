// @vitest-environment jsdom

/**
 * Unit tests for `<LargeChangeCard>` (readiness §5.28 row 1783).
 *
 * Covers:
 *   - renders the cost + scope strip when the payload is present,
 *   - the discriminator `isLargeChangeInboxItem` is payload-driven and
 *     rejects items with the wrong gate_kind or missing payload,
 *   - Approve fires `approveGate(runId, "large_change_admin_approval")`,
 *   - Skip fires `rejectGate(runId, "large_change_admin_approval", reason)`,
 *   - both CTAs call `onResolved` on success so the parent can refetch,
 *   - the buttons disable while a mutation is in-flight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(),
    refresh: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

const approveGateMock = vi.fn();
const rejectGateMock = vi.fn();
vi.mock("@/lib/api/gates", () => ({
  approveGate: (runId: string, gateKey: string) => approveGateMock(runId, gateKey),
  rejectGate: (runId: string, gateKey: string, reason: string) =>
    rejectGateMock(runId, gateKey, reason),
}));

import {
  LargeChangeCard,
  isLargeChangeInboxItem,
} from "@/components/inbox/large-change-card";
import type { InboxItem } from "@/lib/api/client";

function buildItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "ibx_1",
    kind: "approval_needed",
    priority: "high",
    when: "2 min ago",
    created_at: "2026-05-27T10:00:00Z",
    read: false,
    task_id: "tsk_42",
    title: "Refactor wave across 5 services",
    actor: "Athena",
    actor_avatar: null,
    actor_kind: "agent",
    context: "The change touches 312 files across 5 capabilities — admin approval required.",
    cta: "Review",
    phase: "spec",
    to: null,
    payload: {
      gate_kind: "large_change_admin_approval",
      gate_id: "gate_xyz",
      cost_estimate_usd: 124.5,
      scope: { files_touched: 312, lines_added: 1840, lines_removed: 920 },
    },
    ...overrides,
  };
}

describe("LargeChangeCard (row 1783)", () => {
  beforeEach(() => {
    cleanup();
    approveGateMock.mockReset();
    rejectGateMock.mockReset();
  });
  afterEach(() => { cleanup(); });

  it("renders the cost + scope strip from the payload", () => {
    const onResolved = vi.fn();
    render(<LargeChangeCard item={buildItem()} onResolved={onResolved} />);
    const stats = screen.getByTestId("large-change-card-stats");
    expect(stats.textContent).toMatch(/\$124\.50/);
    expect(stats.textContent).toMatch(/312/);
    expect(stats.textContent).toMatch(/\+1840/);
    expect(stats.textContent).toMatch(/-920/);
  });

  it("Approve fires approveGate with the canonical gate_key + calls onResolved", async () => {
    approveGateMock.mockResolvedValueOnce({ id: "gate_xyz", status: "approved" });
    const onResolved = vi.fn();
    render(<LargeChangeCard item={buildItem()} onResolved={onResolved} />);
    fireEvent.click(screen.getByTestId("large-change-card-approve"));
    await waitFor(() => {
      expect(approveGateMock).toHaveBeenCalledWith("tsk_42", "large_change_admin_approval");
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
  });

  it("Skip fires rejectGate with a canned reason + calls onResolved", async () => {
    rejectGateMock.mockResolvedValueOnce({ id: "gate_xyz", status: "rejected" });
    const onResolved = vi.fn();
    render(<LargeChangeCard item={buildItem()} onResolved={onResolved} />);
    fireEvent.click(screen.getByTestId("large-change-card-skip"));
    await waitFor(() => {
      expect(rejectGateMock).toHaveBeenCalledWith(
        "tsk_42",
        "large_change_admin_approval",
        expect.stringContaining("skipped"),
      );
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
  });

  it("disables both buttons while a mutation is in-flight", () => {
    // Never-resolving promise to keep the request pending.
    approveGateMock.mockImplementationOnce(() => new Promise(() => { /* hang */ }));
    render(<LargeChangeCard item={buildItem()} onResolved={vi.fn()} />);
    const approveBtn = screen.getByTestId("large-change-card-approve") as HTMLButtonElement;
    const skipBtn = screen.getByTestId("large-change-card-skip") as HTMLButtonElement;
    fireEvent.click(approveBtn);
    expect(approveBtn.disabled).toBe(true);
    expect(skipBtn.disabled).toBe(true);
  });

  it("isLargeChangeInboxItem accepts approval_needed + matching gate_kind, rejects everything else", () => {
    expect(isLargeChangeInboxItem(buildItem())).toBe(true);
    expect(isLargeChangeInboxItem(buildItem({ kind: "review_requested" }))).toBe(false);
    expect(
      isLargeChangeInboxItem(buildItem({ payload: { gate_kind: "some_other_gate" } })),
    ).toBe(false);
    // Older BE build that omits the payload — falls through to generic row.
    expect(isLargeChangeInboxItem(buildItem({ payload: null }))).toBe(false);
  });
});
