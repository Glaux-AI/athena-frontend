"use client";

/**
 * ChatComposer — the message input pinned to the bottom of the conversation.
 *
 * Auto-grows with the draft (capped), sends on Enter (Shift+Enter inserts a
 * newline; IME composition is respected), and swaps its send button for a
 * Stop control while a reply is streaming so the user can abort. An edit
 * banner appears when resending a prior turn. Tokens-only.
 */

import { useEffect, useRef } from "react";
import { ArrowUp, Pencil, Square } from "lucide-react";

import { cn } from "@/lib/cn";

const MAX_HEIGHT = 200;

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  sending,
  disabled = false,
  editing = false,
  onCancelEdit,
  autoFocusKey,
  placeholder = "Ask anything about this scope…",
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onStop: () => void;
  sending: boolean;
  disabled?: boolean;
  editing?: boolean;
  onCancelEdit?: () => void;
  /** Focus the input whenever this value changes (e.g. on thread switch). */
  autoFocusKey?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  // Auto-grow: reset to measure, then grow to content height (capped).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  // Drop the cursor into the composer on thread switch / when enabled.
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [autoFocusKey, disabled]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      if (!sending) onSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="px-1 pb-1">
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Pencil className="size-3 shrink-0" />
            <span className="truncate">Editing — sending replaces this message and everything after.</span>
          </span>
          <button
            type="button"
            onClick={onCancelEdit}
            className="shrink-0 font-medium text-[var(--text)] hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
      <div
        className={cn(
          "glass flex items-end gap-2 rounded-2xl border px-3 py-2 shadow-[var(--shadow-2)] transition-[box-shadow,border-color]",
          "border-[var(--border)] focus-within:border-[var(--ring)] focus-within:shadow-[var(--shadow-3)] focus-within:ring-2 focus-within:ring-[var(--ring)]",
          disabled && "opacity-60",
        )}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          disabled={disabled}
          rows={1}
          placeholder={placeholder}
          aria-label="Message Athena"
          className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed"
        />
        {sending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            title="Send (Enter)"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-1 px-2 text-[10px] text-[var(--text-subtle)]">
        <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for a new line
      </div>
    </div>
  );
}
