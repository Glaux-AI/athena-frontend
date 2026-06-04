"use client";

/**
 * Delete-run confirmation modal.
 *
 * Opened from the task header's "Delete" button, which only appears once a run
 * is terminal (you cancel an active run first). Delete is PERMANENT — it
 * hard-deletes the run and its history (events, decisions, gates) with no
 * restore — so we confirm before firing. No reason field: unlike cancel, a
 * delete carries no note.
 *
 * Mirrors <CancelRunModal>'s Esc / overlay-click dismissal contract; initial
 * focus lands on the dismissing ("Keep task") button — the safe default for a
 * destructive, irreversible dialog.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError } from "@/lib/api/client";

export function DeleteRunModal({
  runId,
  onClose,
  onDeleted,
}: {
  runId: string;
  /** Dismiss without deleting. Esc + overlay click route here. */
  onClose: () => void;
  /** Called after a successful delete so the caller can navigate away. */
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const dismissRef = useRef<HTMLButtonElement>(null);

  // Focus the safe default ("Keep task") — never pre-focus an irreversible
  // confirm.
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

  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.runs.delete(runId);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete the task.");
    } finally {
      setSubmitting(false);
    }
  }, [runId, submitting, onDeleted]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid="delete-run-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <Card variant="elevated" className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--danger)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Delete this task?
              </span>
            </Cluster>
            <p id={descId} className="text-xs text-[var(--text-muted)]">
              This permanently removes the task and its history — phases,
              decisions, events, and gates. It can&apos;t be undone.
            </p>
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
              Keep task
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void handleConfirm()}
              disabled={submitting}
              loading={submitting}
              data-action="confirm"
            >
              Delete task
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
