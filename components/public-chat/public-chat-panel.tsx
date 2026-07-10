"use client";

/**
 * Presentational slide-in panel for the public showcase chat.
 *
 * Reuses the internal chat's rich renderer (`ChatMarkdown`) and composer
 * (`ChatComposer` with NO accessories - no model/effort/agent/attach controls)
 * so the output matches the in-app chat while the surface stays minimal. Token-
 * only theming; no customer data; nothing persisted.
 */

import { Maximize2, Minimize2, X } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { AgentActivity, type ActivityRow } from "@/components/agent/agent-activity";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
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
  const [maximized, setMaximized] = useState(false);

  // Keep the latest turn in view as content streams in - but never fight a
  // reader who scrolled up to re-read (auto-scroll only while near the bottom).
  const { ref: scrollRef, onScroll } = useStickToBottom<HTMLDivElement>([
    messages,
    streaming?.text,
    streaming?.reasoning,
    open,
  ]);

  const empty = messages.length === 0 && !streaming;

  return (
    <div
      role="dialog"
      aria-label="Ask Athena"
      aria-hidden={!open}
      className={cn(
        // A full-height side drawer (not a small floating card) so large answers
        // have room; maximize widens it to near-fullscreen. Nightglass sheet
        // tier - frosted, glinted, square against the attached edges.
        "glass-sheet fixed inset-y-0 right-0 z-[var(--z-drawer)] flex h-[100dvh] w-full flex-col !rounded-none !rounded-l-2xl border-y-0 border-r-0",
        "transition-[transform,width] duration-300 ease-out motion-reduce:transition-none",
        maximized ? "sm:w-[min(1100px,96vw)]" : "sm:w-[min(560px,92vw)]",
        open ? "translate-x-0" : "pointer-events-none translate-x-[110%]",
      )}
    >
      <Header
        scopeLabel={props.scopeLabel}
        onClose={props.onClose}
        maximized={maximized}
        onToggleMaximize={() => setMaximized((s) => !s)}
      />

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4">
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
            <p className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
              {props.error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative px-3 pb-2 pt-2">
        <hr className="hr-horizon absolute inset-x-0 top-0" aria-hidden />
        <div className="mx-auto w-full max-w-[960px]">
          <ChatComposer
            value={props.draft}
            onChange={props.onDraft}
            onSend={props.onSend}
            onStop={props.onStop}
            sending={sending}
            placeholder="Ask Athena about showcase repos"
          />
          <p className="text-micro px-1 pt-1.5 text-center text-[var(--text-muted)]">
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
  const btn = cn(
    "rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
    focusRing,
  );
  return (
    <div className="relative flex items-center justify-between px-4 py-3">
      <hr className="hr-horizon absolute inset-x-0 bottom-0" aria-hidden />
      <div className="flex items-center gap-2">
        <OwlAvatar size={26} mood="happy" static />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-[var(--text)]">Ask Athena</p>
          <p className="text-micro text-[var(--text-muted)]">{scopeLabel}</p>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleMaximize}
          aria-label={maximized ? "Restore panel width" : "Widen panel"}
          title={maximized ? "Restore width" : "Widen"}
          className={cn("hidden sm:inline-flex", btn)}
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
    <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden rounded-xl px-2 text-center">
      <div className="starfield" aria-hidden />
      <OwlAvatar size={56} mood="waiting" className="relative" />
      <div className="relative">
        <p className="text-sm font-semibold text-[var(--text)]">Explore this codebase with Athena</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Ask anything - Athena answers from its live map of the code.
        </p>
      </div>
      <div className="relative flex w-full flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              "rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs text-[var(--text-muted)] transition-[border-color,background-color,color] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              focusRing,
            )}
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
      <OwlAvatar size={24} mood="happy" static className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        {message.toolSteps && message.toolSteps.length > 0 ? (
          <Activity tools={message.toolSteps} live={false} />
        ) : null}
        <ChatMarkdown content={message.content} />
        {message.tokens ? (
          <p className="text-micro text-[var(--text-muted)]">
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
      <OwlAvatar size={24} mood="thinking" static className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <Activity tools={streaming.tools} live />
        {streaming.text ? (
          <ChatMarkdown content={streaming.text} />
        ) : !hasTools ? (
          <span className="flex items-center gap-2 text-[var(--text-muted)]">
            <span
              className="star-dot is-live"
              style={{ "--dot-color": "var(--primary)" } as CSSProperties}
              aria-hidden
            />
            Thinking…
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Re-exported so the launcher can narrow stream events without re-importing.
export type { PublicChatStreamEvent };
