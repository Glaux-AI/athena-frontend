"use client";

/**
 * TransferOwnershipDialog — owner-only modal that demotes the current
 * owner to admin and promotes a chosen member to owner.
 *
 * §5.4 row 2 fence: the FE only renders the trigger for an actual
 * current-owner role; the BE re-enforces the same check via the
 * `org_transfer_ownership` permission + the explicit
 * `actor_membership.is_owner` guard in
 * `athena-backend/athena/api/routers/members.py`. Confirmation pattern
 * mirrors `/settings/danger`: the admin must type the org slug exactly.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type Member } from "@/lib/api/client";

export function TransferOwnershipDialog({
  orgId,
  orgSlug,
  members,
  onClose,
  onTransferred,
}: {
  orgId: string;
  orgSlug: string;
  /** All members in this org; the dialog filters out the current
   *  owner + any deactivated members. */
  members: Member[];
  onClose: () => void;
  onTransferred: (newOwnerName: string) => Promise<void> | void;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [newOwnerId, setNewOwnerId] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = members.filter((m) => !m.is_owner && !m.deactivated_at);

  // Focus Cancel on mount (destructive default), Esc closes.
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);
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

  const slugMatches = confirm === orgSlug;
  const submitDisabled = submitting || !newOwnerId || !slugMatches;

  const handleSubmit = useCallback(async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.members.transferOwnership(orgId, newOwnerId, confirm);
      await onTransferred(updated.display_name || updated.email);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to transfer ownership.");
      setSubmitting(false);
    }
  }, [confirm, newOwnerId, onTransferred, orgId, submitDisabled]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid="transfer-ownership-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <Card
        variant="glass"
        className="w-full max-w-lg shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Transfer ownership
              </span>
            </Cluster>
            <p id={descId} className="text-xs text-[var(--text-muted)]">
              Promotes the selected member to owner and demotes you to{" "}
              <code>admin</code>. Only one owner per org — the swap is
              atomic. You can ask the new owner to transfer back later.
            </p>
          </Stack>

          {candidates.length === 0 ? (
            <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
              No eligible members to receive ownership. Invite another
              admin first, then come back.
            </p>
          ) : (
            <>
              <Stack gap="1.5">
                <label
                  htmlFor={`${titleId}-new-owner`}
                  className="text-xs font-medium text-[var(--text-muted)]"
                >
                  New owner
                </label>
                <select
                  id={`${titleId}-new-owner`}
                  value={newOwnerId}
                  onChange={(e) => setNewOwnerId(e.target.value)}
                  disabled={submitting}
                  data-testid="transfer-new-owner-select"
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <option value="">Pick a member…</option>
                  {candidates.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name} ({m.email}) — {m.role}
                    </option>
                  ))}
                </select>
              </Stack>

              <Stack gap="1.5">
                <label
                  htmlFor={`${titleId}-confirm`}
                  className="text-xs font-medium text-[var(--text-muted)]"
                >
                  Type <code>{orgSlug}</code> to confirm.
                </label>
                <input
                  id={`${titleId}-confirm`}
                  type="text"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={orgSlug}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={submitting}
                  data-testid="transfer-confirm-slug"
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </Stack>
            </>
          )}

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
              ref={cancelButtonRef}
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
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
              data-testid="transfer-ownership-submit"
            >
              Transfer ownership
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
