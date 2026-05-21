"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError } from "@/lib/api/client";

export default function DangerZonePage() {
  const router = useRouter();
  const { activeOrgId, me, refreshMe } = useSession();
  const myMembership = me?.memberships.find((m) => m.orgId === activeOrgId);
  const isOwner = !!myMembership?.isOwner;
  const slug = myMembership?.orgSlug ?? "";
  const orgName = myMembership?.orgName ?? "";

  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmInput === slug;

  const remove = async () => {
    if (!activeOrgId || !matches) return;
    setBusy(true);
    setError(null);
    try {
      await api.orgs.delete(activeOrgId, slug);
      // Owning state goes away with the org. Refresh the session, then
      // route the user to wherever they still have a seat — or to the
      // org-creation form if they no longer have any.
      await refreshMe();
      router.replace("/orgs/new");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete organization.");
      setBusy(false);
    }
  };

  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Danger zone</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Irreversible destructive actions. Only the org owner can perform
          them, and each requires explicit typed confirmation.
        </p>
      </Stack>

      {!isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Owner-only area</CardTitle>
            <CardDescription>
              Destructive actions are restricted to the org owner. Your
              current role is{" "}
              <strong>{myMembership?.role ?? "unknown"}</strong> — if you
              need ownership transferred, the owner can do that from{" "}
              <code>/settings/members</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isOwner && (
        <Card className="border-[var(--danger)]">
          <CardHeader>
            <CardTitle className="text-[var(--danger)]">Delete this organization</CardTitle>
            <CardDescription>
              Permanently removes <strong>{orgName}</strong> and every row
              that belongs to it — runs, capabilities, memberships,
              invitations, audit log. Memberships in other orgs are
              unaffected.{" "}
              <strong>This cannot be undone.</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="3">
              {error && (
                <p className="text-sm text-[var(--danger)]">{error}</p>
              )}
              <Stack gap="1">
                <label className="text-sm">
                  Type <code>{slug}</code> to confirm.
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={slug}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Stack>
              <Button
                variant="destructive"
                disabled={!matches || busy}
                onClick={remove}
              >
                {busy ? "Deleting…" : `Delete ${orgName} permanently`}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
