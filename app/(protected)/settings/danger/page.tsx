"use client";

/**
 * /settings/danger - §5.31 stage-1 entry point for the destructive
 * org lifecycle. The previous direct hard-delete is gone; this page
 * now soft-deletes only. After a successful soft-delete the owner
 * lands on `/settings/trash` (where stage-2 lives) so they always
 * have a recovery window.
 *
 * Every non-owner gets the read-only "owner-only" notice - the BE
 * also refuses with `permission_denied` so this is defense-in-depth.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";
import { usePermissions } from "@/lib/session/use-permissions";
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

      <ModelsKillSwitchCard />

      {!isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Owner-only area</CardTitle>
            <CardDescription>
              Destructive actions are restricted to the org owner. Your
              current role is{" "}
              <strong>{myMembership?.role ?? "unknown"}</strong> - if you
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

/**
 * "Turn off all models" - org-wide AI kill switch. Flipping it makes the
 * BE refuse EVERY LLM dispatch (Athena credits, BYO keys, and personal
 * subscriptions) with `models_disabled` until re-enabled. Gated on
 * `org:manage` (the BE enforces the same).
 */
function ModelsKillSwitchCard() {
  const { activeOrgId } = useSession();
  const { can } = usePermissions();
  const canManage = can("org:manage");

  const [disabled, setDisabled] = useState<boolean | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const state = await api.alerts.getKillSwitch(activeOrgId);
      setDisabled(state.disabled);
    } catch {
      // Read failure leaves the card in its loading shell; the flip
      // buttons stay hidden so no blind toggle is possible.
      setDisabled(null);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flip = async (next: boolean) => {
    if (!activeOrgId) return;
    setBusy(true);
    try {
      const state = await api.alerts.setKillSwitch(activeOrgId, next);
      setDisabled(state.disabled);
      setConfirmInput("");
      toast.success(
        state.disabled
          ? "All AI models are now turned off for this organization."
          : "AI models re-enabled.",
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the kill switch.");
    } finally {
      setBusy(false);
    }
  };

  const matches = confirmInput === "turn off all models";

  return (
    <Card variant="elevated" className="border-[var(--danger)]">
      <CardHeader>
        <CardTitle className="text-[var(--danger)]">Turn off all AI models</CardTitle>
        <CardDescription>
          Immediately refuses <strong>every</strong> AI call for this
          organization - Athena credits, your own provider keys, and personal
          subscriptions alike. Chat, tasks, ingestion synthesis, and agents
          all stop until re-enabled. In-flight calls finish; nothing new
          starts. Requires the <code>org:manage</code> permission.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {disabled === null ? (
          <div className="h-9 w-56 animate-pulse rounded-md bg-[var(--surface-2)]" />
        ) : disabled ? (
          <Cluster gap="3" align="center" className="flex-wrap">
            <p className="text-sm font-medium text-[var(--danger)]">
              All models are currently OFF.
            </p>
            <Button variant="outline" disabled={!canManage || busy} onClick={() => void flip(false)}>
              {busy ? "Re-enabling…" : "Re-enable all models"}
            </Button>
          </Cluster>
        ) : (
          <Stack gap="3">
            <Stack gap="1">
              <label className="text-sm">
                Type <code>turn off all models</code> to confirm.
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="turn off all models"
                disabled={!canManage}
                className="max-w-sm rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                autoComplete="off"
                spellCheck={false}
              />
            </Stack>
            <Cluster gap="2">
              <Button
                variant="destructive"
                disabled={!canManage || !matches || busy}
                onClick={() => void flip(true)}
              >
                {busy ? "Turning off…" : "Turn off all models"}
              </Button>
            </Cluster>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
