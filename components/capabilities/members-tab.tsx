"use client";

/**
 * CapabilityMembersTab — §5.30 per-capability access control.
 *
 * Lists every member attached to this capability + their role
 * (admin / viewer). Cap admins (or org owner/admin) see full controls:
 * add a new member by email, promote viewer ↔ admin, remove. Anyone
 * else gets the same list read-only.
 *
 * Add-by-email semantics: the email must belong to an existing user
 * with an active org membership. Unknown email returns 404 with the
 * `user_not_in_org` code — we surface that as an inline CTA pointing
 * at `/settings/invitations` (the existing org-invite flow).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Loader2, Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type CapabilityMember,
  type CapabilityRole,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

interface Props {
  capabilityId: string;
  members: CapabilityMember[];
  /** Current viewer's user_id. Used to disable "remove yourself" + to flag
   *  the row visually so users can find themselves quickly. */
  currentUserId: string;
  /** True iff the current viewer can manage this cap's members (org
   *  owner/admin OR has a role=admin row on this cap). Drives whether the
   *  Add / Promote / Demote / Remove controls render. */
  canManage: boolean;
  /** Fired after a successful add / patch / remove. */
  onChanged: () => Promise<void> | void;
}

export function CapabilityMembersTab({
  capabilityId,
  members,
  currentUserId,
  canManage,
  onChanged,
}: Props) {
  return (
    <Stack gap="4">
      {canManage && <AddMemberCard capabilityId={capabilityId} onAdded={onChanged} />}
      <MembersListCard
        capabilityId={capabilityId}
        members={members}
        currentUserId={currentUserId}
        canManage={canManage}
        onChanged={onChanged}
      />
    </Stack>
  );
}

/* ----------------------------- Add member ---------------------------- */

function AddMemberCard({
  capabilityId,
  onAdded,
}: {
  capabilityId: string;
  onAdded: () => Promise<void> | void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CapabilityRole>("viewer");
  const [saving, setSaving] = useState(false);
  const [notInOrg, setNotInOrg] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || saving) return;
    setSaving(true);
    setNotInOrg(false);
    try {
      await api.capabilities.members.addByEmail(capabilityId, { email: email.trim(), role });
      toast.success(`Added ${email.trim()} as ${role}.`);
      setEmail("");
      setRole("viewer");
      await onAdded();
    } catch (e) {
      if (e instanceof ApiError && e.code === "user_not_in_org") {
        setNotInOrg(true);
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't add member.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <UserPlus className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">Add a member</span>
            <span className="text-xs text-[var(--text-muted)]">
              Must already be an org member.
            </span>
          </Cluster>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 focus-within:border-[var(--primary)]">
              <Mail className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setNotInOrg(false); }}
                placeholder="teammate@yourorg.com"
                required
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
              {(["viewer", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "rounded-[5px] px-3 py-1 text-xs font-medium capitalize",
                    role === r
                      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Button type="submit" disabled={saving || !email.trim()}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              Add
            </Button>
          </div>
          {notInOrg && (
            <div className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] p-2.5 text-xs">
              <Cluster gap="2" align="center">
                <span className="font-semibold text-[var(--warning-ink)]">
                  No Athena user with that email is in your org.
                </span>
                <Link
                  href="/settings/members"
                  className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline"
                >
                  Invite to Athena →
                </Link>
              </Cluster>
              <p className="mt-1 text-[var(--text-muted)]">
                Invite them to the org first; once they accept you can add them to
                this capability.
              </p>
            </div>
          )}
        </Stack>
      </form>
    </Card>
  );
}

/* ----------------------------- Member list --------------------------- */

const ROLE_TONE: Record<CapabilityRole, string> = {
  admin:  "bg-[var(--primary-soft)] text-[var(--primary)]",
  viewer: "bg-[var(--surface-2)]    text-[var(--text-muted)]",
};

function MembersListCard({
  capabilityId,
  members,
  currentUserId,
  canManage,
  onChanged,
}: {
  capabilityId: string;
  members: CapabilityMember[];
  currentUserId: string;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const runRowAction = async (
    member: CapabilityMember,
    fn: () => Promise<unknown>,
    successCopy: string,
    failureCopy: string,
  ) => {
    setPendingId(member.id);
    try {
      await fn();
      toast.success(successCopy);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : failureCopy);
    } finally {
      setPendingId(null);
    }
  };

  const onChangeRole = (m: CapabilityMember, role: CapabilityRole) =>
    runRowAction(
      m,
      () => api.capabilities.members.patch(capabilityId, m.user_id, { role }),
      `${m.display_name ?? m.email} is now ${role === "admin" ? "an admin" : "a viewer"}.`,
      "Couldn't change role.",
    );

  const onRemove = (m: CapabilityMember) =>
    runRowAction(
      m,
      () => api.capabilities.members.remove(capabilityId, m.user_id),
      `Removed ${m.display_name ?? m.email}.`,
      "Couldn't remove member.",
    );

  if (members.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">
          No members on this capability yet.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <ShieldCheck className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Members</span>
          <span className="text-xs text-[var(--text-muted)]">{members.length} on this capability</span>
        </Cluster>
        <Stack gap="1.5" as="ul">
          {members.map((m) => {
            const isSelf = m.user_id === currentUserId;
            const initials = (m.display_name ?? m.email)
              .split(/\s+/)
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const isAdmin = m.role === "admin";
            return (
              <li
                key={m.id}
                className={cn(
                  "grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5",
                  isSelf && "border-[var(--primary-soft)]",
                )}
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)]">
                  {initials}
                </div>
                <Stack gap="0" className="min-w-0">
                  <Cluster gap="2" align="center">
                    <span className="truncate font-medium">{m.display_name ?? m.email}</span>
                    {isSelf && <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">you</span>}
                  </Cluster>
                  <span className="truncate text-xs text-[var(--text-muted)]">{m.email}</span>
                </Stack>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", ROLE_TONE[m.role])}>
                  {m.role}
                </span>
                {canManage && (
                  <Cluster gap="1" align="center">
                    <button
                      type="button"
                      onClick={() => onChangeRole(m, isAdmin ? "viewer" : "admin")}
                      disabled={pendingId === m.id}
                      title={isAdmin ? "Demote to viewer" : "Promote to admin"}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
                    >
                      {pendingId === m.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : isAdmin ? (
                        <ArrowDown className="size-3" aria-hidden />
                      ) : (
                        <ArrowUp className="size-3" aria-hidden />
                      )}
                      {isAdmin ? "Demote" : "Promote"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(m)}
                      disabled={pendingId === m.id || isSelf}
                      title={isSelf ? "You can't remove yourself" : "Remove from this capability"}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)] disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <X className="size-3" aria-hidden /> Remove
                    </button>
                  </Cluster>
                )}
                {!canManage && <span className="text-[10px] text-[var(--text-subtle)]">view only</span>}
              </li>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}
