"use client";

/**
 * AiSubscriptionConnectModal - paste-and-verify connect flow for a
 * personal AI subscription (Claude Pro/Max via Claude Code, ChatGPT via
 * Codex). Skinned via the shared <Modal> (glass-sheet; focus-trap, Esc,
 * and overlay-close come free from Radix).
 *
 * The Connect button live-verifies the credential through the vendor CLI
 * on the server BEFORE anything is stored - a failure shows the server's
 * actionable message inline and stores nothing, so the card can never
 * land in a "saved but broken" state.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputFocus } from "@/components/ui/focus";
import { Modal } from "@/components/ui/overlay";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import { api, ApiError, type AiSubscription } from "@/lib/api/client";

export interface ConnectInstructions {
  /** Numbered steps the user follows on their own machine. */
  steps: string[];
  credentialLabel: string;
  placeholder: string;
}

export function AiSubscriptionConnectModal({
  provider,
  providerName,
  instructions,
  onClose,
  onConnected,
}: {
  provider: string;
  providerName: string;
  instructions: ConnectInstructions;
  onClose: () => void;
  /** Called with the verified connection so the caller can refresh. */
  onConnected: (row: AiSubscription) => void;
}) {
  const [credential, setCredential] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submitDisabled = submitting || credential.trim().length < 8;

  const handleSubmit = useCallback(async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const row = await api.aiSubscriptions.connect(provider, credential.trim());
      onConnected(row);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Couldn't verify the credential. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [provider, credential, submitDisabled, onConnected]);

  return (
    <Modal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={
        <Cluster gap="2" align="center">
          <KeyRound className="size-4 text-[var(--primary)]" aria-hidden />
          <span>Connect {providerName}</span>
        </Cluster>
      }
      description="Personal connection - only you can use it, and usage draws on your plan, never org credits. The credential is verified live, then stored encrypted server-side."
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
            onClick={() => void handleSubmit()}
            disabled={submitDisabled}
            loading={submitting}
            data-action="connect-verify"
          >
            Connect &amp; verify
          </Button>
        </>
      }
    >
      <Stack gap="4" data-testid="ai-subscription-connect-modal">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--text-muted)]">
          {instructions.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <Stack gap="1.5">
          <label
            htmlFor={`${fieldId}-credential`}
            className="text-xs font-medium text-[var(--text-muted)]"
          >
            {instructions.credentialLabel}
          </label>
          <textarea
            ref={textareaRef}
            id={`${fieldId}-credential`}
            name="credential"
            rows={4}
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            disabled={submitting}
            spellCheck={false}
            autoComplete="off"
            placeholder={instructions.placeholder}
            className={cn(
              "min-h-[96px] resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60",
              inputFocus,
            )}
          />
        </Stack>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
          >
            {error}
          </p>
        )}

        <Cluster gap="1" align="center">
          <ShieldCheck className="size-3 text-[var(--text-subtle)]" aria-hidden />
          <span className="text-micro text-[var(--text-subtle)]">
            Verified before saving - never shown again after this.
          </span>
        </Cluster>
      </Stack>
    </Modal>
  );
}
