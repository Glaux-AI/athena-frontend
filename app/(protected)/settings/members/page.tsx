"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type Member } from "@/lib/api/client";

const ROLE_OPTIONS = ["owner", "admin", "ws_admin", "engineer", "reviewer", "auditor"];

export default function MembersPage() {
  const { activeOrgId, me } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      setMembers(await api.members.list(activeOrgId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load members");
    }
  }, [activeOrgId]);

  useEffect(() => { void load(); }, [load]);

  const myMembership = me?.memberships.find((m) => m.orgId === activeOrgId);
  const canManage =
    myMembership?.role === "owner" || myMembership?.role === "admin" || myMembership?.role === "ws_admin";

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

  return (
    <Stack gap="4">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold">Members</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Everyone with a seat in this organization.
          </p>
        </Stack>
      </Cluster>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
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
                        {ROLE_OPTIONS.filter((r) => r !== "owner").map((r) => (
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
                    {canManage && !m.is_owner && (
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
    </Stack>
  );
}
