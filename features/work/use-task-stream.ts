"use client";

/**
 * useTaskStream(taskId) — subscribes to a task's merged SSE feed and applies
 * the events to a local reducer the cockpit (`/work/[id]`) reads from:
 *   1. An ordered list of parsed events (for the foldable worklog).
 *   2. The live task status (header pill), with a terminal-priority guard.
 *   3. Per-stage FSM status updates keyed by `stage_key` (the stage rail).
 *   4. The latest `artifact_ready` signal (the artifact card re-fetches on it).
 *   5. The latest `gate_pending` signal (the decision sidebar lights up on it).
 *
 * It carries the resumable SSE machinery (reconnect-with-exponential-backoff,
 * Last-Event-ID resume, seenIds dedup, reconnect-on-token-refresh) but keys its
 * reducer on the TASK event vocabulary (the recursive-Task driver —
 * product-work-driver-design.md §9/§10) — the legacy `/runs` stream it grew out
 * of was retired in the one-flow migration.
 * snake_case is FE truth (ADR-032).
 *
 * Unlike the run hook this one is presentation-only: it does NOT drive the
 * Sophia mascot store (the cockpit derives mood from screen state). Each
 * signal that should trigger a typed re-fetch (thread / artifact / gate) is
 * surfaced as a monotonic-seq carrier so consumers can `useEffect` on it
 * without building their own dedup ring.
 */

import { useEffect, useRef, useState } from "react";

import { sseStreamOrMock as sseStream } from "@/lib/api/mock/sse";
import type { TaskStatus } from "@/lib/api/client";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/** The FSM status one stage can move to over SSE (`phase_step.status`). Mirrors
 *  the non-`locked` arm of `TaskStage["status"]` — a stage never transitions
 *  *back* to locked over the wire. */
export type StageStatus =
  | "ready"
  | "running"
  | "in_review"
  | "approved"
  | "rejected"
  | "failed";

/** A parsed task SSE event. `event` is the raw event name; the typed payload
 *  shapes below describe `data` per the BE task event vocabulary. */
export interface TaskEvent {
  id: string;
  event: string;
  data: Record<string, unknown>;
  receivedAt: number;
}

/**
 * Discriminated union of the parsed task-stream payloads. The reducer narrows
 * on `event` (the raw SSE event name) — this type documents the `data` shape
 * each one carries so consumers reading `events[].data` know the fields.
 */
export type TaskStreamEvent =
  | { event: "task_status"; data: { status: string } }
  | { event: "phase_step"; data: { step: string; status: StageStatus } }
  | {
      event: "agent_step";
      /** `kind` ∈ plan|reason|said|retrieve|read|draft|write|delegate —
       *  `reason` is the model's REAL chain-of-thought (thinking models),
       *  `said` its visible answer text. `step_id` is the persisted ledger
       *  row id (the worklog dedups live rows against it); `stage` scopes
       *  the row to its stage. */
      data: { kind: string; text: string; step_id?: string; stage?: string };
    }
  | {
      event: "tool_call";
      data: {
        id: string;
        name: string;
        args_summary?: string;
        step_id?: string;
        stage?: string;
      };
    }
  | {
      event: "tool_result";
      data: {
        id: string;
        name: string;
        summary?: string;
        ref_count?: number;
        step_id?: string;
        stage?: string;
      };
    }
  | {
      event: "thread_entry";
      data: { entry_id: string; kind: string; author_kind: string; seq: number };
    }
  | {
      event: "gate_pending";
      data: { gate_key: string; stage: string; request_id: string };
    }
  | {
      event: "artifact_ready";
      data: { artifact_id: string; kind: string; version: number };
    }
  | { event: "error"; data: { message: string; stage?: string; code?: string } };

/** A `gate_pending` signal — the open hard gate the decision sidebar surfaces. */
export interface GatePendingSignal {
  /** Monotonic — bump on every `gate_pending` so consumers can effect on it. */
  seq: number;
  gate_key: string;
  stage: string;
  request_id: string;
}

/** An `artifact_ready` signal — the artifact card re-fetches when `seq` moves. */
export interface ArtifactReadySignal {
  seq: number;
  artifact_id: string;
  kind: string;
  version: number;
}

/** A `thread_entry` signal — the decision sidebar re-fetches when `seq` moves. */
export interface ThreadSignal {
  seq: number;
  entry_id: string;
  kind: string;
  author_kind: string;
}

/** An `error` event surfaced inline (especially the AI-unavailable case). */
export interface TaskStreamError {
  seq: number;
  message: string;
  stage?: string;
  code?: string;
}

