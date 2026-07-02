/**
 * Live chat-turn event consumer.
 *
 * `streamTurnEvents` subscribes to
 * `GET /v1/chat/threads/{id}/turns/{turn_id}/events` - the resumable SSE feed
 * over the durable `chat_turn_events` spine - and yields typed events as the
 * background turn runs. The stream is a pure READ side: closing it (page
 * leave, thread switch) never affects the turn, and reconnecting with the last
 * seen `seq` replays everything missed, so a remounting page rebuilds the
 * partial answer exactly.
 *
 * Wire envelope is canonical FE truth (ADR-032, snake_case): the run-stream
 * vocabulary (`tool_call` / `tool_result` / `agent_step` / `reasoning`) plus
 * the turn's `status` lifecycle event. The terminal `status`
 * (completed/failed/cancelled) carries `assistant_message_id` - the caller
 * refetches the transcript to swap the streamed text for the persisted row.
 */

import { sseStream, type SSEOptions } from "@/lib/sse/event-stream";
import type { ChatTurnStatus } from "@/lib/api/client";

export type TurnStreamEvent =
  // A tool started (e.g. `query_codebase`, `ask_clarification`).
  | { type: "tool_call"; seq: number; id: string; parent_id?: string | undefined; name: string; args_summary: string }
  // A started tool finished - pairs on `id` so the UI can settle the pill.
  | { type: "tool_result"; seq: number; id: string; parent_id?: string | undefined; name: string }
  // `text` carries streamed answer chunks; `kind` is the status verb.
  | { type: "agent_step"; seq: number; kind: string; text?: string }
  // The model's thinking - its OWN event so it renders in a collapsible panel.
  | { type: "reasoning"; seq: number; text: string }
  // Turn lifecycle. Terminal statuses end the stream; `assistant_message_id`
  // points at the persisted reply to fetch.
  | {
      type: "status";
      seq: number;
      status: ChatTurnStatus;
      error?: string;
      assistant_message_id?: string;
      proposal_message_id?: string;
    };

export async function* streamTurnEvents(
  threadId: string,
  turnId: string,
  opts: { signal?: AbortSignal; lastEventId?: string } = {},
): AsyncGenerator<TurnStreamEvent, void, void> {
  const url = `/v1/chat/threads/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(turnId)}/events`;
  const sseOpts: SSEOptions = {};
  if (opts.signal) sseOpts.signal = opts.signal;
  if (opts.lastEventId) sseOpts.lastEventId = opts.lastEventId;
  for await (const raw of sseStream(url, sseOpts)) {
    const mapped = mapEvent(raw.event, raw.data, Number(raw.id) || 0);
    if (mapped) yield mapped;
  }
}

function mapEvent(event: string, rawData: string, seq: number): TurnStreamEvent | null {
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
        seq,
        id: String(data["id"] ?? ""),
        parent_id: data["parent_id"] ? String(data["parent_id"]) : undefined,
        name: String(data["name"] ?? "tool"),
        args_summary: String(data["args_summary"] ?? ""),
      };
    case "tool_result":
      return {
        type: "tool_result",
        seq,
        id: String(data["id"] ?? ""),
        parent_id: data["parent_id"] ? String(data["parent_id"]) : undefined,
        name: String(data["name"] ?? "tool"),
      };
    case "agent_step":
      return {
        type: "agent_step",
        seq,
        kind: String(data["kind"] ?? ""),
        ...(typeof data["text"] === "string" ? { text: data["text"] } : {}),
      };
    case "reasoning":
      return { type: "reasoning", seq, text: String(data["text"] ?? "") };
    case "status":
      return {
        type: "status",
        seq,
        status: String(data["status"] ?? "running") as ChatTurnStatus,
        ...(typeof data["error"] === "string" ? { error: data["error"] } : {}),
        ...(typeof data["assistant_message_id"] === "string"
          ? { assistant_message_id: data["assistant_message_id"] }
          : {}),
        ...(typeof data["proposal_message_id"] === "string"
          ? { proposal_message_id: data["proposal_message_id"] }
          : {}),
      };
    default:
      // Heartbeats / unknown events - stream close ends iteration.
      return null;
  }
}
