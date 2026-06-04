"use client";

/**
 * /chat — scope-aware conversations with Athena.
 *
 * Layout: a collapsible thread rail on the left, a centered conversation in
 * the middle with the composer pinned to the bottom. Replies stream in live —
 * a status + tool panel while Athena works, the answer typing in below it —
 * then settle into the persisted message with citations and a collapsed tool
 * recap. Threads are scoped to the org or a capability, and can be renamed or
 * deleted from the rail.
 *
 * In demo mode (`config.isMock`) compose + thread writes are disabled and a
 * banner replaces the composer; the precomputed conversations stay browsable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, FileText, Hammer, PanelLeftOpen, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import {
  api,
  ApiError,
  type Capability,
  type ChatMessage,
  type ChatThread,
} from "@/lib/api/client";
import { config } from "@/lib/config";
import { useChatTurn } from "@/features/chat/use-chat-turn";
import { ChatThreadRail, type NewChatScope } from "@/components/chat/chat-thread-rail";
import { ChatMessage as ChatMessageRow } from "@/components/chat/chat-message";
import { ChatActivity } from "@/components/chat/chat-activity";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { ReasoningPanel } from "@/components/chat/reasoning-panel";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { CitationDrawer } from "@/components/runs/citations/citation-drawer";
import type { CitationSource } from "@/components/runs/citations/citation-chip";

const EXAMPLE_PROMPTS = [
  "What does this scope do, and where does the core logic live?",
  "What changed here recently, and why?",
  "Draft a short PRD for an improvement you'd prioritize.",
];

export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<ChatMessage | null>(null);

  const { messages, hydrate, sending, streaming, failedTurn, send, retry, editAndResend, abort } =
    useChatTurn();

  const scrollRef = useRef<HTMLDivElement>(null);

  // One hoisted citation drawer shared by every chip in the conversation.
  const [citation, setCitation] = useState<{ source: CitationSource; ref: string } | null>(null);
  const openCitation = useCallback((source: CitationSource, refValue: string) => {
    setCitation({ source, ref: refValue });
  }, []);

  const readOnly = config.isMock;
  const draft = activeId ? drafts[activeId] ?? "" : "";
  const setDraft = (value: string) =>
    activeId && setDrafts((d) => ({ ...d, [activeId]: value }));

  // Initial load: threads + capabilities (for the new-chat scope picker).
  useEffect(() => {
    (async () => {
      try {
        const [ts, caps] = await Promise.all([
          api.chat.listThreads(),
          api.capabilities.list().catch(() => [] as Capability[]),
        ]);
        setThreads(ts);
        setCapabilities(caps);
        if (ts[0]) setActiveId(ts[0].id);
      } catch {
        /* empty state covers the failure */
      }
    })();
  }, []);

  // Load the active thread's transcript.
  useEffect(() => {
    if (!activeId) {
      setActiveThread(null);
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    (async () => {
      try {
        const detail = await api.chat.getThread(activeId);
        if (cancelled) return;
        setActiveThread(detail.thread);
        hydrate(detail.messages);
        setEditing(null);
      } catch {
        if (!cancelled) toast.error("Couldn't load this chat.");
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, hydrate]);

  // Keep pinned to the latest message / streamed token.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, loadingThread, sending]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abort(), [abort]);

  const onSend = () => {
    if (!activeId || !draft.trim() || sending) return;
    const tid = activeId;
    const content = draft;
    setDrafts((d) => ({ ...d, [tid]: "" }));
    if (editing) {
      const target = editing;
      setEditing(null);
      void editAndResend(tid, target, content);
    } else {
      void send(tid, content);
    }
  };

  const pickCard = (value: string) => {
    if (!activeId || sending || readOnly) return;
    void send(activeId, value);
  };

  const beginEdit = (m: ChatMessage) => {
    if (!activeId || sending) return;
    setEditing(m);
    setDrafts((d) => ({ ...d, [activeId]: m.content }));
  };

  const handleNew = useCallback(
    async (scope: NewChatScope) => {
      if (creating) return;
      setCreating(true);
      try {
        const { thread } = await api.chat.createThread({ title: "New chat", ...scope });
        const ts = await api.chat.listThreads().catch(() => null);
        if (ts) setThreads(ts);
        else setThreads((cur) => [thread, ...cur]);
        setActiveId(thread.id);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Could not start a new chat.");
      } finally {
        setCreating(false);
      }
    },
    [creating],
  );

  const handleRename = useCallback(async (id: string, title: string) => {
    setThreads((cur) => cur.map((t) => (t.id === id ? { ...t, title } : t)));
    setActiveThread((cur) => (cur && cur.id === id ? { ...cur, title } : cur));
    try {
      await api.chat.renameThread(id, title);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't rename the chat.");
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const prev = threads;
      const remaining = prev.filter((t) => t.id !== id);
      setThreads(remaining);
      if (activeId === id) setActiveId(remaining[0]?.id ?? null);
      try {
        await api.chat.deleteThread(id);
        toast.success("Chat deleted.");
      } catch (e) {
        setThreads(prev); // restore on failure
        toast.error(e instanceof ApiError ? e.message : "Couldn't delete the chat.");
      }
    },
    [threads, activeId],
  );

  const showWelcome = !loadingThread && activeThread && messages.length === 0 && !sending;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] min-h-0 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-2)]">
      {!collapsed && (
        <ChatThreadRail
          threads={threads}
          activeId={activeId}
          capabilities={capabilities}
          creating={creating}
          readOnly={readOnly}
          onSelect={setActiveId}
          onToggleCollapsed={() => setCollapsed(true)}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
        {/* Conversation header */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Show chats"
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{activeThread?.title ?? "Chat"}</div>
            {activeThread && (
              <div className="truncate text-[11px] text-[var(--text-subtle)]">{activeThread.scope.label}</div>
            )}
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => void handleNew({ scope_kind: "org" })}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] shadow-[var(--shadow-1)] transition-shadow hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-2)] disabled:opacity-60"
            >
              <Plus className="size-3.5" /> New chat
            </button>
          )}
        </header>

        {/* Conversation body */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {!activeThread ? (
              loadingThread ? (
                <ConversationSkeleton />
              ) : (
                <EmptyWorkspace hasThreads={threads.length > 0} readOnly={readOnly} onNew={() => void handleNew({ scope_kind: "org" })} creating={creating} />
              )
            ) : loadingThread ? (
              <ConversationSkeleton />
            ) : (
              <div className="space-y-5">
                {activeThread.created_task && (
                  <Link
                    href={`/runs/${activeThread.created_task.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-xs no-underline hover:bg-[var(--surface)]"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {activeThread.created_task.kind === "prd" ? <FileText className="size-4 shrink-0 text-[var(--success-ink)]" /> : <Hammer className="size-4 shrink-0 text-[var(--success-ink)]" />}
                      <span className="min-w-0">
                        <span className="font-semibold uppercase tracking-wider text-[var(--success-ink)]">Produced a task</span>
                        <span className="ml-2 text-[var(--text)]">{activeThread.created_task.goal}</span>
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-[var(--success-ink)]" />
                  </Link>
                )}

                {showWelcome ? (
                  <EmptyThread
                    scopeLabel={activeThread.scope.label}
                    readOnly={readOnly}
                    onPick={(p) => setDraft(p)}
                  />
                ) : (
                  messages.map((m, i) => (
                    <ChatMessageRow
                      key={m.id}
                      message={m}
                      onCitationOpen={openCitation}
                      onEdit={beginEdit}
                      editDisabled={sending}
                      onPickClarification={pickCard}
                      cardsDisabled={sending || i !== messages.length - 1}
                    />
                  ))
                )}

                {/* Live streaming turn */}
                {sending && streaming && (
                  <div className="flex gap-3">
                    <ActorAvatar name="Athena" agent size={26} mood="thinking" className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="text-xs font-semibold text-[var(--text)]">Athena</div>
                      <ChatActivity turn={streaming} />
                      {streaming.reasoning && (
                        <ReasoningPanel reasoning={streaming.reasoning} defaultOpen />
                      )}
                      {streaming.text && (
                        <StreamingAnswer text={streaming.text} onCitation={openCitation} />
                      )}
                    </div>
                  </div>
                )}

                {failedTurn && !sending && (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
                    <span className="min-w-0 truncate">{failedTurn.message}</span>
                    <button
                      type="button"
                      onClick={() => activeId && void retry(activeId)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--danger)] px-2 py-1 text-xs font-medium hover:bg-[var(--surface)]"
                    >
                      <RotateCcw className="size-3" /> Retry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-3 shadow-[var(--inner-highlight)]">
          <div className="mx-auto w-full max-w-3xl">
            {readOnly ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-center text-xs text-[var(--text-muted)]">
                Demo mode — chat compose is disabled. Browse the precomputed conversations.
              </div>
            ) : (
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSend={onSend}
                onStop={abort}
                sending={sending}
                disabled={!activeId}
                editing={!!editing}
                onCancelEdit={() => {
                  setEditing(null);
                  setDraft("");
                }}
                autoFocusKey={activeId ?? ""}
                placeholder={activeThread ? `Message Athena about ${activeThread.scope.label}…` : "Pick or start a chat first"}
              />
            )}
          </div>
        </div>
      </main>

      <CitationDrawer
        open={citation !== null}
        source={citation?.source ?? null}
        refValue={citation?.ref ?? null}
        onClose={() => setCitation(null)}
      />
    </div>
  );
}

/** The answer as it streams in — rendered as live markdown (same renderer as
 *  the settled bubble) so formatting + inline citations appear as they arrive,
 *  with no plain-text→formatted reflow when the turn finishes. The "drafting…"
 *  cue lives in the ChatActivity strip above. */
function StreamingAnswer({
  text,
  onCitation,
}: {
  text: string;
  onCitation: (source: CitationSource, ref: string) => void;
}) {
  return <ChatMarkdown content={text} onCitation={onCitation} />;
}

/** Welcome shown when no thread is open. */
function EmptyWorkspace({
  hasThreads,
  readOnly,
  onNew,
  creating,
}: {
  hasThreads: boolean;
  readOnly: boolean;
  onNew: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <ActorAvatar name="Athena" agent size={56} mood="happy" />
      <div>
        <h2 className="text-lg font-semibold">Chat with Athena</h2>
        <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
          Ask about any capability or your whole org. Athena cites its sources and can spin a task out of the conversation.
        </p>
      </div>
      {!readOnly &&
        (hasThreads ? (
          <p className="text-sm text-[var(--text-muted)]">Pick a chat on the left, or start a new one.</p>
        ) : (
          <button
            type="button"
            onClick={onNew}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-fg)] shadow-[var(--shadow-cta)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Plus className="size-4" /> Start your first chat
          </button>
        ))}
    </div>
  );
}

/** Welcome shown inside an empty thread — example prompts seed the composer. */
function EmptyThread({
  scopeLabel,
  readOnly,
  onPick,
}: {
  scopeLabel: string;
  readOnly: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <ActorAvatar name="Athena" agent size={48} mood="happy" />
      <div>
        <h2 className="text-base font-semibold">Ask anything about {scopeLabel}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Athena answers with citations from your knowledge graph and repos.</p>
      </div>
      {!readOnly && (
        <div className="flex w-full max-w-md flex-col gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text)] shadow-[var(--shadow-1)] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-2)]"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Content-shaped skeleton while a thread's transcript loads. */
function ConversationSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading conversation">
      <div className="flex justify-end">
        <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
      </div>
      <div className="flex gap-3">
        <div className="size-7 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-16 w-full animate-pulse rounded-lg bg-[var(--surface-2)]" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-8 w-2/5 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
      </div>
    </div>
  );
}