export interface TaskStreamState {
  events: TaskEvent[];
  status: "connecting" | "open" | "closed" | "error";
  /** The live task status (header pill), terminal-priority guarded. */
  taskStatus: TaskStatus;
  /** Per-stage FSM status, keyed by `stage_key`. Empty until the first
   *  `phase_step` lands — consumers merge this over the fetched `TaskStage[]`. */
  stageUpdates: Record<string, StageStatus>;
  /** Most-recent `artifact_ready` signal; `null` until one arrives. */
  latestArtifact: ArtifactReadySignal | null;
  /** Most-recent `gate_pending` signal; `null` until one arrives. */
  gatePending: GatePendingSignal | null;
  /** Most-recent `thread_entry` signal; `null` until one arrives. */
  threadSignal: ThreadSignal | null;
  /** Monotonic carrier bumped on every `phase_step` so the cockpit re-fetches
   *  the authoritative stages + task (rail / header pill / child_ids) — the
   *  optimistic `stageUpdates` merge is reconciled against the DB on every
   *  transition, so the rail can never get stuck stale (e.g. on a Stop). */
  stageSignal: { seq: number } | null;
  /** Most-recent `error` event; `null` until one arrives. */
  error: TaskStreamError | null;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Terminal task statuses must not be overwritten by a non-terminal one
 * arriving over SSE. If the initial `api.tasks.get(id)` says `done` but a
 * lagging SSE event replays `in_progress`, we keep `done` (mirrors the
 * run-stream F-03.2 priority guard).
 */
const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "done",
  "cancelled",
]);

