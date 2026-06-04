"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type Org } from "@/lib/api/client";
import { useActiveOrgTier, planLabel } from "@/lib/billing/use-active-org-tier";

export default function OrganizationSettingsPage() {
  const { activeOrgId, me, refreshMe } = useSession();
  const tier = useActiveOrgTier();
  const [org, setOrg] = useState<Org | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [autoJoin, setAutoJoin] = useState(false);
  const [defaultRole, setDefaultRole] = useState("engineer");

  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
      try {
        const result = await api.orgs.get(activeOrgId);
        setOrg(result);
        setDisplayName(result.display_name ?? result.name);
        setAutoJoin(result.auto_join_for_verified_domain);
        setDefaultRole(result.default_role_for_invite);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load organization");
      }
    })();
  }, [activeOrgId]);

  if (!activeOrgId) return <p>No active organization.</p>;
  if (!org)
    return (
      // FE coding-standard: page-level loading uses content-shaped
      // skeletons, not a "Loading…" text node. Matches the header +
      // two-section layout this page renders once loaded.
      <Stack gap="4" aria-busy="true" aria-label="Loading organization settings">
        <Stack gap="1">
          <div className="h-7 w-64 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
        <div className="h-40 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-48 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
    );

  const myMembership = me?.memberships.find((m) => m.orgId === activeOrgId);
  const canEdit = myMembership?.role === "owner" || myMembership?.role === "admin";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.orgs.patch(activeOrgId, {
        display_name: displayName,
        auto_join_for_verified_domain: autoJoin,
        default_role_for_invite: defaultRole,
      });
      setOrg(updated);
      await refreshMe();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Organization settings"
        subtitle={<>Identity + auto-join policy for <strong>{org.name}</strong>.</>}
      />

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>How your team sees this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="3">
            <Field label="Display name">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </Field>
            <ReadField label="Slug" value={org.slug} />
            <ReadField label="Plan" value={tier ? planLabel(tier) : "—"} />
          </Stack>
        </CardContent>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Auto-join via verified email domain</CardTitle>
          <CardDescription>
            New GitHub-OAuth sign-ins from your verified domains land directly in the workspace with the default role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoJoin}
                disabled={!canEdit}
                onChange={(e) => setAutoJoin(e.target.checked)}
              />
              Enable auto-join for new signups with verified-domain emails
            </label>
            <Field label="Default role for auto-join">
              <select
                value={defaultRole}
                onChange={(e) => setDefaultRole(e.target.value)}
                disabled={!canEdit}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <option value="engineer">engineer</option>
                <option value="reviewer">reviewer</option>
                <option value="auditor">auditor</option>
              </select>
            </Field>
          </Stack>
        </CardContent>
      </Card>

      {canEdit && (
        <Cluster justify="end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 inline-block font-medium">{label}</span>
      {children}
    </label>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
      <span className="mb-1 inline-block font-medium">{label}</span>
      <p className="font-mono text-[var(--text-muted)]">{value}</p>
    </div>
  );
}
