"use client";

/**
 * useRunStream(runId) — subscribes to the run's SSE feed, applies events to:
 *   1. A local ordered list of events (for the stream panel UI)
 *   2. The global mascot store (Sophia's mood reacts to live events)
 *
 * Auto-reconnects with exponential backoff on stream error. Passes
 * `Last-Event-ID` on each reconnect so the server can replay missed
 * events from Postgres (see streaming-and-agents.md §8). Mascot events
 * are only dispatched the first time we see an event id, to avoid
 * double-firing mood transitions on replay.
 *
 * Per UX standard §11 and the mascot store contract.
 */

import { useEffect, useRef, useState } from "react";

import { sseStreamOrMock as sseStream } from "@/lib/api/mock/sse";
import { useMascotStore } from "@/lib/stores/mascot";
import type { RunStatus } from "@/lib/api/client";

export interface RunEvent {
  id: string;
  /**
   * Event names per backend contract:
   * `run_status` | `agent_step` | `tool_call` | `gate_pending`
   * F-04.14 (Task 03.4) adds three clarification lifecycle events:
   * `clarification_pending` | `clarification_resolved` | `clarification_expired`
   */
  event: string;
  data: Record<string, unknown>;
  receivedAt: number;
}

/**
 * F-04.14 — lightweight clarification lifecycle signal. The page mounts /
 * unmounts the pause card from this — full row details come from the typed
 * `api.runs.clarifications.*` endpoints, not from the SSE payload.
 */
export interface ClarificationLifecycleSignal {
  /** Event seq, used as a dedup + change-detection key. */
  seq: number;
  kind: "pending" | "resolved" | "expired";
  /** When `kind === "pending"`, the batch id (or null for single questions). */
  batch_id: string | null;
  /** Affected qids for this signal. */
  qids: string[];
  /** Phase the qids belong to. */
  phase_key: string;
  /** Server-side payload, opaque to the hook — caller may inspect. */
  payload: Record<string, unknown>;
}

export interface RunStreamState {
  events: RunEvent[];
  status: "connecting" | "open" | "closed" | "error";
  cost: number;
  runStatus: RunStatus;
  /** F-04.14 — the most-recent clarification lifecycle signal. Consumers re-fetch
   * the typed clarification list when this changes. `null` until the first
   * matching event arrives. */
  clarificationSignal: ClarificationLifecycleSignal | null;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * F-03.2 — terminal statuses must not be overwritten by a non-terminal one
 * arriving over SSE. If the initial `api.runs.get(id)` says `completed` but a
 * lagging SSE event replays `running`, we keep `completed`.
 */
const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
  "gate_rejected",
]);

