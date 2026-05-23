"use client";

/**
 * ChatDrawer — global right-side drawer for Athena chat.
 *
 * Mounted in AppShell so it's available on every authenticated page.
 * Opens / closes via `useChatDrawerStore`. The thread list is collapsible
 * (left rail inside the drawer) and the active conversation persists across
 * navigation. Drafts are preserved per-thread even if the drawer is closed.
 *
 * No scrim — page behind stays interactive. Width: 420px (fits most
 * laptops without crowding the main content).
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronsLeft, ChevronsRight, FileText, Hammer, Loader2, Lock, Plus, Send, Sparkles, X } from "lucide-react";

import { useChatDrawerStore } from "@/lib/stores/chat-drawer";
import { api, ApiError, type ChatMessage, type ChatThread } from "@/lib/api/client";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ChatDrawer() {
  const open            = useChatDrawerStore((s) => s.open);
  const setOpen         = useChatDrawerStore((s) => s.setOpen);
  const collapsed       = useChatDrawerStore((s) => s.collapsed);
  const toggleCollapsed = useChatDrawerStore((s) => s.toggleCollapsed);
  const activeThreadId  = useChatDrawerStore((s) => s.activeThreadId);
  const setActiveId     = useChatDrawerStore((s) => s.setActiveThreadId);
  const drafts          = useChatDrawerStore((s) => s.drafts);
  const setDraft        = useChatDrawerStore((s) => s.setDraft);
  const clearDraft      = useChatDrawerStore((s) => s.clearDraft);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load thread list when the drawer first opens.
  useEffect(() => {
    if (!open || threads.length > 0) return;
    (async () => {
      try {
        const list = await api.chat.listThreads();
        setThreads(list);
        if (!activeThreadId && list[0]) {
          setActiveId(list[0].id);
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't load chat threads.");
      }
    })();
  }, [open, threads.length, activeThreadId, setActiveId]);

  // Load messages whenever activeThreadId changes.
  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;
    setLoadingThread(true);
    (async () => {
      try {
        const detail = await api.chat.getThread(activeThreadId);
        if (cancelled) return;
        setActiveThread(detail.thread);
        setMessages(detail.messages);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof ApiError ? e.message : "Couldn't load thread.");
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeThreadId]);

  // Keep view scrolled to latest message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loadingThread]);

  // ⌘+. / Ctrl+. to toggle drawer from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setOpen(!useChatDrawerStore.getState().open);
      }
      if (e.key === "Escape" && useChatDrawerStore.getState().open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const draft = activeThreadId ? drafts[activeThreadId] ?? "" : "";

  const onSend = async () => {
    if (!activeThreadId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const reply = await api.chat.postMessage(activeThreadId, draft);
      // Optimistically append the user message + the agent reply.
      setMessages((cur) => [
        ...cur,
        {
          id: `${activeThreadId}_u_${Date.now()}`,
          thread_id: activeThreadId,
          role: "user",
          who: "You",
          avatar: "DU",
          content: draft,
          created_at: new Date().toISOString(),
        },
        reply,
      ]);
      clearDraft(activeThreadId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void onSend();
    }
  };

  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="Athena chat"
      className="fixed right-3 top-3 bottom-3 z-40 flex w-[min(540px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      style={{ animation: "improveFloatIn 180ms cubic-bezier(0.2, 0.7, 0.2, 1)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Show threads" : "Collapse threads"}
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
          <ActorAvatar name="Athena" agent size={20} mood="thinking" />
          <span className="text-sm font-semibold">Chat with Athena</span>
        </div>
        <div className="flex items-center gap-1">
          {!config.isMock && (
            <button
              onClick={() => toast.info("New thread coming next.")}
              aria-label="New thread"
              className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <Plus className="size-4" />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Thread list (collapsible left rail) */}
        {!collapsed && (
          <div className="w-44 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface-2)] p-2">
            {threads.length === 0 ? (
              <p className="p-2 text-xs text-[var(--text-muted)]">No threads yet.</p>
            ) : threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={cn(
                  "mb-1 block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  t.id === activeThreadId
                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "text-[var(--text)] hover:bg-[var(--surface)]",
                )}
              >
                <div className="line-clamp-2 font-medium">{t.title}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-subtle)]">{t.scope.label} · {t.updated_at}</div>
              </button>
            ))}
          </div>
        )}

        {/* Conversation pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
            {loadingThread ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : !activeThread ? (
              <p className="text-sm text-[var(--text-muted)]">Pick a thread on the left to start.</p>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                  {activeThread.scope.label}
                </div>
                <h3 className="text-sm font-semibold">{activeThread.title}</h3>
                {activeThread.created_task && (
                  <Link
                    href={`/runs/${activeThread.created_task.id}`}
                    className="block rounded-md border border-[var(--success)] bg-[var(--success-soft)] p-2 text-xs no-underline hover:bg-[var(--surface)]"
                  >
                    <div className="flex items-center gap-1.5">
                      {activeThread.created_task.kind === "prd" ? <FileText className="size-3 text-[var(--success)]" /> : <Hammer className="size-3 text-[var(--success)]" />}
                      <span className="font-semibold uppercase tracking-wider text-[var(--success)]">Produced task</span>
                      <ArrowUpRight className="ml-auto size-3 text-[var(--success)]" />
                    </div>
                    <div className="mt-1 line-clamp-2 text-[var(--text)]">{activeThread.created_task.goal}</div>
                  </Link>
                )}
                <ul className="space-y-3">
                  {messages.map((m) => {
                    if (m.role === "task_created") {
                      return (
                        <li key={m.id} className="flex justify-center">
                          <Link
                            href={`/runs/${m.content}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--success)] bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--success)] no-underline hover:bg-[var(--surface)]"
                          >
                            <Sparkles className="size-2.5" />
                            Task <code className="font-mono">{m.content}</code> created
                          </Link>
                        </li>
                      );
                    }
                    return (
                      <li key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse text-right")}>
                        <ActorAvatar name={m.who} initials={m.avatar} agent={m.role === "assistant"} size={22} />
                        <div className={cn(
                          "inline-block max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                          m.role === "user"
                            ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                            : "bg-[var(--surface-2)] text-[var(--text)]",
                        )}>
                          <div className="whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: m.content }} />
                          {m.citations && m.citations.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1 border-t border-[var(--border)] pt-1.5">
                              {m.citations.slice(0, 4).map((c, i) => (
                                <span
                                  key={`${c.kind}-${i}`}
                                  title={c.ref ?? c.label}
                                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--text-muted)]"
                                >
                                  <span className="font-sans font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{c.kind}</span>
                                  <span>·</span>
                                  <span>{c.label}</span>
                                </span>
                              ))}
                              {m.citations.length > 4 && (
                                <span className="text-[9px] text-[var(--text-subtle)]">+{m.citations.length - 4}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Composer (demo mode swaps this for a read-only notice) */}
          {config.isMock ? (
            <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-2">
              <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
                <Lock className="size-3" />
                <span>Demo mode — chat compose is disabled. Browse the precomputed conversations.</span>
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-2">
              <div className="relative flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => activeThreadId && setDraft(activeThreadId, e.target.value)}
                  onKeyDown={onKey}
                  disabled={!activeThreadId || sending}
                  placeholder={activeThreadId ? "Ask anything in this scope · ⌘↵ to send" : "Pick a thread first"}
                  rows={2}
                  className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
                />
                <Button onClick={onSend} disabled={!draft.trim() || sending} size="sm">
                  {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                </Button>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--text-subtle)]">
                <span>
                  <Sparkles className="mr-1 inline size-2.5 text-[var(--primary)]" />
                  Drafts persist per thread, even when the chat is closed.
                </span>
                <span>⌘ . to toggle</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
