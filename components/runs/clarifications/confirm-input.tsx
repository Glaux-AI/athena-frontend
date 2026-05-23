"use client";

/**
 * ConfirmInput — F-04.14 / question_kind === "confirm".
 *
 * Single "Confirm" button acknowledging a statement (e.g., "This is a
 * breaking change — confirm to continue."). Sibling actions Defer 24h /
 * Skip surface only when allowed by priority / defer_count.
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import type { ClarificationInputProps } from "./common";

export function ConfirmInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      onAnswerChange(confirmed ? { confirmed: true } : null);
    }
  }, [confirmed, batchMode, onAnswerChange]);

  const handleSubmit = async () => {
    if (submitting || disabled) return;
    setSubmitting(true);
    try {
      setConfirmed(true);
      await onSubmit({ confirmed: true });
    } finally {
      setSubmitting(false);
    }
  };

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  if (batchMode) {
    return (
      <Cluster gap="2" align="center">
        <Button
          size="sm"
          variant={confirmed ? "secondary" : "primary"}
          onClick={() => setConfirmed((v) => !v)}
          disabled={disabled}
          data-confirm-toggle
        >
          <ShieldCheck className="size-3.5" />
          {confirmed ? "Confirmed" : "Confirm"}
        </Button>
      </Cluster>
    );
  }

  return (
    <Stack gap="3">
      <Cluster justify="between" align="center" className="flex-wrap gap-2">
        <Cluster gap="2">
          {canDefer && onDefer && (
            <Button variant="ghost" size="sm" onClick={onDefer} disabled={disabled}>
              Defer 24h
            </Button>
          )}
          {canSkip && onSkip && (
            <Button variant="ghost" size="sm" onClick={onSkip} disabled={disabled}>
              Open in inbox
            </Button>
          )}
        </Cluster>
        <Button size="sm" onClick={handleSubmit} disabled={disabled} loading={submitting}>
          <ShieldCheck className="size-3.5" />
          Confirm
        </Button>
      </Cluster>
    </Stack>
  );
}
