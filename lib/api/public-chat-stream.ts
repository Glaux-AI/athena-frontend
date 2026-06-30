/**
 * Public showcase chat send/stream client.
 *
 * POSTs a question to `/v1/public/chat/stream` (unauthenticated) and yields the
 * trimmed event vocabulary the BE emits for the public surface:
 *   - `agent_step` (streamed answer chunks)
 *   - `reasoning`  (the model's thinking, its own channel)
 *   - `tool_call` / `tool_result` (sanitised - a generic "searching" activity,
 *      no internal tool name or args)
 *   - `message`    (terminal assistant reply: content + citations only)
 *   - `error`
 *
 * There is no `user_message` / `task_created` (the surface is stateless and has
 * no task tools), and no model/effort/agent/attachment fields (all server-pinned
 * or absent by design). History is held by the browser and sent each turn -
 * nothing is persisted server-side.
 */

import { publicSseStream } from "@/lib/sse/public-event-stream";

export interface PublicChatCitation {
  kind: string;
  id: string;
  label: string;
}

/** One step in the agent-activity log - a (safe) tool the agent called. */
export interface PublicToolStep {
  id: string;
  name: string;
  argsSummary: string;
  done: boolean;
}

export interface PublicChatMessage {
  id: string;
  role: "assistant" | "user";
  who: string;
  avatar: string;
  content: string;
  citations: PublicChatCitation[];
  /** Total tokens used by the turn ("N tokens used"). */
  tokens?: number;
  /** The agent's tool steps for this turn (the collapsed activity recap). */
  toolSteps?: PublicToolStep[];
}

export interface PublicChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export type PublicChatStreamEvent =
  | { type: "agent_step"; kind: string; text?: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; id: string; name: string; argsSummary: string }
  | { type: "tool_result"; id: string }
  | { type: "message"; message: PublicChatMessage }
  | { type: "error"; code: string; message: string };

export interface StreamPublicChatParams {
  message: string;
  repoRef?: string | null;
  history?: PublicChatHistoryTurn[];
  signal?: AbortSignal;
}

export async function* streamPublicChat(
  params: StreamPublicChatParams,
): AsyncGenerator<PublicChatStreamEvent, void, void> {
  const body: Record<string, unknown> = { message: params.message };
  if (params.repoRef) body.repo_ref = params.repoRef;
  if (params.history && params.history.length) body.history = params.history;

  const opts = params.signal ? { body, signal: params.signal } : { body };
  for await (const raw of publicSseStream("/v1/public/chat/stream", opts)) {
    const mapped = mapEvent(raw.event, raw.data);
    if (mapped) yield mapped;
  }
}

function mapEvent(event: string, rawData: string): PublicChatStreamEvent | null {
  let data: Record<string, unknown> = {};
  try {
    data = rawData ? (JSON.parse(rawData) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  switch (event) {
    case "agent_step":
      return {
        type: "agent_step",
        kind: String(data["kind"] ?? ""),
        ...(typeof data["text"] === "string" ? { text: data["text"] } : {}),
      };
    case "reasoning":
      return { type: "reasoning", text: String(data["text"] ?? "") };
    case "tool_call":
      return {
        type: "tool_call",
        id: String(data["id"] ?? ""),
        name: String(data["name"] ?? "tool"),
        argsSummary: String(data["args_summary"] ?? ""),
      };
    case "tool_result":
      return { type: "tool_result", id: String(data["id"] ?? "") };
    case "message":
      return { type: "message", message: toMessage(data) };
    case "error":
      return {
        type: "error",
        code: String(data["code"] ?? "stream_error"),
        message: String(data["message"] ?? "The chat failed. Please try again."),
      };
    default:
      return null;
  }
}

function toMessage(data: Record<string, unknown>): PublicChatMessage {
  const rawCitations = Array.isArray(data["citations"]) ? data["citations"] : [];
  const citations: PublicChatCitation[] = rawCitations.map((c) => {
    const obj = (c ?? {}) as Record<string, unknown>;
    return {
      kind: String(obj["kind"] ?? ""),
      id: String(obj["id"] ?? ""),
      label: String(obj["label"] ?? obj["id"] ?? ""),
    };
  });
  const tokens = Number(data["tokens"] ?? 0);
  return {
    id: String(data["id"] ?? crypto.randomUUID()),
    role: "assistant",
    who: String(data["who"] ?? "Athena"),
    avatar: String(data["avatar"] ?? "athena"),
    content: String(data["content"] ?? ""),
    citations,
    tokens: Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0,
  };
}
