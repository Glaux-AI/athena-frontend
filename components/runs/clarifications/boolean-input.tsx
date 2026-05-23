"use client";

/**
 * BooleanInput — F-04.14 / question_kind === "boolean".
 *
 * Two large Yes / No buttons. An optional rationale textarea below mirrors
 * the audit field on `ClarificationAnswer.rationale` (Task 03.4).
 */

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ClarificationInputProps } from "./common";

export function BooleanInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const [value, setValue] = useState<boolean | null>(null);
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      const payload = value === null ? null : { boolean: value, ...(rationale.trim() ? { rationale: rationale.trim() } : {}) };
      onAnswerChange(payload);
    }
  }, [value, rationale, batchMode, onAnswerChange]);

  const handleSubmit = async () => {
    if (value === null || submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSubmit({
        boolean: value,
        ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  return (
    <Stack gap="3">
      <Cluster gap="2" align="center">
        {([
          { v: true,  label: "Yes", icon: Check, tone: "primary" as const },
          { v: false, label: "No",  icon: X,     tone: "secondary" as const },
        ]).map((b) => {
          const selected = value === b.v;
          return (
            <button
              key={String(b.v)}
              type="button"
              onClick={() => setValue(b.v)}
              disabled={disabled}
              data-bool={String(b.v)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                selected && b.v
                  ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                  : selected && !b.v
                  ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <b.icon className="size-4" />
              {b.label}
            </button>
          );
        })}
      </Cluster>
      <Stack gap="1">
        <label htmlFor={`bool-rationale-${clarification.qid}`} className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Rationale (optional)
        </label>
        <textarea
          id={`bool-rationale-${clarification.qid}`}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={2}
          placeholder="Why? Audited alongside the answer."
          className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          disabled={disabled}
        />
      </Stack>
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
          <Button size="sm" onClick={handleSubmit} disabled={value === null || disabled} loading={submitting}>
            Submit
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
