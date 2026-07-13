"use client";

/**
 * useChatTurn - shared send / steer / queue / edit / retry engine for the
 * `/chat` page and the chat FAB.
 *
 * Turns run in the BACKGROUND server-side: `send` persists the user row +
 * enqueues a turn (202 `{message, turn}`), then `attach` subscribes to the
 * turn's resumable event feed and reduces it into the live `streaming` view
 * (the answer typing in, tool pills, reasoning). Closing the feed never stops
 * the turn - navigating away and back replays every missed event, so the
 * partial answer is rebuilt exactly (call `hydrate(messages, activeTurn)` with
 * the thread detail's `active_turn`).
 *
 * Mid-turn control:
 *  - `steerNow` sends a message INTO the running turn (folded in at the
 *    agent's next model call) with an optional model/effort override for the
 *    rest of the turn.
 *  - `queue` holds messages typed while a turn runs; they auto-send when it
 *    settles, and each queued item can be edited, removed, or steered in now.
 *  - `stop` is a server-side cooperative cancel (any partial answer text is
 *    persisted); `detach` only closes the local feed (unmount).
 *
 * Edit and retry lean on the BE `rewind` primitive - delete a user turn (and
 * everything after it) before re-sending - and are available only while no
 * turn is active (the BE 409s a rewind against a running turn).
 */

import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from "react";

import {
  api,
  ApiError,
  type ChatMessage,
  type ChatTurn as ChatTurnRow,
  type EffortLevel,
  type ModelSelection,
} from "@/lib/api/client";
import { streamTurnEvents } from "@/lib/api/chat-turn-stream";

/** A user turn whose assistant reply errored, was stopped, or never arrived. */
interface FailedTurn {
  content: string;
  /** Id of the persisted user row (rewound before a retry). */
  userMessageId: string;
  /** Whether that row is persisted server-side (→ rewind it before retry). */
  persisted: boolean;
  /** Human-readable reason, surfaced inline next to Retry. */
  message: string;
  model: ModelSelection | null;
  effort: EffortLevel;
  attachmentIds: string[];
  pageContext: string | null;
  webSearch: boolean;
  opticalCompression: boolean;
  agentId: string | null;
}

