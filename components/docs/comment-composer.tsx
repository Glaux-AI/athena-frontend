"use client";

/**
 * CommentComposer — small inline composer used to add comments on a document
 * or document section. Implements F-04.12 (ADR-064): the composer carries a
 * "Treat as a decision" checkbox. When set + submit, the backend additionally
 * creates a `run_decisions` row with `kind='comment'` scoped to the comment's
 * anchor. Default unchecked because most comments are discussion, not binding.
 *
 * Caller owns persistence. The composer hands `{ text, asDecision }` to
 * `onSubmit` and clears + collapses on success.
 */

import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

export interface CommentComposerProps {
  /** Optional default for the "Treat as a decision" checkbox. */
  defaultAsDecision?: boolean;
  /** Placeholder text in the textarea. */
  placeholder?: string;
  /** Submit handler. Throwing surfaces to the caller (via toast or similar). */
  onSubmit: (payload: { text: string; asDecision: boolean }) => Promise<void> | void;
  /** Optional `aria-label`/visible label for accessibility. Default "Add comment". */
  label?: string;
  /** Compact mode — render without the surrounding card. */
  compact?: boolean;
}

export function CommentComposer({
  defaultAsDecision = false,
  placeholder = "Add a comment…",
  onSubmit,
  label = "Add comment",
  compact = false,
}: CommentComposerProps) {
  const [text, setText] = useState("");
  const [asDecision, setAsDecision] = useState(defaultAsDecision);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setText("");
    setAsDecision(defaultAsDecision);
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ text: trimmed, asDecision });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack
      gap="2"
      as="section"
      aria-label={label}
      className={cn(
        !compact && "rounded-md border border-[var(--border)] bg-[var(--surface)] p-3",
      )}
      data-comment-composer
    >
      {!compact && (
        <Cluster gap="2" align="center">
          <MessageSquare className="size-3.5 text-[var(--text-muted)]" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {label}
          </span>
        </Cluster>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        aria-label={label}
      />
      <Cluster justify="between" align="center" className="flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={asDecision}
            onChange={(e) => setAsDecision(e.target.checked)}
            className="accent-[var(--primary)]"
            data-as-decision
          />
          Treat as a decision
        </label>
        <Cluster gap="2" align="center">
          {text.trim().length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!text.trim()}
            loading={submitting}
          >
            <Send className="size-3.5" />
            Post
          </Button>
        </Cluster>
      </Cluster>
    </Stack>
  );
}
