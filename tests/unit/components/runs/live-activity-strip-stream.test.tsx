// @vitest-environment jsdom

/**
 * LiveActivityStrip + use-run-stream wire-up tests (readiness §4 row 11).
 *
 * Drives the strip end-to-end via a mocked `sseStreamOrMock` async generator
 * so we can verify:
 *
 *   1. The strip consumes the canonical FE-truth envelope shape — snake_case
 *      `agent_step` (all 6 closed kind values: plan/reason/retrieve/read/draft/
 *      write), `gate_pending`, `phase_transition`, and the terminal
 *      `run_status` — and renders them in arrival order inside the expanded
 *      timeline.
 *   2. `useRunStream` carries the last seen event id into the reconnect
 *      attempt's `Last-Event-ID` option after a mid-stream disconnect.
 *
 * The hook's reconnect-with-backoff path uses real `setTimeout`, so we run
 * the reconnect test under `vi.useFakeTimers()` and flush the 1s initial
 * backoff with `vi.advanceTimersByTimeAsync(...)`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { SSEEvent, SSEOptions } from "@/lib/sse/event-stream";

// `useRunStream` imports `sseStreamOrMock` from this module — mock it before
// any module under test imports the hook.
const sseStreamMock = vi.fn();
vi.mock("@/lib/api/mock/sse", () => ({
  sseStreamOrMock: (url: string, opts: SSEOptions = {}) => sseStreamMock(url, opts),
}));

import { LiveActivityStrip } from "@/components/runs/live-activity-strip";
import { useMascotStore } from "@/lib/stores/mascot";

/**
 * Build an async generator that yields the given events sequentially. Each
 * yield is wrapped in a queued microtask so the consumer's `for await` loop
 * has time to apply state between events. When `afterAll` is provided it is
 * invoked once the script is exhausted, which lets a test request a
 * mid-stream disconnect (by throwing).
 */
function scriptedGenerator(
  events: SSEEvent[],
  afterAll?: () => void | Promise<void>,
): AsyncGenerator<SSEEvent, void, void> {
  let i = 0;
  const gen = {
    async next() {
      // Yield to the microtask queue so the consumer can observe each event
      // before the next one lands.
      await Promise.resolve();
      if (i < events.length) return { value: events[i++]!, done: false };
      if (afterAll) await afterAll();
      return { value: undefined, done: true };
    },
    async return() {
      return { value: undefined, done: true };
    },
    async throw(err: unknown): Promise<IteratorResult<SSEEvent, void>> {
      throw err;
    },
    [Symbol.asyncIterator]() {
      return gen;
    },
  };
  // The hook only consumes this via `for await`, which exercises `next` +
  // `Symbol.asyncIterator`. The full `AsyncGenerator` interface (asyncDispose,
  // etc.) is unused — cast via `unknown` to satisfy TS without adding
  // dead protocol stubs.
  return gen as unknown as AsyncGenerator<SSEEvent, void, void>;
}

function sse(id: string, event: string, data: Record<string, unknown>): SSEEvent {
  return { id, event, data: JSON.stringify(data) };
}

