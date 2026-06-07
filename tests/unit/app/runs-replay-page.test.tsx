// @vitest-environment jsdom

/**
 * §7 Replay UI GA — unit tests for `/runs/[id]/replay`.
 *
 * Covers:
 *   1. The page fetches `/v1/runs/{id}/events/replay`, walks `has_more`
 *      pagination, and renders the resulting timeline.
 *   2. The scrubber controls (range input + step buttons + play/pause)
 *      update the position counter and visible event list.
 *   3. The position display reads "event N of M" in lockstep with `index`.
 *
 * The test mocks `api.runs.{get, replay}` at the module level so the page's
 * effect resolves synchronously after a microtask flush — no jsdom fetch
 * polyfill needed, and no need to spin up the in-process mock backend for
 * a one-page test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from "@testing-library/react";

import type { ReplayEvent, RunDetail } from "@/lib/api/client";

// `vi.mock` factories are hoisted above non-hoisted top-level declarations,
// so closing over a plain `const fn = vi.fn()` would hit a TDZ error. Use
// `vi.hoisted` to bind the mocks to a hoisted binding the factory can see.
const { runsGetMock, runsReplayMock } = vi.hoisted(() => ({
  runsGetMock: vi.fn(),
  runsReplayMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      runs: {
        ...actual.api.runs,
        get: runsGetMock,
        replay: runsReplayMock,
      },
    },
  };
});

// Avoid pulling in Next.js routing in jsdom — the page only uses `use()`
// to unwrap `params`, no navigation hooks.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mascot store is read by `<LiveActivityStrip>` indirectly through hooks;
// not used by `<ReplayActivityStrip>` but the imports could pull it in
// transitively if Vite resolves the layout primitives' module graph.
// Keep the test isolated to the replay surface.

import RunReplayPage from "@/app/(protected)/runs/[id]/replay/page";

function makeRun(): RunDetail {
  return {
    id: "tsk_001",
    goal: "Add Stripe ACH support for mid-market invoices",
    status: "completed",
    spent_usd: 0.47,
    created_at: "2026-05-22T12:32:00Z",
    output_summary: null,
    stream_url: "/v1/runs/tsk_001/events",
    kind: "implement",
    domain_id: "dom_billing",
    current_phase: 5,
    progress: 100,
    assignee: "Athena",
    requested_by: "Maya Rao",
    source: { kind: "prd", label: "PRD" },
    summary: "ACH for mid-market",
  };
}

function makeEvent(seq: number, event: string, payload: Record<string, unknown> = {}): ReplayEvent {
  return {
    seq,
    event,
    payload,
    created_at: new Date(Date.parse("2026-05-22T12:32:00Z") + seq * 1000).toISOString(),
  };
}

const FIXTURE_EVENTS: ReplayEvent[] = [
  makeEvent(1, "run_status", { status: "running" }),
  makeEvent(2, "agent_step", { kind: "plan", label: "Planning" }),
  makeEvent(3, "agent_step", { kind: "draft", label: "Drafting spec.md" }),
  makeEvent(4, "tool_call", { name: "search_knowledge", args_summary: "ach checkout" }),
  makeEvent(5, "phase_transition", { from: "spec", to: "plan" }),
  makeEvent(6, "run_status", { status: "completed" }),
];

describe("/runs/[id]/replay page", () => {
  beforeEach(() => {
    cleanup();
    runsGetMock.mockReset();
    runsReplayMock.mockReset();
    runsGetMock.mockResolvedValue(makeRun());
    runsReplayMock.mockResolvedValue({
      events: FIXTURE_EVENTS,
      next_cursor: 6,
      has_more: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderPage() {
    const params = Promise.resolve({ id: "tsk_001" });
    render(<RunReplayPage params={params} />);
    // Two awaits: one for the params promise, one for the api fetch chain.
    await waitFor(() => {
      expect(runsReplayMock).toHaveBeenCalled();
    });
    // Wait for the activity strip to mount (loadState flips to "ready").
    await waitFor(() => {
      expect(screen.queryByTestId("replay-activity-strip")).not.toBeNull();
    });
  }

  it("fetches replay events and renders the run goal + total count", async () => {
    await renderPage();
    expect(runsGetMock).toHaveBeenCalledWith("tsk_001");
    expect(runsReplayMock).toHaveBeenCalledWith("tsk_001");
    // Goal renders verbatim.
    expect(screen.getByText(/add stripe ach support/i)).not.toBeNull();
    // Initial position is "event 1 of 6".
    const position = screen.getByTestId("replay-position");
    expect(position.textContent).toMatch(/event 1 of 6/i);
  });

  it("renders the visible timeline up to the current scrubber index", async () => {
    await renderPage();
    // Only the first event should be visible initially.
    const list = screen.getByTestId("replay-event-list");
    expect(list.querySelectorAll("li").length).toBe(1);
    // Current event readout reflects seq + event name.
    const current = screen.getByTestId("replay-current-event");
    expect(current.textContent).toMatch(/#1.*run_status/);
  });

  it("step-forward advances the index and reveals more events", async () => {
    await renderPage();
    const stepForward = screen.getByTestId("replay-step-forward");
    fireEvent.click(stepForward);
    fireEvent.click(stepForward);
    // Position now reads "event 3 of 6".
    expect(screen.getByTestId("replay-position").textContent).toMatch(/event 3 of 6/i);
    const list = screen.getByTestId("replay-event-list");
    expect(list.querySelectorAll("li").length).toBe(3);
  });

  it("step-back decreases the index but never goes below 0", async () => {
    await renderPage();
    const stepForward = screen.getByTestId("replay-step-forward");
    const stepBack = screen.getByTestId("replay-step-back");
    // Move to event 3, then back twice — should land on event 1.
    fireEvent.click(stepForward);
    fireEvent.click(stepForward);
    fireEvent.click(stepBack);
    fireEvent.click(stepBack);
    // Extra click — should clamp at 0 (event 1 of 6).
    fireEvent.click(stepBack);
    expect(screen.getByTestId("replay-position").textContent).toMatch(/event 1 of 6/i);
    expect(stepBack.getAttribute("disabled")).not.toBeNull();
  });

  it("the range scrubber jumps directly to the chosen index", async () => {
    await renderPage();
    const scrubber = screen.getByTestId("replay-scrubber") as HTMLInputElement;
    fireEvent.change(scrubber, { target: { value: "4" } });
    expect(screen.getByTestId("replay-position").textContent).toMatch(/event 5 of 6/i);
    const list = screen.getByTestId("replay-event-list");
    expect(list.querySelectorAll("li").length).toBe(5);
  });

  it("play/pause toggles the button label between Play and Pause", async () => {
    // The 900ms interval-driven advance is exercised by stepForward in the
    // other tests; here we cover the play/pause toggle behaviour without
    // mixing fake timers and async waitFor (which would deadlock — waitFor
    // polls under real timers and fake timers freeze the microtask queue).
    await renderPage();
    const playBtn = screen.getByTestId("replay-play-pause");
    expect(playBtn.textContent).toMatch(/play/i);
    act(() => { fireEvent.click(playBtn); });
    expect(playBtn.textContent).toMatch(/pause/i);
    act(() => { fireEvent.click(playBtn); });
    expect(playBtn.textContent).toMatch(/play/i);
  });

  it("paginates across multiple pages when has_more is true", async () => {
    // Two-page scenario: first page returns events 1..3 with has_more,
    // second page returns events 4..6. The page should concatenate them
    // and end up with all 6 events visible via the scrubber.
    runsReplayMock.mockReset();
    runsReplayMock.mockResolvedValueOnce({
      events: FIXTURE_EVENTS.slice(0, 3),
      next_cursor: 3,
      has_more: true,
    });
    runsReplayMock.mockResolvedValueOnce({
      events: FIXTURE_EVENTS.slice(3),
      next_cursor: 6,
      has_more: false,
    });

    await renderPage();
    expect(runsReplayMock).toHaveBeenCalledTimes(2);
    // First call: no cursor. Second call: cursor=3.
    expect(runsReplayMock.mock.calls[0]).toEqual(["tsk_001"]);
    expect(runsReplayMock.mock.calls[1]).toEqual(["tsk_001", { cursor: 3 }]);
    // Total should equal the combined length.
    expect(screen.getByTestId("replay-position").textContent).toMatch(/event 1 of 6/i);
  });
});
