"use client";

/**
 * ChatComposer — the floating message card at the bottom of the conversation.
 *
 * One bordered surface holds everything: the auto-growing textarea on top and
 * a controls row underneath — caller-provided `accessories` (the effort /
 * model pickers, styled as quiet chips) on the left, the send ⇄ stop control
 * on the right. A single hairline border with a soft accent glow on focus —
 * no nested frames. Sends on Enter (Shift+Enter inserts a newline; IME
 * composition is respected) and swaps the send button for a Stop control
 * while a reply is streaming. An edit pill appears above the card when
 * resending a prior turn. Tokens-only.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUp, Loader2, Pencil, Square, X } from "lucide-react";

import { cn } from "@/lib/cn";

const MAX_HEIGHT = 200;

/** Quiet-chip restyle for the effort/model pickers rendered as composer
 *  `accessories` — borderless until hovered so the card keeps a single
 *  visible frame. Shared by /chat and the /dashboard ask stage so the two
 *  composers are pixel-identical (the home→chat handoff reads as one
 *  continuous surface). */
export const COMPOSER_PICKER_CLASS =
  "h-7 rounded-lg border-transparent bg-transparent px-2 text-[var(--text-muted)] shadow-none hover:bg-[var(--surface-2)] hover:text-[var(--text)] data-[state=open]:bg-[var(--surface-2)] data-[state=open]:text-[var(--text)]";

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  sending,
  stopping = false,
  disabled = false,
  editing = false,
  onCancelEdit,
  autoFocusKey,
  placeholder = "Ask anything about this scope…",
  accessories,
  hero = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onStop: () => void;
  sending: boolean;
  /** Stop was clicked and the turn is tearing down — shows transient feedback. */
  stopping?: boolean;
  disabled?: boolean;
  editing?: boolean;
  onCancelEdit?: () => void;
  /** Focus the input whenever this value changes (e.g. on thread switch). */
  autoFocusKey?: string;
  placeholder?: string;
  /** Controls rendered on the left of the bottom row (effort / model pickers). */
  accessories?: ReactNode;
  /** Hero sizing for the home ask stage — larger input text, same frame. */
  hero?: boolean;
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
    <div>
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-full border border-[var(--border)] bg-[var(--info-soft)] py-1 pl-3 pr-1 text-xs text-[var(--info-ink)]">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Pencil className="size-3 shrink-0" aria-hidden />
            <span className="truncate">Editing — sending replaces this message and everything after.</span>
          </span>
          <button
            type="button"
            onClick={onCancelEdit}
            aria-label="Cancel editing"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--info-ink)] transition-colors hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      <div
        className={cn(
          "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-2)]",
          "transition-[border-color,box-shadow] duration-200 ease-out",
          // Focus = one hairline accent border + a gentle lift. No ring, no
          // glow — the halo-on-halo look is exactly what this replaces.
          "focus-within:border-[var(--border-accent)] focus-within:shadow-[var(--shadow-3)]",
          !disabled && "hover:border-[var(--border-strong)] focus-within:hover:border-[var(--border-accent)]",
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
          className={cn(
            "input-bare max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 leading-relaxed outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed",
            hero ? "text-base" : "text-sm",
          )}
        />
        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
          {accessories}
          <div className="ml-auto flex items-center">
            {sending ? (
              <button
                type="button"
                onClick={onStop}
                disabled={stopping}
                aria-label={stopping ? "Stopping" : "Stop generating"}
                title={stopping ? "Stopping…" : "Stop generating"}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
              >
                {stopping ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Square className="size-3 fill-current" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                aria-label="Send message"
                title="Send (Enter)"
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  canSend
                    ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
                    : "bg-[var(--surface-3)] text-[var(--text-subtle)] disabled:cursor-not-allowed",
                )}
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
