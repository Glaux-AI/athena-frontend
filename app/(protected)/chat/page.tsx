"use client";

/**
 * /chat — long-form, scope-aware conversations with Athena.
 *
 * Left rail: thread list. Right pane: conversation. Each thread may have
 * produced a task (`thread.created_task`) — when it did, a "Created task"
 * chip appears on the row, the message stream ends with a `task_created`
 * event card, and the right pane header shows a quick-jump link to /runs/[id].
 *
 * In demo mode (`config.isMock`) the composer is disabled and an explanatory
 * banner replaces the input — every example below is precomputed.
 */

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, FileText, Hammer, Info, Lock, Send, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type ChatMessage, type ChatThread } from "@/lib/api/client";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";

const FLAVOUR_META: Record<NonNullable<ChatThread["flavour"]>, { label: string; tone: string }> = {
  prd_framing:        { label: "PRD framing",       tone: "bg-[var(--info-soft)] text-[var(--info)]" },
  bug_investigation:  { label: "Bug investigation", tone: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  codebase_qa:        { label: "Codebase Q&A",      tone: "bg-[var(--surface-2)] text-[var(--text-muted)]" },
  architecture:       { label: "Architecture",     tone: "bg-[var(--primary-soft)] text-[var(--primary)]" },
  knowledge_lookup:   { label: "Quick lookup",     tone: "bg-[var(--success-soft)] text-[var(--success)]" },
};

export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ts = await api.chat.listThreads();
        setThreads(ts);
        if (ts[0]) setActiveId(ts[0].id);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setLoadingThread(true);
    (async () => {
      try {
        const t = await api.chat.getThread(activeId);
        setActiveThread(t.thread);
        setMessages(t.messages);
      } catch { /* ignore */ }
      finally { setLoadingThread(false); }
    })();
  }, [activeId]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeId || !draft.trim() || config.isMock) return;
    const pendingContent = draft;
    setDraft("");
    setSending(true);
    setMessages((prev) => [...prev, { id: `optimistic_${Date.now()}`, thread_id: activeId, role: "user", who: "You", avatar: "YO", content: pendingContent, created_at: new Date().toISOString() }]);
    try {
      const reply = await api.chat.postMessage(activeId, pendingContent);
      setMessages((prev) => [...prev, reply]);
    } catch (e) {
      const errMsg = e instanceof ApiError ? e.message : "Send failed";
      setMessages((prev) => [...prev, { id: `err_${Date.now()}`, thread_id: activeId, role: "system", who: "system", avatar: "!!", content: `[${errMsg}]`, created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap="4" className="h-[calc(100vh-12rem)]">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
          <p className="text-sm text-[var(--text-muted)]">Scope-aware Q&amp;A with citations. Promote useful findings to domain notes — and spin a task out of any conversation.</p>
        </Stack>
        {!config.isMock && (
          <Button variant="outline">
            <Sparkles className="size-4" />
            New thread
          </Button>
        )}
      </Cluster>

      <div className="flex flex-1 min-h-0 gap-4">
        <Card className="flex w-80 shrink-0 flex-col gap-1 overflow-y-auto p-2">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={cn(
                "block w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                t.id === activeId ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="line-clamp-2 font-medium">{t.title}</div>
                {t.flavour && (
                  <span className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    FLAVOUR_META[t.flavour].tone,
                  )}>
                    {FLAVOUR_META[t.flavour].label}
                  </span>
                )}
              </div>
              <div className="line-clamp-1 text-xs text-[var(--text-muted)] mt-1">{t.preview}</div>
              <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                <span>{t.scope.label}</span>
                <span>·</span>
                <span>{t.updated_at}</span>
                {t.created_task && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 font-semibold normal-case tracking-normal text-[var(--success)]">
                    {t.created_task.kind === "prd" ? <FileText className="size-2.5" /> : <Hammer className="size-2.5" />}
                    Task created
                  </span>
                )}
              </div>
            </button>
          ))}
        </Card>

        <Card className="flex flex-1 flex-col p-0">
          <div className="flex-1 overflow-y-auto p-4">
            {!activeThread ? (
              <p className="text-sm text-[var(--text-muted)]">Pick a thread on the left.</p>
            ) : loadingThread ? (
              <Stack gap="4" aria-busy="true" aria-label="Loading thread">
                <Stack gap="1">
                  <div className="h-5 w-64 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
                </Stack>
                <Stack gap="3">
                  <div className="max-w-[80%] self-start h-12 w-3/5 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
                  <div className="max-w-[80%] self-end h-10 w-1/2 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
                  <div className="max-w-[80%] self-start h-16 w-2/3 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
                  <div className="max-w-[80%] self-end h-8 w-2/5 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
                </Stack>
              </Stack>
            ) : (
              <Stack gap="4">
                <Stack gap="0">
                  <Cluster gap="2" align="center">
                    <h2 className="text-base font-semibold">{activeThread.title}</h2>
                    {activeThread.flavour && (
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", FLAVOUR_META[activeThread.flavour].tone)}>
                        {FLAVOUR_META[activeThread.flavour].label}
                      </span>
                    )}
                  </Cluster>
                  <span className="text-xs text-[var(--text-subtle)]">{activeThread.scope.label}</span>
                </Stack>
                {activeThread.created_task && (
                  <Card className="border-[var(--success)] bg-[var(--success-soft)]">
                    <Cluster gap="2" align="center" justify="between">
                      <Cluster gap="2" align="center">
                        {activeThread.created_task.kind === "prd" ? <FileText className="size-4 text-[var(--success)]" /> : <Hammer className="size-4 text-[var(--success)]" />}
                        <Stack gap="0">
                          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--success)]">This conversation produced a task</span>
                          <span className="text-sm text-[var(--text)]">{activeThread.created_task.goal}</span>
                        </Stack>
                      </Cluster>
                      <Link href={`/runs/${activeThread.created_task.id}`} className="inline-flex items-center gap-1 rounded-md border border-[var(--success)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--success)] hover:bg-[var(--success-soft)]">
                        Open task
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </Cluster>
                  </Card>
                )}
                <Stack gap="3" as="ul">
                  {messages.map((m) => <MessageRow key={m.id} message={m} />)}
                </Stack>
              </Stack>
            )}
          </div>
          <form onSubmit={send} className="border-t border-[var(--border)] p-3">
            {config.isMock ? (
              <Cluster gap="2" align="center" className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                <Lock className="size-3.5" />
                <span>Demo mode — chat compose is disabled. Browse the precomputed conversations on the left.</span>
              </Cluster>
            ) : (
              <Cluster gap="2" align="end">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask anything about this scope…"
                  rows={2}
                  className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <Button type="submit" disabled={sending || !draft.trim() || !activeId}>
                  <Send className="size-4" />
                  Send
                </Button>
              </Cluster>
            )}
          </form>
        </Card>
      </div>
    </Stack>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "task_created") {
    return (
      <li className="my-1 flex justify-center">
        <Link
          href={`/runs/${message.content}`}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--success)] bg-[var(--success-soft)] px-3 py-1 text-xs font-medium text-[var(--success)] hover:bg-[var(--surface)]"
        >
          <Sparkles className="size-3" />
          Task <code className="font-mono">{message.content}</code> created from this conversation
          <ArrowUpRight className="size-3" />
        </Link>
      </li>
    );
  }
  if (message.role === "system") {
    return (
      <li className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)]">
          <Info className="size-3" />
          {message.content}
        </div>
      </li>
    );
  }
  return (
    <li className={cn("flex gap-3", message.role === "user" && "justify-end")}>
      <div className={cn(
        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
        message.role === "user"
          ? "bg-[var(--primary)] text-[var(--primary-fg)]"
          : "bg-[var(--surface-2)] text-[var(--text)]",
      )}>
        {message.role === "assistant" && (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{message.who}</div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: message.content }} />
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">
            {message.citations.map((c, i) => (
              <span
                key={`${c.kind}-${i}`}
                title={c.ref ?? c.label}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)]"
              >
                <span className="font-sans font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{c.kind}</span>
                <span>·</span>
                <span>{c.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
