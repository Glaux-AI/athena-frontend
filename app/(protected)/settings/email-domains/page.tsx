"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, UserCog } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";
import { usePermissions } from "@/lib/session/use-permissions";
import { api, ApiError, type DomainVerification, type Org, type OrgRole } from "@/lib/api/client";

export default function EmailDomainsPage() {
  const { activeOrgId } = useSession();
  const { can } = usePermissions();
  const [domains, setDomains] = useState<DomainVerification[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [d, o, r] = await Promise.all([
        api.emailDomains.list(activeOrgId),
        api.orgs.get(activeOrgId).catch(() => null as Org | null),
        api.roles.list(activeOrgId).catch(() => [] as OrgRole[]),
      ]);
      setDomains(d);
      setOrg(o);
      setRoles(r);
    }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
  }, [activeOrgId]);

  useEffect(() => { void load(); }, [load]);

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    try {
      await api.emailDomains.claim(activeOrgId, domainInput);
      setDomainInput("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Claim failed");
    }
  };

  const verify = async (d: DomainVerification) => {
    if (!activeOrgId) return;
    setBusy(d.id);
    try {
      await api.emailDomains.verify(activeOrgId, d.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed (check DNS).");
    } finally {
      setBusy(null);
    }
  };

  const unclaim = async (d: DomainVerification) => {
    if (!activeOrgId) return;
    setBusy(d.id);
    try {
      await api.emailDomains.unclaim(activeOrgId, d.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unclaim failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Email domains"
        subtitle="Claim and verify domains so teammates signing in with matching emails can auto-join."
      />

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {org && (
        <DefaultRoleCard
          org={org}
          roles={roles}
          canEdit={can("org:manage")}
          onSaved={load}
        />
      )}

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Claim a domain</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={claim}>
            <Cluster gap="2" align="end">
              <label className="flex-1 text-sm">
                <span className="mb-1 inline-block font-medium">Domain</span>
                <input
                  required
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="lumen.dev"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </label>
              <Button type="submit">Claim</Button>
            </Cluster>
          </form>
        </CardContent>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Your domains</CardTitle>
          <CardDescription>Add the TXT record to the apex, then click Verify.</CardDescription>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <EmptyState
              icon={<Globe className="size-5" aria-hidden />}
              title="No domains claimed yet"
              description="Claim a domain above, then add its TXT record and verify so matching emails can auto-join."
            />
          ) : (
            <Stack gap="3">
              {domains.map((d) => (
                <Card
                  key={d.id}
                  className="border-[var(--border)] bg-[var(--surface-2)] p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]"
                >
                  <Stack gap="2">
                    <Cluster justify="between" align="center">
                      <Stack gap="0">
                        <span className="font-mono text-sm font-medium">{d.domain}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {d.verified_at ? "verified ✓" : d.last_error ?? "awaiting DNS"}
                        </span>
                      </Stack>
                      <Cluster gap="2">
                        {!d.verified_at && (
                          <Button size="sm" disabled={busy === d.id} onClick={() => verify(d)}>Verify</Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => unclaim(d)}>Unclaim</Button>
                      </Cluster>
                    </Cluster>
                    {!d.verified_at && (
                      <div className="rounded-md bg-[var(--surface)] p-2 font-mono text-xs">
                        <div><span className="text-[var(--text-subtle)]">Name:</span> {d.dns_txt_record_name}</div>
                        <div><span className="text-[var(--text-subtle)]">Type:</span> TXT</div>
                        <div><span className="text-[var(--text-subtle)]">Value:</span> {d.dns_txt_value}</div>
                      </div>
                    )}
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

/* ------------------------ Default role ------------------------ */

/**
 * DefaultRoleCard - which role a new member lands on when they join via
 * a verified email domain (and the preselected role on invites). Bound
 * to `orgs.default_role_for_invite`; the role list is the org's
 * data-driven set, so a deleted role can never stay the default (the BE
 * repoints it on delete-with-reassign).
 */
function DefaultRoleCard({
  org,
  roles,
  canEdit,
  onSaved,
}: {
  org: Org;
  roles: OrgRole[];
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [autoJoinBusy, setAutoJoinBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = roles.length > 0
    ? roles.map((r) => r.name)
    : [org.default_role_for_invite];

  const changeDefault = async (role: string) => {
    if (busy || role === org.default_role_for_invite) return;
    setBusy(true);
    setError(null);
    try {
      await api.orgs.patch(org.id, { default_role_for_invite: role });
      toast.success(`New members now join as "${role}"`);
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update default role");
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoJoin = async () => {
    if (autoJoinBusy) return;
    setAutoJoinBusy(true);
    setError(null);
    try {
      await api.orgs.patch(org.id, {
        auto_join_for_verified_domain: !org.auto_join_for_verified_domain,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update auto-join");
    } finally {
      setAutoJoinBusy(false);
    }
  };

  return (
    <Card variant="elevated">
      <CardHeader>
        <Cluster gap="2" align="center">
          <UserCog className="size-4 text-[var(--primary)]" aria-hidden />
          <CardTitle>Default role for new members</CardTitle>
        </Cluster>
        <CardDescription>
          Anyone auto-joining via a verified domain gets this role; it&rsquo;s also the
          preselected role on invites. Admins can change a member&rsquo;s role any time
          under Members.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          <Cluster gap="3" align="center">
            <select
              value={org.default_role_for_invite}
              disabled={!canEdit || busy}
              onChange={(e) => void changeDefault(e.target.value)}
              aria-label="Default role for new members"
              data-testid="default-role-select"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {(options.includes(org.default_role_for_invite)
                ? options
                : [org.default_role_for_invite, ...options]
              ).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {roles.length > 0 && (
              <span className="text-xs text-[var(--text-subtle)]">
                {roles.find((r) => r.is_default_for_invite)?.permissions.length ?? 0} permissions
              </span>
            )}
          </Cluster>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={org.auto_join_for_verified_domain}
              disabled={!canEdit || autoJoinBusy}
              onChange={() => void toggleAutoJoin()}
              data-testid="auto-join-toggle"
              className="size-3.5 accent-[var(--primary)]"
            />
            <span>
              Let anyone with a verified-domain email join automatically
              <span className="block text-xs text-[var(--text-muted)]">
                Off means matching emails still need an invitation.
              </span>
            </span>
          </label>
          {!canEdit && (
            <p className="text-xs text-[var(--text-subtle)]">
              Changing these needs the org-manage permission.
            </p>
          )}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </Stack>
      </CardContent>
    </Card>
  );
}
