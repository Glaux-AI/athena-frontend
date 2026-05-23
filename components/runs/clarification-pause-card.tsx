"use client";

/**
 * ClarificationPauseCard — F-04.14 inline pause card for mid-step /
 * pre-finalize questions. Renders the rationale prominently because the user
 * hits it while reviewing phase content.
 *
 * Routes the per-question-kind input via a switch on `question_kind`. When
 * multiple clarifications share a `batch_id`, the page mounts a single card
 * with all questions stacked — submit is disabled until every blocker has a
 * valid answer. Optional questions inside a batch can be skipped (per Task
 * 03.4: skip is only valid for `priority === 'optional'`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Info } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  ClarificationAnswer,
  ClarificationOrigin,
  ClarificationPriority,
  RunClarification,
} from "@/lib/api/client";
import { isAnswerValid } from "./clarifications/common";
import { SingleChoiceInput } from "./clarifications/single-choice-input";
import { MultiChoiceInput } from "./clarifications/multi-choice-input";
import { BooleanInput } from "./clarifications/boolean-input";
import { ConfirmInput } from "./clarifications/confirm-input";
import { ChoiceWithFreeTextInput } from "./clarifications/choice-with-free-text-input";
import { FreeTextInput } from "./clarifications/free-text-input";
import { NumericInput } from "./clarifications/numeric-input";
import { ReferencePickInput } from "./clarifications/reference-pick-input";

export interface PauseSubmitContext {
  qid: string;
  phaseKey: string;
  answer: ClarificationAnswer;
}

export interface ClarificationPauseCardProps {
  /** All clarifications to render in this card. Length > 1 ⇒ batch mode. */
  clarifications: RunClarification[];
  /** Submit a single clarification's answer. Caller routes to the API. */
  onSubmit: (ctx: PauseSubmitContext) => Promise<void> | void;
  /** Submit a batch atomically. Caller routes to `submitBatch`. */
  onSubmitBatch?: (answers: Array<{ qid: string; answer: ClarificationAnswer }>) => Promise<void> | void;
  onSkip?: (qid: string, phaseKey: string) => Promise<void> | void;
  onDefer?: (qid: string, phaseKey: string) => Promise<void> | void;
  /** Optional priority badge color override. */
  priorityTone?: "amber" | "red";
}

function priorityChip(priority: ClarificationPriority): { label: string; tone: string } {
  switch (priority) {
    case "blocker":
      return { label: "Blocker", tone: "bg-[var(--danger-soft)] text-[var(--danger)]" };
    case "normal":
      return { label: "Normal", tone: "bg-[var(--warning-soft)] text-[var(--warning)]" };
    case "optional":
      return { label: "Optional", tone: "bg-[var(--surface-2)] text-[var(--text-muted)]" };
  }
}

function originLabel(origin: ClarificationOrigin): string {
  switch (origin) {
    case "agent":
      return "Athena needs your input";
    case "system":
      return "System flag";
    case "reviewer":
      return "Reviewer note";
    case "conli":
      return "Confidence-low input";
    case "scope_collisions":
      return "Scope collision";
    case "stale_knowledge":
      return "Stale knowledge";
    case "tie_breaker":
      return "Tie breaker";
    case "no_unknown_term":
      return "Unknown term";
    case "no_unverified_reference":
      return "Unverified reference";
    case "active_decision_conflict":
      return "Conflicts with active decision";
  }
}