/** One tool the agent invoked during the live turn. */
interface StreamTool {
  id: string;
  parent_id?: string | undefined;
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

/** A message typed while a turn was running - waiting its turn, or steered in
 *  now. Kept client-side; sending/steering persists it. */
export interface QueuedMessage {
  id: string;
  content: string;
  model: ModelSelection | null;
  effort: EffortLevel;
  attachmentIds: string[];
  pageContext: string | null;
  webSearch: boolean;
  opticalCompression: boolean;
  agentId: string | null;
}

const EMPTY_TURN: StreamingTurn = { text: "", reasoning: "", status: null, tools: [] };
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15_000;

function localId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.round(performance.now())}`;
  return `__local_${rnd}`;
}

function optimisticUser(
  threadId: string,
  id: string,
  content: string,
  attachmentIds: string[],
): ChatMessage {
  return {
    id,
    thread_id: threadId,
    role: "user",
    who: "You",
    avatar: "YO",
    content,
    created_at: new Date().toISOString(),
    ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
  };
}

function turnModel(turn: ChatTurnRow): ModelSelection | null {
  if (!turn.model_provider || !turn.model_id) return null;
  return {
    provider: turn.model_provider,
    model: turn.model_id,
    ...(turn.model_source
      ? { source: turn.model_source as "athena" | "byok" | "subscription" }
      : {}),
  };
}

/** Public surface of the shared chat-turn engine. */
export interface ChatTurn {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  hydrate: (next: ChatMessage[], activeTurn?: ChatTurnRow | null) => void;
  /** True while a turn is active (queued/running/steering) on this surface. */
  sending: boolean;
  /** True from Stop click until the terminal event lands. */
  stopping: boolean;
  streaming: StreamingTurn | null;
  failedTurn: FailedTurn | null;
  clearFailure: () => void;
  /** Messages waiting for the running turn to settle. */
  queue: QueuedMessage[];
  removeQueued: (id: string) => void;
  /** Pop a queued item for editing (returns it, removed from the queue). */
  takeQueued: (id: string) => QueuedMessage | null;
  /** Steer a queued item into the RUNNING turn now, on the given (fresh)
   *  model/effort picks. */
  sendQueuedNow: (
    threadId: string,
    id: string,
    model?: ModelSelection | null,
    effort?: EffortLevel,
  ) => Promise<void>;
  /** Send now, into the running turn (mid-turn steer + optional override).
   *  `fallback` capabilities are used only if the turn settles in the same
   *  instant and the steer falls back to a fresh turn. */
  steerNow: (
    threadId: string,
    content: string,
    model?: ModelSelection | null,
    effort?: EffortLevel,
    attachmentIds?: string[],
    fallback?: {
      webSearch?: boolean;
      opticalCompression?: boolean;
      agentId?: string | null;
      pageContext?: string | null;
    },
  ) => Promise<void>;
  send: (
    threadId: string,
    content: string,
    model?: ModelSelection | null,
    effort?: EffortLevel,
    attachmentIds?: string[],
    pageContext?: string | null,
    webSearch?: boolean,
    opticalCompression?: boolean,
    agentId?: string | null,
  ) => Promise<void>;
  retry: (threadId: string) => Promise<void>;
  editAndResend: (
    threadId: string,
    message: ChatMessage,
    newContent: string,
    model?: ModelSelection | null,
    effort?: EffortLevel,
    attachmentIds?: string[],
    pageContext?: string | null,
    webSearch?: boolean,
    opticalCompression?: boolean,
    agentId?: string | null,
  ) => Promise<void>;
  /** Server-side cooperative cancel of the active turn. */
  stop: (threadId: string) => void;
  /** Close the local event feed WITHOUT stopping the turn (unmount). */
  detach: () => void;
}

export function useChatTurn(): ChatTurn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [streaming, setStreaming] = useState<StreamingTurn | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);

  const attachCtrlRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<ChatTurnRow | null>(null);
  const sendingRef = useRef(false);
  const failedRef = useRef<FailedTurn | null>(null);
  const queueRef = useRef<QueuedMessage[]>([]);
  // The send() args of the turn this surface started - retry context when it
  // fails. Null for a reattached turn (retry context comes from the row).
  const sentRef = useRef<FailedTurn | null>(null);

  const setFailed = useCallback((f: FailedTurn | null) => {
    failedRef.current = f;
    setFailedTurn(f);
  }, []);

  const setQueueBoth = useCallback(
    (updater: (cur: QueuedMessage[]) => QueuedMessage[]) => {
      setQueue((cur) => {
        const next = updater(cur);
        queueRef.current = next;
        return next;
      });
    },
    [],
  );

  const detach = useCallback(() => {
    attachCtrlRef.current?.abort();
    attachCtrlRef.current = null;
  }, []);

  /** Refetch the settled transcript, carrying the streamed reasoning onto the
   *  persisted assistant row (reasoning isn't persisted server-side). */
  const settleFromServer = useCallback(
    async (
      threadId: string,
      assistantMessageId: string | null,
      reasoning: string,
      signal: AbortSignal,
    ): Promise<ChatMessage[] | null> => {
      try {
        const detail = await api.chat.getThread(threadId);
        const settled = detail.messages.map((m) =>
          assistantMessageId && m.id === assistantMessageId && reasoning
            ? { ...m, reasoning }
            : m,
        );
        // A thread switch during the fetch detached this feed - do NOT write
        // this thread's transcript over the now-active thread's view.
        if (signal.aborted) return null;
        setMessages(settled);
        return settled;
      } catch {
        return null;
      }
    },
    [],
  );

  const send = useCallback(
    async (
      threadId: string,
      content: string,
      model: ModelSelection | null = null,
      effort: EffortLevel = "medium",
      attachmentIds: string[] = [],
      pageContext: string | null = null,
      webSearch: boolean = false,
      opticalCompression: boolean = false,
      agentId: string | null = null,
    ) => {
      if (!content.trim() && attachmentIds.length === 0) return;
      // A turn is already running on this surface: hold the message in the
      // local queue (auto-sent when the turn settles; steerable in now).
      if (sendingRef.current) {
        setQueueBoth((cur) => [
          ...cur,
          { id: localId(), content, model, effort, attachmentIds, pageContext, webSearch, opticalCompression, agentId },
        ]);
        return;
      }
      sendingRef.current = true;
      setSending(true);
      setStreaming({ ...EMPTY_TURN });
      setFailed(null);

      const tempId = localId();
      setMessages((cur) => [...cur, optimisticUser(threadId, tempId, content, attachmentIds)]);
      const context: FailedTurn = {
        content,
        userMessageId: tempId,
        persisted: false,
        message: "",
        model,
        effort,
        attachmentIds,
        pageContext,
        webSearch,
        opticalCompression,
        agentId,
      };
      sentRef.current = context;
      try {
        const { message, turn } = await api.chat.postMessage(
          threadId, content, model, effort, attachmentIds, pageContext, webSearch, opticalCompression, agentId,
        );
        context.userMessageId = message.id;
        context.persisted = true;
        setMessages((cur) => cur.map((m) => (m.id === tempId ? message : m)));
        if (turn.status === "failed") {
          // Enqueue failed server-side (broker blip) - message persisted.
          sendingRef.current = false;
          setSending(false);
          setStreaming(null);
          setFailed({ ...context, message: turn.error ?? "Athena couldn't start this reply." });
          return;
        }
        void attach(threadId, turn);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.metadata?.["code"] === "turn_active") {
          // Raced an already-running turn (another tab / a follow-up turn):
          // drop the optimistic bubble, requeue the content, reattach.
          setMessages((cur) => cur.filter((m) => m.id !== tempId));
          setQueueBoth((cur) => [
            { id: localId(), content, model, effort, attachmentIds, pageContext, webSearch, opticalCompression, agentId },
            ...cur,
          ]);
          sendingRef.current = false;
          setSending(false);
          setStreaming(null);
          try {
            const detail = await api.chat.getThread(threadId);
            setMessages(detail.messages);
            if (detail.active_turn) void attach(threadId, detail.active_turn);
          } catch {
            /* the queue holds the message; the next hydrate reattaches */
          }
          return;
        }
        sendingRef.current = false;
        setSending(false);
        setStreaming(null);
        setFailed({
          ...context,
          message: e instanceof Error ? e.message : "The message couldn't be sent.",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setFailed, setQueueBoth],
  );

  /** Subscribe to a turn's event feed (resumable; reconnects with backoff)
   *  and reduce it into the streaming view until the terminal status. */
  const attach = useCallback(
    async (threadId: string, turn: ChatTurnRow) => {
      detach();
      const ctrl = new AbortController();
      attachCtrlRef.current = ctrl;
      activeTurnRef.current = turn;
      sendingRef.current = true;
      setSending(true);
      setFailed(null);
      setStreaming({ ...EMPTY_TURN });

      let lastEventId = "";
      let reasoningBuf = "";
      let backoff = RECONNECT_BASE_MS;
      let terminal: { status: string; error?: string; assistantMessageId: string | null } | null = null;

      while (!ctrl.signal.aborted && !terminal) {
        try {
          for await (const ev of streamTurnEvents(threadId, turn.id, {
            signal: ctrl.signal,
            ...(lastEventId ? { lastEventId } : {}),
          })) {
            backoff = RECONNECT_BASE_MS;
            if (ev.seq) lastEventId = String(ev.seq);
            if (ev.type === "agent_step") {
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
                  tools: [...base.tools, { id: ev.id, parent_id: ev.parent_id, name: ev.name, args_summary: ev.args_summary, done: false }],
                };
              });
            } else if (ev.type === "tool_result") {
              setStreaming((s) =>
                s ? { ...s, tools: s.tools.map((t) => (t.id === ev.id ? { ...t, done: true } : t)) } : s,
              );
            } else if (ev.type === "status") {
              if (ev.status === "steering") {
                setStreaming((s) => ({ ...(s ?? { ...EMPTY_TURN }), status: "steer" }));
              } else if (["completed", "failed", "cancelled"].includes(ev.status)) {
                terminal = {
                  status: ev.status,
                  ...(ev.error ? { error: ev.error } : {}),
                  assistantMessageId: ev.assistant_message_id ?? null,
                };
                break;
              }
            }
          }
          // Stream closed without a terminal event (server restart / network):
          // reconnect with the cursor unless we were detached.
          if (!terminal && !ctrl.signal.aborted) {
            await new Promise((r) => setTimeout(r, backoff));
            backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
          }
        } catch {
          if (ctrl.signal.aborted) break;
          await new Promise((r) => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
        }
      }

      if (ctrl.signal.aborted) return; // detached - the turn keeps running

      const settled = await settleFromServer(threadId, terminal?.assistantMessageId ?? null, reasoningBuf, ctrl.signal);
      // A thread switch during the settle fetch detached this feed. Bail
      // BEFORE touching any shared state (setFailed / the queue auto-send) -
      // otherwise this thread's follow-up would stream into the now-active
      // thread's view and Stop would target the wrong turn.
      if (ctrl.signal.aborted) return;
      const unanswered =
        terminal?.status === "failed" ||
        (terminal?.status === "cancelled" && !terminal.assistantMessageId);
      if (terminal && unanswered) {
        const ctx = sentRef.current;
        const userRow = settled?.find((m) => m.id === turn.user_message_id);
        setFailed({
          content: ctx?.content ?? userRow?.content ?? "",
          userMessageId: turn.user_message_id,
          persisted: true,
          message:
            terminal.status === "cancelled"
              ? "Stopped. Pick up where you left off?"
              : terminal.error ?? "Athena didn't return a reply.",
          model: ctx?.model ?? turnModel(turn),
          effort: (ctx?.effort ?? turn.effort) as EffortLevel,
          attachmentIds: ctx?.attachmentIds ?? userRow?.attachment_ids ?? [],
          pageContext: ctx?.pageContext ?? null,
          webSearch: ctx?.webSearch ?? turn.web_search,
          // Optical is transient (never persisted on the turn row), so a
          // reload with no in-memory context can only fall back to off.
          opticalCompression: ctx?.opticalCompression ?? false,
          agentId: ctx?.agentId ?? turn.agent_id ?? null,
        });
      }
      sentRef.current = null;
      activeTurnRef.current = null;
      if (attachCtrlRef.current === ctrl) attachCtrlRef.current = null;
      sendingRef.current = false;
      setSending(false);
      setStopping(false);
      setStreaming(null);

      // Auto-send the next queued message once the turn settled cleanly.
      if (terminal?.status === "completed") {
        const next = queueRef.current[0];
        if (next) {
          setQueueBoth((cur) => cur.slice(1));
          void send(
            threadId, next.content, next.model, next.effort, next.attachmentIds,
            next.pageContext, next.webSearch, next.opticalCompression, next.agentId,
          );
        }
      }
    },
     
    [detach, setFailed, setQueueBoth, settleFromServer, send],
  );

  const steerNow = useCallback(
    async (
      threadId: string,
      content: string,
      model: ModelSelection | null = null,
      effort?: EffortLevel,
      attachmentIds: string[] = [],
      // Capabilities to preserve if the turn settles in the same instant and
      // the steer has to fall back to a FRESH turn (web search / custom agent /
      // page snapshot). Steering INTO a running turn ignores these - the
      // running turn already has its own; they only matter for the fresh-turn
      // fallback.
      fallback: {
        webSearch?: boolean;
        opticalCompression?: boolean;
        agentId?: string | null;
        pageContext?: string | null;
      } = {},
    ) => {
      const turn = activeTurnRef.current;
      if (!turn || !content.trim()) return;
      const tempId = localId();
      setMessages((cur) => [...cur, optimisticUser(threadId, tempId, content, attachmentIds)]);
      try {
        const message = await api.chat.steerTurn(threadId, turn.id, content, model, effort ?? null, attachmentIds);
        setMessages((cur) => cur.map((m) => (m.id === tempId ? message : m)));
        setStreaming((s) => ({ ...(s ?? { ...EMPTY_TURN }), status: "steer" }));
      } catch (e) {
        setMessages((cur) => cur.filter((m) => m.id !== tempId));
        if (e instanceof ApiError && e.status === 409) {
          // The turn settled in the same instant - send as a fresh message,
          // preserving the message's own capabilities (never a silent
          // downgrade of web search / the chosen agent).
          await send(
            threadId, content, model, effort ?? "medium", attachmentIds,
            fallback.pageContext ?? null, fallback.webSearch ?? false,
            fallback.opticalCompression ?? false, fallback.agentId ?? null,
          );
          return;
        }
        setFailed({
          content,
          userMessageId: tempId,
          persisted: false,
          message: e instanceof Error ? e.message : "The message couldn't be sent.",
          model,
          effort: effort ?? "medium",
          attachmentIds,
          pageContext: fallback.pageContext ?? null,
          webSearch: fallback.webSearch ?? false,
          opticalCompression: fallback.opticalCompression ?? false,
          agentId: fallback.agentId ?? null,
        });
      }
    },
    [send, setFailed],
  );

  const sendQueuedNow = useCallback(
    async (
      threadId: string,
      id: string,
      model?: ModelSelection | null,
      effort?: EffortLevel,
    ) => {
      const item = queueRef.current.find((q) => q.id === id);
      if (!item) return;
      setQueueBoth((cur) => cur.filter((q) => q.id !== id));
      // The FRESH picker values win (that is the "send now with the new
      // model/effort" contract); fall back to the item's own capture. The
      // item's web-search / agent / page-context are carried so a fresh-turn
      // fallback never downgrades them.
      await steerNow(
        threadId,
        item.content,
        model !== undefined ? model : item.model,
        effort ?? item.effort,
        item.attachmentIds,
        {
          webSearch: item.webSearch,
          opticalCompression: item.opticalCompression,
          agentId: item.agentId,
          pageContext: item.pageContext,
        },
      );
    },
    [setQueueBoth, steerNow],
  );

  const removeQueued = useCallback(
    (id: string) => setQueueBoth((cur) => cur.filter((q) => q.id !== id)),
    [setQueueBoth],
  );

  const takeQueued = useCallback(
    (id: string): QueuedMessage | null => {
      const item = queueRef.current.find((q) => q.id === id) ?? null;
      if (item) setQueueBoth((cur) => cur.filter((q) => q.id !== id));
      return item;
    },
    [setQueueBoth],
  );

  /** Replace the transcript (thread switch / initial load); detaches the feed
   *  (never stops the turn) and reattaches when the thread has an active one. */
  const hydrate = useCallback(
    (next: ChatMessage[], activeTurn: ChatTurnRow | null = null) => {
      detach();
      activeTurnRef.current = null;
      sendingRef.current = false;
      sentRef.current = null;
      setMessages(next);
      setStreaming(null);
      setSending(false);
      setStopping(false);
      setFailed(null);
      setQueueBoth(() => []);
      if (activeTurn) void attach(activeTurn.thread_id, activeTurn);
    },
    [attach, detach, setFailed, setQueueBoth],
  );

  const stop = useCallback((threadId: string) => {
    const turn = activeTurnRef.current;
    if (!turn) return;
    setStopping(true);
    void api.chat.cancelTurn(threadId, turn.id).catch(() => setStopping(false));
  }, []);

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
      await send(threadId, failed.content, failed.model, failed.effort, failed.attachmentIds, failed.pageContext, failed.webSearch, failed.opticalCompression, failed.agentId);
    },
    [send, setFailed],
  );

  const editAndResend = useCallback(
    async (
      threadId: string,
      message: ChatMessage,
      newContent: string,
      model: ModelSelection | null = null,
      effort: EffortLevel = "medium",
      attachmentIds: string[] = [],
      pageContext: string | null = null,
      webSearch: boolean = false,
      opticalCompression: boolean = false,
      agentId: string | null = null,
    ) => {
      if ((!newContent.trim() && attachmentIds.length === 0) || sendingRef.current) return;
      // Drop the edited row + everything after it locally, then rewind the
      // server to match before re-sending. Local-only rows have nothing to rewind.
      setMessages((cur) => {
        const idx = cur.findIndex((m) => m.id === message.id);
        return idx >= 0 ? cur.slice(0, idx) : cur;
      });
      if (!message.id.startsWith("__local_")) {
        try {
          await api.chat.rewind(threadId, message.id);
        } catch {
          /* best-effort */
        }
      }
      await send(threadId, newContent, model, effort, attachmentIds, pageContext, webSearch, opticalCompression, agentId);
    },
    [send],
  );

  return {
    messages,
    setMessages,
    hydrate,
    sending,
    stopping,
    streaming,
    failedTurn,
    clearFailure: useCallback(() => setFailed(null), [setFailed]),
    queue,
    removeQueued,
    takeQueued,
    sendQueuedNow,
    steerNow,
    send,
    retry,
    editAndResend,
    stop,
    detach,
  };
}
