"use client";

/**
 * Presentational slide-in panel for the public showcase chat.
 *
 * Reuses the internal chat's rich renderer (`ChatMarkdown`) and composer
 * (`ChatComposer` with NO accessories - no model/effort/agent/attach controls)
 * so the output matches the in-app chat while the surface stays minimal. Token-
 * only theming; no customer data; nothing persisted.
 */

import { Loader2, Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AgentActivity, type ActivityRow } from "@/components/agent/agent-activity";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import type {
  PublicChatMessage,
  PublicChatStreamEvent,
  PublicToolStep,
} from "@/lib/api/public-chat-stream";
import type { PublicStreamingTurn } from "@/features/public-chat/use-public-chat-turn";

export interface PublicChatPanelProps {
  open: boolean;
  onClose: () => void;
  scopeLabel: string;
  suggestions: string[];
  messages: PublicChatMessage[];
  streaming: PublicStreamingTurn | null;
  sending: boolean;
  error: string | null;
  draft: string;
  onDraft: (next: string) => void;
  onSend: () => void;
  onStop: () => void;
  onSuggestion: (text: string) => void;
}

export function PublicChatPanel(props: PublicChatPanelProps) {
  const { open, messages, streaming, sending } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [maximized, setMaximized] = useState(false);

  // Keep the latest turn in view as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.text, streaming?.reasoning, open]);

  const empty = messages.length === 0 && !streaming;

  return (
    <div
      role="dialog"
      aria-label="Ask Athena"
      aria-hidden={!open}
      className={[
        // A full-height side drawer (not a small floating card) so large answers
        // have room; maximize widens it to near-fullscreen.
        "fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full flex-col border-l border-[var(--border-soft)]",
        "bg-[var(--surface)] shadow-2xl transition-[transform,width] duration-300 ease-out motion-reduce:transition-none",
        maximized ? "sm:w-[min(1100px,96vw)]" : "sm:w-[min(560px,92vw)]",
        open ? "translate-x-0" : "pointer-events-none translate-x-[110%]",
      ].join(" ")}
    >
      <Header
        scopeLabel={props.scopeLabel}
        onClose={props.onClose}
        maximized={maximized}
        onToggleMaximize={() => setMaximized((s) => !s)}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {/* Center the content at a generous reading width so a maximized panel
            stays readable while still giving large answers plenty of room. */}
        <div className="mx-auto h-full w-full max-w-[960px] space-y-4">
          {empty ? (
            <EmptyState suggestions={props.suggestions} onPick={props.onSuggestion} />
          ) : (
            <>
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
              {streaming ? <StreamingRow streaming={streaming} /> : null}
            </>
          )}
          {props.error ? (
            <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {props.error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-[var(--border-soft)] px-3 pb-2 pt-2">
        <div className="mx-auto w-full max-w-[960px]">
          <ChatComposer
            value={props.draft}
            onChange={props.onDraft}
            onSend={props.onSend}
            onStop={props.onStop}
            sending={sending}
            placeholder="Ask Athena about showcase repos"
          />
          <p className="px-1 pt-1.5 text-center text-[11px] text-[var(--text-muted)]">
            A demo of Athena on public repos.{" "}
            <a className="font-medium text-[var(--primary)] hover:underline" href="/login">
              Try it on your own code
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Header({
  scopeLabel,
  onClose,
  maximized,
  onToggleMaximize,
}: {
  scopeLabel: string;
  onClose: () => void;
  maximized: boolean;
  onToggleMaximize: () => void;
}) {
  const btn =
    "rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-[var(--text)]">Ask Athena</p>
          <p className="text-[11px] text-[var(--text-muted)]">{scopeLabel}</p>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleMaximize}
          aria-label={maximized ? "Restore panel width" : "Widen panel"}
          title={maximized ? "Restore width" : "Widen"}
          className={`hidden sm:inline-flex ${btn}`}
        >
          {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onClose} aria-label="Close chat" className={btn}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
        <Sparkles className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--text)]">Explore this codebase with Athena</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Ask anything - Athena answers from its live map of the code.
        </p>
      </div>
      <div className="flex w-full flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-left text-xs text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The agent-activity log - reuses the SAME shared <AgentActivity> the internal
 *  chat uses (it maps each safe tool name to a friendly verb). `live` auto-
 *  expands during streaming, then rolls up to a collapsed receipt when settled. */
function Activity({ tools, live }: { tools: PublicToolStep[]; live: boolean }) {
  if (!tools.length) return null;
  const rows: ActivityRow[] = tools.map((t, i) => ({
    key: `${t.id}-${i}`,
    id: t.id,
    kind: "tool",
    toolName: t.name,
    summary: t.argsSummary ?? "",
    status: t.done ? "ok" : "running",
    order: i,
    live,
  }));
  return (
    <AgentActivity
      headline={live ? "Athena is working…" : "Athena's work"}
      rows={rows}
      live={live}
      defaultExpanded={live}
      maxHeightClass="max-h-48"
      emptyText="Working…"
    />
  );
}

function MessageRow({ message }: { message: PublicChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--primary-soft)] px-3 py-2 text-sm text-[var(--text)]">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        {message.toolSteps && message.toolSteps.length > 0 ? (
          <Activity tools={message.toolSteps} live={false} />
        ) : null}
        <ChatMarkdown content={message.content} />
        {message.tokens ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            {message.tokens.toLocaleString()} tokens used
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StreamingRow({ streaming }: { streaming: PublicStreamingTurn }) {
  const hasTools = streaming.tools.length > 0;
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <Activity tools={streaming.tools} live />
        {streaming.text ? (
          <ChatMarkdown content={streaming.text} />
        ) : !hasTools ? (
          <span className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            Thinking…
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Re-exported so the launcher can narrow stream events without re-importing.
export type { PublicChatStreamEvent };
