"use client";

/**
 * TransferOwnershipDialog - owner-only modal that demotes the current
 * owner to admin and promotes a chosen member to owner.
 *
 * §5.4 row 2 fence: the FE only renders the trigger for an actual
 * current-owner role; the BE re-enforces the same check via the
 * `org_transfer_ownership` permission + the explicit
 * `actor_membership.is_owner` guard in
 * `athena-backend/athena/api/routers/members.py`. Confirmation pattern
 * mirrors `/settings/danger`: the admin must type the org slug exactly.
 *
 * Skinned via the shared <Modal> (glass-sheet; focus-trap, Esc, and
 * overlay-close come free from Radix).
 */

import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inputFocus } from "@/components/ui/focus";
import { Modal } from "@/components/ui/overlay";
import { MemberPicker } from "@/components/ui/member-picker";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
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
  const [newOwnerId, setNewOwnerId] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = members.filter((m) => !m.is_owner && !m.deactivated_at);

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
    <Modal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      title={
        <Cluster gap="2" align="center">
          <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
          <span>Transfer ownership</span>
        </Cluster>
      }
      description={
        <>
          Promotes the selected member to owner and demotes you to{" "}
          <code>admin</code>. Only one owner per org - the swap is
          atomic. You can ask the new owner to transfer back later.
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
        </>
      }
    >
      <Stack gap="4" data-testid="transfer-ownership-dialog">
        {candidates.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
            No eligible members to receive ownership. Invite another
            admin first, then come back.
          </p>
        ) : (
          <>
            <Stack gap="1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">
                New owner
              </span>
              <MemberPicker
                members={candidates}
                value={newOwnerId || null}
                onSelect={(m) => setNewOwnerId(m.user_id)}
                disabled={submitting}
                placeholder="Search admins and members…"
                data-testid="transfer-new-owner-select"
              />
            </Stack>

            <Stack gap="1.5">
              <label
                htmlFor="transfer-confirm-slug"
                className="text-xs font-medium text-[var(--text-muted)]"
              >
                Type <code>{orgSlug}</code> to confirm.
              </label>
              <input
                id="transfer-confirm-slug"
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={orgSlug}
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
                data-testid="transfer-confirm-slug"
                className={cn(
                  "rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-sm transition-[border-color,box-shadow]",
                  inputFocus,
                )}
              />
            </Stack>
          </>
        )}

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
