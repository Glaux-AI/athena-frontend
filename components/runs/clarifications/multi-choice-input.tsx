"use client";

/**
 * MultiChoiceInput — F-04.14 / question_kind === "multi_choice".
 *
 * Checkbox group with required vs optional sub-headers and live min/max
 * validation against `reference_picker`-like constraints stored on the
 * question's options (`is_optional`). Backend enforces final min/max via
 * `min_selected` / `max_selected` on the options array; FE derives a
 * reasonable client-side preview.
 */

import { useEffect, useState } from "react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ClarificationInputProps } from "./common";
import { isAnswerValid } from "./common";

export function MultiChoiceInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      onAnswerChange(selected.size > 0 ? { choice_ids: Array.from(selected) } : null);
    }
  }, [selected, batchMode, onAnswerChange]);

  const required = clarification.options.filter((o) => !o.is_optional);
  const optional = clarification.options.filter((o) => o.is_optional);
  const min = required.length > 0 ? 1 : 0;
  const max = clarification.options.length;
  const overMax = selected.size > max;
  const underMin = selected.size < min;

  const answer = selected.size > 0 ? { choice_ids: Array.from(selected) } : null;
  const valid = isAnswerValid(clarification, answer);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSubmit = async () => {
    if (!valid || submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSubmit({ choice_ids: Array.from(selected) });
    } finally {
      setSubmitting(false);
    }
  };

  const renderGroup = (label: string, group: typeof clarification.options) =>
    group.length === 0 ? null : (
      <Stack gap="1" as="section">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        <Stack gap="1" as="ul">
          {group.map((opt) => {
            const checked = selected.has(opt.id);
            return (
              <li key={opt.id}>
                <label
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2 rounded-md border p-2 text-sm transition-colors",
                    checked
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                  data-option-id={opt.id}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt.id)}
                    disabled={disabled}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <Stack gap="0" className="min-w-0">
                    <span className="font-medium">{opt.label}</span>
                    {opt.body && (
                      <span className="text-xs text-[var(--text-muted)]">{opt.body}</span>
                    )}
                  </Stack>
                </label>
              </li>
            );
          })}
        </Stack>
      </Stack>
    );

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  return (
    <Stack gap="3">
      {renderGroup("Required", required)}
      {renderGroup("Optional", optional)}
      <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
        <span>
          {selected.size} selected (min {min}{max < 99 ? `, max ${max}` : ""})
        </span>
        {overMax && <span className="text-[var(--danger)]">Over the max — uncheck some.</span>}
        {underMin && <span className="text-[var(--warning)]">Pick at least {min}.</span>}
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
