"use client";

/**
 * Streaming engine for the public showcase chat - a trimmed twin of
 * `features/chat/use-chat-turn.ts`.
 *
 * Owns the in-memory transcript (NOT persisted anywhere), the in-flight
 * streaming turn, and send/abort. The browser-held last-N turns are sent as
 * `history` each turn so follow-ups stay coherent without any server-side
 * thread. There is no edit/retry/rewind, no model/effort/agent pickers.
 */

import { useCallback, useRef, useState } from "react";

import {
  streamPublicChat,
  type PublicChatMessage,
  type PublicToolStep,
} from "@/lib/api/public-chat-stream";

// How many prior turns the browser sends back as context. Kept small (and the
// BE also caps it) to bound prompt cost on the public surface.
const HISTORY_LIMIT = 6;

export interface PublicStreamingTurn {
  text: string;
  reasoning: string;
  /** The agent's tool steps so far this turn - the live activity log. */
  tools: PublicToolStep[];
}

export interface PublicChatTurn {
  messages: PublicChatMessage[];
  streaming: PublicStreamingTurn | null;
  sending: boolean;
  error: string | null;
  send: (message: string) => void;
  abort: () => void;
}

export function usePublicChatTurn(repoRef?: string | null): PublicChatTurn {
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [streaming, setStreaming] = useState<PublicStreamingTurn | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const send = useCallback(
    (raw: string) => {
      const message = raw.trim();
      if (!message || sendingRef.current) return;
      sendingRef.current = true;
      setError(null);
      setSending(true);
      setStreaming({ text: "", reasoning: "", tools: [] });
      // Accumulates this turn's tool steps for the live log + the settled recap.
      const turnTools: PublicToolStep[] = [];

      const userMsg: PublicChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        who: "You",
        avatar: "user",
        content: message,
        citations: [],
      };
      // History = the conversation so far (before this turn), last N turns. The
      // BE appends the new message itself.
      const history = messages
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, userMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          for await (const ev of streamPublicChat({
            message,
            repoRef: repoRef ?? null,
            history,
            signal: controller.signal,
          })) {
            if (ev.type === "agent_step" && ev.text) {
              const chunk = ev.text;
              setStreaming((s) => (s ? { ...s, text: s.text + chunk } : s));
            } else if (ev.type === "reasoning") {
              const chunk = ev.text;
              setStreaming((s) => (s ? { ...s, reasoning: s.reasoning + chunk } : s));
            } else if (ev.type === "tool_call") {
              turnTools.push({ id: ev.id, name: ev.name, argsSummary: ev.argsSummary, done: false });
              setStreaming((s) => (s ? { ...s, tools: [...turnTools] } : s));
            } else if (ev.type === "tool_result") {
              const t = turnTools.find((x) => x.id === ev.id);
              if (t) t.done = true;
              setStreaming((s) => (s ? { ...s, tools: [...turnTools] } : s));
            } else if (ev.type === "message") {
              // Attach the turn's tool steps (all settled) as the message recap.
              const msg: PublicChatMessage = {
                ...ev.message,
                toolSteps: turnTools.map((t) => ({ ...t, done: true })),
              };
              setMessages((prev) => [...prev, msg]);
              setStreaming(null);
            } else if (ev.type === "error") {
              setError(ev.message);
            }
          }
        } catch (e) {
          const aborted = e instanceof DOMException && e.name === "AbortError";
          if (!aborted) {
            setError("Sorry, something went wrong. Please try again.");
          }
        } finally {
          sendingRef.current = false;
          setSending(false);
          setStreaming(null);
          abortRef.current = null;
        }
      })();
    },
    [messages, repoRef],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, streaming, sending, error, send, abort };
}
