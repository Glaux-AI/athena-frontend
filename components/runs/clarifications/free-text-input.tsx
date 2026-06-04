"use client";

/**
 * FreeTextInput — F-04.14 / question_kind === "free_text".
 *
 * Markdown textarea with live character count, honouring `min_length`,
 * `max_length`, and (optionally) a `regex` preview. Validation duplicates
 * server-side rules from Task 03.4 for immediate FE feedback.
 */

import { useEffect, useState, useMemo } from "react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import type { ClarificationInputProps } from "./common";
import { isAnswerValid } from "./common";

export function FreeTextInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const constraints = clarification.free_text_constraints;
  const minLen = constraints?.min_length ?? 1;
  const maxLen = constraints?.max_length;

  const regex = useMemo(() => {
    if (!constraints?.regex) return null;
    try {
      return new RegExp(constraints.regex);
    } catch {
      return null;
    }
  }, [constraints?.regex]);

  const regexFails = regex != null && text.length > 0 && !regex.test(text);

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      onAnswerChange(text.trim() ? { free_text: text.trim() } : null);
    }
  }, [text, batchMode, onAnswerChange]);

  const answer = text.trim() ? { free_text: text.trim() } : null;
  const valid = isAnswerValid(clarification, answer) && !regexFails;

  const handleSubmit = async () => {
    if (!valid || submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSubmit({ free_text: text.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  return (
    <Stack gap="3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Markdown supported."
        maxLength={maxLen}
        disabled={disabled}
        className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        aria-label="Free-text answer"
      />
      <Cluster justify="between" align="center" className="text-[10px] text-[var(--text-subtle)]">
        <span>
          {text.length} / {maxLen ?? "∞"} chars
          {text.length < minLen && (
            <span className="ml-2 text-[var(--warning-ink)]">need {minLen - text.length} more</span>
          )}
          {regexFails && (
            <span className="ml-2 text-[var(--danger-ink)]">doesn&apos;t match required pattern</span>
          )}
        </span>
        {constraints?.regex && (
          <code className="font-mono text-[var(--text-subtle)]">/{constraints.regex}/</code>
        )}
      </Cluster>
      {!batchMode && (
        <Cluster justify="between" align="center" className="flex-wrap gap-2">
          <Cluster gap="2">
            {canDefer && onDefer && (
              <Button variant="ghost" size="sm" onClick={onDefer} disabled={disabled}>
                Defer 24h
              </Button>
            )}
            {canSkip && onSkip && (
              <Button variant="ghost" size="sm" onClick={onSkip} disabled={disabled}>
                Skip
              </Button>
            )}
          </Cluster>
          <Button size="sm" onClick={handleSubmit} disabled={!valid || disabled} loading={submitting}>
            Submit
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
