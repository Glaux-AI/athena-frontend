"use client";

/**
 * useRunStream(runId) — subscribes to the run's SSE feed, applies events to:
 *   1. A local ordered list of events (for the stream panel UI)
 *   2. The global mascot store (Sophia's mood reacts to live events)
 *
 * Per UX standard §11 and the mascot store contract.
 */

import { useEffect, useState } from "react";

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
  runStatus: "queued" | "running" | "awaiting_gate" | "completed" | "failed" | "cancelled";
}

export function useRunStream(runId: string, streamUrl: string): RunStreamState {
  const applyRunEvent = useMascotStore((s) => s.applyRunEvent);

  const [state, setState] = useState<RunStreamState>({
    events: [],
    status: "connecting",
    cost: 0,
    runStatus: "queued",
  });

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        setState((s) => ({ ...s, status: "open" }));
        for await (const raw of sseStream(streamUrl, { signal: ctrl.signal })) {
          if (cancelled) return;
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(raw.data); } catch { /* keep empty */ }

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

          setState((s) => ({
            ...s,
            events: [...s.events, { id: raw.id, event: raw.event, data, receivedAt: Date.now() }],
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
          }));
        }
        if (!cancelled) setState((s) => ({ ...s, status: "closed" }));
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, status: "error" }));
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [runId, streamUrl, applyRunEvent]);

  return state;
}
