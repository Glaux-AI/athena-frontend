"use client";

/**
 * useChatTurn — shared send / edit / retry engine for the `/chat` page.
 *
 * Owns the transcript, the in-flight `sending` flag, the live `streaming`
 * turn (the answer typing in + the status/tool activity beside it), and the
 * `failedTurn` marker that drives the inline Retry affordance.
 *
 * Live typing: the backend streams the answer as `agent_step` frames whose
 * `text` chunks accumulate into the reply (kind = the status verb), plus
 * `tool_call` / `tool_result` pairs. We surface those as a `streaming` object
 * so the conversation can render a Cursor/Claude-style typing bubble with a
 * status line and tool pills, then swap in the persisted `message` (real id,
 * citations, tool_calls, usage) when the turn settles.
 *
 * Edit and retry both lean on the BE `rewind` primitive — delete a user turn
 * (and everything after it) before re-streaming — so the thread never
 * accumulates stale or duplicate rows. The just-sent user row's real server id
 * arrives via the stream's first `user_message` frame; we swap it in over the
 * optimistic bubble so a rewind can target it.
 */

import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from "react";

import { api, type ChatMessage } from "@/lib/api/client";
import { streamChatMessage } from "@/lib/api/chat-stream";

/** A user turn whose assistant reply errored or never arrived. */
export interface FailedTurn {
  content: string;
  /** Id of the user row as currently shown (server id once synced). */
  userMessageId: string;
  /** Whether that row is persisted server-side (→ rewind it before retry). */
  persisted: boolean;
  /** Human-readable reason, surfaced inline next to Retry. */
  message: string;
}

/** One tool the agent invoked during the live turn. `done` flips on the
 *  paired `tool_result` frame so the UI can settle the pill. */
export interface StreamTool {
  id: string;
  name: string;
  args_summary: string;
  done: boolean;
}

/** The in-flight assistant turn: the answer typing in, the model's reasoning
 *  (collapsible, kept apart from the answer), the latest status verb, and the
 *  tools called so far. Null when nothing is streaming. */
export interface StreamingTurn {
  text: string;
  reasoning: string;
  status: string | null;
  tools: StreamTool[];
}

const EMPTY_TURN: StreamingTurn = { text: "", reasoning: "", status: null, tools: [] };
const LOCAL_PREFIX = "__local_";

