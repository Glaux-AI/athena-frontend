"use client";

/**
 * NumericInput — F-04.14 / question_kind === "numeric".
 *
 * Number input with min/max/step/unit chip. Validation matches Task 03.4
 * server-side rules so the FE never lets the user fire a request the
 * backend will 422.
 */

import { useEffect, useState } from "react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import type { ClarificationInputProps } from "./common";
import { isAnswerValid } from "./common";

export function NumericInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const [raw, setRaw] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const constraints = clarification.numeric_constraints ?? {};
  const parsed = raw.trim() === "" ? null : Number(raw);
  const value = parsed !== null && !Number.isNaN(parsed) ? parsed : null;

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      onAnswerChange(value !== null ? { numeric: value } : null);
    }
  }, [value, batchMode, onAnswerChange]);

  const answer = value !== null ? { numeric: value } : null;
  const valid = isAnswerValid(clarification, answer);

  const outOfRange =
    value !== null
    && ((constraints.min != null && value < constraints.min)
      || (constraints.max != null && value > constraints.max));

  const handleSubmit = async () => {
    if (!valid || submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSubmit({ numeric: value! });
    } finally {
      setSubmitting(false);
    }
  };

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  return (
    <Stack gap="3">
      <Cluster gap="2" align="center">
        <input
          type="number"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          min={constraints.min}
          max={constraints.max}
          step={constraints.step}
          disabled={disabled}
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm tabular-nums focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Numeric answer"
        />
        {constraints.unit && (
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text-muted)]">
            {constraints.unit}
          </span>
        )}
      </Cluster>
      <span className="text-[10px] text-[var(--text-subtle)]">
        {constraints.min != null && `min: ${constraints.min}`}
        {constraints.min != null && constraints.max != null && " · "}
        {constraints.max != null && `max: ${constraints.max}`}
        {constraints.step != null && ` · step: ${constraints.step}`}
        {outOfRange && (
          <span className="ml-2 text-[var(--danger)]">out of range</span>
        )}
      </span>
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
