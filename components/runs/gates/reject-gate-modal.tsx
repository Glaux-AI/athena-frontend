"use client";

/**
 * §3.6 r6 — RejectGateModal.
 *
 * Modal a user opens from the Approval banner when they want to reject
 * the open gate. Wraps a textarea (min 10 / max 2000 chars) + Submit +
 * Cancel; on Submit, POSTs `{outcome: 'rejected', reason}` via
 * `rejectGate(runId, gateKey, reason)`.
 *
 * Mirrors the Esc-close + overlay-click-close behavior from
 * `<ScopeCollisionsModal>` — except this modal IS dismissable (unlike
 * the sticky scope-collisions one), so Esc and the overlay both call
 * `onClose`. Submit is disabled while the reason is out of range.
 *
 * Focus is trapped: textarea gets initial focus; Cancel restores focus
 * to the trigger via the standard `onClose` callback contract.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { rejectGate } from "@/lib/api/gates";
import { ApiError } from "@/lib/api/client";
import type { OpenGate } from "@/lib/api/gates";

/** Bounds enforced both in the textarea state + on submit. The lower
 * bound matches the BE's "non-empty reason" rule; the upper bound is
 * the FE-side ceiling — BE clamps to 1000 on persist. */
const REASON_MIN = 10;
const REASON_MAX = 2000;

export function RejectGateModal({
  runId,
  gateKey,
  onClose,
  onRejected,
}: {
  runId: string;
  gateKey: string;
  /** Dismiss the modal without rejecting. Esc + overlay click route here. */
  onClose: () => void;
  /** Called after a successful reject so the caller can re-fetch / dismiss. */
  onRejected: (gate: OpenGate) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea on mount so keyboard users land in the input.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Esc closes — dismissable modal contract.
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  const trimmedLen = reason.trim().length;
  const tooShort = trimmedLen < REASON_MIN;
  const tooLong = reason.length > REASON_MAX;
  const submitDisabled = submitting || tooShort || tooLong;

  const handleSubmit = useCallback(async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await rejectGate(runId, gateKey, reason.trim());
      onRejected(updated);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Couldn't reject the gate.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [runId, gateKey, reason, submitDisabled, onRejected]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid="reject-gate-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <Card
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Reject this gate
              </span>
            </Cluster>
            <p id={descId} className="text-xs text-[var(--text-muted)]">
              Tell Athena why you&apos;re rejecting <code className="font-mono">{gateKey}</code>. The reason is recorded on the run and visible to anyone who can view it.
            </p>
          </Stack>

          <Stack gap="1.5">
            <label htmlFor={`${titleId}-reason`} className="text-xs font-medium text-[var(--text-muted)]">
              Reason <span className="text-[var(--danger)]">*</span>
            </label>
            <textarea
              ref={textareaRef}
              id={`${titleId}-reason`}
              name="reason"
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              aria-invalid={tooLong || (trimmedLen > 0 && tooShort)}
              aria-describedby={`${titleId}-counter`}
              placeholder="e.g. The capabilities list missed the billing-retry service; rerun the spec with that scope included."
              className="min-h-[120px] resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Cluster justify="between" align="center">
              <span className="text-[10px] text-[var(--text-subtle)]">
                Minimum {REASON_MIN} characters.
              </span>
              <span
                id={`${titleId}-counter`}
                className={`text-[10px] tabular-nums ${tooLong ? "text-[var(--danger)]" : "text-[var(--text-subtle)]"}`}
              >
                {reason.length}/{REASON_MAX}
              </span>
            </Cluster>
          </Stack>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]"
            >
              {error}
            </p>
          )}

          <Cluster justify="end" gap="2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              data-action="cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void handleSubmit()}
              disabled={submitDisabled}
              loading={submitting}
              data-action="submit"
            >
              Reject gate
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
