"use client";

/**
 * Mascot activity bridges - translate a screen's LIVE activity into Sophia's
 * mood (UX design standard §7.3 "active-run override").
 *
 * The mood store (`lib/stores/mascot.ts`) and every per-mood animation were
 * already built, but nothing was driving them: `applyRunEvent` had no callers,
 * so the owl beside the wordmark sat frozen in `idle` no matter what Athena was
 * doing. These hooks close that gap for the three surfaces where Athena visibly
 * works - the task cockpit, the repo ingest pipeline, and chat - by mapping
 * each surface's existing live signal onto the store's `RunEvent` vocabulary.
 *
 * Each hook resets the store on unmount so a run mood from one screen never
 * leaks onto the next.
 */

import { useEffect, useRef } from "react";

import { useMascotStore, type Mood } from "@/lib/stores/mascot";
import type { TaskStreamState } from "@/features/work/use-task-stream";
import type { StreamingTurn } from "@/features/chat/use-chat-turn";
import type { SyncState } from "@/components/repo/sync-status";

/* ----------------------------- task cockpit ------------------------------ */

/**
 * Drive Sophia from a task's live SSE feed (`/work/[id]`): each `agent_step`
 * sets the matching mood (plan/reason → thinking, retrieve/read → reading,
 * draft/write/said → writing, delegate → working), each `tool_call` flashes
 * `working`, an open hard gate is `waiting`, and a terminal task status settles
 * to `happy` (done) or `focused` (blocked/cancelled) before easing back.
 */
export function useTaskMascot(stream: TaskStreamState): void {
  const applyRunEvent = useMascotStore((s) => s.applyRunEvent);
  const reset = useMascotStore((s) => s.reset);
  // The high-water mark of events we've already mapped, so we map each fresh
  // event exactly once (the event list only ever grows).
  const processed = useRef(0);

  useEffect(() => {
    const evs = stream.events;
    for (let i = processed.current; i < evs.length; i += 1) {
      const ev = evs[i];
      if (!ev) continue;
      if (ev.event === "agent_step") {
        applyRunEvent({ type: "agent_step", kind: String(ev.data["kind"] ?? "") });
      } else if (ev.event === "tool_call") {
        applyRunEvent({ type: "tool_call" });
      }
    }
    processed.current = evs.length;
  }, [stream.events, applyRunEvent]);

  // An open hard gate - Sophia looks up expectantly. Keyed on the monotonic
  // `seq` so a re-fired gate re-arms the mood (same pattern as the cockpit's
  // gate re-fetch effect).
  useEffect(() => {
    if (stream.gatePending) applyRunEvent({ type: "gate_pending" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.gatePending?.seq, applyRunEvent]);

  // Terminal task status - a brief celebration / alert, then back to default.
  useEffect(() => {
    const s = stream.taskStatus;
    if (s === "done") {
      applyRunEvent({ type: "run_status", status: "completed" });
    } else if (s === "blocked") {
      applyRunEvent({ type: "run_status", status: "failed" });
    } else if (s === "cancelled") {
      applyRunEvent({ type: "run_status", status: "cancelled" });
    }
  }, [stream.taskStatus, applyRunEvent]);

  useEffect(() => () => reset(), [reset]);
}

/* --------------------------------- chat ---------------------------------- */

/**
 * Drive Sophia from a live chat turn (`/chat`). The streaming turn's status
 * verb maps to a mood while Athena answers, each tool call flashes `working`, a
 * failed turn is `focused`, and the settled turn eases back to the resting mood.
 */
export function useChatMascot(args: {
  streaming: StreamingTurn | null;
  sending: boolean;
  /** Truthy while the last turn is in a retryable failed state. */
  failedTurn: { message: string } | null;
}): void {
  const { streaming, sending, failedTurn } = args;
  const applyRunEvent = useMascotStore((s) => s.applyRunEvent);
  const clearRun = useMascotStore((s) => s.clearRun);
  const reset = useMascotStore((s) => s.reset);

  const status = streaming?.status ?? null;
  const toolCount = streaming?.tools.length ?? 0;

  // The live status verb (reason / retrieve / read / draft / write / said …).
  useEffect(() => {
    if (sending && status) applyRunEvent({ type: "agent_step", kind: status });
  }, [status, sending, applyRunEvent]);

  // A new tool call - busy `working` (re-armed on each call).
  useEffect(() => {
    if (sending && toolCount > 0) applyRunEvent({ type: "tool_call" });
  }, [toolCount, sending, applyRunEvent]);

  // A failed / stopped turn - alert, never sad.
  useEffect(() => {
    if (failedTurn) applyRunEvent({ type: "run_status", status: "failed" });
  }, [failedTurn, applyRunEvent]);

  // The turn settled cleanly - drop the run mood back to the resting default.
  useEffect(() => {
    if (!sending && !failedTurn) clearRun();
  }, [sending, failedTurn, clearRun]);

  useEffect(() => () => reset(), [reset]);
}

/* ------------------------------- ingestion ------------------------------- */

/** Resting mood for each derived repo sync state - the screen default while
 *  the repo page is open, so the owl mirrors the ingest pipeline. */
const SYNC_MOOD: Partial<Record<SyncState, Mood>> = {
  in_flight: "working",
  syncing: "working",
  paused: "focused",
  failed: "focused",
  degraded: "focused",
};

/**
 * Drive Sophia from a repo's live sync state (`/domains/[id]/repos/[repo_id]`).
 * Ingestion has no per-step SSE feed here - it's a polled status - so the live
 * state is expressed as the screen default: `working` while indexing, `focused`
 * when it needs attention, `idle` otherwise.
 */
export function useSyncMascot(state: SyncState): void {
  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);
  const reset = useMascotStore((s) => s.reset);

  useEffect(() => {
    setScreenDefault(SYNC_MOOD[state] ?? "idle");
  }, [state, setScreenDefault]);

  useEffect(() => () => reset(), [reset]);
}
