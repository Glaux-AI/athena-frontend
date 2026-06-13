/**
 * Live chat-send consumer.
 *
 * `streamChatMessage` POSTs a user message to
 * `/v1/chat/threads/{id}/messages/stream` and yields typed events as the
 * chat agent works, so the UI can show "what Athena is doing" - which
 * tools it's calling, what it's reasoning about - instead of blocking on
 * one terminal reply.
 *
 * Wire envelope is canonical FE truth (ADR-032, snake_case). It reuses the
 * run-stream vocabulary (`tool_call`, `agent_step`) plus a chat-specific
 * terminal `message` event carrying the persisted assistant `ChatMessage`,
 * and an `error` event. The bridge that produces these lives in the BE at
 * `athena/api/routers/chat.py` (the `/messages/stream` endpoint).
 *
 * Safe fallback: if the stream endpoint isn't available (404/405) and no
 * events were received, we transparently fall back to the non-streaming
 * `api.chat.postMessage`. That window is the only one where nothing was
 * persisted server-side, so the fallback can't double-send.
 */

import { sseStream, SSEError, type SSEOptions } from "@/lib/sse/event-stream";
import { api, type ChatMessage, type EffortLevel, type ModelSelection } from "@/lib/api/client";

export type ChatStreamEvent =
  | { type: "tool_call"; id: string; name: string; args_summary: string }
  // A tool started via `tool_call` finished - pairs on `id` so the UI can mark
  // the pill done. Optional in the wire (older BE builds omit it).
  | { type: "tool_result"; id: string; name: string }
  | { type: "agent_step"; kind: string; text?: string }
  // The model's thinking - its OWN event so it can render in a collapsible
  // panel without ever being appended to the answer body.
  | { type: "reasoning"; text: string }
  // The persisted *user* row, emitted first so the UI can swap its optimistic
  // bubble for the server row (real id) - needed for edit/retry rewind.
  | { type: "user_message"; message: ChatMessage }
  | { type: "message"; message: ChatMessage }
  // A `task_created` proposal row (the "Start task" card), emitted AFTER the
  // terminal `message` when the agent called `propose_task`. Carried on its own
  // event so the card renders live instead of only after a reload.
  | { type: "task_created"; message: ChatMessage }
  | { type: "error"; code: string; message: string };

export async function* streamChatMessage(
  threadId: string,
  content: string,
  signal?: AbortSignal,
  model?: ModelSelection | null,
  effort?: EffortLevel | null,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const url = `/v1/chat/threads/${encodeURIComponent(threadId)}/messages/stream`;
  const body = {
    content,
    ...(model ? { model_provider: model.provider, model_id: model.model } : {}),
    ...(model?.source ? { model_source: model.source } : {}),
    ...(effort ? { effort } : {}),
  };
  const opts: SSEOptions = { method: "POST", body };
  if (signal) opts.signal = signal;

  let receivedAny = false;
  try {
    for await (const raw of sseStream(url, opts)) {
      receivedAny = true;
      const mapped = mapEvent(raw.event, raw.data);
      if (mapped) yield mapped;
    }
  } catch (e) {
    // Endpoint not deployed → safe to fall back (nothing was persisted).
    if (!receivedAny && e instanceof SSEError && (e.status === 404 || e.status === 405)) {
      const reply = await api.chat.postMessage(threadId, content, model, effort);
      yield { type: "message", message: reply };
      return;
    }
    throw e;
  }
}

function mapEvent(event: string, rawData: string): ChatStreamEvent | null {
  let data: Record<string, unknown> = {};
  try {
    data = rawData ? (JSON.parse(rawData) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  switch (event) {
    case "tool_call":
      return {
        type: "tool_call",
        id: String(data["id"] ?? ""),
        name: String(data["name"] ?? "tool"),
        args_summary: String(data["args_summary"] ?? ""),
      };
    case "tool_result":
      return {
        type: "tool_result",
        id: String(data["id"] ?? ""),
        name: String(data["name"] ?? "tool"),
      };
    case "agent_step":
      // `text` carries streamed answer chunks; `kind` (plan/reason/…) is the
      // status verb the UI renders while the turn runs.
      return {
        type: "agent_step",
        kind: String(data["kind"] ?? ""),
        ...(typeof data["text"] === "string" ? { text: data["text"] } : {}),
      };
    case "reasoning":
      return { type: "reasoning", text: String(data["text"] ?? "") };
    case "user_message":
      return { type: "user_message", message: data as unknown as ChatMessage };
    case "message":
      return { type: "message", message: data as unknown as ChatMessage };
    case "task_created":
      return { type: "task_created", message: data as unknown as ChatMessage };
    case "error":
      return {
        type: "error",
        code: String(data["code"] ?? "stream_error"),
        message: String(data["message"] ?? "The chat stream failed."),
      };
    default:
      // `done` / heartbeats / unknown events - stream close ends iteration.
      return null;
  }
}
