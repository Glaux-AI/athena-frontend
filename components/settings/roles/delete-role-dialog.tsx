"use client";

/**
 * DeleteRoleDialog - delete a role, reassigning its members first.
 *
 * When the role still has members / pending invitations (or is the
 * org's default-invite role), the BE refuses without a `reassign_to`
 * target - so the dialog requires picking the landing role up front
 * and shows exactly what will move. Unused roles get a plain confirm.
 */

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inUse =
    role.member_count > 0 ||
    role.pending_invitation_count > 0 ||
    role.is_default_for_invite;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, busy]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="delete-role-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <Card
        variant="glass"
        className="w-full max-w-md shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--danger)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Delete role &ldquo;{role.name}&rdquo;
              </span>
            </Cluster>
            {inUse ? (
              <p className="text-xs text-[var(--text-muted)]">
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
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Nobody uses this role. Deleting it cannot be undone.
              </p>
            )}
          </Stack>

          {inUse && (
            <Stack gap="1.5">
              <label htmlFor={`${titleId}-target`} className="text-xs font-medium text-[var(--text-muted)]">
                Move everyone to
              </label>
              <select
                id={`${titleId}-target`}
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                disabled={busy}
                data-testid="delete-role-reassign-select"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <option value="">Pick a role…</option>
                {otherRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.permissions.length} permissions)
                  </option>
                ))}
              </select>
            </Stack>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]">
              {error}
            </p>
          )}

          <Cluster justify="end" gap="2">
            <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
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
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
