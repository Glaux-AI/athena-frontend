"use client";

/**
 * Cancel-run confirmation modal.
 *
 * Opened from the task header's "Cancel" button. Cancelling a run is
 * irreversible — the agent-worker driving it halts at its next phase
 * boundary and the run lands terminal — so we confirm before firing rather
 * than cancelling on a single click. The reason is OPTIONAL (unlike a gate
 * rejection, a cancel needs no justification); when given it's recorded on
 * the cancel decision and surfaced in the terminal SSE event.
 *
 * Mirrors <RejectGateModal>'s Esc / overlay-click dismissal contract. The
 * initial focus lands on the dismissing ("Keep running") button — the safe
 * default for a destructive dialog, so a stray Enter never stops a run.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError } from "@/lib/api/client";

/** BE caps the cancel reason at 500 chars (`RunCancelIn.reason` max_length). */
const REASON_MAX = 500;

export function CancelRunModal({
  runId,
  onClose,
  onCancelled,
}: {
  runId: string;
  /** Dismiss without cancelling. Esc + overlay click route here. */
  onClose: () => void;
  /** Called after a successful cancel so the caller can re-fetch / dismiss. */
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const dismissRef = useRef<HTMLButtonElement>(null);

  // Focus the safe default ("Keep running") on mount — a destructive dialog
  // should never have its confirm pre-focused.
  useEffect(() => {
    dismissRef.current?.focus();
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

  const tooLong = reason.length > REASON_MAX;
  const confirmDisabled = submitting || tooLong;

  const handleConfirm = useCallback(async () => {
    if (confirmDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = reason.trim();
      await api.runs.cancel(runId, trimmed.length > 0 ? trimmed : undefined);
      onCancelled();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't cancel the task.");
    } finally {
      setSubmitting(false);
    }
  }, [runId, reason, confirmDisabled, onCancelled]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid="cancel-run-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <Card variant="glass" className="w-full max-w-lg shadow-[var(--shadow-3)]" onClick={(e) => e.stopPropagation()}>
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--danger)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Cancel this task?
              </span>
            </Cluster>
            <p id={descId} className="text-xs text-[var(--text-muted)]">
              Athena stops working on this task and it can&apos;t be resumed. A
              phase already underway finishes, then the agent halts. You can
              optionally note why.
            </p>
          </Stack>

          <Stack gap="1.5">
            <label
              htmlFor={`${titleId}-reason`}
              className="text-xs font-medium text-[var(--text-muted)]"
            >
              Reason <span className="text-[var(--text-subtle)]">(optional)</span>
            </label>
            <textarea
              id={`${titleId}-reason`}
              name="reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              aria-invalid={tooLong}
              aria-describedby={`${titleId}-counter`}
              placeholder="e.g. Superseded by a newer task — no longer needed."
              className="min-h-[96px] resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Cluster justify="end" align="center">
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
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]"
            >
              {error}
            </p>
          )}

          <Cluster justify="end" gap="2">
            <Button
              ref={dismissRef}
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              data-action="dismiss"
            >
              Keep running
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void handleConfirm()}
              disabled={confirmDisabled}
              loading={submitting}
              data-action="confirm"
            >
              Cancel task
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
