"use client";

/**
 * Settings → Members — unified people-management surface.
 *
 * Folds the previously-separate `/settings/invitations` page into this
 * one (a member and a pending-invite are the same job — "manage the
 * people in this org"). Order:
 *
 *   1. Invite-by-email form (admins only).
 *   2. Pending invitations list (admins only — revoke per row).
 *   3. Active + deactivated members table (everyone reads; admins
 *      change role / deactivate / reactivate).
 */

import { useCallback, useEffect, useState } from "react";
import { Mail, UserPlus, Loader2, Link as LinkIcon, Send } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import {
  api,
  ApiError,
  type Invitation,
  type InvitationWithWarning,
  type Member,
  type SeatsOut,
} from "@/lib/api/client";
import { SeatsBadge } from "@/components/members/seats-badge";
import { AwaitingSeatPill } from "@/components/members/awaiting-seat-pill";
import { useBuySeatsModal } from "@/lib/stores/buy-seats-modal";
import { TransferOwnershipDialog } from "@/components/members/transfer-ownership-dialog";
import { InviteLinkModal } from "@/components/members/invite-link-modal";

const MEMBER_ROLE_OPTIONS = ["owner", "admin", "ws_admin", "engineer", "reviewer", "auditor"];
const INVITE_ROLE_OPTIONS = ["engineer", "reviewer", "auditor", "ws_admin", "admin"];