function localId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.round(performance.now())}`;
  return `${LOCAL_PREFIX}${rnd}`;
}

function optimisticUser(threadId: string, id: string, content: string): ChatMessage {
  return {
    id,
    thread_id: threadId,
    role: "user",
    who: "You",
    avatar: "YO",
    content,
    created_at: new Date().toISOString(),
  };
}

/** Public surface of the shared chat-turn engine. */
export interface ChatTurn {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  hydrate: (next: ChatMessage[]) => void;
  sending: boolean;
  streaming: StreamingTurn | null;
  failedTurn: FailedTurn | null;
  clearFailure: () => void;
  send: (threadId: string, content: string) => Promise<void>;
  retry: (threadId: string) => Promise<void>;
  editAndResend: (threadId: string, message: ChatMessage, newContent: string) => Promise<void>;
  abort: () => void;
}

export function useChatTurn(): ChatTurn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState<StreamingTurn | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);

  const streamCtrlRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const failedRef = useRef<FailedTurn | null>(null);

  const setFailed = useCallback((f: FailedTurn | null) => {
    failedRef.current = f;
    setFailedTurn(f);
  }, []);

  const abort = useCallback(() => streamCtrlRef.current?.abort(), []);

  /** Replace the transcript (thread switch / initial load); cancels in-flight. */
  const hydrate = useCallback(
    (next: ChatMessage[]) => {
      streamCtrlRef.current?.abort();
      setMessages(next);
      setStreaming(null);
      setFailed(null);
    },
    [setFailed],
  );

  const send = useCallback(
    async (threadId: string, content: string) => {
      if (!content.trim() || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setStreaming({ ...EMPTY_TURN });
      setFailed(null);

      const tempId = localId();
      setMessages((cur) => [...cur, optimisticUser(threadId, tempId, content)]);

      let shownUserId = tempId;
      let persisted = false;
      let gotReply = false;
      let errorMsg: string | null = null;
      // Accumulated reasoning, attached to the settled message so the panel
      // survives the turn (session-only; it isn't persisted server-side yet).
      let reasoningBuf = "";

      const ctrl = new AbortController();
      streamCtrlRef.current = ctrl;
      try {
        for await (const ev of streamChatMessage(threadId, content, ctrl.signal)) {
          if (ev.type === "user_message") {
            persisted = true;
            shownUserId = ev.message.id;
            setMessages((cur) => cur.map((m) => (m.id === tempId ? ev.message : m)));
          } else if (ev.type === "message") {
            gotReply = true;
            const settled = reasoningBuf
              ? { ...ev.message, reasoning: reasoningBuf }
              : ev.message;
            setMessages((cur) => [...cur, settled]);
            setStreaming(null);
          } else if (ev.type === "agent_step") {
            setStreaming((s) => {
              const base = s ?? { ...EMPTY_TURN };
              return {
                ...base,
                text: ev.text ? base.text + ev.text : base.text,
                status: ev.kind || base.status,
              };
            });
          } else if (ev.type === "reasoning") {
            reasoningBuf += ev.text;
            setStreaming((s) => {
              const base = s ?? { ...EMPTY_TURN };
              return { ...base, reasoning: base.reasoning + ev.text, status: "reason" };
            });
          } else if (ev.type === "tool_call") {
            setStreaming((s) => {
              const base = s ?? { ...EMPTY_TURN };
              if (ev.id && base.tools.some((t) => t.id === ev.id)) return base;
              return {
                ...base,
                tools: [...base.tools, { id: ev.id, name: ev.name, args_summary: ev.args_summary, done: false }],
              };
            });
          } else if (ev.type === "tool_result") {
            setStreaming((s) =>
              s ? { ...s, tools: s.tools.map((t) => (t.id === ev.id ? { ...t, done: true } : t)) } : s,
            );
          } else if (ev.type === "error") {
            errorMsg = ev.message;
          }
        }
        if (!gotReply) {
          setFailed({
            content,
            userMessageId: shownUserId,
            persisted,
            message: errorMsg ?? "Athena didn't return a reply.",
          });
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setFailed({
            content,
            userMessageId: shownUserId,
            persisted,
            message: e instanceof Error ? e.message : "The chat stream failed.",
          });
        }
      } finally {
        if (streamCtrlRef.current === ctrl) streamCtrlRef.current = null;
        sendingRef.current = false;
        setSending(false);
        setStreaming(null);
      }
    },
    [setFailed],
  );

  const retry = useCallback(
    async (threadId: string) => {
      const failed = failedRef.current;
      if (!failed || sendingRef.current) return;
      setFailed(null);
      setMessages((cur) => cur.filter((m) => m.id !== failed.userMessageId));
      if (failed.persisted) {
        try {
          await api.chat.rewind(threadId, failed.userMessageId);
        } catch {
          /* best-effort: a missing row just means nothing to prune */
        }
      }
      await send(threadId, failed.content);
    },
    [send, setFailed],
  );

  const editAndResend = useCallback(
    async (threadId: string, message: ChatMessage, newContent: string) => {
      if (!newContent.trim() || sendingRef.current) return;
      // Drop the edited row + everything after it locally, then rewind the
      // server to match before re-streaming. Local-only rows (never persisted)
      // have nothing to rewind.
      setMessages((cur) => {
        const idx = cur.findIndex((m) => m.id === message.id);
        return idx >= 0 ? cur.slice(0, idx) : cur;
      });
      if (!message.id.startsWith(LOCAL_PREFIX)) {
        try {
          await api.chat.rewind(threadId, message.id);
        } catch {
          /* best-effort */
        }
      }
      await send(threadId, newContent);
    },
    [send],
  );

  return {
    messages,
    setMessages,
    hydrate,
    sending,
    streaming,
    failedTurn,
    clearFailure: useCallback(() => setFailed(null), [setFailed]),
    send,
    retry,
    editAndResend,
    abort,
  };
}
