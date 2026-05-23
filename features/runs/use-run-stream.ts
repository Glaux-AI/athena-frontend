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

export interface RunEvent {
  id: string;
  event: string;       // "run_status" | "agent_step" | "tool_call" | "gate_pending"
  data: Record<string, unknown>;
  receivedAt: number;
}

export interface RunStreamState {
  events: RunEvent[];
  status: "connecting" | "open" | "closed" | "error";
  cost: number;
  runStatus: "queued" | "running" | "awaiting_gate" | "completed" | "failed" | "cancelled" | "gate_rejected";
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export function useRunStream(runId: string, streamUrl: string): RunStreamState {
  const applyRunEvent = useMascotStore((s) => s.applyRunEvent);
  const lastEventIdRef = useRef<string>("");
  const seenIdsRef = useRef<Set<string>>(new Set());

  const [state, setState] = useState<RunStreamState>({
    events: [],
    status: "connecting",
    cost: 0,
    runStatus: "queued",
  });

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

            setState((s) => {
              const existingIdx = raw.id ? s.events.findIndex((e) => e.id === raw.id) : -1;
              const nextEvents = existingIdx >= 0
                ? s.events // duplicate — skip
                : [...s.events, { id: raw.id, event: raw.event, data, receivedAt: Date.now() }];
              return {
                ...s,
                events: nextEvents,
                cost:
                  raw.event === "run_status" && typeof data["spent_usd"] === "number"
                    ? (data["spent_usd"] as number)
                    : s.cost,
                runStatus:
                  raw.event === "run_status" && typeof data["status"] === "string"
                    ? (data["status"] as RunStreamState["runStatus"])
                    : raw.event === "gate_pending"
                    ? "awaiting_gate"
                    : s.runStatus,
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
