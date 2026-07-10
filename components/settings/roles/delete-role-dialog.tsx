"use client";

/**
 * DeleteRoleDialog - delete a role, reassigning its members first.
 *
 * When the role still has members / pending invitations (or is the
 * org's default-invite role), the BE refuses without a `reassign_to`
 * target - so the dialog requires picking the landing role up front
 * and shows exactly what will move. Unused roles get a plain confirm.
 *
 * Skinned via the shared <Modal> (glass-sheet; focus-trap, Esc, and
 * overlay-close come free from Radix).
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type OrgRole } from "@/lib/api/client";

export function DeleteRoleDialog({
  orgId,
  role,
  otherRoles,
  onClose,
  onDeleted,
}: {
  orgId: string;
  role: OrgRole;
  /** Every other role in the org - reassignment candidates. */
  otherRoles: OrgRole[];
  onClose: () => void;
  onDeleted: () => Promise<void> | void;
}) {
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inUse =
    role.member_count > 0 ||
    role.pending_invitation_count > 0 ||
    role.is_default_for_invite;

  const submit = async () => {
    if (busy || (inUse && !reassignTo)) return;
    setBusy(true);
    setError(null);
    try {
      await api.roles.remove(orgId, role.id, inUse ? reassignTo : undefined);
      toast.success(`Role "${role.name}" deleted`);
      await onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete role");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        <Cluster gap="2" align="center">
          <AlertTriangle className="size-4 text-[var(--danger)]" aria-hidden />
          <span>Delete role &ldquo;{role.name}&rdquo;</span>
        </Cluster>
      }
      description={
        inUse ? (
          <>
            {role.member_count > 0 && (
              <>
                <strong>{role.member_count}</strong> member{role.member_count === 1 ? "" : "s"}
              </>
            )}
            {role.member_count > 0 && role.pending_invitation_count > 0 && " and "}
            {role.pending_invitation_count > 0 && (
              <>
                <strong>{role.pending_invitation_count}</strong> pending invitation
                {role.pending_invitation_count === 1 ? "" : "s"}
              </>
            )}
            {(role.member_count > 0 || role.pending_invitation_count > 0) &&
              " currently use this role"}
            {role.is_default_for_invite &&
              (role.member_count > 0 || role.pending_invitation_count > 0
                ? ", and it is the default role for new members"
                : "It is the default role for new members")}
            . Pick where they should land - everything moves atomically, then the role is removed.
          </>
        ) : (
          "Nobody uses this role. Deleting it cannot be undone."
        )
      }
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void submit()}
            disabled={busy || (inUse && !reassignTo)}
            loading={busy}
            data-testid="delete-role-submit"
          >
            Delete role
          </Button>
        </>
      }
    >
      <Stack gap="4" data-testid="delete-role-dialog">
        {inUse && (
          <Stack gap="1.5">
            <label htmlFor="delete-role-target" className="text-xs font-medium text-[var(--text-muted)]">
              Move everyone to
            </label>
            <Select
              id="delete-role-target"
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              disabled={busy}
              data-testid="delete-role-reassign-select"
            >
              <option value="">Pick a role…</option>
              {otherRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.permissions.length} permissions)
                </option>
              ))}
            </Select>
          </Stack>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
            {error}
          </p>
        )}
      </Stack>
    </Modal>
  );
}