export default function MembersPage() {
  const { activeOrgId, me } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [seats, setSeats] = useState<SeatsOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [m, inv, s] = await Promise.all([
        api.members.list(activeOrgId),
        api.invitations.list(activeOrgId).catch(() => [] as Invitation[]),
        // Older BE builds may 404 on /seats; fall back to null so the
        // gating UI degrades gracefully (everything renders as today
        // when seats info isn't available).
        api.billing.getSeats(activeOrgId).catch(() => null as SeatsOut | null),
      ]);
      setMembers(m);
      setInvitations(inv);
      setSeats(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load members");
    }
  }, [activeOrgId]);

  useEffect(() => { void load(); }, [load]);

  const myMembership = me?.memberships.find((m) => m.orgId === activeOrgId);
  const canManage =
    myMembership?.role === "owner" || myMembership?.role === "admin" || myMembership?.role === "ws_admin";
  const isOwner = !!myMembership?.isOwner;
  const orgSlug = myMembership?.orgSlug ?? "";

  const change = async (m: Member, role: string) => {
    if (!activeOrgId) return;
    setBusy(m.user_id);
    try {
      await api.members.changeRole(activeOrgId, m.user_id, role);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to change role");
    } finally {
      setBusy(null);
    }
  };

  const deactivate = async (m: Member) => {
    if (!activeOrgId) return;
    setBusy(m.user_id);
    try {
      await api.members.deactivate(activeOrgId, m.user_id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to deactivate");
    } finally {
      setBusy(null);
    }
  };

  const reactivate = async (m: Member) => {
    if (!activeOrgId) return;
    setBusy(m.user_id);
    try {
      await api.members.reactivate(activeOrgId, m.user_id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to reactivate");
    } finally {
      setBusy(null);
    }
  };

  const pendingInvites = invitations.filter(
    (inv) => !inv.revoked_at && !inv.accepted_at && new Date(inv.expires_at) >= new Date(),
  );

  return (
    <Stack gap="4">
      <Cluster gap="3" align="center" justify="between">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Everyone with a seat in this organization, plus pending invitations.
          </p>
        </Stack>
        {/* §7.9.6 row 2473 — Seats badge links to /settings/billing. */}
        <SeatsBadge seats={seats} />
      </Cluster>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      {canManage && (
        <InviteCard activeOrgId={activeOrgId!} seats={seats} onInvited={load} />
      )}

      {pendingInvites.length > 0 && (
        <PendingInvitesCard
          invitations={pendingInvites}
          canManage={canManage}
          activeOrgId={activeOrgId!}
          seats={seats}
          onRevoked={load}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{members.length} member{members.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Owner shows on top; deactivated members at the bottom.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
              <tr>
                <th className="pb-2 pr-3">Member</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">
                    <Stack gap="0">
                      <span className="font-medium">{m.display_name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{m.email}</span>
                    </Stack>
                  </td>
                  <td className="py-2 pr-3">
                    {m.is_owner ? (
                      <span className="inline-flex rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--primary)]">
                        owner
                      </span>
                    ) : canManage ? (
                      <select
                        value={m.role}
                        disabled={busy === m.user_id}
                        onChange={(e) => change(m, e.target.value)}
                        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                      >
                        {MEMBER_ROLE_OPTIONS.filter((r) => r !== "owner").map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs">{m.role}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {m.deactivated_at ? (
                      <span className="text-[var(--text-subtle)] italic">deactivated</span>
                    ) : (
                      <span className="text-[var(--success)]">active</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {m.is_owner && isOwner ? (
                      // §5.4 row 2 — only the current owner sees the
                      // transfer affordance on their own row. The dialog
                      // requires typing the org slug to confirm.
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="transfer-ownership-trigger"
                        onClick={() => setTransferOpen(true)}
                      >
                        Transfer ownership
                      </Button>
                    ) : canManage && !m.is_owner && (
                      m.deactivated_at ? (
                        <Button size="sm" variant="ghost" disabled={busy === m.user_id} onClick={() => reactivate(m)}>
                          Reactivate
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={busy === m.user_id} onClick={() => deactivate(m)}>
                          Deactivate
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {transferOpen && activeOrgId && (
        <TransferOwnershipDialog
          orgId={activeOrgId}
          orgSlug={orgSlug}
          members={members}
          onClose={() => setTransferOpen(false)}
          onTransferred={async (newOwnerName: string) => {
            setTransferOpen(false);
            toast.success(`Ownership transferred to ${newOwnerName}`);
            await load();
          }}
        />
      )}
    </Stack>
  );
}

/* ------------------------ Invite form ------------------------ */

/**
 * §7.9.6 row 2471 — Invite card gates by `seats.available_seats`:
 *   - `available > 0`  → existing "Send invite" button submits.
 *   - `available === 0` → submit replaced with a yellow "Seats full —
 *     buy a seat or upgrade" CTA that toasts the deferred BuySeatsModal.
 *     Form fields stay rendered so the admin can prep the invite while
 *     they wait for the modal swap.
 *
 * Soft-cap warning: when the mint response carries `warning.code ===
 * "over_seat_cap"`, surface a Sonner toast pointing at the same
 * (deferred) buy-seats CTA.
 */
function InviteCard({
  activeOrgId,
  seats,
  onInvited,
}: {
  activeOrgId: string;
  seats: SeatsOut | null;
  onInvited: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("engineer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkInvitation, setLinkInvitation] = useState<Invitation | null>(null);
  const buySeatsModal = useBuySeatsModal();

  const atCap = seats !== null && seats.available_seats <= 0;

  // §5.4 row-3 — generate a shareable invite link. Same role select as
  // the email mint; no email is sent — the URL is the share payload.
  const generateLink = async () => {
    if (linkBusy) return;
    setLinkBusy(true);
    setError(null);
    try {
      const inv = await api.invitations.createLink(activeOrgId, { role });
      setLinkInvitation(inv);
      await onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate invite link");
    } finally {
      setLinkBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy || atCap) return;
    setBusy(true);
    setError(null);
    try {
      const result = (await api.invitations.create(activeOrgId, {
        email: email.trim(),
        role,
      })) as InvitationWithWarning;
      setEmail("");
      setRole("engineer");
      // §7.9.6 row 2471 — Soft-cap toast. The invite IS still minted,
      // but the workspace is over capacity now; the recipient won't be
      // able to accept until extra seats land.
      if (result.warning?.code === "over_seat_cap") {
        const meta = result.warning.metadata ?? {};
        const active = typeof meta.active_seats === "number" ? meta.active_seats : null;
        const total = typeof meta.total_seats === "number" ? meta.total_seats : null;
        const over = active !== null && total !== null ? Math.max(1, active + (meta.pending_invitations as number ?? 0) - total) : 1;
        toast.warning(
          `Invite sent — workspace is ${over} over capacity. Buy seats or upgrade to admit them.`,
          {
            action: {
              label: "Buy seats",
              onClick: () => buySeatsModal.open(),
            },
          },
        );
      }
      await onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit}>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <UserPlus className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Invite a teammate</span>
              <span className="text-xs text-[var(--text-muted)]">
                Email + role. Recipients sign in with GitHub to accept.
              </span>
            </Cluster>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
              <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 focus-within:border-[var(--primary)]">
                <Mail className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alice@yourorg.com"
                  className="w-full bg-transparent text-sm focus:outline-none"
                />
              </div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
              >
                {INVITE_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {atCap ? (
                <Button
                  type="button"
                  data-testid="seats-full-cta"
                  className="border border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)] hover:opacity-90"
                  onClick={() => buySeatsModal.open()}
                >
                  Seats full — buy a seat or upgrade
                </Button>
              ) : (
                <Button type="submit" disabled={busy || !email.trim()} data-testid="send-invite">
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                  Send invitation
                </Button>
              )}
            </div>
            {/* §5.4 row-3 — shareable invite link. Same role select; no
                email required. Opens a modal with copy / regenerate /
                revoke once a link exists. */}
            <Cluster gap="2" align="center" justify="between">
              <span className="text-xs text-[var(--text-subtle)]">
                Or skip the email and share a link:
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={linkBusy || atCap}
                onClick={() => void generateLink()}
                data-testid="generate-invite-link"
              >
                {linkBusy ? <Loader2 className="size-3.5 animate-spin" /> : <LinkIcon className="size-3.5" />}
                Generate invite link
              </Button>
            </Cluster>
            {error && (
              <p className="text-xs text-[var(--danger)]">{error}</p>
            )}
          </Stack>
        </form>
      </CardContent>
      {linkInvitation && (
        <InviteLinkModal
          activeOrgId={activeOrgId}
          invitation={linkInvitation}
          role={role}
          onClose={() => setLinkInvitation(null)}
          onRegenerated={(inv: Invitation) => setLinkInvitation(inv)}
          onRevoked={async () => {
            setLinkInvitation(null);
            await onInvited();
          }}
        />
      )}
    </Card>
  );
}

/* ------------------------ Pending invites ------------------------ */

/**
 * §7.9.6 row 2472 — Pending invitations get an "Awaiting seat" pill on
 * the rows that would tip the workspace over its seat cap on accept.
 *
 * Today we compute the flag FE-side from the SeatsOut summary: when
 * `pending > available`, the (pending − available) most-recently-created
 * invitations are over-cap. Once the BE adds a per-row
 * `would_exceed_cap` flag, this can read that field directly.
 */
function PendingInvitesCard({
  invitations,
  canManage,
  activeOrgId,
  seats,
  onRevoked,
}: {
  invitations: Invitation[];
  canManage: boolean;
  activeOrgId: string;
  seats: SeatsOut | null;
  onRevoked: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revoke = async (inv: Invitation) => {
    setBusyId(inv.id);
    setError(null);
    try {
      await api.invitations.revoke(activeOrgId, inv.id);
      await onRevoked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke");
    } finally {
      setBusyId(null);
    }
  };

  // §5.4 row-2 — resend the original email + extend expires_at.
  // 409s on link-mode rows (the action is hidden for those anyway).
  const resend = async (inv: Invitation) => {
    setBusyId(inv.id);
    setError(null);
    try {
      await api.invitations.resend(activeOrgId, inv.id);
      toast.success(`Invitation resent to ${inv.email ?? "recipient"}`);
      await onRevoked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to resend");
    } finally {
      setBusyId(null);
    }
  };

  // Identify which invitations are over-cap. We mark the (pending −
  // available) most-recently-created rows as awaiting-seat.
  const overCapIds = (() => {
    if (!seats) return new Set<string>();
    const over = (seats.pending_invitations ?? invitations.length) - seats.available_seats;
    if (over <= 0) return new Set<string>();
    const sorted = [...invitations].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return new Set(sorted.slice(0, over).map((inv) => inv.id));
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{invitations.length} pending invitation{invitations.length === 1 ? "" : "s"}</CardTitle>
        <CardDescription>Active invitations not yet accepted or revoked.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-xs text-[var(--danger)]">{error}</p>}
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
            <tr>
              <th className="pb-2 pr-3">Email</th>
              <th className="pb-2 pr-3">Role</th>
              <th className="pb-2 pr-3">Expires</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id} className="border-t border-[var(--border)]">
                <td className="py-2 pr-3 font-medium">
                  {inv.kind === "link" ? (
                    <Cluster gap="1.5" align="center">
                      <LinkIcon className="size-3 text-[var(--text-subtle)]" aria-hidden />
                      <span className="text-xs italic text-[var(--text-muted)]">
                        Shareable link
                      </span>
                    </Cluster>
                  ) : (
                    inv.email
                  )}
                </td>
                <td className="py-2 pr-3 text-xs">{inv.role}</td>
                <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                  {new Date(inv.expires_at).toLocaleDateString()}
                </td>
                <td className="py-2 pr-3 text-xs">
                  {overCapIds.has(inv.id) ? (
                    inv.email ? (
                      <AwaitingSeatPill inviteeEmail={inv.email} />
                    ) : (
                      <AwaitingSeatPill />
                    )
                  ) : (
                    <span className="text-[var(--text-subtle)]">Awaiting accept</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">
                  {canManage && (
                    <Cluster gap="1" justify="end">
                      {inv.kind === "email" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === inv.id}
                          onClick={() => resend(inv)}
                          data-testid={`resend-invite-${inv.id}`}
                        >
                          {busyId === inv.id ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                          Resend
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === inv.id}
                        onClick={() => revoke(inv)}
                      >
                        {busyId === inv.id ? <Loader2 className="size-3 animate-spin" /> : null}
                        Revoke
                      </Button>
                    </Cluster>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
