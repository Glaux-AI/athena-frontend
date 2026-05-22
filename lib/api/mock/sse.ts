/**
 * Mock SSE generator — produces a realistic stream of run events when
 * `NEXT_PUBLIC_API_MODE=mock`.
 *
 * Shape of each emitted event matches the backend contract:
 *   - `agent_step` events carry `{ kind, label, duration_ms }`
 *   - `tool_call`  events carry `{ name, args_summary, duration_ms }`
 *   - `gate_pending` events carry `{ gate, requires }`
 *   - `run_status` events carry `{ status, spent_usd }`
 *
 * Useful for driving the right rail in the run detail page + the mascot.
 */

import { sseStream as realSseStream, type SSEEvent, type SSEOptions } from "@/lib/sse/event-stream";
import { config } from "@/lib/config";

interface ScriptedEvent {
  event: "run_status" | "agent_step" | "tool_call" | "gate_pending";
  data: Record<string, unknown>;
  /** Wall-clock delay before this event fires, ms. */
  delay_ms: number;
}

function scriptFor(runId: string): ScriptedEvent[] {
  // Same script for every mock run — varying ID lets us seed slight variation.
  const cost = 0;
  return [
    { event: "run_status", data: { status: "running",  spent_usd: cost + 0.00 }, delay_ms: 200 },
    { event: "agent_step", data: { kind: "plan",     label: "Planning approach", duration_ms: 1200 }, delay_ms: 600 },
    { event: "agent_step", data: { kind: "retrieve", label: "Loading capability context", duration_ms: 800 }, delay_ms: 1400 },
    { event: "tool_call",  data: { name: "search_knowledge", args_summary: "ACH dispute handling", duration_ms: 410 }, delay_ms: 2300 },
    { event: "agent_step", data: { kind: "reason",   label: "Drafting spec.md", duration_ms: 2400 }, delay_ms: 2900 },
    { event: "run_status", data: { status: "running", spent_usd: cost + 0.04 }, delay_ms: 4400 },
    { event: "tool_call",  data: { name: "list_repo_nodes", args_summary: "billing-svc + billing-web", duration_ms: 220 }, delay_ms: 5200 },
    { event: "agent_step", data: { kind: "draft",    label: "Writing spec sections 1-5", duration_ms: 3200 }, delay_ms: 5900 },
    { event: "agent_step", data: { kind: "write",    label: "Saved spec.md@v1", duration_ms: 80 }, delay_ms: 7600 },
    { event: "gate_pending", data: { gate: "spec_review", requires: ["product", "finance"] }, delay_ms: 7900 },
    { event: "run_status", data: { status: "awaiting_gate", spent_usd: cost + 0.14, run_id: runId }, delay_ms: 8000 },
  ];
}

function fmt(ev: ScriptedEvent, n: number): string {
  return `id: ${n}\nevent: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

/**
 * Returns an SSE-shaped ReadableStream by replaying the scripted events on a
 * timer. Compatible with `lib/sse/event-stream.ts`'s `sseStream` parser.
 */
function makeMockStreamResponse(runId: string, signal?: AbortSignal): Response {
  const script = scriptFor(runId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cancelled = false;
      const timeouts: ReturnType<typeof setTimeout>[] = [];

      const cleanup = () => {
        cancelled = true;
        timeouts.forEach(clearTimeout);
      };

      if (signal) {
        if (signal.aborted) cleanup();
        else signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {/* already closed */} });
      }

      // Push an initial comment so the parser knows it's alive.
      controller.enqueue(encoder.encode(": connected\n\n"));

      script.forEach((ev, i) => {
        timeouts.push(setTimeout(() => {
          if (cancelled) return;
          try {
            controller.enqueue(encoder.encode(fmt(ev, i + 1)));
          } catch {
            // already closed
          }
        }, ev.delay_ms));
      });

      // Close 1s after the last event so consumers settle into "closed".
      const lastDelay = script[script.length - 1]?.delay_ms ?? 0;
      timeouts.push(setTimeout(() => {
        if (cancelled) return;
        try { controller.close(); } catch { /* already closed */ }
      }, lastDelay + 1000));
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

export async function* mockSseStream(url: string, opts: SSEOptions = {}): AsyncGenerator<SSEEvent, void, void> {
  // Extract runId from `/v1/runs/{id}/events`. Defensive — fall back to "tsk".
  const m = url.match(/\/v1\/runs\/([^/]+)\/events/);
  const runId = m ? decodeURIComponent(m[1]!) : "tsk";

  const fakeResponse = makeMockStreamResponse(runId, opts.signal);
  // Patch global fetch for just this call so the real `sseStream` parser works.
  // We don't actually intercept window.fetch — we synthesize a `Response` and
  // run the parser logic manually below.

  const reader = fakeResponse.body!.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let cur: Partial<SSEEvent> = {};

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nlIdx;
      while ((nlIdx = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const line = rawLine.replace(/\r$/, "");

        if (line === "") {
          if (cur.event !== undefined || cur.data !== undefined) {
            yield { id: cur.id ?? "", event: cur.event ?? "message", data: cur.data ?? "" };
          }
          cur = {};
          continue;
        }
        if (line.startsWith(":")) continue;

        const colon = line.indexOf(":");
        const field = colon >= 0 ? line.slice(0, colon) : line;
        const valueStr = colon >= 0 ? line.slice(colon + 1).replace(/^ /, "") : "";

        if (field === "id") cur.id = valueStr;
        else if (field === "event") cur.event = valueStr;
        else if (field === "data") cur.data = cur.data === undefined ? valueStr : `${cur.data}\n${valueStr}`;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function sseStreamOrMock(url: string, opts: SSEOptions = {}): AsyncGenerator<SSEEvent, void, void> {
  if (config.isMock) return mockSseStream(url, opts);
  return realSseStream(url, opts);
}