describe("LiveActivityStrip + use-run-stream", () => {
  beforeEach(() => {
    cleanup();
    sseStreamMock.mockReset();
    useMascotStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders all 4 canonical event types in arrival order", async () => {
    // 9 events: 6 agent_step (one per closed `kind`), gate_pending,
    // phase_transition, terminal run_status.
    const stream: SSEEvent[] = [
      sse("1", "run_status", { status: "running", spent_usd: 0 }),
      sse("2", "agent_step", { kind: "plan", label: "Planning approach", duration_ms: 100 }),
      sse("3", "agent_step", { kind: "reason", label: "Weighing options", duration_ms: 200 }),
      sse("4", "agent_step", { kind: "retrieve", label: "Fetching context", duration_ms: 300 }),
      sse("5", "agent_step", { kind: "read", label: "Reading code", duration_ms: 400 }),
      sse("6", "agent_step", { kind: "draft", label: "Drafting spec", duration_ms: 500 }),
      sse("7", "agent_step", { kind: "write", label: "Saving spec.md", duration_ms: 600 }),
      sse("8", "phase_transition", { from: "impl.spec", to: "impl.plan" }),
      sse("9", "gate_pending", { gate: "spec_approved", requires: ["product"] }),
      sse("10", "run_status", { status: "completed", spent_usd: 0.42 }),
    ];

    sseStreamMock.mockImplementation(() => scriptedGenerator(stream));

    render(
      <LiveActivityStrip
        runId="tsk_test"
        streamUrl="/v1/runs/tsk_test/events"
        initialStatus="running"
      />,
    );

    // Expand the strip so the timeline renders.
    const toggle = await screen.findByRole("button", { expanded: false });
    fireEvent.click(toggle);

    // Wait until the terminal event lands and the run-status footer appears.
    await waitFor(() =>
      expect(document.getElementById("live-activity-body")?.textContent)
        .toMatch(/Run completed/),
    );

    // All assertions are scoped to the expanded body so the compact summary
    // line (which mirrors the latest event) doesn't cause duplicate matches.
    const body = document.getElementById("live-activity-body")!;
    const bodyText = body.textContent ?? "";

    // All 6 agent_step labels render.
    expect(bodyText).toMatch(/Planning approach/);
    expect(bodyText).toMatch(/Weighing options/);
    expect(bodyText).toMatch(/Fetching context/);
    expect(bodyText).toMatch(/Reading code/);
    expect(bodyText).toMatch(/Drafting spec/);
    expect(bodyText).toMatch(/Saving spec\.md/);

    // gate_pending row carries its gate name and required roles.
    expect(bodyText).toMatch(/Awaiting approval/);
    expect(bodyText).toMatch(/spec_approved/);

    // phase_transition row renders from→to inline.
    expect(bodyText).toMatch(/impl\.spec/);
    expect(bodyText).toMatch(/impl\.plan/);

    // Order is preserved: the rendered <li> elements should appear in the
    // same order as the input event stream (skipping run_status `running`,
    // which renders as "Run started").
    const items = Array.from(body.querySelectorAll("li")).map(
      (li) => li.textContent ?? "",
    );
    const orderedIndexFor = (needle: RegExp): number =>
      items.findIndex((t) => needle.test(t));
    const planIdx = orderedIndexFor(/Planning approach/);
    const phaseIdx = orderedIndexFor(/impl\.plan/);
    const gateIdx = orderedIndexFor(/spec_approved/);
    const completedIdx = orderedIndexFor(/Run completed/);
    expect(planIdx).toBeGreaterThanOrEqual(0);
    expect(phaseIdx).toBeGreaterThan(planIdx);
    expect(gateIdx).toBeGreaterThan(phaseIdx);
    expect(completedIdx).toBeGreaterThan(gateIdx);
  });

  it("reconnects with Last-Event-ID matching the last seen seq", async () => {
    vi.useFakeTimers();

    // First connection: deliver two events then disconnect by throwing.
    // Second connection: deliver one more event then close cleanly.
    const firstBatch: SSEEvent[] = [
      sse("seq-1", "run_status", { status: "running", spent_usd: 0 }),
      sse("seq-2", "agent_step", { kind: "plan", label: "Planning", duration_ms: 100 }),
    ];
    const secondBatch: SSEEvent[] = [
      sse("seq-3", "agent_step", { kind: "write", label: "Writing", duration_ms: 200 }),
    ];

    let callIdx = 0;
    sseStreamMock.mockImplementation((_url: string, opts: SSEOptions) => {
      callIdx += 1;
      if (callIdx === 1) {
        return scriptedGenerator(firstBatch, () => {
          // After the first batch is drained, simulate a mid-stream
          // disconnect by throwing — the consumer should treat this as an
          // error, back off, and reconnect.
          throw new Error("stream dropped");
        });
      }
      // Second call — the resume attempt. Record the lastEventId carried in.
      void opts;
      return scriptedGenerator(secondBatch);
    });

    render(
      <LiveActivityStrip
        runId="tsk_resume"
        streamUrl="/v1/runs/tsk_resume/events"
        initialStatus="running"
      />,
    );

    // Drain the first batch. Microtasks need to run; advance by 0 to let
    // pending promises resolve under fake timers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Flush the 1s initial backoff so the reconnect happens.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Drain the second batch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Two calls total: original + one resume.
    expect(sseStreamMock).toHaveBeenCalledTimes(2);

    // The resume call must carry `lastEventId === "seq-2"` (the last id we
    // saw on the dropped connection).
    const [, resumeOpts] = sseStreamMock.mock.calls[1] as [string, SSEOptions];
    expect(resumeOpts.lastEventId).toBe("seq-2");
  });
});