function isTerminal(s: RunStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

export function useRunStream(
  runId: string,
  streamUrl: string,
  initialStatus: RunStatus = "queued",
): RunStreamState {
  const applyRunEvent = useMascotStore((s) => s.applyRunEvent);
  const lastEventIdRef = useRef<string>("");
  const seenIdsRef = useRef<Set<string>>(new Set());

  const [state, setState] = useState<RunStreamState>({
    events: [],
    status: "connecting",
    cost: 0,
    runStatus: initialStatus,
    clarificationSignal: null,
  });

  // Monotonic counter for clarification lifecycle signals — incremented every
  // time a relevant event lands so consumers can `useEffect` on `seq` without
  // building their own dedup ring. Lives in a ref because the value need not
  // trigger a re-render on its own; it's embedded in `clarificationSignal`.
  const clarificationSeqRef = useRef<number>(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    let backoff = INITIAL_BACKOFF_MS;

    (async () => {
      while (!cancelled) {
        try {
          setState((s) => ({ ...s, status: s.events.length === 0 ? "connecting" : "open" }));

          const opts: { signal: AbortSignal; lastEventId?: string } = { signal: ctrl.signal };
          if (lastEventIdRef.current) opts.lastEventId = lastEventIdRef.current;
          for await (const raw of sseStream(streamUrl, opts)) {
            if (cancelled) return;

            // First event from this connection resets backoff + flips to open.
            backoff = INITIAL_BACKOFF_MS;
            setState((s) => (s.status === "open" ? s : { ...s, status: "open" }));

            // Track the latest seen event id for resume.
            if (raw.id) lastEventIdRef.current = raw.id;

            // Skip mood / state side-effects when we're replaying an event we
            // already applied (the server resends from Last-Event-ID inclusive on
            // some implementations). The event still goes into the list because
            // the UI key set is the dedup boundary.
            const isReplay = raw.id !== "" && seenIdsRef.current.has(raw.id);
            if (raw.id) seenIdsRef.current.add(raw.id);

            let data: Record<string, unknown> = {};
            try { data = JSON.parse(raw.data); } catch { /* keep empty */ }

            if (!isReplay) {
              // Drive Sophia from the live stream
              if (raw.event === "agent_step") {
                const kind = String(data["kind"] ?? "");
                if (["plan", "reason", "retrieve", "read", "draft", "write"].includes(kind)) {
                  applyRunEvent({ type: "agent_step", kind: kind as "plan" | "reason" | "retrieve" | "read" | "draft" | "write" });
                }
              } else if (raw.event === "tool_call") {
                applyRunEvent({ type: "tool_call" });
              } else if (raw.event === "gate_pending") {
                applyRunEvent({ type: "gate_pending" });
              } else if (raw.event === "run_status") {
                const status = String(data["status"] ?? "running") as "running" | "completed" | "failed" | "cancelled" | "gate_rejected";
                applyRunEvent({ type: "run_status", status });
              }
            }

            // F-04.14 — collect clarification lifecycle signal so the page
            // can refresh / mount / unmount the pause UI. We don't fan-out
            // the full row from the SSE payload because the server keeps the
            // event body deliberately small; callers do a typed re-fetch.
            let nextClarificationSignal: ClarificationLifecycleSignal | null = null;
            if (
              !isReplay
              && (raw.event === "clarification_pending"
                || raw.event === "clarification_resolved"
                || raw.event === "clarification_expired")
            ) {
              const kind = raw.event === "clarification_pending"
                ? "pending"
                : raw.event === "clarification_resolved"
                ? "resolved"
                : "expired";
              const qidsRaw = data["qids"];
              const qids = Array.isArray(qidsRaw)
                ? qidsRaw.filter((q): q is string => typeof q === "string")
                : typeof data["qid"] === "string"
                ? [data["qid"] as string]
                : [];
              clarificationSeqRef.current += 1;
              nextClarificationSignal = {
                seq: clarificationSeqRef.current,
                kind,
                batch_id: typeof data["batch_id"] === "string" ? (data["batch_id"] as string) : null,
                qids,
                phase_key: typeof data["phase_key"] === "string" ? (data["phase_key"] as string) : "",
                payload: data,
              };
            }

            setState((s) => {
              const existingIdx = raw.id ? s.events.findIndex((e) => e.id === raw.id) : -1;
              const nextEvents = existingIdx >= 0
                ? s.events // duplicate — skip
                : [...s.events, { id: raw.id, event: raw.event, data, receivedAt: Date.now() }];

              // F-03.2 — priority guard. Once we're in a terminal state
              // (completed / failed / cancelled / gate_rejected), do not
              // accept a non-terminal `run_status` event. SSE replays after
              // reconnect can deliver stale "running" events that would
              // otherwise overwrite the truth from `api.runs.get(id)`.
              let nextRunStatus: RunStatus = s.runStatus;
              if (raw.event === "run_status" && typeof data["status"] === "string") {
                const incoming = data["status"] as RunStatus;
                if (!isTerminal(s.runStatus) || isTerminal(incoming)) {
                  nextRunStatus = incoming;
                }
              } else if (raw.event === "gate_pending" && !isTerminal(s.runStatus)) {
                nextRunStatus = "awaiting_gate";
              }

              return {
                ...s,
                events: nextEvents,
                cost:
                  raw.event === "run_status" && typeof data["spent_usd"] === "number"
                    ? (data["spent_usd"] as number)
                    : s.cost,
                runStatus: nextRunStatus,
                clarificationSignal: nextClarificationSignal ?? s.clarificationSignal,
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
          // Connection failed — surface as `error` (which renders as "reconnecting…"
          // in the consumer) and back off before retrying.
          setState((s) => ({ ...s, status: "error" }));
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [runId, streamUrl, applyRunEvent]);

  return state;
}
