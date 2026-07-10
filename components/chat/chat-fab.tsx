"use client";

/**
 * ChatFab - the global "Ask Athena about this page" assistant.
 *
 * A floating launcher pinned bottom-right of every authenticated page; opening
 * it docks a compact chat panel that knows what page you are on. When you ask,
 * Athena reads the screen - the whole viewport edge-glows for a beat while the
 * page is snapshotted (`usePageContext().capture()`) - then answers with the
 * full chat toolbelt (knowledge retrieval, citations, task proposals). The
 * snapshot rides each turn transiently (BE `page_context`); it is never
 * persisted, so the visible transcript stays clean.
 *
 * It reuses the same engine as `/chat` (`useChatTurn` + `ChatComposer` +
 * `ChatMessage`), so it inherits streaming, stop, retry, attachments, model /
 * effort pickers, citations, and proposal cards for free. One org-scoped
 * thread is created lazily on first send and reused across navigation - the
 * page precision comes per-message from `page_context`, so a single thread
 * still answers accurately about every page. The full transcript is always one
 * tap away via "Open full chat".
 *
 * Hidden on `/chat` (the full surface is already there) and `/onboarding`.
 * Disabled in demo/mock mode, mirroring the read-only `/chat` page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, ExternalLink, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type ChatMessage,
  type EnabledModel,
  type ModelSelection,
  type Task,
  type TaskProposalPayload,
} from "@/lib/api/client";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/SessionProvider";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import { useChatTurn } from "@/features/chat/use-chat-turn";
import { useChatFabStore } from "@/lib/stores/chat-fab";
import { usePageContext } from "@/hooks/use-page-context";
import { ScreenReadingGlow } from "@/components/chat/screen-reading-glow";
import { ChatComposer, COMPOSER_PICKER_CLASS } from "@/components/chat/chat-composer";
import { ChatMessage as ChatMessageRow } from "@/components/chat/chat-message";
import { ChatActivity } from "@/components/chat/chat-activity";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { ReasoningPanel } from "@/components/chat/reasoning-panel";
import { EffortSelector } from "@/components/ui/effort-selector";
import { focusRing } from "@/components/ui/focus";
import { ModelSelector } from "@/components/ui/model-selector";
import { AttachmentButton, AttachmentChips, useAttachmentDrafts } from "@/components/ui/attachment-picker";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { CitationDrawer } from "@/components/runs/citations/citation-drawer";
import type { CitationSource } from "@/components/runs/citations/citation-chip";
import { NewTaskDialog, type NewTaskDefaults } from "@/components/work/new-task-dialog";

/** How long the "reading the screen" scan beat plays before the turn fires.
 *  Long enough to read as intentional, short enough to feel instant. Skipped
 *  under prefers-reduced-motion. */
const READ_BEAT_MS = 650;
/** How close to the bottom (px) still counts as pinned to the latest. */
const PIN_THRESHOLD = 80;

const EXAMPLE_PROMPTS = [
  "What is this page showing me?",
  "Explain the key things here.",
  "What should I look at next?",
];

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function isHiddenRoute(pathname: string): boolean {
  return (
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/onboarding")
  );
}

/** Auth + route gate. The heavy chat state lives in <ChatFabSurface/> so it
 *  never mounts on the surfaces where the FAB is hidden. */
export function ChatFab() {
  const { status } = useSession();
  const pathname = usePathname() ?? "/";
  if (status !== "authenticated" || isHiddenRoute(pathname)) return null;
  return <ChatFabSurface />;
}

