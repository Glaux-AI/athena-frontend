"use client";

/**
 * ChoiceWithFreeTextInput — F-04.14 / question_kind === "single_choice_with_free_text".
 *
 * Radio group; selecting an option marked `requires_free_text: true` (or
 * conventionally `id === "other"`) reveals a textarea that is required for
 * submit. Honours `free_text_constraints` for live char-count + validation.
 */

import { useEffect, useState } from "react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ClarificationInputProps } from "./common";
import { isAnswerValid } from "./common";

export function ChoiceWithFreeTextInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const [choiceId, setChoiceId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = clarification.options.find((o) => o.id === choiceId);
  const revealText =
    (!!selected && (selected.requires_free_text === true || selected.id === "other"))
    || clarification.free_text_allowed;

  const constraints = clarification.free_text_constraints;
  const minLen = constraints?.min_length ?? 1;
  const maxLen = constraints?.max_length;

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      const payload = choiceId
        ? { choice_id: choiceId, ...(revealText && freeText.trim() ? { free_text: freeText.trim() } : {}) }
        : null;
      onAnswerChange(payload);
    }
  }, [choiceId, freeText, revealText, batchMode, onAnswerChange]);

  const answer = choiceId
    ? { choice_id: choiceId, ...(revealText && freeText ? { free_text: freeText } : {}) }
    : null;
  const valid = isAnswerValid(clarification, answer);

  const handleSubmit = async () => {
    if (!valid || submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSubmit({
        choice_id: choiceId!,
        ...(revealText && freeText.trim() ? { free_text: freeText.trim() } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  return (
    <Stack gap="3">
      <Stack gap="1.5" as="ul">
        {clarification.options.map((opt) => {
          const isSelected = choiceId === opt.id;
          return (
            <li key={opt.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => setChoiceId(opt.id)}
                disabled={disabled}
                data-option-id={opt.id}
                className={cn(
                  "w-full rounded-md border p-2 text-left text-sm transition-colors",
                  isSelected ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:border-[var(--border-strong)]",
                )}
              >
                <Cluster gap="2" align="center">
                  <span className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border-strong)]",
                  )}>
                    {isSelected && <span className="size-1.5 rounded-full bg-[var(--primary-fg)]" />}
                  </span>
                  <span className="font-medium">{opt.label}</span>
                  {opt.requires_free_text && (
                    <span className="rounded-full bg-[var(--info-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--info)]">
                      free text required
                    </span>
                  )}
                </Cluster>
                {opt.body && <p className="ml-6 mt-0.5 text-xs text-[var(--text-muted)]">{opt.body}</p>}
              </button>
            </li>
          );
        })}
      </Stack>

      {revealText && (
        <Stack gap="1">
          <label
            htmlFor={`cwft-text-${clarification.qid}`}
            className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
          >
            Tell us more {minLen > 0 ? "(required)" : "(optional)"}
          </label>
          <textarea
            id={`cwft-text-${clarification.qid}`}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={3}
            placeholder="Type your answer…"
            maxLength={maxLen}
            disabled={disabled}
            className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <Cluster justify="between" align="center" className="text-[10px] text-[var(--text-subtle)]">
            <span>
              {freeText.length} / {maxLen ?? "∞"}
              {minLen > 0 && freeText.length < minLen && (
                <span className="ml-2 text-[var(--warning)]">need {minLen - freeText.length} more</span>
              )}
            </span>
          </Cluster>
        </Stack>
      )}

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
