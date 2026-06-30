"use client";

/**
 * useExecutionStream - live activity feed for ONE async sub-agent execution.
 *
 * Subscribes to `GET /v1/agent-executions/{id}/events` (SSE) via `sseStream`,
 * reducing the canonical event vocabulary (status / tool_call / tool_result /
 * agent_step / reasoning) into ordered activity rows + the current status, so
 * the UI can show exactly what the sub-agent is doing. Resumes with the last
 * seen `seq` (Last-Event-ID) and reconnects with a short backoff until the run
 * reaches a terminal status (or the component unmounts).
 */

import { useEffect, useRef, useState } from "react";

import { api, type ExecutionStatus } from "@/lib/api/client";
import { sseStream } from "@/lib/sse/event-stream";

export type ActivityRow =
  | { kind: "status"; seq: number; status: string }
  | { kind: "tool"; seq: number; callId: string; name: string; summary: string; done: boolean }
  | { kind: "text"; seq: number; text: string }
  | { kind: "reasoning"; seq: number; text: string };

export interface ExecutionStreamState {
  status: ExecutionStatus | null;
  rows: ActivityRow[];
  result: string | null;
  error: string | null;
  connected: boolean;
}

const TERMINAL = new Set<string>(["completed", "failed", "cancelled"]);

const INITIAL: ExecutionStreamState = {
  status: null,
  rows: [],
  result: null,
  error: null,
  connected: false,
};

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function reduce(
  s: ExecutionStreamState,
  event: string,
  seq: number,
  payload: Record<string, unknown>,
): ExecutionStreamState {
  const rows = s.rows.slice();
  const last = rows[rows.length - 1];
  if (event === "status") {
    return {
      ...s,
      status: str(payload.status) as ExecutionStatus,
      result: typeof payload.result === "string" ? payload.result : s.result,
      error: typeof payload.error === "string" ? payload.error : s.error,
      rows: [...rows, { kind: "status", seq, status: str(payload.status) }],
    };
  }
  if (event === "tool_call") {
    return {
      ...s,
      rows: [
        ...rows,
        {
          kind: "tool",
          seq,
          callId: str(payload.id, String(seq)),
          name: str(payload.name, "tool"),
          summary: str(payload.args_summary),
          done: false,
        },
      ],
    };
  }
  if (event === "tool_result") {
    const id = str(payload.id);
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r && r.kind === "tool" && r.callId === id && !r.done) {
        rows[i] = { ...r, done: true };
        break;
      }
    }
    return { ...s, rows };
  }
  if (event === "agent_step") {
    const text = str(payload.text);
    if (last && last.kind === "text") {
      rows[rows.length - 1] = { ...last, text: last.text + text };
      return { ...s, rows };
    }
    return { ...s, rows: [...rows, { kind: "text", seq, text }] };
  }
  if (event === "reasoning") {
    const text = str(payload.text);
    if (last && last.kind === "reasoning") {
      rows[rows.length - 1] = { ...last, text: last.text + text };
      return { ...s, rows };
    }
    return { ...s, rows: [...rows, { kind: "reasoning", seq, text }] };
  }
  return s;
}

export function useExecutionStream(
  executionId: string | null,
  enabled: boolean,
): ExecutionStreamState {
  const [state, setState] = useState<ExecutionStreamState>(INITIAL);
  const lastSeq = useRef(0);

  useEffect(() => {
    if (!executionId || !enabled) return;
    setState(INITIAL);
    lastSeq.current = 0;
    const ac = new AbortController();
    let stopped = false;

    (async () => {
      while (!stopped) {
        try {
          setState((s) => ({ ...s, connected: true }));
          const opts: { signal: AbortSignal; lastEventId?: string } = {
            signal: ac.signal,
          };
          if (lastSeq.current) opts.lastEventId = String(lastSeq.current);
          for await (const ev of sseStream(
            api.agentExecutions.eventsUrl(executionId),
            opts,
          )) {
            const seq = Number(ev.id) || 0;
            if (seq) lastSeq.current = seq;
            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(ev.data) as Record<string, unknown>;
            } catch {
              payload = {};
            }
            setState((s) => reduce(s, ev.event, seq, payload));
            if (ev.event === "status" && TERMINAL.has(str(payload.status))) {
              stopped = true;
              break;
            }
          }
        } catch {
          if (ac.signal.aborted) break;
        }
        if (stopped) break;
        setState((s) => ({ ...s, connected: false }));
        await new Promise((r) => setTimeout(r, 1500));
      }
    })();

    return () => {
      stopped = true;
      ac.abort();
    };
  }, [executionId, enabled]);

  return state;
}
