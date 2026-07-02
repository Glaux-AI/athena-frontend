"use client";

/**
 * /chat - scope-aware conversations with Athena.
 *
 * Layout (2026-06-12 redesign - matches the /dashboard ask stage): one open,
 * full-height canvas. Threads live behind a corner History button that opens
 * a slide-in overlay drawer (scrim + panel) instead of a persistent rail -
 * the conversation always gets the full width. The whole canvas sits on the
 * same subtle ambient light as the home stage (always on, for continuity);
 * empty/welcome states add the rest of home's language (Sophia + gradient
 * heading). The centered conversation
 * column has a floating composer card at the bottom - the same
 * `<ChatComposer>` frame as home - and messages scroll under it through a
 * soft fade. The header stays chromeless until the conversation scrolls.
 *
 * Home handoff: a draft sent from /dashboard arrives in memory
 * (`lib/chat/draft-handoff.ts`); while its new org thread spins up we render
 * a ghost of the just-sent user bubble (rising in, continuing home's exit
 * motion) so the route change reads as one continuous surface, then the real
 * optimistic turn takes over. Replies stream in live - a status + tool panel
 * while Athena works, the answer typing in below it - then settle into the
 * persisted message with citations and a collapsed tool recap. Auto-scroll
 * pins to the latest token only while the reader is near the bottom.
 *
 * In demo mode (`config.isMock`) compose + thread writes are disabled and a
 * banner replaces the composer; the precomputed conversations stay browsable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, History, Plus, RotateCcw, Share2, SquarePen, X } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type Agent,
  type AgentExecution,
  type Domain,
  type ChatMessage,
  type ChatThread,
  type EnabledModel,
  type IncomingShare,
  type ModelSelection,
  type SharedThreadDetail,
  type Task,
  type TaskProposalPayload,
} from "@/lib/api/client";
import { NewTaskDialog, type NewTaskDefaults } from "@/components/work/new-task-dialog";
import { AgentRunGroup } from "@/components/chat/agent-activity/agent-run-chip";
import { AgentActivityDrawer } from "@/components/chat/agent-activity/agent-activity-drawer";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";
import { consumeChatDraftHandoff, peekChatDraftHandoff, type ChatDraftHandoff } from "@/lib/chat/draft-handoff";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import { useSession } from "@/lib/session/SessionProvider";
import { useChatTurn } from "@/features/chat/use-chat-turn";
import { useChatMascot } from "@/features/mascot/use-mascot-activity";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { AgentSelector } from "@/components/ui/agent-selector";
import { ChatThreadRail, threadDisplayTitle, type NewChatScope } from "@/components/chat/chat-thread-rail";
import { ChatMessage as ChatMessageRow } from "@/components/chat/chat-message";
import { ShareThreadDialog } from "@/components/chat/share-thread-dialog";
import { SharedThreadView } from "@/components/chat/shared-thread-view";
import { PinnedPanel } from "@/components/chat/pinned-panel";
import { ChatActivity } from "@/components/chat/chat-activity";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { ReasoningPanel } from "@/components/chat/reasoning-panel";
import { ChatComposer, COMPOSER_PICKER_CLASS } from "@/components/chat/chat-composer";
import { AttachmentChips, useAttachmentDrafts } from "@/components/ui/attachment-picker";
import { ComposerActionsMenu } from "@/components/ui/composer-actions";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { CitationDrawer } from "@/components/runs/citations/citation-drawer";
import type { CitationSource } from "@/components/runs/citations/citation-chip";

// Each one maps to a capability the agent actually has today (the shared
// kb-navigation catalog + chat's action tools): #1 → retrieval ladder +
// blueprints; #2 → recent_code_changes (drill-down live commit history,
// chat.v23) + query_org(activity); #3 → KB-grounded drafting + propose_task.
const EXAMPLE_PROMPTS = [
  "What does this scope do, and where does the core logic live?",
  "What changed here recently?",
  "Draft a short PRD for an improvement you'd prioritize.",
];

/** How close to the bottom (px) still counts as "reading the latest". */
const PIN_THRESHOLD = 96;