export function ClarificationPauseCard({
  clarifications,
  onSubmit,
  onSubmitBatch,
  onSkip,
  onDefer,
}: ClarificationPauseCardProps) {
  const batched = clarifications.length > 1;
  const headPriority = clarifications.find((c) => c.priority === "blocker")?.priority ?? clarifications[0]!.priority;
  const headOrigin = clarifications[0]!.origin;
  const phaseKey = clarifications[0]!.phase_key;
  const tone = priorityChip(headPriority);

  // Track per-qid answers in batch mode.
  const [answers, setAnswers] = useState<Record<string, ClarificationAnswer | null>>({});

  const setAnswerFor = useCallback(
    (qid: string, a: ClarificationAnswer | null) => {
      setAnswers((prev) => ({ ...prev, [qid]: a }));
    },
    [],
  );

  useEffect(() => {
    // Initialize / prune answer map as the question set changes (resolve/expire).
    setAnswers((prev) => {
      const next: Record<string, ClarificationAnswer | null> = {};
      for (const c of clarifications) {
        next[c.qid] = prev[c.qid] ?? null;
      }
      return next;
    });
  }, [clarifications]);

  const blockersAnswered = useMemo(
    () =>
      clarifications
        .filter((c) => c.priority === "blocker")
        .every((c) => isAnswerValid(c, answers[c.qid] ?? null)),
    [clarifications, answers],
  );
  const [submittingBatch, setSubmittingBatch] = useState(false);

  const handleSubmitBatch = async () => {
    if (!onSubmitBatch || !blockersAnswered || submittingBatch) return;
    const payload: Array<{ qid: string; answer: ClarificationAnswer }> = [];
    for (const c of clarifications) {
      const a = answers[c.qid];
      if (a == null) continue;
      payload.push({ qid: c.qid, answer: a });
    }
    setSubmittingBatch(true);
    try {
      await onSubmitBatch(payload);
    } finally {
      setSubmittingBatch(false);
    }
  };

  return (
    <Card
      className={cn(
        "border-[var(--border-strong)]",
        headPriority === "blocker" ? "bg-[var(--danger-soft)]" : "bg-[var(--warning-soft)]",
      )}
      data-pause-card
      data-batched={batched ? "true" : "false"}
    >
      <Stack gap="3">
        <Cluster gap="2" align="center" className="flex-wrap">
          <AlertCircle className="size-4 text-[var(--warning)]" aria-hidden />
          <span className="text-sm font-semibold">
            {batched ? `${clarifications.length} questions paused this phase` : originLabel(headOrigin)}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              tone.tone,
            )}
          >
            {tone.label}
          </span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">phase: {phaseKey}</span>
        </Cluster>

        <Stack gap="3" as="ul">
          {clarifications.map((c) => (
            <li key={c.qid} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
              <Stack gap="2">
                <Cluster justify="between" align="start" className="flex-wrap gap-2">
                  <Stack gap="1" className="min-w-0">
                    <span className="text-sm font-semibold leading-snug">{c.question}</span>
                    {c.rationale && (
                      <Cluster gap="1" align="start" className="text-xs text-[var(--text-muted)]">
                        <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                        <span>
                          <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Why I&apos;m asking:</span>{" "}
                          {c.rationale}
                        </span>
                      </Cluster>
                    )}
                  </Stack>
                  <Cluster gap="1" align="center">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        priorityChip(c.priority).tone,
                      )}
                    >
                      {priorityChip(c.priority).label}
                    </span>
                  </Cluster>
                </Cluster>

                <ClarificationInputRouter
                  clarification={c}
                  onSubmit={(answer) => onSubmit({ qid: c.qid, phaseKey: c.phase_key, answer })}
                  {...(onSkip && c.priority === "optional"
                    ? { onSkip: () => onSkip(c.qid, c.phase_key) }
                    : {})}
                  {...(onDefer && c.priority !== "optional" && c.defer_count < 3
                    ? { onDefer: () => onDefer(c.qid, c.phase_key) }
                    : {})}
                  batchMode={batched}
                  onAnswerChange={(a) => setAnswerFor(c.qid, a)}
                />
              </Stack>
            </li>
          ))}
        </Stack>

        {batched && (
          <Cluster justify="between" align="center" className="flex-wrap gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-xs text-[var(--text-muted)]">
              {blockersAnswered
                ? "All blocker questions answered. Submit to resume the phase."
                : "Submit disabled until every blocker has a valid answer."}
            </span>
            <Button size="sm" onClick={handleSubmitBatch} disabled={!blockersAnswered} loading={submittingBatch}>
              Submit answers
            </Button>
          </Cluster>
        )}
      </Stack>
    </Card>
  );
}

/**
 * Dispatch the appropriate per-kind input based on `question_kind`. Lives in
 * the same file because both the card and the modal use it.
 */
export function ClarificationInputRouter(
  props: {
    clarification: RunClarification;
    onSubmit: (a: ClarificationAnswer) => Promise<void> | void;
    onSkip?: () => Promise<void> | void;
    onDefer?: () => Promise<void> | void;
    disabled?: boolean;
    batchMode?: boolean;
    onAnswerChange?: (a: ClarificationAnswer | null) => void;
  },
) {
  const { clarification } = props;
  switch (clarification.question_kind) {
    case "single_choice":
      return <SingleChoiceInput {...props} />;
    case "multi_choice":
      return <MultiChoiceInput {...props} />;
    case "boolean":
      return <BooleanInput {...props} />;
    case "confirm":
      return <ConfirmInput {...props} />;
    case "single_choice_with_free_text":
      return <ChoiceWithFreeTextInput {...props} />;
    case "free_text":
      return <FreeTextInput {...props} />;
    case "numeric":
      return <NumericInput {...props} />;
    case "reference_pick":
      return <ReferencePickInput {...props} />;
  }
}
