// @vitest-environment jsdom

/**
 * Unit tests for `<LargeChangeCard>` (readiness §5.28 row 1783).
 *
 * After AGENT-2 Stage 4 the card is a DEEP-LINK (no inline gate calls): it
 * surfaces the projected cost + scope, then routes into `/work/{task_id}` where
 * the canonical stage gate (`StageActions`) owns approve / request-changes.
 * Covers:
 *   - renders the cost + scope strip when the payload is present,
 *   - clicking the card invokes `onOpen` (the parent routes + marks read),
 *   - still renders (a plain deep-link) when the BE omits the payload,
 *   - the discriminator `isLargeChangeInboxItem` is payload-driven.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
    context: "The change touches 312 files across 5 domains - admin approval required.",
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
  beforeEach(() => { cleanup(); });
  afterEach(() => { cleanup(); });

  it("renders the cost + scope strip from the payload", () => {
    render(<LargeChangeCard item={buildItem()} onOpen={vi.fn()} />);
    const stats = screen.getByTestId("large-change-card-stats");
    expect(stats.textContent).toMatch(/\$124\.50/);
    expect(stats.textContent).toMatch(/312/);
    expect(stats.textContent).toMatch(/\+1840/);
    expect(stats.textContent).toMatch(/-920/);
  });

  it("deep-links into the task cockpit on click (no inline gate calls)", () => {
    const onOpen = vi.fn();
    render(<LargeChangeCard item={buildItem()} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("large-change-card"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("still renders a plain deep-link row when the BE omits the payload", () => {
    render(<LargeChangeCard item={buildItem({ payload: null })} onOpen={vi.fn()} />);
    expect(screen.queryByTestId("large-change-card-stats")).toBeNull();
    expect(screen.getByTestId("large-change-card")).toBeTruthy();
  });

  it("isLargeChangeInboxItem accepts approval_needed + matching gate_kind, rejects everything else", () => {
    expect(isLargeChangeInboxItem(buildItem())).toBe(true);
    expect(isLargeChangeInboxItem(buildItem({ kind: "review_requested" }))).toBe(false);
    expect(
      isLargeChangeInboxItem(buildItem({ payload: { gate_kind: "some_other_gate" } })),
    ).toBe(false);
    // Older BE build that omits the payload - falls through to generic row.
    expect(isLargeChangeInboxItem(buildItem({ payload: null }))).toBe(false);
  });
});
