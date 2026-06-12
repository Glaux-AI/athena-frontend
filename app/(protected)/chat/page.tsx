"use client";

/**
 * /chat — scope-aware conversations with Athena.
 *
 * Layout: an open, full-height canvas (no outer card) — a collapsible thread
 * rail on the left and a centered conversation column with a floating
 * composer card at the bottom; messages scroll under it through a soft fade.
 * The header stays chromeless until the conversation scrolls, then gains a
 * hairline. Replies stream in live — a status + tool panel while Athena
 * works, the answer typing in below it — then settle into the persisted
 * message with citations and a collapsed tool recap. Auto-scroll pins to the
 * latest token only while the reader is near the bottom; scrolling up to
 * re-read pauses it and a "Latest" pill offers the way back.
 *
 * In demo mode (`config.isMock`) compose + thread writes are disabled and a
 * banner replaces the composer; the precomputed conversations stay browsable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, PanelLeftOpen, Plus, RotateCcw, SquarePen } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type Domain,
  type ChatMessage,
  type ChatThread,
  type EffortLevel,
  type EnabledModel,
  type ModelSelection,
} from "@/lib/api/client";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/SessionProvider";
import { useChatTurn } from "@/features/chat/use-chat-turn";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { ChatThreadRail, threadDisplayTitle, type NewChatScope } from "@/components/chat/chat-thread-rail";
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

/** Quiet-chip restyle for the effort/model pickers inside the composer card —
 *  borderless until hovered so the card keeps a single visible frame. */
const PICKER_GHOST =
  "h-7 rounded-lg border-transparent bg-transparent px-2 text-[var(--text-muted)] shadow-none hover:bg-[var(--surface-2)] hover:text-[var(--text)] data-[state=open]:bg-[var(--surface-2)] data-[state=open]:text-[var(--text)]";

/** How close to the bottom (px) still counts as "reading the latest". */
const PIN_THRESHOLD = 96;

