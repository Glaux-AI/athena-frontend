"use client";

/**
 * /settings/profile - the §9.7 GDPR data-subject rights surface.
 *
 * Three cards: identity (with Art. 16 display-name rectification),
 * "Your data" (Art. 15/20 machine-readable export download), and the
 * account danger zone (Art. 17 erasure with typed-email confirmation,
 * mirroring the org danger-zone pattern). Deletion is refused server-side
 * with `sole_owner_orgs` while the caller still owns live workspaces -
 * the card renders that list with the transfer/delete guidance.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cluster, Stack } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { api, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function ProfilePage() {
  const { me } = useSession();
  if (!me) {
    // Page-level loading uses a content-shaped skeleton, not a text node.
    return (
      <Stack gap="4" aria-busy="true" aria-label="Loading your profile">
        <Stack gap="1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-96" />
        </Stack>
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </Stack>
    );
  }

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Your profile"
        subtitle="Your identity, your data. Edit your display name, download everything Athena holds about you, or delete your account."
      />
      <IdentityCard />
      <YourDataCard />
      <DeleteAccountCard />
    </Stack>
  );
}

function IdentityCard() {
  const { me, refreshMe } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = name ?? me?.displayName ?? "";
  const dirty = me != null && value.trim() !== me.displayName && value.trim().length > 0;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await api.account.patchProfile({ display_name: value.trim() });
      await refreshMe();
      setName(null);
    } catch {
      setError("Could not save your display name. Try again.");
    } finally {
      setSaving(false);
    }
  }, [value, refreshMe]);

  if (!me) return null;
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>{me.displayName}</CardTitle>
        <CardDescription>{me.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
            <label htmlFor="display-name" className="mb-1 inline-block font-medium">
              Display name
            </label>
            <Cluster gap="2" align="center">
              <input
                id="display-name"
                value={value}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                className="h-8 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
                Save
              </Button>
            </Cluster>
            {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
          </div>
          <Field label="User ID" value={me.id} mono />
          <Field label="Sign-in email" value={`${me.email} (changes via your sign-in provider)`} />
          <Field label="Account type" value={me.isEmployee ? "Athena employee" : "Customer"} />
          <Field label="Workspaces" value={String(me.memberships.length)} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function YourDataCard() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      const bundle = await api.account.export();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "athena-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not build your export. Try again shortly.");
    } finally {
      setDownloading(false);
    }
  }, []);

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          Download a machine-readable copy of everything Athena holds about you:
          profile, workspace memberships, consent history, chats, tasks you
          created, uploaded files, and your audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Button variant="secondary" onClick={download} loading={downloading}>
              <Download className="size-4" /> Export my data
            </Button>
          </Cluster>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </Stack>
      </CardContent>
    </Card>
  );
}

function DeleteAccountCard() {
  const { me, signOut } = useSession();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedOrgs, setOwnedOrgs] = useState<{ org_id: string; org_name: string }[]>([]);
  const [purgeAfter, setPurgeAfter] = useState<string | null>(null);

  const matches =
    me != null && confirm.trim().toLowerCase() === me.email.trim().toLowerCase();

  const requestDeletion = useCallback(async () => {
    setBusy(true);
    setError(null);
    setOwnedOrgs([]);
    try {
      const receipt = await api.account.delete(confirm.trim());
      setPurgeAfter(receipt.purge_after);
      // Locked out server-side already; end the client session cleanly.
      window.setTimeout(() => void signOut(), 4000);
    } catch (e) {
      if (e instanceof ApiError && e.code === "sole_owner_orgs") {
        const orgs = (e.metadata?.orgs ?? []) as { org_id: string; org_name: string }[];
        setOwnedOrgs(orgs);
        setError(
          "You still own the workspaces below. Transfer ownership (Settings, then Members) or delete them (Settings, then Danger zone) first.",
        );
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Could not request deletion. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }, [confirm, signOut]);

  if (purgeAfter) {
    return (
      <Card variant="elevated" className="border-[var(--danger)]/40">
        <CardHeader>
          <CardTitle>Account scheduled for deletion</CardTitle>
          <CardDescription>
            Your account is locked and your personal data will be permanently
            erased on {new Date(purgeAfter).toLocaleString()}. Contact support
            before that date if this was a mistake. Signing you out…
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card variant="elevated" className="border-[var(--danger)]/40">
      <CardHeader>
        <CardTitle>
          <Cluster gap="2" align="center">
            <AlertTriangle className="size-4 text-[var(--danger)]" /> Delete account
          </Cluster>
        </CardTitle>
        <CardDescription>
          Locks your account immediately and permanently erases your personal
          data, uploaded files, and sign-in identity after a 30-day grace
          window. This cannot be undone from the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="2">
          <label htmlFor="delete-confirm" className="text-sm font-medium">
            Type your email to confirm
          </label>
          <input
            id="delete-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={me?.email}
            autoComplete="off"
            className="h-9 w-full max-w-sm rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          {ownedOrgs.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-[var(--text-muted)]">
              {ownedOrgs.map((o) => (
                <li key={o.org_id}>{o.org_name}</li>
              ))}
            </ul>
          )}
          <div>
            <Button
              variant="destructive"
              onClick={requestDeletion}
              loading={busy}
              disabled={!matches}
            >
              Delete my account
            </Button>
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
      <span className="mb-1 inline-block font-medium">{label}</span>
      <p className={mono ? "font-mono text-[var(--text-muted)]" : "text-[var(--text-muted)]"}>{value}</p>
    </div>
  );
}
