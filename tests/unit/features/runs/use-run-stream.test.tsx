// @vitest-environment jsdom

/**
 * useRunStream — `phase_transition` reducer coverage.
 *
 * Pins the contract that a `phase_transition` SSE event carrying the
 * canonical BE-truth envelope (`to_phase_key` etc.) advances the hook's
 * `currentPhaseKey`. Consumers (the phase rail) rely on this to
 * auto-advance live without a page reload.
 *
 * Sibling test file `components/runs/live-activity-strip-stream.test.tsx`
 * covers the strip's rendering of `phase_transition` envelopes. Here we
 * exercise the hook in isolation via a tiny harness component so we can
 * assert reducer state directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import type { SSEEvent, SSEOptions } from "@/lib/sse/event-stream";

// Mock the SSE source before any module under test imports the hook.
const sseStreamMock = vi.fn();
vi.mock("@/lib/api/mock/sse", () => ({
  sseStreamOrMock: (url: string, opts: SSEOptions = {}) => sseStreamMock(url, opts),
}));

import { useRunStream, type RunStreamState } from "@/features/runs/use-run-stream";
import { useMascotStore } from "@/lib/stores/mascot";

/**
 * Scripted async generator. Mirrors the helper in
 * `live-activity-strip-stream.test.tsx`. Yields each event on a
 * microtask boundary so the consumer's `for await` loop has time to
 * apply state between events.
 */
function scriptedGenerator(events: SSEEvent[]): AsyncGenerator<SSEEvent, void, void> {
  let i = 0;
  const gen = {
    async next() {
      await Promise.resolve();
      if (i < events.length) return { value: events[i++]!, done: false };
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
  return gen as unknown as AsyncGenerator<SSEEvent, void, void>;
}

function sse(id: string, event: string, data: Record<string, unknown>): SSEEvent {
  return { id, event, data: JSON.stringify(data) };
}

/**
 * Render-less harness. Pushes the hook's latest state into a ref the
 * test can read after each tick. Returning `null` keeps the DOM
 * minimal — we drive assertions through the captured state.
 */
function Harness({ onState }: { onState: (s: RunStreamState) => void }) {
  const state = useRunStream("tsk_test", "/v1/runs/tsk_test/events", "running");
  onState(state);
  return null;
}

describe("useRunStream phase_transition reducer", () => {
  beforeEach(() => {
    cleanup();
    sseStreamMock.mockReset();
    useMascotStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances currentPhaseKey on a phase_transition envelope (to_phase_key)", async () => {
    const stream: SSEEvent[] = [
      sse("1", "run_status", { status: "running", spent_usd: 0 }),
      // BE-canonical envelope: snake_case, status='started'.
      sse("2", "phase_transition", {
        type: "phase_transition",
        run_id: "tsk_test",
        phase_key: "impl.plan",
        from_phase_key: "impl.spec",
        to_phase_key: "impl.plan",
        status: "started",
        ts: "2026-05-28T12:00:00+00:00",
      }),
    ];
    sseStreamMock.mockImplementation(() => scriptedGenerator(stream));

    const box: { latest: RunStreamState | null } = { latest: null };
    render(<Harness onState={(s) => { box.latest = s; }} />);

    await waitFor(() => {
      expect(box.latest?.currentPhaseKey).toBe("impl.plan");
    });
  });

  it("starts with currentPhaseKey=null and updates only on phase_transition", async () => {
    const stream: SSEEvent[] = [
      sse("1", "run_status", { status: "running", spent_usd: 0 }),
      sse("2", "agent_step", { kind: "plan", label: "Planning", duration_ms: 100 }),
    ];
    sseStreamMock.mockImplementation(() => scriptedGenerator(stream));

    const box: { latest: RunStreamState | null } = { latest: null };
    render(<Harness onState={(s) => { box.latest = s; }} />);

    await waitFor(() => {
      expect(box.latest?.events.length).toBeGreaterThanOrEqual(2);
    });
    expect(box.latest?.currentPhaseKey).toBeNull();
  });

  it("converges on the final to_phase_key after a sequence of transitions", async () => {
    const stream: SSEEvent[] = [
      sse("1", "phase_transition", {
        type: "phase_transition",
        run_id: "tsk_test",
        phase_key: "impl.spec",
        from_phase_key: null,
        to_phase_key: "impl.spec",
        status: "started",
        ts: "2026-05-28T12:00:00+00:00",
      }),
      sse("2", "phase_transition", {
        type: "phase_transition",
        run_id: "tsk_test",
        phase_key: "impl.spec",
        from_phase_key: "impl.spec",
        to_phase_key: "impl.spec",
        status: "completed",
        ts: "2026-05-28T12:00:05+00:00",
      }),
      sse("3", "phase_transition", {
        type: "phase_transition",
        run_id: "tsk_test",
        phase_key: "impl.plan",
        from_phase_key: "impl.spec",
        to_phase_key: "impl.plan",
        status: "started",
        ts: "2026-05-28T12:00:06+00:00",
      }),
    ];
    sseStreamMock.mockImplementation(() => scriptedGenerator(stream));

    const box: { latest: RunStreamState | null } = { latest: null };
    render(<Harness onState={(s) => { box.latest = s; }} />);

    await waitFor(() => {
      expect(box.latest?.events.length).toBeGreaterThanOrEqual(3);
    });
    // Final to_phase_key wins — phase rail tracks the latest phase the BE
    // has entered, irrespective of how many transitions arrived between.
    expect(box.latest?.currentPhaseKey).toBe("impl.plan");
  });

  it("ignores phase_transition envelopes without a to_phase_key", async () => {
    // Defensive: a malformed envelope (missing required field) must
    // not advance the phase rail.
    const stream: SSEEvent[] = [
      sse("1", "phase_transition", {
        type: "phase_transition",
        run_id: "tsk_test",
        // No `to_phase_key`.
        from_phase_key: "impl.spec",
        status: "started",
      }),
    ];
    sseStreamMock.mockImplementation(() => scriptedGenerator(stream));

    const box: { latest: RunStreamState | null } = { latest: null };
    render(<Harness onState={(s) => { box.latest = s; }} />);

    await waitFor(() => {
      expect(box.latest?.events.length).toBeGreaterThanOrEqual(1);
    });
    expect(box.latest?.currentPhaseKey).toBeNull();
  });
});