export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [creating, setCreating] = useState(false);
  // Threads drawer - hidden behind the corner History button; overlays the
  // conversation when open instead of claiming a persistent rail.
  const [railOpen, setRailOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [models, setModels] = useState<EnabledModel[]>([]);
  const [model, setModel] = useState<ModelSelection | null>(null);
  // Custom agents the user may pick for a turn (Agent Registry), and the
  // current pick. Per-turn like the model/effort dials; selecting one pre-fills
  // the model with the agent's pinned model (the sent model still wins).
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  // Async sub-agent runs spawned in this thread (Agent Registry agent-to-agent).
  // Live chips under the spawning message; the drawer shows one run in detail.
  const [executions, setExecutions] = useState<AgentExecution[]>([]);
  const [openExecId, setOpenExecId] = useState<string | null>(null);
  // A draft carried over from the home (/dashboard) composer - sent into a
  // fresh org-scoped thread once that thread's transcript has settled. Set
  // the moment it's consumed (before the thread exists) so the ghost bubble
  // bridges the route change.
  const [pendingHandoff, setPendingHandoff] = useState<ChatDraftHandoff | null>(null);
  // Whether this mount is the landing half of the home→chat handoff (known
  // from the very first render, before the init effect consumes the draft).
  // The composer then skips its rise-in: home's exit glide already delivered
  // it to this exact spot, and re-animating it reads as a stutter.
  const [arrivedViaHandoff] = useState(
    () => !config.isMock && peekChatDraftHandoff() !== null,
  );
  // How hard Athena works this turn (tool budget + reasoning depth). Flow
  // content, not plumbing - always shown next to the model pick; balanced
  // default, and the pick is remembered across refreshes (run-prefs).
  const [effort, setEffort] = usePersistedEffort("chat");
  // Per-turn "Web search" toggle from the composer "+" menu (session-only).
  const [webSearch, setWebSearch] = useState(false);
  // Sharable threads: shares delivered to me ("Shared with me"), the share
  // dialog target thread, and the open read-only shared snapshot (a frozen
  // copy a teammate sent - imported into an owned thread to continue).
  const [incoming, setIncoming] = useState<IncomingShare[]>([]);
  const [shareForThreadId, setShareForThreadId] = useState<string | null>(null);
  const [sharedView, setSharedView] = useState<SharedThreadDetail | null>(null);
  const [loadingShared, setLoadingShared] = useState(false);
  const [importingShare, setImportingShare] = useState(false);
  // This thread's pinned AI answers (independent of the loaded history window),
  // surfaced in the header's "Pinned" panel.
  const [pins, setPins] = useState<ChatMessage[]>([]);

  const {
    messages, setMessages, hydrate, sending, stopping, streaming, failedTurn,
    queue, removeQueued, takeQueued, sendQueuedNow, send, retry, editAndResend,
    stop, detach,
  } = useChatTurn();
  // Drive the TopBar Sophia owl from the live chat turn - thinking / reading /
  // writing while Athena answers, working on tool calls, focused on a failure.
  useChatMascot({ streaming, sending, failedTurn });
  const router = useRouter();
  // A chat task-proposal card's "Start task" opens the New-task dialog in place
  // (over the chat), pre-filled from the proposal - no navigation away.
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDefaults, setTaskDefaults] = useState<NewTaskDefaults | null>(null);
  // Subscription models gain workspace grounding when the deployment runs
  // the MCP bridge - the picker's "Your plan" footnote says which.
  const { me, activeOrgId } = useSession();

  // --- Async sub-agent runs (agent-to-agent) ------------------------------- #
  const customAgentsEnabled = me?.features.customAgents === true;
  const execThreadId = activeThread?.id ?? null;
  const refreshExecutions = useCallback(async () => {
    if (!customAgentsEnabled || !execThreadId) {
      setExecutions([]);
      return;
    }
    try {
      setExecutions(await api.agentExecutions.list(execThreadId));
    } catch {
      // Best-effort: the chips simply don't show on a transient failure.
    }
  }, [customAgentsEnabled, execThreadId]);
  useEffect(() => {
    void refreshExecutions();
  }, [refreshExecutions]);
  // Poll while any run is active so the inline chips stay live (the open run's
  // drawer has its own SSE feed).
  const hasActiveRun = executions.some(
    (e) => !["completed", "failed", "cancelled"].includes(e.status),
  );
  useEffect(() => {
    if (!hasActiveRun) return;
    const t = setInterval(() => void refreshExecutions(), 3000);
    return () => clearInterval(t);
  }, [hasActiveRun, refreshExecutions]);
  const execByMessage = executions.reduce<Record<string, AgentExecution[]>>(
    (acc, e) => {
      const key = e.parent_message_id;
      if (!key) return acc;
      (acc[key] ??= []).push(e);
      return acc;
    },
    {},
  );
  const openExecution = openExecId
    ? executions.find((e) => e.id === openExecId) ?? null
    : null;
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

  // Attachments: images need a vision-capable model pick; documents always
  // work. The picker reads `canAttachImages` to gate the image path.
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

  // Drop leftover attachments when the user switches threads.
  useEffect(() => clearAttachments(), [activeId, clearAttachments]);

  // "Shared with me" + per-thread pins - best-effort refreshes (a transient
  // failure just leaves the list as-is). Skipped in demo mode.
  const refreshIncoming = useCallback(async () => {
    if (readOnly) return;
    try {
      setIncoming(await api.chat.listIncomingShares());
    } catch {
      /* best-effort */
    }
  }, [readOnly]);
  useEffect(() => {
    void refreshIncoming();
  }, [refreshIncoming]);

  const refreshPins = useCallback(async () => {
    if (readOnly || !activeId) {
      setPins([]);
      return;
    }
    try {
      setPins(await api.chat.listPins(activeId));
    } catch {
      /* best-effort */
    }
  }, [readOnly, activeId]);
  useEffect(() => {
    void refreshPins();
  }, [refreshPins]);

  // Pasted images go straight into the picker (text paste is untouched).
  const onPasteAttach = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (imgs.length) addAttachments(imgs);
  };

  // The mount-once init below does two non-idempotent things: it consumes the
  // one-shot home handoff and, for a handoff, creates a thread. React
  // StrictMode (dev, `reactStrictMode` in next.config) double-invokes mount
  // effects, which would run init twice - the second pass (handoff already
  // consumed) takes the `else` branch and switches activeId to an existing
  // thread, racing the first pass and landing the draft in the wrong thread.
  // This ref keeps init strictly once (a no-op in production, where mount
  // effects already run once).
  const didInitRef = useRef(false);

  // Initial load: threads + domains (for the new-chat scope picker) + the
  // org's enabled models (the composer model picker; default to the first one,
  // null = the Athena-hosted platform default).
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    // Home-composer handoff: surface the ghost bubble immediately (before any
    // network round-trip) so the home→chat motion never shows a blank frame.
    // Demo mode never consumes it (compose disabled).
    const handoff = config.isMock ? null : consumeChatDraftHandoff();
    if (handoff) setPendingHandoff(handoff);
    (async () => {
      try {
        const [ts, caps, ms, ags] = await Promise.all([
          api.chat.listThreads(),
          api.domains.list().catch(() => [] as Domain[]),
          api.models.enabled().catch(() => [] as EnabledModel[]),
          api.agents.list().catch(() => [] as Agent[]),
        ]);
        setThreads(ts);
        setDomains(caps);
        setAgents(ags);
        const enabled = ms.filter((m) => m.enabled);
        setModels(enabled);
        // The remembered pick wins when it's still offered (same rung);
        // otherwise default to a workspace-capable model - a subscription
        // model (chat-only, no workspace tools) must be an explicit pick.
        const restored = restoreModelSelection("chat", enabled);
        const preferred =
          enabled.find((m) => m.source !== "subscription") ?? enabled[0];
        if (restored) setModel(restored);
        else if (preferred)
          setModel({
            provider: preferred.provider,
            model: preferred.id,
            source: preferred.source,
          });
        const first = ts[0];
        if (handoff) {
          // Start a fresh org-scoped thread; the pending-handoff effect below
          // sends the draft once the thread's transcript settles. Set
          // activeThread optimistically from the just-created row so the send
          // does NOT depend on the transcript-load round-trip succeeding - if
          // that GET fails (network blip / token-refresh race right after
          // navigation), activeThread still lands and the typed message +
          // attachments are sent instead of the ghost sticking forever.
          try {
            const { thread } = await api.chat.createThread({ title: "New chat", scope_kind: "org" });
            setThreads([thread, ...ts]);
            setActiveThread(thread);
            // Mark the transcript load in-flight ATOMICALLY with the activeId
            // switch. The transcript-load effect sets loadingThread too, but the
            // handoff-send effect re-runs in the SAME commit as this id change
            // and would otherwise read the initial `false`, fire send() before
            // the (empty) transcript settles, and then have its stream aborted +
            // its optimistic turn wiped by that load's hydrate() - the bug that
            // left an empty chat with the message lost. Setting it true here
            // holds send() back until the load actually finishes.
            setLoadingThread(true);
            setActiveId(thread.id);
          } catch {
            // Couldn't start the thread - keep the typed message in the most
            // recent chat's composer rather than losing it.
            setPendingHandoff(null);
            toast.error("Couldn't start a new chat.");
            if (first) {
              setActiveId(first.id);
              setDrafts((d) => ({ ...d, [first.id]: handoff.content }));
            }
          }
        } else {
          // Inbox deep-link: /chat?thread=<id> (a mention) opens that thread;
          // otherwise default to the most recent. A thread the caller can't
          // open fails the transcript load gracefully (toast), never a 404.
          const deepThreadId =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("thread")
              : null;
          if (deepThreadId) setActiveId(deepThreadId);
          else if (first) setActiveId(first.id);
        }
      } catch {
        // Empty state covers the failure - and the handoff ghost must not
        // outlive a dead init (its thread will never arrive).
        setPendingHandoff(null);
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
        // Reattach to a still-running turn: its event feed replays everything
        // missed, so the partial answer rebuilds exactly where it left off.
        hydrate(detail.messages, detail.active_turn ?? null);
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

  // Send the home-composer handoff once its new thread's (empty) transcript
  // has settled - sending earlier would race the thread-load effect, whose
  // hydrate() aborts in-flight streams.
  useEffect(() => {
    if (!pendingHandoff || !activeThread || loadingThread || sending) return;
    const h = pendingHandoff;
    setPendingHandoff(null);
    pinnedRef.current = true;
    setAtBottom(true);
    // Send with the home composer's OWN model/effort/attachments (carried in
    // the handoff), not chat's async-restored state - so an attached image
    // never races onto a default/non-vision model before the pick restores.
    if (h.webSearch) setWebSearch(true); // keep the toggle armed for follow-ups
    if (h.agentId) setAgentId(h.agentId); // keep the agent armed for follow-ups
    void send(activeThread.id, h.content, h.model, h.effort, h.attachmentIds, null, h.webSearch, h.agentId ?? null);
  }, [pendingHandoff, activeThread, loadingThread, sending, send]);

  // A thread switch always lands pinned to its latest message.
  useEffect(() => {
    pinnedRef.current = true;
    setAtBottom(true);
    setScrolled(false);
  }, [activeId]);

  // Keep pinned to the latest message / streamed token - unless the reader
  // scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, loadingThread, sending]);

  // The threads drawer closes on Escape, like any overlay.
  useEffect(() => {
    if (!railOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRailOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [railOpen]);

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

  // Close the local event feed on unmount - the turn keeps running
  // server-side and the next visit reattaches.
  useEffect(() => () => detach(), [detach]);

  const onSend = () => {
    if (!activeId) return;
    if (editing && sending) return; // edits apply only to a settled thread
    if (!draft.trim() && attachmentReadyIds.length === 0) return;
    if (attachPending || (hasReadyImage && !canAttachImages)) return;
    const tid = activeId;
    const content = draft;
    const attachmentIds = attachmentReadyIds;
    setDrafts((d) => ({ ...d, [tid]: "" }));
    clearAttachments();
    pinnedRef.current = true;
    setAtBottom(true);
    if (editing) {
      const target = editing;
      setEditing(null);
      void editAndResend(tid, target, content, model, effort, attachmentIds, null, webSearch, agentId);
    } else {
      void send(tid, content, model, effort, attachmentIds, null, webSearch, agentId);
    }
  };

  const pickCard = (value: string) => {
    if (!activeId || sending || readOnly) return;
    void send(activeId, value, model, effort);
  };

  // A proposal card's "Start task" → open the New-task dialog pre-filled. The
  // proposal already carries everything the form needs (type/title/goal/domain),
  // so we map it straight to the dialog defaults - no /work round-trip.
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
      router.push(`/work/${task.id}`);
    },
    [router],
  );

  // Decline a proposal: drop the card optimistically, then delete the row
  // server-side so it doesn't return on reload. Restore on failure.
  const dismissProposal = useCallback(
    async (messageId: string) => {
      if (!activeId) return;
      const prev = messages;
      setMessages((cur) => cur.filter((m) => m.id !== messageId));
      try {
        await api.chat.dismissProposal(activeId, messageId);
      } catch (e) {
        setMessages(prev);
        toast.error(e instanceof ApiError ? e.message : "Couldn't dismiss the suggestion.");
      }
    },
    [activeId, messages, setMessages],
  );

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

  // Open a shared snapshot read-only (from the rail or a `?shared=` deep-link).
  const openShared = useCallback(async (shareId: string) => {
    setRailOpen(false);
    setLoadingShared(true);
    try {
      setSharedView(await api.chat.getShare(shareId));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't open the shared chat.");
    } finally {
      setLoadingShared(false);
    }
  }, []);

  // "Continue in my chat": materialise a private owned copy, then switch to it
  // (the transcript-load effect hydrates it). Idempotent server-side.
  const importSharedNow = useCallback(async () => {
    if (!sharedView || importingShare) return;
    setImportingShare(true);
    try {
      const { thread } = await api.chat.importShare(sharedView.share_id);
      const ts = await api.chat.listThreads().catch(() => null);
      if (ts) setThreads(ts);
      else setThreads((cur) => [thread, ...cur.filter((t) => t.id !== thread.id)]);
      setSharedView(null);
      setActiveId(thread.id);
      void refreshIncoming();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't import the shared chat.");
    } finally {
      setImportingShare(false);
    }
  }, [sharedView, importingShare, refreshIncoming]);

  // One-shot inbox deep-link: /chat?shared=<id> opens the shared snapshot.
  useEffect(() => {
    if (readOnly || typeof window === "undefined") return;
    const sid = new URLSearchParams(window.location.search).get("shared");
    if (sid) void openShared(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin / unpin an assistant answer - optimistic, reconciled with the server
  // row + a pins refresh; reverted on failure.
  const pinMessage = useCallback(
    async (m: ChatMessage) => {
      if (!activeId) return;
      const stamp = new Date().toISOString();
      setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, pinned_at: stamp } : x)));
      try {
        const updated = await api.chat.pinMessage(activeId, m.id);
        setMessages((cur) => cur.map((x) => (x.id === m.id ? updated : x)));
        void refreshPins();
      } catch (e) {
        setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, pinned_at: null } : x)));
        toast.error(e instanceof ApiError ? e.message : "Couldn't pin the answer.");
      }
    },
    [activeId, setMessages, refreshPins],
  );

  const unpinMessage = useCallback(
    async (m: ChatMessage) => {
      if (!activeId) return;
      const prev = m.pinned_at ?? null;
      setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, pinned_at: null } : x)));
      setPins((cur) => cur.filter((x) => x.id !== m.id));
      try {
        const updated = await api.chat.unpinMessage(activeId, m.id);
        setMessages((cur) => cur.map((x) => (x.id === m.id ? updated : x)));
        void refreshPins();
      } catch (e) {
        setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, pinned_at: prev } : x)));
        void refreshPins();
        toast.error(e instanceof ApiError ? e.message : "Couldn't unpin the answer.");
      }
    },
    [activeId, setMessages, refreshPins],
  );

  const unpinById = useCallback(
    (messageId: string) => {
      const m = messages.find((x) => x.id === messageId) ?? pins.find((x) => x.id === messageId);
      if (m) void unpinMessage(m);
    },
    [messages, pins, unpinMessage],
  );

  // Scroll a pinned answer into view + briefly highlight it.
  const jumpToPin = useCallback((messageId: string) => {
    const el = document.getElementById(`chatmsg-${messageId}`);
    if (!el) {
      toast.message("That answer isn't loaded in this view.");
      return;
    }
    pinnedRef.current = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("animate-pin-flash");
    // Reflow so re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add("animate-pin-flash");
  }, []);

  const shareThreadTitle = shareForThreadId
    ? (() => {
        const t = threads.find((x) => x.id === shareForThreadId);
        return t ? threadDisplayTitle(t) : "this chat";
      })()
    : "this chat";

  const showWelcome = !loadingThread && activeThread && messages.length === 0 && !sending && !pendingHandoff;
  // Welcome / empty states center themselves in the column; transcripts (and
  // the handoff ghost) flow top-down.
  const centered = (!activeThread || !!showWelcome) && !pendingHandoff;

  return (
    <div className="relative -mx-6 -my-8 flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden lg:-mx-8">
      {/* Threads drawer - overlay panel behind the corner History button. */}
      {railOpen && (
        <>
          <div
            className="animate-overlay-in absolute inset-0 z-30 bg-[var(--overlay)] backdrop-blur-sm"
            onClick={() => setRailOpen(false)}
            aria-hidden
          />
          <div className="animate-panel-in-left absolute inset-y-0 left-0 z-40 shadow-[var(--shadow-3)]">
            <ChatThreadRail
              threads={threads}
              activeId={activeId}
              domains={domains}
              creating={creating}
              readOnly={readOnly}
              incoming={incoming}
              onSelect={(id) => {
                setSharedView(null);
                setActiveId(id);
                setRailOpen(false);
              }}
              onToggleCollapsed={() => setRailOpen(false)}
              onNew={(scope) => {
                setSharedView(null);
                setRailOpen(false);
                void handleNew(scope);
              }}
              onRename={handleRename}
              onDelete={handleDelete}
              onShare={(id) => {
                setRailOpen(false);
                setShareForThreadId(id);
              }}
              onOpenShared={(shareId) => void openShared(shareId)}
            />
          </div>
        </>
      )}

      <main className="relative isolate flex h-full min-w-0 flex-1 flex-col">
        {/* The same ambient light as the home stage, always on - /chat and
            /dashboard read as one continuous surface (fading it out per
            transcript made the canvas fall to flat --bg right as home handed
            over). `subtle` is the quiet two-pool variant, so transcripts stay
            within the intensity rule. */}
        <AmbientBackground variant="subtle" />

        {sharedView ? (
          <SharedThreadView
            share={sharedView}
            importing={importingShare}
            onImport={() => void importSharedNow()}
            onClose={() => setSharedView(null)}
            onCitationOpen={openCitation}
          />
        ) : loadingShared ? (
          <div className="flex h-full items-center justify-center px-4 sm:px-6">
            <div className="w-full max-w-3xl">
              <ConversationSkeleton />
            </div>
          </div>
        ) : (
        <>
        {/* Conversation header - chromeless until the transcript scrolls under it. */}
        <header
          className={cn(
            "z-20 flex h-12 shrink-0 items-center gap-2 border-b px-4 transition-colors duration-200",
            scrolled ? "border-[var(--border)] bg-[var(--bg)]" : "border-transparent bg-transparent",
          )}
        >
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Chats"
            title="Chats"
            className="-ml-1 inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <History className="size-4" />
          </button>
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
          {activeThread && !readOnly && (
            <PinnedPanel pins={pins} onJump={jumpToPin} onUnpin={unpinById} />
          )}
          {activeThread && !readOnly && (
            <button
              type="button"
              onClick={() => setShareForThreadId(activeThread.id)}
              aria-label="Share chat"
              title="Share chat"
              className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <Share2 className="size-4" />
            </button>
          )}
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

        {/* Conversation body - scrolls under the floating composer. */}
        <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6",
              centered ? "flex min-h-full flex-col justify-center pb-48" : "pb-44",
            )}
          >
            {pendingHandoff ? (
              <HandoffGhost text={pendingHandoff.content} />
            ) : !activeThread ? (
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
                  messages.map((m, i) => {
                    const runs = execByMessage[m.id];
                    return (
                      <div key={m.id} id={`chatmsg-${m.id}`}>
                        <ChatMessageRow
                          message={m}
                          onCitationOpen={openCitation}
                          onEdit={beginEdit}
                          editDisabled={sending}
                          onPickClarification={pickCard}
                          cardsDisabled={sending || i !== messages.length - 1}
                          onStartProposal={startTaskFromProposal}
                          onDismissProposal={dismissProposal}
                          onPin={pinMessage}
                          onUnpin={unpinMessage}
                          pinDisabled={readOnly}
                        />
                        {runs && runs.length > 0 && (
                          <AgentRunGroup executions={runs} onOpen={setOpenExecId} />
                        )}
                      </div>
                    );
                  })
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

        {/* Floating composer - messages fade out underneath it. */}
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
            <div
              className={cn(
                "pointer-events-auto mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6",
                !arrivedViaHandoff && "animate-rise-in",
              )}
            >
              {readOnly ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-center text-xs text-[var(--text-muted)]">
                  Demo mode - chat compose is disabled. Browse the precomputed conversations.
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
                      Using your subscription - answers come from the
                      conversation only; this model can&apos;t browse workspace
                      knowledge.
                    </p>
                  )}
                {queue.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {queue.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-3 pr-1.5 text-xs text-[var(--text-muted)] shadow-[var(--shadow-1)]"
                      >
                        <span className="inline-flex size-1.5 shrink-0 rounded-full bg-[var(--warning)]" aria-hidden />
                        <span className="min-w-0 flex-1 truncate" title={q.content}>
                          {q.content}
                        </span>
                        <span className="shrink-0 text-[10px] text-[var(--text-subtle)]">queued</span>
                        <button
                          type="button"
                          onClick={() => activeId && void sendQueuedNow(activeId, q.id, model, effort)}
                          className="shrink-0 rounded-md border border-[var(--border)] px-2 py-0.5 font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          title="Fold it into the reply Athena is writing now (uses the current model/effort picks)"
                        >
                          Send now
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const item = takeQueued(q.id);
                            if (item) setDraft(item.content);
                          }}
                          aria-label="Edit queued message"
                          title="Edit"
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          <SquarePen className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeQueued(q.id)}
                          aria-label="Remove queued message"
                          title="Remove"
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSend={onSend}
                  onStop={() => activeId && stop(activeId)}
                  sending={sending}
                  stopping={stopping}
                  queueing={sending}
                  disabled={!activeId}
                  editing={!!editing}
                  onCancelEdit={() => {
                    setEditing(null);
                    setDraft("");
                  }}
                  autoFocusKey={activeId ?? ""}
                  placeholder={activeThread ? `Message Athena about ${activeThread.scope.label}…` : "Pick or start a chat first"}
                  onPaste={onPasteAttach}
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
                      <ComposerActionsMenu
                        onFiles={addAttachments}
                        canAttachImages={canAttachImages}
                        webSearch={webSearch}
                        onToggleWebSearch={setWebSearch}
                        disabled={sending || !activeId || readOnly}
                      />
                      {agents.length > 0 && (
                        <AgentSelector
                          agents={agents}
                          value={agentId}
                          onChange={(id) => {
                            setAgentId(id);
                            const a = id ? agents.find((x) => x.id === id) : null;
                            // Pre-fill the agent's pinned model ONLY when the user
                            // hasn't already chosen one - their explicit model +
                            // effort pick always wins and is never clobbered.
                            if (model == null && a?.model_provider && a?.model_id) {
                              const sel: ModelSelection = a.model_source
                                ? { provider: a.model_provider, model: a.model_id, source: a.model_source as "athena" | "byok" | "subscription" }
                                : { provider: a.model_provider, model: a.model_id };
                              setModel(sel);
                              storeModel("chat", sel);
                            }
                          }}
                          disabled={sending}
                          className={COMPOSER_PICKER_CLASS}
                        />
                      )}
                      <EffortSelector value={effort} onChange={setEffort} className={COMPOSER_PICKER_CLASS} />
                      {models.length > 0 && (
                        <ModelSelector
                          models={models}
                          value={model}
                          onChange={(m) => {
                            setModel(m);
                            storeModel("chat", m);
                          }}
                          className={COMPOSER_PICKER_CLASS}
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
        </>
        )}
      </main>

      <CitationDrawer
        open={citation !== null}
        source={citation?.source ?? null}
        refValue={citation?.ref ?? null}
        label={citation?.label ?? null}
        onClose={() => setCitation(null)}
      />

      {/* Opened in place by a task-proposal card's "Start task" - pre-filled
          from the proposal so the user confirms + tweaks before minting. */}
      <NewTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        onCreated={onTaskCreated}
        defaults={taskDefaults}
      />

      {/* Live detail + controls for one async sub-agent run. */}
      {openExecution && (
        <AgentActivityDrawer
          execution={openExecution}
          onClose={() => setOpenExecId(null)}
          onChanged={refreshExecutions}
        />
      )}

      {/* Share a snapshot copy of a thread with teammates in the org. */}
      {shareForThreadId && activeOrgId && me?.id && (
        <ShareThreadDialog
          threadId={shareForThreadId}
          orgId={activeOrgId}
          currentUserId={me.id}
          threadTitle={shareThreadTitle}
          onClose={() => setShareForThreadId(null)}
          onShared={(count) => {
            setShareForThreadId(null);
            toast.success(`Shared with ${count} teammate${count === 1 ? "" : "s"}.`);
          }}
        />
      )}
    </div>
  );
}

