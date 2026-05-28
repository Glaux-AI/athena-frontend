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
import { getBrowserSupabase } from "@/lib/supabase/browser";

export interface RunEvent {
  id: string;
  /**
   * Event names per backend contract:
   * `run_status` | `agent_step` | `tool_call` | `gate_pending`
   * F-04.14 (Task 03.4) adds three clarification lifecycle events:
   * `clarification_pending` | `clarification_resolved` | `clarification_expired`
   * The BE dispatcher also emits `phase_transition` (consumed by the
   * reducer to advance the phase rail via `currentPhaseKey`).
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
  /**
   * BE-emitted phase the run has most recently entered. Driven by the
   * `phase_transition` SSE event's `to_phase_key`. `null` until the first
   * such event arrives — consumers should fall back to their initial
   * `current_phase` source until then. Allows the phase rail to
   * auto-advance without the user reloading the page.
   */
  currentPhaseKey: string | null;
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
    currentPhaseKey: null,
  });

  // Monotonic counter for clarification lifecycle signals — incremented every
  // time a relevant event lands so consumers can `useEffect` on `seq` without
  // building their own dedup ring. Lives in a ref because the value need not
  // trigger a re-render on its own; it's embedded in `clarificationSignal`.
  const clarificationSeqRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    let backoff = INITIAL_BACKOFF_MS;
    // One controller per connection attempt so we can abort + reconnect on
    // JWT refresh without tearing down the whole effect. The auth-listener
    // below mutates `currentCtrl` so the live attempt sees the new token.
    let currentCtrl = new AbortController();

    // Reconnect on Supabase token refresh so the next attempt picks up the
    // fresh Bearer in lib/sse/event-stream.ts. Mock supabase's
    // onAuthStateChange is a no-op subscription so this is safe in tests.
    let authSub: { unsubscribe: () => void } | null = null;
    try {
      const supabase = getBrowserSupabase();
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "TOKEN_REFRESHED" && !cancelled) {
          // Abort the in-flight stream; the outer loop will reconnect with
          // the new token and resume from `Last-Event-ID`.
          currentCtrl.abort();
        }
      });
      authSub = data.subscription;
    } catch {
      // Supabase not configured (e.g. mock mode w/ no client). Fall through
      // — SSE will just lack auto-reconnect on refresh, same as before.
    }

    (async () => {
      while (!cancelled) {
        try {
          setState((s) => ({ ...s, status: s.events.length === 0 ? "connecting" : "open" }));

          const opts: { signal: AbortSignal; lastEventId?: string } = { signal: currentCtrl.signal };
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

              // Advance the phase rail on `phase_transition` events.
              // BE-canonical envelope (snake_case per ADR-032) — `to_phase_key`
              // is the phase the run is now in. Replays (`isReplay === true`)
              // still update the FE-derived `currentPhaseKey` because the
              // reducer here is the only source of truth for it.
              let nextCurrentPhaseKey: string | null = s.currentPhaseKey;
              if (raw.event === "phase_transition" && typeof data["to_phase_key"] === "string") {
                nextCurrentPhaseKey = data["to_phase_key"] as string;
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
                currentPhaseKey: nextCurrentPhaseKey,
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
          // Connection failed (or aborted on token refresh) — surface as
          // `error` (which renders as "reconnecting…" in the consumer)
          // and back off before retrying. Token-refresh aborts skip the
          // backoff effectively because the loop re-enters immediately
          // for the next iteration — the setTimeout still runs but the
          // initial backoff (1s) is small enough not to feel laggy.
          setState((s) => ({ ...s, status: "error" }));
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        }
        // Allocate a fresh controller for the next attempt so an abort
        // from the auth-state listener doesn't permanently poison the
        // signal we hand to `sseStream`.
        if (!cancelled) currentCtrl = new AbortController();
      }
    })();

    return () => {
      cancelled = true;
      currentCtrl.abort();
      authSub?.unsubscribe();
    };
  }, [runId, streamUrl, applyRunEvent]);

  return state;
}