export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [models, setModels] = useState<EnabledModel[]>([]);
  const [model, setModel] = useState<ModelSelection | null>(null);
  // How hard Athena works this turn (tool budget + reasoning depth). Flow
  // content, not plumbing — always shown next to the model pick; balanced default.
  const [effort, setEffort] = useState<EffortLevel>("medium");

  const { messages, hydrate, sending, stopping, streaming, failedTurn, send, retry, editAndResend, abort } =
    useChatTurn();
  // Subscription models gain workspace grounding when the deployment runs
  // the MCP bridge — the picker's "Your plan" footnote says which.
  const { me } = useSession();
  const subscriptionGrounded = me?.features.subscriptionMcpBridge ?? false;

  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll only while the reader is near the bottom; scrolling up to
  // re-read must never be fought by the stream.
  const pinnedRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [scrolled, setScrolled] = useState(false);

  // One hoisted citation drawer shared by every chip in the conversation.
  const [citation, setCitation] = useState<{ source: CitationSource; ref: string; label?: string } | null>(null);
  const openCitation = useCallback((source: CitationSource, refValue: string, label?: string) => {
    setCitation(label ? { source, ref: refValue, label } : { source, ref: refValue });
  }, []);

  const readOnly = config.isMock;
  const draft = activeId ? drafts[activeId] ?? "" : "";
  const setDraft = (value: string) =>
    activeId && setDrafts((d) => ({ ...d, [activeId]: value }));

  // Initial load: threads + domains (for the new-chat scope picker) + the
  // org's enabled models (the composer model picker; default to the first one,
  // null = the Athena-hosted platform default).
  useEffect(() => {
    (async () => {
      try {
        const [ts, caps, ms] = await Promise.all([
          api.chat.listThreads(),
          api.domains.list().catch(() => [] as Domain[]),
          api.models.enabled().catch(() => [] as EnabledModel[]),
        ]);
        setThreads(ts);
        setDomains(caps);
        const enabled = ms.filter((m) => m.enabled);
        setModels(enabled);
        // Default to a workspace-capable model — a subscription model
        // (chat-only, no workspace tools) must be an explicit pick.
        const preferred =
          enabled.find((m) => m.source !== "subscription") ?? enabled[0];
        if (preferred)
          setModel({
            provider: preferred.provider,
            model: preferred.id,
            source: preferred.source,
          });
        if (ts[0]) setActiveId(ts[0].id);
      } catch {
        /* empty state covers the failure */
      }
    })();
  }, []);

  // Small screens get the conversation, not the rail, by default.
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(max-width: 767px)").matches) setCollapsed(true);
    }
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

  // A thread switch always lands pinned to its latest message.
  useEffect(() => {
    pinnedRef.current = true;
    setAtBottom(true);
    setScrolled(false);
  }, [activeId]);

  // Keep pinned to the latest message / streamed token — unless the reader
  // scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, loadingThread, sending]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD;
    pinnedRef.current = nearBottom;
    setAtBottom(nearBottom);
    setScrolled(el.scrollTop > 8);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abort(), [abort]);

  const onSend = () => {
    if (!activeId || !draft.trim() || sending) return;
    const tid = activeId;
    const content = draft;
    setDrafts((d) => ({ ...d, [tid]: "" }));
    pinnedRef.current = true;
    setAtBottom(true);
    if (editing) {
      const target = editing;
      setEditing(null);
      void editAndResend(tid, target, content, model, effort);
    } else {
      void send(tid, content, model, effort);
    }
  };

  const pickCard = (value: string) => {
    if (!activeId || sending || readOnly) return;
    void send(activeId, value, model, effort);
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
  // Welcome / empty states center themselves in the column; transcripts flow top-down.
  const centered = !activeThread || !!showWelcome;

  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden lg:-mx-8">
      {/* Thread rail — width-animated collapse; stays mounted so its search
          and menus keep their state across toggles. */}
      <div
        className={cn(
          "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
          collapsed ? "w-0" : "w-72",
        )}
      >
        <ChatThreadRail
          threads={threads}
          activeId={activeId}
          domains={domains}
          creating={creating}
          readOnly={readOnly}
          onSelect={setActiveId}
          onToggleCollapsed={() => setCollapsed(true)}
          onNew={handleNew}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>

      <main className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--bg)]">
        {/* Conversation header — chromeless until the transcript scrolls under it. */}
        <header
          className={cn(
            "z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-[var(--bg)] px-4 transition-colors duration-200",
            scrolled ? "border-[var(--border)]" : "border-transparent",
          )}
        >
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Show chats"
              className="-ml-1 inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <h1 className="truncate text-sm font-semibold">
              {activeThread ? threadDisplayTitle(activeThread) : "Chat"}
            </h1>
            {activeThread && (
              <span className="inline-flex min-w-0 max-w-56 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]" aria-hidden />
                <span className="truncate">{activeThread.scope.label}</span>
              </span>
            )}
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => void handleNew({ scope_kind: "org" })}
              disabled={creating}
              aria-label="New chat"
              title="New chat"
              className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              <SquarePen className="size-4" />
            </button>
          )}
        </header>

        {/* Conversation body — scrolls under the floating composer. */}
        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6",
              centered ? "flex min-h-full flex-col justify-center pb-48" : "pb-44",
            )}
          >
            {!activeThread ? (
              loadingThread ? (
                <ConversationSkeleton />
              ) : (
                <EmptyWorkspace hasThreads={threads.length > 0} readOnly={readOnly} onNew={() => void handleNew({ scope_kind: "org" })} creating={creating} />
              )
            ) : loadingThread ? (
              <ConversationSkeleton />
            ) : (
              <div className={cn(!showWelcome && "space-y-6")}>
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
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
                    <span className="min-w-0 truncate">{failedTurn.message}</span>
                    <button
                      type="button"
                      onClick={() => activeId && void retry(activeId)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--danger)] px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <RotateCcw className="size-3" /> Retry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Floating composer — messages fade out underneath it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          {!atBottom && activeThread && messages.length > 0 && !loadingThread && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={jumpToLatest}
                className="animate-pop-in pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] shadow-[var(--shadow-2)] transition-[color,box-shadow] duration-150 hover:text-[var(--text)] hover:shadow-[var(--shadow-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <ArrowDown className="size-3.5" /> Latest
              </button>
            </div>
          )}
          <div className="h-10 bg-gradient-to-t from-[var(--bg)] to-transparent" aria-hidden />
          <div className="bg-[var(--bg)]">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
              {readOnly ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-center text-xs text-[var(--text-muted)]">
                  Demo mode — chat compose is disabled. Browse the precomputed conversations.
                </div>
              ) : (
                <>
                  {models.find(
                    (m) =>
                      m.source === "subscription" &&
                      m.provider === model?.provider &&
                      m.id === model?.model,
                  ) && (
                    <p
                      role="status"
                      className="mb-1.5 px-1 text-[11px] text-[var(--text-subtle)]"
                    >
                      Using your subscription — answers come from the
                      conversation only; this model can&apos;t browse workspace
                      knowledge.
                    </p>
                  )}
                <ChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSend={onSend}
                  onStop={abort}
                  sending={sending}
                  stopping={stopping}
                  disabled={!activeId}
                  editing={!!editing}
                  onCancelEdit={() => {
                    setEditing(null);
                    setDraft("");
                  }}
                  autoFocusKey={activeId ?? ""}
                  placeholder={activeThread ? `Message Athena about ${activeThread.scope.label}…` : "Pick or start a chat first"}
                  accessories={
                    <>
                      <EffortSelector value={effort} onChange={setEffort} disabled={sending} className={PICKER_GHOST} />
                      {models.length > 0 && (
                        <ModelSelector
                          models={models}
                          value={model}
                          onChange={setModel}
                          disabled={sending}
                          className={PICKER_GHOST}
                          includeSubscription
                          subscriptionGrounded={subscriptionGrounded}
                        />
                      )}
                    </>
                  }
                />
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <CitationDrawer
        open={citation !== null}
        source={citation?.source ?? null}
        refValue={citation?.ref ?? null}
        label={citation?.label ?? null}
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
  onCitation: (source: CitationSource, ref: string, label?: string) => void;
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
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <ActorAvatar name="Athena" agent size={64} mood="happy" />
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Chat with Athena</h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
          Ask about any domain or your whole org. Athena cites its sources and can spin a task out of the conversation.
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-sm font-medium text-[var(--primary-fg)] shadow-[var(--shadow-cta)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
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
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <ActorAvatar name="Athena" agent size={56} mood="happy" />
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Ask anything about {scopeLabel}</h2>
        <p className="text-sm text-[var(--text-muted)]">Answers cite your knowledge graph and repos.</p>
      </div>
      {!readOnly && (
        <div className="flex w-full max-w-md flex-col gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-left text-sm text-[var(--text-muted)] transition-[border-color,background-color,color] duration-150 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <span className="min-w-0">{p}</span>
              <SquarePen className="size-3.5 shrink-0 text-[var(--text-subtle)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden />
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
    <div className="space-y-6 pt-4" aria-busy="true" aria-label="Loading conversation">
      <div className="flex justify-end">
        <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
      </div>
      <div className="flex gap-3">
        <div className="size-7 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-16 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-8 w-2/5 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
      </div>
    </div>
  );
}
