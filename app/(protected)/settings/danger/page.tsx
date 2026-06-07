"use client";

/**
 * /settings/danger — §5.31 stage-1 entry point for the destructive
 * org lifecycle. The previous direct hard-delete is gone; this page
 * now soft-deletes only. After a successful soft-delete the owner
 * lands on `/settings/trash` (where stage-2 lives) so they always
 * have a recovery window.
 *
 * Every non-owner gets the read-only "owner-only" notice — the BE
 * also refuses with `permission_denied` so this is defense-in-depth.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError } from "@/lib/api/client";

export default function DangerZonePage() {
  const router = useRouter();
  const { activeOrgId, me, refreshMe } = useSession();
  const myMembership = me?.memberships.find((mm) => mm.orgId === activeOrgId);
  const isOwner = !!myMembership?.isOwner;
  const slug = myMembership?.orgSlug ?? "";
  const orgName = myMembership?.orgName ?? "";

  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmInput === slug;

  const softDelete = async () => {
    if (!activeOrgId || !matches) return;
    setBusy(true);
    setError(null);
    try {
      await api.orgs.softDelete(activeOrgId, slug);
      // The org is now soft-deleted. The owner can still navigate to
      // /settings/trash to either Restore or Delete-forever. Every
      // other member's next protected request will 403 with
      // `org_deleted` and bounce them to /login.
      await refreshMe();
      router.replace("/settings/trash");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to soft-delete organization.");
      setBusy(false);
    }
  };

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Danger zone"
        subtitle={
          <>
            Soft-deletes the organization for recovery from{" "}
            <Link href="/settings/trash" className="underline">
              /settings/trash
            </Link>
            . Permanent deletion (with cascade) is the stage-2 action on
            that page. Owner-only.
          </>
        }
      />

      {!isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Owner-only area</CardTitle>
            <CardDescription>
              Destructive actions are restricted to the org owner. Your
              current role is{" "}
              <strong>{myMembership?.role ?? "unknown"}</strong> — if you
              need ownership transferred, the owner can do that from{" "}
              <Link href="/settings/members" className="underline">
                /settings/members
              </Link>
              {" "}
              (Transfer ownership lives on the owner&apos;s row).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isOwner && (
        <Card variant="elevated" className="border-[var(--danger)]">
          <CardHeader>
            <CardTitle className="text-[var(--danger)]">
              Soft delete this organization
            </CardTitle>
            <CardDescription>
              Marks <strong>{orgName}</strong> + every domain + every
              repo inside it as deleted (one cascade in a single
              transaction). Members other than you immediately lose
              access on their next request. You retain access from{" "}
              <code>/settings/trash</code> where you can <strong>Restore</strong>{" "}
              (and re-enqueue ingest) or <strong>Delete forever</strong>{" "}
              (stage-2 cascade DELETE). The recovery window is until you
              explicitly permanent-delete. <strong>Stage 1 of 2.</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="3">
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              <Stack gap="1">
                <label className="text-sm">
                  Type <code>{slug}</code> to confirm.
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={slug}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Stack>
              <Cluster gap="2">
                <Button
                  variant="destructive"
                  disabled={!matches || busy}
                  onClick={softDelete}
                >
                  {busy ? "Soft-deleting…" : `Soft delete ${orgName}`}
                </Button>
                <Link
                  href="/settings/trash"
                  className="text-sm text-[var(--text-muted)] underline self-center"
                >
                  Open trash →
                </Link>
              </Cluster>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
