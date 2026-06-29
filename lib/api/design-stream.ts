/**
 * Live design-system generation consumer.
 *
 * `streamGenerateSystem` POSTs to `/v1/design/token-sets/generate/stream` and
 * yields typed events as Athena reads tokens + designs the system - so the editor
 * shows "what Athena is doing" + a cancel button, then applies the terminal
 * `done` draft. Mirrors the chat-send streamer (lib/api/chat-stream.ts).
 *
 * Safe fallback: if the stream endpoint isn't available (404/405) and nothing was
 * received, fall back to the non-streaming `api.design.generateSystem`. Nothing is
 * persisted by either path (the user reviews + saves the draft), so this can't
 * double-write.
 */

import { sseStream, SSEError, type SSEOptions } from "@/lib/sse/event-stream";
import {
  api,
  type GenerateDesignSystemInput,
  type GenerateDesignSystemResult,
} from "@/lib/api/client";

export type DesignGenEvent =
  | { type: "status"; text: string }
  | { type: "done"; result: GenerateDesignSystemResult }
  | { type: "error"; code: string; message: string };

export async function* streamGenerateSystem(
  input: GenerateDesignSystemInput,
  signal?: AbortSignal,
): AsyncGenerator<DesignGenEvent, void, void> {
  const opts: SSEOptions = { method: "POST", body: input };
  if (signal) opts.signal = signal;

  let receivedAny = false;
  try {
    for await (const raw of sseStream("/v1/design/token-sets/generate/stream", opts)) {
      receivedAny = true;
      const mapped = mapEvent(raw.event, raw.data);
      if (mapped) yield mapped;
    }
  } catch (e) {
    // Endpoint not deployed → fall back (nothing was persisted either way). The
    // signal is threaded through so navigating away cancels the fallback too.
    if (!receivedAny && e instanceof SSEError && (e.status === 404 || e.status === 405)) {
      const result = await api.design.generateSystem(input, signal);
      yield { type: "done", result };
      return;
    }
    throw e;
  }
}

function mapEvent(event: string, rawData: string): DesignGenEvent | null {
  let data: Record<string, unknown> = {};
  try {
    data = rawData ? (JSON.parse(rawData) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  switch (event) {
    case "agent_step":
      return typeof data["text"] === "string" && data["text"]
        ? { type: "status", text: data["text"] as string }
        : null;
    case "done":
      return { type: "done", result: data as unknown as GenerateDesignSystemResult };
    case "error":
      return {
        type: "error",
        code: String(data["code"] ?? "stream_error"),
        message: String(data["message"] ?? "Couldn't generate the design system."),
      };
    default:
      // `done`-adjacent heartbeats / unknown events - stream close ends iteration.
      return null;
  }
}