function isTerminal(s: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

/**
 * Map a raw `task_status.status` string (the BE driver vocabulary —
 * running | in_progress | done | cancelled | failed) onto a `TaskStatus`.
 * `running` is the driver's active sentinel; the board status for it is
 * `in_progress`. `failed` maps to the `blocked` board column. Unknown values
 * (already a valid `TaskStatus`, e.g. `in_review`) pass through.
 */
function toTaskStatus(raw: string): TaskStatus | null {
  switch (raw) {
    case "running":
      return "in_progress";
    case "failed":
      return "blocked";
    case "in_progress":
    case "done":
    case "cancelled":
    case "in_review":
    case "blocked":
    case "todo":
    case "triage":
    case "backlog":
      return raw;
    default:
      return null;
  }
}

export function useTaskStream(
  taskId: string,
  streamUrl: string,
  initialStatus: TaskStatus = "todo",
): TaskStreamState {
  const lastEventIdRef = useRef<string>("");
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Monotonic counters for the re-fetch signals — bumped each time a relevant
  // event lands so consumers can `useEffect` on the signal without building
  // their own dedup ring. Refs because the bump itself need not re-render.
  const artifactSeqRef = useRef<number>(0);
  const gateSeqRef = useRef<number>(0);
  const threadSeqRef = useRef<number>(0);
  const errorSeqRef = useRef<number>(0);
  const stageSeqRef = useRef<number>(0);

  const [state, setState] = useState<TaskStreamState>({
    events: [],
    status: "connecting",
    taskStatus: initialStatus,
    stageUpdates: {},
    latestArtifact: null,
    gatePending: null,
    threadSignal: null,
    stageSignal: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let backoff = INITIAL_BACKOFF_MS;
    // One controller per connection attempt so we can abort + reconnect on
    // JWT refresh without tearing down the whole effect.
    let currentCtrl = new AbortController();

    // Reconnect on Supabase token refresh so the next attempt picks up the
    // fresh Bearer in lib/sse/event-stream.ts. Mock supabase's
    // onAuthStateChange is a no-op subscription so this is safe in tests.
    let authSub: { unsubscribe: () => void } | null = null;
    try {
      const supabase = getBrowserSupabase();
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "TOKEN_REFRESHED" && !cancelled) {
          currentCtrl.abort();
        }
      });
      authSub = data.subscription;
    } catch {
      // Supabase not configured (mock mode w/ no client). SSE just lacks
      // auto-reconnect on refresh, same as the run stream.
    }

    (async () => {
      while (!cancelled) {
        try {
          setState((s) => ({
            ...s,
            status: s.events.length === 0 ? "connecting" : "open",
          }));

          const opts: { signal: AbortSignal; lastEventId?: string } = {
            signal: currentCtrl.signal,
          };
          if (lastEventIdRef.current) opts.lastEventId = lastEventIdRef.current;

          for await (const raw of sseStream(streamUrl, opts)) {
            if (cancelled) return;

            // First event from this connection resets backoff + flips to open.
            backoff = INITIAL_BACKOFF_MS;
            setState((s) => (s.status === "open" ? s : { ...s, status: "open" }));

            if (raw.id) lastEventIdRef.current = raw.id;

            // Replays (resend from Last-Event-ID inclusive) must not double-fire
            // the re-fetch signals. The event still enters the list (the UI key
            // set is the dedup boundary).
            const isReplay = raw.id !== "" && seenIdsRef.current.has(raw.id);
            if (raw.id) seenIdsRef.current.add(raw.id);

            let data: Record<string, unknown> = {};
            try {
              data = JSON.parse(raw.data);
            } catch {
              /* keep empty */
            }

            // Build the re-fetch signals (skipped on replay) outside setState so
            // the seq refs bump exactly once per fresh event.
            let nextArtifact: ArtifactReadySignal | null = null;
            let nextGate: GatePendingSignal | null = null;
            let nextThread: ThreadSignal | null = null;
            let nextStage: { seq: number } | null = null;
            let nextError: TaskStreamError | null = null;
            if (!isReplay) {
              if (raw.event === "phase_step") {
                stageSeqRef.current += 1;
                nextStage = { seq: stageSeqRef.current };
              }
              if (raw.event === "artifact_ready" && typeof data["artifact_id"] === "string") {
                artifactSeqRef.current += 1;
                nextArtifact = {
                  seq: artifactSeqRef.current,
                  artifact_id: data["artifact_id"] as string,
                  kind: typeof data["kind"] === "string" ? (data["kind"] as string) : "",
                  version: typeof data["version"] === "number" ? (data["version"] as number) : 0,
                };
              } else if (raw.event === "gate_pending" && typeof data["gate_key"] === "string") {
                gateSeqRef.current += 1;
                nextGate = {
                  seq: gateSeqRef.current,
                  gate_key: data["gate_key"] as string,
                  stage: typeof data["stage"] === "string" ? (data["stage"] as string) : "",
                  request_id:
                    typeof data["request_id"] === "string" ? (data["request_id"] as string) : "",
                };
              } else if (raw.event === "thread_entry" && typeof data["entry_id"] === "string") {
                threadSeqRef.current += 1;
                nextThread = {
                  seq: threadSeqRef.current,
                  entry_id: data["entry_id"] as string,
                  kind: typeof data["kind"] === "string" ? (data["kind"] as string) : "",
                  author_kind:
                    typeof data["author_kind"] === "string" ? (data["author_kind"] as string) : "",
                };
              } else if (raw.event === "error") {
                errorSeqRef.current += 1;
                nextError = {
                  seq: errorSeqRef.current,
                  message:
                    typeof data["message"] === "string"
                      ? (data["message"] as string)
                      : "Something went wrong.",
                  ...(typeof data["stage"] === "string" ? { stage: data["stage"] as string } : {}),
                  ...(typeof data["code"] === "string" ? { code: data["code"] as string } : {}),
                };
              }
            }

            setState((s) => {
              const existingIdx = raw.id ? s.events.findIndex((e) => e.id === raw.id) : -1;
              const nextEvents =
                existingIdx >= 0
                  ? s.events // duplicate — skip
                  : [...s.events, { id: raw.id, event: raw.event, data, receivedAt: Date.now() }];

              // Priority guard — once terminal, ignore a non-terminal status.
              let nextTaskStatus: TaskStatus = s.taskStatus;
              if (raw.event === "task_status" && typeof data["status"] === "string") {
                const incoming = toTaskStatus(data["status"] as string);
                if (incoming && (!isTerminal(s.taskStatus) || isTerminal(incoming))) {
                  nextTaskStatus = incoming;
                }
              }

              // Stage FSM update — merge by stage_key. The canonical payload key
              // is `step`; accept `stage` as a defensive fallback so a stray
              // emitter (a past cause of a stuck "Athena working" rail) still
              // applies. The stageSignal re-fetch reconciles either way.
              let nextStageUpdates = s.stageUpdates;
              const stepKey =
                typeof data["step"] === "string"
                  ? (data["step"] as string)
                  : typeof data["stage"] === "string"
                    ? (data["stage"] as string)
                    : null;
              if (
                raw.event === "phase_step" &&
                stepKey !== null &&
                typeof data["status"] === "string"
              ) {
                nextStageUpdates = {
                  ...s.stageUpdates,
                  [stepKey]: data["status"] as StageStatus,
                };
              }

              // A run-error must not outlive the stage recovering. The reaper's
              // "didn't finish — the worker may have restarted" (and any other
              // stage error) is persisted in the durable event log and replayed
              // on every connect, so once the SAME stage moves on — re-run to
              // `running`, or settled `in_review`/`approved` — the prior error is
              // moot and the banner must clear WITHOUT a refresh. A fresh error
              // from this very event (`nextError`) always wins.
              const recovered =
                data["status"] === "running" ||
                data["status"] === "in_review" ||
                data["status"] === "approved";
              const clearsError =
                nextError === null &&
                s.error !== null &&
                raw.event === "phase_step" &&
                recovered &&
                (s.error.stage == null || s.error.stage === stepKey);

              return {
                ...s,
                events: nextEvents,
                taskStatus: nextTaskStatus,
                stageUpdates: nextStageUpdates,
                latestArtifact: nextArtifact ?? s.latestArtifact,
                gatePending: nextGate ?? s.gatePending,
                threadSignal: nextThread ?? s.threadSignal,
                stageSignal: nextStage ?? s.stageSignal,
                error: nextError ?? (clearsError ? null : s.error),
              };
            });
          }

          // Clean close — server ended the stream.
          if (!cancelled) {
            setState((s) => ({ ...s, status: "closed" }));
            return;
          }
        } catch {
          if (cancelled) return;
          setState((s) => ({ ...s, status: "error" }));
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
        // Fresh controller for the next attempt so an auth-listener abort
        // doesn't permanently poison the signal we hand to `sseStream`.
        if (!cancelled) currentCtrl = new AbortController();
      }
    })();

    return () => {
      cancelled = true;
      currentCtrl.abort();
      authSub?.unsubscribe();
    };
  }, [taskId, streamUrl]);

  return state;
}
