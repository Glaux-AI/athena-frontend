"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type Invitation } from "@/lib/api/client";

const ROLE_OPTIONS = ["engineer", "reviewer", "auditor", "ws_admin", "admin"];

export default function InvitationsPage() {
  const { activeOrgId } = useSession();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("engineer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      setInvitations(await api.invitations.list(activeOrgId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invitations");
    }
  }, [activeOrgId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    setBusy(true);
    setError(null);
    try {
      await api.invitations.create(activeOrgId, { email, role });
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv: Invitation) => {
    if (!activeOrgId) return;
    try {
      await api.invitations.revoke(activeOrgId, inv.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke");
    }
  };

  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Invitations</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Invite teammates by email. Recipients sign in with GitHub to accept.
        </p>
      </Stack>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <Cluster gap="2" align="end">
              <label className="flex-1 text-sm">
                <span className="mb-1 inline-block font-medium">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alice@lumen.dev"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 inline-block font-medium">Role</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invitation"}</Button>
            </Cluster>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending</CardTitle>
          <CardDescription>Active invitations not yet accepted or revoked.</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No invitations.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                <tr>
                  <th className="pb-2 pr-3">Email</th>
                  <th className="pb-2 pr-3">Role</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const status = inv.revoked_at
                    ? "revoked"
                    : inv.accepted_at
                      ? "accepted"
                      : new Date(inv.expires_at) < new Date()
                        ? "expired"
                        : "pending";
                  return (
                    <tr key={inv.id} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-3 font-medium">{inv.email}</td>
                      <td className="py-2 pr-3 text-xs">{inv.role}</td>
                      <td className="py-2 pr-3 text-xs">{status}</td>
                      <td className="py-2 pr-3 text-right">
                        {status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => revoke(inv)}>Revoke</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
