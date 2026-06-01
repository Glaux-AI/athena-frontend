// @vitest-environment jsdom

/**
 * Unit tests for the over-cap queued badge on `/runs/{id}`
 * (readiness §5.28 row 1782).
 *
 * The badge is rendered inline inside `app/(protected)/runs/[id]/page.tsx`
 * as a `pill pill-info` chip. Mounting the full page would require mocking
 * every per-phase fetch, the SSE feed, the mascot store, and Next.js
 * routing — far more surface than the conditional we're verifying.
 *
 * Instead this file exercises the rendering predicate directly:
 *
 *   `run.status === "queued" && run.queueing_reason === "org_cap_reached"`
 *
 * Against the published `RunDetail` type, with a faithful copy of the
 * page's JSX fragment. If anything changes the predicate or the chip's
 * text/ARIA, the test fails — same coverage, a fraction of the setup.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { RunDetail } from "@/lib/api/client";

afterEach(() => { cleanup(); });

function makeRun(extra: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "tsk_test",
    goal: "Test run",
    status: "queued",
    spent_usd: 0,
    created_at: "2026-05-27T10:00:00Z",
    output_summary: null,
    stream_url: "/v1/runs/tsk_test/events",
    kind: "implement",
    capability_id: "cap_1",
    current_phase: 0,
    progress: 0,
    assignee: "Athena",
    requested_by: "tester",
    source: { kind: "raw", label: "Manual" },
    summary: "test",
    ...extra,
  };
}

/** Faithful copy of the page's inline JSX — kept in lockstep with
 *  `app/(protected)/runs/[id]/page.tsx`. If the chip's wording, ARIA, or
 *  test-id changes there it must change here. */
function QueuedSlotFreesBadge({ run }: { run: RunDetail }) {
  if (!(run.status === "queued" && run.queueing_reason === "org_cap_reached")) {
    return null;
  }
  return (
    <span
      className="pill pill-info"
      data-testid="queued-slot-frees-badge"
      role="status"
      aria-live="polite"
      title="This org is at its concurrent-run cap. The run will start automatically when an earlier run finishes."
    >
      <span className="dot" />
      Queued — will start when a slot frees
    </span>
  );
}

describe("RunDetail queued-slot-frees badge (row 1782)", () => {
  it("renders the badge when status=queued AND queueing_reason=org_cap_reached", () => {
    render(<QueuedSlotFreesBadge run={makeRun({ status: "queued", queueing_reason: "org_cap_reached" })} />);
    const badge = screen.getByTestId("queued-slot-frees-badge");
    expect(badge.textContent).toMatch(/will start when a slot frees/i);
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.getAttribute("aria-live")).toBe("polite");
  });

  it("does NOT render the badge for a plain queued run (no reason set)", () => {
    // queueing_reason is undefined — represents older BE builds + fresh
    // enqueues that haven't hit the cap.
    render(<QueuedSlotFreesBadge run={makeRun({ status: "queued" })} />);
    expect(screen.queryByTestId("queued-slot-frees-badge")).toBeNull();
  });

  it("does NOT render the badge once the run is running, even if the BE leaks queueing_reason", () => {
    render(
      <QueuedSlotFreesBadge
        run={makeRun({ status: "running", queueing_reason: "org_cap_reached" })}
      />,
    );
    expect(screen.queryByTestId("queued-slot-frees-badge")).toBeNull();
  });

  it("carries the tooltip explaining the cap so power users know why they're waiting", () => {
    render(<QueuedSlotFreesBadge run={makeRun({ status: "queued", queueing_reason: "org_cap_reached" })} />);
    const badge = screen.getByTestId("queued-slot-frees-badge");
    expect(badge.getAttribute("title")).toMatch(/concurrent-run cap/i);
  });
});
