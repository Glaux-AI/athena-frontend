"use client";

/**
 * DisconnectConfirmModal - confirm + capture an optional reason before
 * revoking an integration (Agent EEE). Reason is an audit-trail hint,
 * not BE-required. Skinned via the shared <Modal> (glass-sheet;
 * focus-trap, Esc, and overlay-close come free from Radix).
 */

import { useCallback, useId, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputFocus } from "@/components/ui/focus";
import { Modal } from "@/components/ui/overlay";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
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
  const fieldId = useId();

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
    <Modal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={
        <Cluster gap="2" align="center">
          <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
          <span>Disconnect {providerName}?</span>
        </Cluster>
      }
      description={
        <>
          Athena will stop reading from {providerName} until you
          reconnect. Stored credentials are revoked and removed from
          this org.
        </>
      }
      size="md"
      footer={
        <>
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
            Disconnect
          </Button>
        </>
      }
    >
      <Stack gap="4" data-testid="disconnect-confirm-modal">
        <Stack gap="1.5">
          <label
            htmlFor={`${fieldId}-reason`}
            className="text-xs font-medium text-[var(--text-muted)]"
          >
            Reason <span className="text-[var(--text-subtle)]">(optional, recorded in audit log)</span>
          </label>
          <textarea
            id={`${fieldId}-reason`}
            name="reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            aria-invalid={tooLong}
            aria-describedby={`${fieldId}-counter`}
            placeholder="e.g. Rotating the OAuth app - will reconnect right after."
            className={cn(
              "min-h-[96px] resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60",
              inputFocus,
            )}
          />
          <Cluster justify="end" align="center">
            <span
              id={`${fieldId}-counter`}
              className={`text-micro tabular-nums ${
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
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
          >
            {error}
          </p>
        )}
      </Stack>
    </Modal>
  );
}