/** The answer as it streams in - rendered as live markdown (same renderer as
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

/** The home-handoff bridge: a ghost of the just-sent user bubble (same frame
 *  as the real one) + Athena settling in, shown while the new thread spins
 *  up. The real optimistic turn replaces it the moment send() fires. */
function HandoffGhost({ text }: { text: string }) {
  return (
    <div className="animate-rise-in space-y-6">
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-2.5 text-sm leading-relaxed text-[var(--text)]">
          {text}
        </div>
      </div>
      <div className="flex gap-3">
        <ActorAvatar name="Athena" agent size={26} mood="thinking" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-xs font-semibold text-[var(--text)]">Athena</div>
          <p className="text-sm text-[var(--text-muted)]">Starting your chat…</p>
        </div>
      </div>
    </div>
  );
}

/** Welcome shown when no thread is open - the home stage's language. */
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
      <OwlAvatar size={72} mood="happy" />
      <div className="space-y-1.5">
        <GradientText as="h2" className="text-2xl font-semibold tracking-tight">
          Chat with Athena
        </GradientText>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
          Ask about any domain or your whole org. Athena cites its sources and can spin a task out of the conversation.
        </p>
      </div>
      {!readOnly &&
        (hasThreads ? (
          <p className="text-sm text-[var(--text-muted)]">Open a chat from the corner button, or start a new one.</p>
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

/** Welcome shown inside an empty thread - example prompts seed the composer. */
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
      <OwlAvatar size={72} mood="waiting" />
      <div className="space-y-1.5">
        <GradientText as="h2" className="text-2xl font-semibold tracking-tight">
          Ask anything about {scopeLabel}
        </GradientText>
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
