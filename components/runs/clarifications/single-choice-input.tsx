"use client";

/**
 * SingleChoiceInput — F-04.14 / question_kind === "single_choice".
 *
 * Radio group; each option carries an optional `body` that expands inline.
 * Options marked `requires_restart: true` render an amber chip
 * "this restarts the phase" + we add a confirmation step before submit fires.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ClarificationInputProps } from "./common";
import { isAnswerValid } from "./common";

export function SingleChoiceInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const defaultChoice = useMemo(
    () => clarification.options.find((o) => o.is_default)?.id ?? null,
    [clarification.options],
  );
  const [choiceId, setChoiceId] = useState<string | null>(defaultChoice);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  const selectedOption = clarification.options.find((o) => o.id === choiceId);
  const requiresRestart = !!selectedOption?.requires_restart;

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      onAnswerChange(choiceId ? { choice_id: choiceId } : null);
    }
  }, [choiceId, batchMode, onAnswerChange]);

  const answer = choiceId ? { choice_id: choiceId } : null;
  const valid = isAnswerValid(clarification, answer);

  const toggleBody = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSubmit = async () => {
    if (!valid || submitting || disabled) return;
    if (requiresRestart && !confirmingRestart) {
      setConfirmingRestart(true);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ choice_id: choiceId! });
    } finally {
      setSubmitting(false);
      setConfirmingRestart(false);
    }
  };

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  return (
    <Stack gap="3">
      <Stack gap="1.5" as="ul">
        {clarification.options.map((opt) => {
          const selected = choiceId === opt.id;
          const isExpanded = expanded.has(opt.id);
          return (
            <li key={opt.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setChoiceId(opt.id)}
                disabled={disabled}
                data-option-id={opt.id}
                className={cn(
                  "w-full rounded-md border p-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  selected
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Cluster gap="2" align="center" className="flex-wrap">
                  <span className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border-strong)]",
                  )}>
                    {selected && <span className="size-1.5 rounded-full bg-[var(--primary-fg)]" />}
                  </span>
                  <span className="font-medium">{opt.label}</span>
                  {opt.is_default && (
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      Default
                    </span>
                  )}
                  {opt.requires_restart && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
                      <AlertTriangle className="size-2.5" />
                      this restarts the phase
                    </span>
                  )}
                  {opt.body && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleBody(opt.id); }}
                      className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      Detail
                    </button>
                  )}
                </Cluster>
                {opt.body && isExpanded && (
                  <p className="ml-6 mt-1 whitespace-pre-line text-xs text-[var(--text-muted)]">{opt.body}</p>
                )}
              </button>
            </li>
          );
        })}
      </Stack>

      {requiresRestart && choiceId && (
        <p className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">
          {confirmingRestart
            ? "This will restart the phase. Continue?"
            : "Picking this option will restart the phase before resuming."}
        </p>
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
            {requiresRestart && !confirmingRestart ? "Confirm & continue" : confirmingRestart ? "Restart phase" : "Submit"}
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
