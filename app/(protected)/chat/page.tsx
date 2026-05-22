"use client";

/**
 * /chat — long-form, scope-aware conversations with Athena.
 *
 * Left rail: thread list. Right pane: conversation. The compose box submits
 * to /v1/chat/threads/{id}/messages and the mock-mode handler synthesizes an
 * assistant reply.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Send } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type ChatMessage, type ChatThread } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
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
        setMessages(t.messages);
      } catch { /* ignore */ }
      finally { setLoadingThread(false); }
    })();
  }, [activeId]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeId || !draft.trim()) return;
    const pendingContent = draft;
    setDraft("");
    setSending(true);
    // Optimistic user message
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

  const activeThread = threads.find((t) => t.id === activeId);

  return (
    <Stack gap="4" className="h-[calc(100vh-12rem)]">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
          <p className="text-sm text-[var(--text-muted)]">Scope-aware Q&amp;A with citations. Promote useful findings to domain notes.</p>
        </Stack>
        <Button variant="outline">
          <Plus className="size-4" />
          New thread
        </Button>
      </Cluster>

      <div className="flex flex-1 min-h-0 gap-4">
        <Card className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto p-2">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={cn(
                "block w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                t.id === activeId ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]",
              )}
            >
              <div className="line-clamp-1 font-medium">{t.title}</div>
              <div className="line-clamp-1 text-xs text-[var(--text-muted)]">{t.preview}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{t.scope.label} · {t.updated_at}</div>
            </button>
          ))}
        </Card>

        <Card className="flex flex-1 flex-col p-0">
          <div className="flex-1 overflow-y-auto p-4">
            {!activeThread ? (
              <p className="text-sm text-[var(--text-muted)]">Pick a thread on the left.</p>
            ) : loadingThread ? (
              <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>
            ) : (
              <Stack gap="4">
                <Stack gap="0">
                  <h2 className="text-base font-semibold">{activeThread.title}</h2>
                  <span className="text-xs text-[var(--text-subtle)]">{activeThread.scope.label}</span>
                </Stack>
                <Stack gap="3" as="ul">
                  {messages.map((m) => (
                    <li key={m.id} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                      <div className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        m.role === "user"
                          ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                          : m.role === "system"
                          ? "border border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                          : "bg-[var(--surface-2)] text-[var(--text)]",
                      )}>
                        {m.role === "assistant" && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{m.who}</div>}
                        {m.content}
                      </div>
                    </li>
                  ))}
                </Stack>
              </Stack>
            )}
          </div>
          <form onSubmit={send} className="border-t border-[var(--border)] p-3">
            <Cluster gap="2" align="end">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask anything about this scope…"
                rows={2}
                className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <Button type="submit" disabled={sending || !draft.trim() || !activeId}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send
              </Button>
            </Cluster>
          </form>
        </Card>
      </div>
    </Stack>
  );
}
