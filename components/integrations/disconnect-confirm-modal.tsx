"use client";

/**
 * DisconnectConfirmModal — confirm + capture an optional reason before
 * revoking an integration (Agent EEE). Mirrors `<RejectGateModal>` for
 * Esc + overlay close. Reason is an audit-trail hint, not BE-required.
 * Cancel gets initial focus (safer default for a destructive action).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { disconnect } from "@/lib/api/integrations";
import { ApiError } from "@/lib/api/client";

/** Upper bound enforced both in the textarea state + on submit. */
const REASON_MAX = 2000;

export function DisconnectConfirmModal({
  integrationId,
  providerName,
  onClose,
  onDisconnected,
}: {
  integrationId: string;
  /** Display name of the provider, e.g. "GitHub". Shown in the prompt. */
  providerName: string;
  /** Dismiss the modal without disconnecting. Esc + overlay click route here. */
  onClose: () => void;
  /** Called after a successful disconnect so the caller can re-fetch. */
  onDisconnected: () => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel on mount — destructive action default.
  useEffect(() => {
    cancelButtonRef.current?.focus();
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
  const submitDisabled = submitting || tooLong;

  const handleSubmit = useCallback(async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = reason.trim();
      await (trimmed.length > 0 ? disconnect(integrationId, trimmed) : disconnect(integrationId));
      onDisconnected();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't disconnect the integration.");
    } finally {
      setSubmitting(false);
    }
  }, [integrationId, reason, submitDisabled, onDisconnected]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid="disconnect-confirm-modal-backdrop"
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
                Disconnect {providerName}?
              </span>
            </Cluster>
            <p id={descId} className="text-xs text-[var(--text-muted)]">
              Athena will stop reading from {providerName} until you
              reconnect. Stored credentials are revoked and removed from
              this org.
            </p>
          </Stack>

          <Stack gap="1.5">
            <label
              htmlFor={`${titleId}-reason`}
              className="text-xs font-medium text-[var(--text-muted)]"
            >
              Reason <span className="text-[var(--text-subtle)]">(optional, recorded in audit log)</span>
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
              placeholder="e.g. Rotating the OAuth app — will reconnect right after."
              className="min-h-[96px] resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Cluster justify="end" align="center">
              <span
                id={`${titleId}-counter`}
                className={`text-[10px] tabular-nums ${
                  tooLong ? "text-[var(--danger)]" : "text-[var(--text-subtle)]"
                }`}
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
              ref={cancelButtonRef}
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
              Disconnect
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