function ChatFabSurface() {
  const open = useChatFabStore((s) => s.open);
  const close = useChatFabStore((s) => s.close);
  const toggle = useChatFabStore((s) => s.toggle);

  const router = useRouter();
  const { me } = useSession();
  const subscriptionGrounded = me?.features.subscriptionMcpBridge ?? false;
  const readOnly = config.isMock;

  const { label, capture } = usePageContext();

  const {
    messages,
    sending,
    stopping,
    streaming,
    failedTurn,
    setMessages,
    send,
    retry,
    editAndResend,
    stop,
    detach,
  } = useChatTurn();

  // One org-scoped thread, created lazily on first send and reused across
  // navigation; page precision rides per-message via page_context.
  const threadIdRef = useRef<string | null>(null);

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [models, setModels] = useState<EnabledModel[]>([]);
  const [model, setModel] = useState<ModelSelection | null>(null);
  const [effort, setEffort] = usePersistedEffort("chat");
  const modelsLoadedRef = useRef(false);

  // The screen-reading glow: `reading` holds for the whole turn; `beat` is the
  // brighter initial scan while the snapshot is taken.
  const [reading, setReading] = useState(false);
  const [beat, setBeat] = useState(false);

  // One hoisted citation drawer shared by every chip in the panel.
  const [citation, setCitation] = useState<{ source: CitationSource; ref: string; label?: string } | null>(null);
  const openCitation = useCallback((source: CitationSource, refValue: string, lbl?: string) => {
    setCitation(lbl ? { source, ref: refValue, label: lbl } : { source, ref: refValue });
  }, []);

  // Task-proposal "Start task" opens the New-task dialog in place, pre-filled.
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDefaults, setTaskDefaults] = useState<NewTaskDefaults | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  // Attachments: images need a vision-capable model; documents always work.
  const selectedSpec = model
    ? models.find((mm) => mm.provider === model.provider && mm.id === model.model)
    : undefined;
  const canAttachImages = selectedSpec?.supports_vision ?? false;
  const {
    addFiles: addAttachments,
    remove: removeAttachment,
    clear: clearAttachments,
    drafts: attachmentDrafts,
    readyIds: attachmentReadyIds,
    pending: attachPending,
    hasReadyImage,
  } = useAttachmentDrafts({ canAttachImages });

  // Load the org's enabled models the first time the panel opens (not on every
  // page mount). Default to a workspace-capable model; restore the saved pick.
  useEffect(() => {
    if (!open || readOnly || modelsLoadedRef.current) return;
    modelsLoadedRef.current = true;
    (async () => {
      try {
        const ms = await api.models.enabled();
        const enabled = ms.filter((m) => m.enabled);
        setModels(enabled);
        const restored = restoreModelSelection("chat", enabled);
        const preferred = enabled.find((m) => m.source !== "subscription") ?? enabled[0];
        if (restored) setModel(restored);
        else if (preferred)
          setModel({ provider: preferred.provider, model: preferred.id, source: preferred.source });
      } catch {
        /* the composer still works on the platform default with no picker */
      }
    })();
  }, [open, readOnly]);

  // Close on Escape (the panel is a docked popover, not a focus-trapping modal,
  // so the page stays interactive while it is open).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Cmd/Ctrl+J toggles the assistant from anywhere (the command palette owns
  // Cmd/Ctrl+K, so this is a distinct, non-colliding chord).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Keep pinned to the latest message / token unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, open]);

  // Close the local event feed on unmount - the turn keeps running
  // server-side and its answer lands in the thread.
  useEffect(() => () => detach(), [detach]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD;
    pinnedRef.current = nearBottom;
    setAtBottom(nearBottom);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const ensureThread = useCallback(async (): Promise<string> => {
    if (threadIdRef.current) return threadIdRef.current;
    const { thread } = await api.chat.createThread({ title: "Page assistant", scope_kind: "org" });
    threadIdRef.current = thread.id;
    return thread.id;
  }, []);

  const runTurn = useCallback(
    async (content: string, attachmentIds: string[], editTarget: ChatMessage | null) => {
      // Snapshot the page the user is asking from, right now.
      const pageContext = capture();
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

      pinnedRef.current = true;
      setAtBottom(true);
      setReading(true);
      setBeat(!reduce);
      try {
        const [tid] = await Promise.all([
          ensureThread(),
          reduce ? Promise.resolve() : sleep(READ_BEAT_MS),
        ]);
        setBeat(false);
        if (editTarget) {
          await editAndResend(tid, editTarget, content, model, effort, attachmentIds, pageContext);
        } else {
          await send(tid, content, model, effort, attachmentIds, pageContext);
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't reach Athena.");
        setDraft(content); // don't lose the message if the thread couldn't start
      } finally {
        setReading(false);
        setBeat(false);
      }
    },
    [capture, ensureThread, editAndResend, send, model, effort],
  );

  const onSend = () => {
    if (readOnly || sending) return;
    const content = draft.trim();
    const attachmentIds = attachmentReadyIds;
    if (!content && attachmentIds.length === 0) return;
    if (attachPending || (hasReadyImage && !canAttachImages)) return;
    const target = editing;
    setEditing(null);
    setDraft("");
    clearAttachments();
    void runTurn(content, attachmentIds, target);
  };

  const pickCard = (value: string) => {
    if (readOnly || sending) return;
    void runTurn(value, [], null);
  };

  const beginEdit = (m: ChatMessage) => {
    if (sending) return;
    setEditing(m);
    setDraft(m.content);
  };

  const startTaskFromProposal = useCallback((proposal: TaskProposalPayload) => {
    setTaskDefaults({
      type: proposal.type,
      title: proposal.title,
      body: proposal.goal,
      ...(proposal.domain_id ? { domain_id: proposal.domain_id } : {}),
    });
    setTaskDialogOpen(true);
  }, []);

  const onTaskCreated = useCallback(
    (task: Task) => {
      setTaskDialogOpen(false);
      close();
      router.push(`/work/${task.id}`);
    },
    [close, router],
  );

  const dismissProposal = useCallback(
    async (messageId: string) => {
      const tid = threadIdRef.current;
      if (!tid) return;
      const prev = messages;
      setMessages((cur) => cur.filter((m) => m.id !== messageId));
      try {
        await api.chat.dismissProposal(tid, messageId);
      } catch (e) {
        setMessages(prev);
        toast.error(e instanceof ApiError ? e.message : "Couldn't dismiss the suggestion.");
      }
    },
    [messages, setMessages],
  );

  const hasConversation = messages.length > 0 || sending || !!failedTurn;
  const busyClosed = !open && sending;

  return (
    <>
      <ScreenReadingGlow active={reading} reading={beat} />

      {/* Launcher - pinned bottom-right of every authenticated page. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Close Athena assistant" : "Ask Athena about this page"}
        aria-expanded={open}
        title={open ? "Close" : "Ask Athena about this page"}
        className={cn(
          "athena-fab fixed bottom-5 right-5 z-[var(--z-overlay)] inline-flex size-14 items-center justify-center rounded-full",
          "bg-[var(--primary)] text-[var(--primary-fg)] shadow-[var(--shadow-cta)]",
          "transition-[transform,box-shadow] duration-200 ease-out hover:scale-[1.06]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          busyClosed && "athena-fab-busy",
        )}
      >
        {open ? <X className="size-6" /> : <OwlAvatar size={30} mood="happy" />}
        {busyClosed && (
          <span
            className="star-dot is-live absolute -right-0.5 -top-0.5 ring-2 ring-[var(--bg)]"
            style={{ "--dot-color": "var(--ring)" } as React.CSSProperties}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <section
          aria-label="Athena page assistant"
          className="athena-fab-panel animate-fab-panel-in glass-panel fixed bottom-24 right-5 z-[var(--z-overlay)] flex flex-col overflow-hidden !rounded-2xl"
        >
          {/* Header */}
          <header className="relative flex items-center gap-2 px-3 py-2.5">
            <hr className="hr-horizon absolute inset-x-0 bottom-0" aria-hidden />
            <OwlAvatar size={24} mood={sending ? "thinking" : "happy"} static />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text)]">Ask about this page</div>
              <div className="text-micro flex items-center gap-1.5 text-[var(--text-muted)]">
                <span
                  className="star-dot shrink-0"
                  style={{ "--dot-color": "var(--primary)" } as React.CSSProperties}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </div>
            </div>
            <Link
              href="/chat"
              onClick={() => close()}
              aria-label="Open full chat"
              title="Open full chat"
              className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <ExternalLink className="size-4" />
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              title="Close"
              className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="size-4" />
            </button>
          </header>

          {/* Transcript */}
          <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!hasConversation ? (
              <Welcome readOnly={readOnly} onPick={(p) => setDraft(p)} />
            ) : (
              <div className="space-y-5">
                {messages.map((m, i) => (
                  <ChatMessageRow
                    key={m.id}
                    message={m}
                    onCitationOpen={openCitation}
                    onEdit={beginEdit}
                    editDisabled={sending}
                    onPickClarification={pickCard}
                    cardsDisabled={sending || i !== messages.length - 1}
                    onStartProposal={startTaskFromProposal}
                    onDismissProposal={dismissProposal}
                  />
                ))}

                {sending && streaming && (
                  <div className="flex gap-2.5">
                    <ActorAvatar name="Athena" agent size={24} mood="thinking" className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="text-xs font-semibold text-[var(--text)]">Athena</div>
                      <ChatActivity turn={streaming} />
                      {streaming.reasoning && <ReasoningPanel reasoning={streaming.reasoning} defaultOpen />}
                      {streaming.text && <ChatMarkdown content={streaming.text} onCitation={openCitation} />}
                    </div>
                  </div>
                )}

                {failedTurn && !sending && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
                    <span className="min-w-0 truncate">{failedTurn.message}</span>
                    <button
                      type="button"
                      onClick={() => threadIdRef.current && void retry(threadIdRef.current)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-strong)] px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--surface)]",
                        focusRing,
                      )}
                    >
                      <RotateCcw className="size-3" /> Retry
                    </button>
                  </div>
                )}
              </div>
            )}

            {!atBottom && hasConversation && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="animate-pop-in sticky bottom-0 left-1/2 z-10 mx-auto flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] shadow-[var(--shadow-2)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <ArrowDown className="size-3.5" /> Latest
              </button>
            )}
          </div>

          {/* Composer */}
          <div className="relative p-2.5">
            <hr className="hr-horizon absolute inset-x-0 top-0" aria-hidden />
            {readOnly ? (
              <div className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-center text-xs text-[var(--text-muted)]">
                Demo mode - the page assistant is available in the live app.
              </div>
            ) : (
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSend={onSend}
                onStop={() => threadIdRef.current && stop(threadIdRef.current)}
                sending={sending}
                stopping={stopping}
                editing={!!editing}
                onCancelEdit={() => {
                  setEditing(null);
                  setDraft("");
                }}
                autoFocusKey={open ? "fab-open" : ""}
                placeholder={`Ask about ${label}…`}
                onPaste={(e) => {
                  const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
                  if (imgs.length) addAttachments(imgs);
                }}
                attachmentBar={<AttachmentChips drafts={attachmentDrafts} onRemove={removeAttachment} />}
                canSendWithoutText={attachmentReadyIds.length > 0}
                sendBlocked={attachPending || (hasReadyImage && !canAttachImages)}
                sendBlockedTitle={
                  attachPending
                    ? "Waiting for uploads to finish…"
                    : "This model can't read images - remove them or pick a vision model."
                }
                accessories={
                  <>
                    <AttachmentButton
                      onFiles={addAttachments}
                      canAttachImages={canAttachImages}
                      disabled={sending || readOnly}
                    />
                    <EffortSelector value={effort} onChange={setEffort} disabled={sending} className={COMPOSER_PICKER_CLASS} />
                    {models.length > 0 && (
                      <ModelSelector
                        models={models}
                        value={model}
                        onChange={(m) => {
                          setModel(m);
                          storeModel("chat", m);
                        }}
                        disabled={sending}
                        className={COMPOSER_PICKER_CLASS}
                        includeSubscription
                        subscriptionGrounded={subscriptionGrounded}
                      />
                    )}
                  </>
                }
              />
            )}
          </div>
        </section>
      )}

      <CitationDrawer
        open={citation !== null}
        source={citation?.source ?? null}
        refValue={citation?.ref ?? null}
        label={citation?.label ?? null}
        onClose={() => setCitation(null)}
      />

      <NewTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        onCreated={onTaskCreated}
        defaults={taskDefaults}
      />
    </>
  );
}

/** Empty state - shown until the first turn. Sophia + a one-line pitch + a few
 *  page-agnostic starter prompts that seed the composer. */
function Welcome({ readOnly, onPick }: { readOnly: boolean; onPick: (p: string) => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden rounded-xl px-2 text-center">
      <div className="starfield" aria-hidden />
      <OwlAvatar size={56} mood="waiting" className="relative" />
      <div className="relative space-y-1">
        <h2 className="text-base font-semibold text-[var(--text)]">Ask anything about this page</h2>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          Athena reads what is on screen, then answers from your org knowledge - and can spin a task out of the conversation.
        </p>
      </div>
      {!readOnly && (
        <div className="relative flex w-full flex-col gap-1.5">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className={cn(
                "group flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs text-[var(--text-muted)] transition-[border-color,background-color,color] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                focusRing,
              )}
            >
              <span className="min-w-0">{p}</span>
              <Sparkles
                className="size-3 shrink-0 text-[var(--text-subtle)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                aria-hidden
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
