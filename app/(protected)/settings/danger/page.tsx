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
import { ConfirmDialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/skeleton";
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const softDelete = async () => {
    if (!activeOrgId) return;
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
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
                >
                  {error}
                </p>
              )}
              <Cluster gap="2">
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => setConfirmOpen(true)}
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

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void softDelete();
        }}
        title={`Soft delete ${orgName}?`}
        description="Marks the organization and everything inside it as deleted. You can Restore or Delete forever from /settings/trash. Stage 1 of 2."
        tone="danger"
        confirmLabel="Soft delete"
        typeToConfirm={slug}
        loading={busy}
      />
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
  const [confirmOpen, setConfirmOpen] = useState(false);
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
          <Skeleton className="h-9 w-56 rounded-md" />
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
          <Cluster gap="2">
            <Button
              variant="destructive"
              disabled={!canManage || busy}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? "Turning off…" : "Turn off all models"}
            </Button>
          </Cluster>
        )}
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void flip(true);
          }}
          title="Turn off all AI models?"
          description="Every AI call for this organization is refused until re-enabled. In-flight calls finish; nothing new starts."
          tone="danger"
          confirmLabel="Turn off all models"
          typeToConfirm="turn off all models"
          loading={busy}
        />
      </CardContent>
    </Card>
  );
}
