// @vitest-environment jsdom

/**
 * useTaskStream - the task cockpit's live SSE reducer. These pin the
 * terminal-priority guard's REPLAY-ONLY contract (the header-pill fix):
 *
 *   1. A FRESH non-terminal `task_status` after a terminal one wins - so a
 *      stage "reopen" or a board "restore"/"reopen" (done|cancelled →
 *      in_progress|backlog) un-sticks the header pill instead of leaving it on
 *      "Done".
 *   2. A REPLAYED non-terminal `task_status` (a Last-Event-ID resume re-sends a
 *      seen id) must NOT un-terminal - a lagging replay can't clobber the
 *      terminal we already settled on.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

type RawEvent = { id: string; event: string; data: string };

const { sseState } = vi.hoisted(() => ({
  sseState: { impl: null as ((url: string, opts: { signal?: AbortSignal }) => AsyncIterable<RawEvent>) | null },
}));

vi.mock("@/lib/api/mock/sse", () => ({
  sseStreamOrMock: (url: string, opts: { signal?: AbortSignal }) => sseState.impl!(url, opts),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabase: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  }),
}));

import { useTaskStream } from "@/features/work/use-task-stream";

/** A stream that yields the given events then stays open (awaits abort), so the
 *  hook's clean-close reconnect never fires and the test sees a stable end state. */
function streamYielding(events: RawEvent[]) {
  return async function* (_url: string, opts: { signal?: AbortSignal }): AsyncIterable<RawEvent> {
    for (const e of events) yield e;
    await new Promise<void>((resolve) => {
      if (opts.signal?.aborted) return resolve();
      opts.signal?.addEventListener("abort", () => resolve());
    });
  };
}

function statusEvent(id: string, status: string): RawEvent {
  return { id, event: "task_status", data: JSON.stringify({ status }) };
}

afterEach(() => {
  cleanup();
  sseState.impl = null;
});

describe("useTaskStream terminal-priority guard", () => {
  it("lets a FRESH non-terminal status win after a terminal one (reopen/restore)", async () => {
    sseState.impl = streamYielding([
      statusEvent("1", "done"),
      statusEvent("2", "in_progress"),
    ]);
    const { result } = renderHook(() =>
      useTaskStream("t1", "/v1/tasks/t1/events", "todo"),
    );
    await waitFor(() => expect(result.current.taskStatus).toBe("in_progress"));
  });

  it("keeps the terminal status when a non-terminal one is REPLAYED on resume", async () => {
    sseState.impl = streamYielding([
      statusEvent("1", "in_progress"),
      statusEvent("2", "done"),
      // resume re-sends id "1" (already seen) - a stale replay must not un-terminal.
      statusEvent("1", "in_progress"),
      // sentinel AFTER the replay: once it lands the replay was processed.
      { id: "3", event: "thread_entry", data: JSON.stringify({ entry_id: "e1", kind: "x", author_kind: "user" }) },
    ]);
    const { result } = renderHook(() =>
      useTaskStream("t2", "/v1/tasks/t2/events", "todo"),
    );
    await waitFor(() => expect(result.current.threadSignal).not.toBeNull());
    expect(result.current.taskStatus).toBe("done");
  });
});
