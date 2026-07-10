"use client";

/**
 * §5.31 - Domain Danger zone tab.
 *
 * Two states:
 *   - **Live cap**: shows a single "Soft delete" card. Typed-slug
 *     confirmation. On success the parent routes to
 *     `/domains?status=deleted` so the user sees the row land in
 *     the trash list.
 *   - **Soft-deleted cap**: shows a Reindex card (calls restore) + a
 *     Delete-forever card (typed-slug confirmation; permanent).
 *
 * Visibility on the tab nav is enforced at the page level (cap-admin
 * or org-admin only); this component still defensively gates the
 * buttons behind `canManage`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inputFocus } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type Domain } from "@/lib/api/client";

interface Props {
  cap: Domain;
  canManage: boolean;
  /** Called after a successful state change so the parent can refetch. */
  onChanged?: () => void | Promise<void>;
}

export function DomainDangerZoneTab({ cap, canManage, onChanged }: Props) {
  const router = useRouter();
  const isDeleted = !!cap.deleted_at;

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cap-admin only</CardTitle>
          <CardDescription>
            Destructive actions on this domain are restricted to
            cap-admins (and org owner/admin). Ask a cap-admin or the
            org owner to perform a delete or restore.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isDeleted) {
    return (
      <Stack gap="4">
        <DeletedBanner cap={cap} />
        <RestoreCard cap={cap} onChanged={onChanged} />
        <PermanentDeleteCard cap={cap} onChanged={onChanged} />
      </Stack>
    );
  }

  return (
    <Stack gap="4">
      <SoftDeleteCard
        cap={cap}
        onSuccess={() => {
          router.push("/domains?status=deleted");
        }}
      />
    </Stack>
  );
}

/* -------------------------- live → soft-delete -------------------------- */

function SoftDeleteCard({
  cap,
  onSuccess,
}: {
  cap: Domain;
  onSuccess: () => void;
}) {
  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirmInput === cap.slug;

  const onSubmit = async () => {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await api.domains.softDelete(cap.id);
      toast.success(`Domain "${cap.name}" moved to trash.`);
      onSuccess();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to soft-delete.");
      setBusy(false);
    }
  };

  return (
    <Card className="border-[var(--danger)] shadow-[var(--shadow-2)]">
      <CardHeader>
        <CardTitle className="text-[var(--danger-ink)] flex items-center gap-2">
          <AlertTriangle className="size-4" />
          Soft delete this domain
        </CardTitle>
        <CardDescription>
          Marks <strong>{cap.name}</strong> as deleted. The row stays in
          Postgres so an admin can restore. Default list views + the
          knowledge graph all exclude soft-deleted domains. You can
          permanently delete (with cascade) from the trash view after
          this step. <strong>Stage 1 of 2.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          {error && (
            <p className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]" role="alert">
              {error}
            </p>
          )}
          <Stack gap="1">
            <label className="text-sm">
              Type <code>{cap.slug}</code> to confirm.
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={cap.slug}
              className={cn("rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-sm transition-[border-color,box-shadow]", inputFocus)}
              autoComplete="off"
              spellCheck={false}
            />
          </Stack>
          <Button
            variant="destructive"
            disabled={!matches || busy}
            onClick={onSubmit}
          >
            {busy ? "Soft-deleting…" : `Soft delete ${cap.name}`}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

/* -------------------------- soft-deleted state -------------------------- */

function DeletedBanner({ cap }: { cap: Domain }) {
  const when = cap.deleted_at
    ? new Date(cap.deleted_at).toLocaleString()
    : "-";
  const by = cap.deleted_by_user_id ?? "-";
  return (
    <Card className="border-[var(--warning)] bg-[var(--warning-soft)] shadow-[var(--shadow-1)]">
      <CardContent>
        <Cluster gap="2" align="start">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" aria-hidden />
          <p className="text-sm text-[var(--warning-ink)]">
            <strong>This domain is in trash.</strong>{" "}
            Soft-deleted on <code>{when}</code> by{" "}
            <code className="text-xs">{by}</code>. Every tab is
            read-only. <strong>Reindex</strong> re-enables it and runs a
            fresh KG ingest; <strong>Delete forever</strong> permanently
            removes the row and every knowledge node tied to it.
          </p>
        </Cluster>
      </CardContent>
    </Card>
  );
}

function RestoreCard({
  cap,
  onChanged,
}: {
  cap: Domain;
  onChanged: (() => void | Promise<void>) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.domains.restore(cap.id);
      toast.success(
        `Domain "${cap.name}" restored. Re-ingest enqueued for every attached repo.`,
      );
      if (onChanged) await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to restore.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="size-4" />
          Reindex (restore)
        </CardTitle>
        <CardDescription>
          Clears the deleted flag and re-enqueues an ingest at HEAD for
          every attached repo so the knowledge graph reflects current
          source state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          {error && (
            <p className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy} onClick={onSubmit}>
            {busy ? "Restoring…" : "Reindex"}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PermanentDeleteCard({
  cap,
  onChanged,
}: {
  cap: Domain;
  onChanged: (() => void | Promise<void>) | undefined;
}) {
  const router = useRouter();
  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirmInput === cap.slug;

  const onSubmit = async () => {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await api.domains.permanentDelete(cap.id, cap.slug);
      toast.success(`Domain "${cap.name}" permanently deleted.`);
      if (onChanged) await onChanged();
      router.push("/domains");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Failed to permanently delete.",
      );
      setBusy(false);
    }
  };

  return (
    <Card className="border-[var(--danger)] shadow-[var(--shadow-2)]">
      <CardHeader>
        <CardTitle className="text-[var(--danger-ink)] flex items-center gap-2">
          <Trash2 className="size-4" />
          Delete forever
        </CardTitle>
        <CardDescription>
          Hard deletes <strong>{cap.name}</strong> and every row tied to
          it: attached repos&apos; join rows, domain memberships,
          domain skills, the domain&apos;s Blueprint sections, and every
          knowledge node / edge scoped to this domain.{" "}
          <strong>This cannot be undone.</strong> The audit log entry
          for this deletion is retained.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          {error && (
            <p className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]" role="alert">
              {error}
            </p>
          )}
          <Stack gap="1">
            <label className="text-sm">
              Type <code>{cap.slug}</code> to confirm.
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={cap.slug}
              className={cn("rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-sm transition-[border-color,box-shadow]", inputFocus)}
              autoComplete="off"
              spellCheck={false}
            />
          </Stack>
          <Button
            variant="destructive"
            disabled={!matches || busy}
            onClick={onSubmit}
          >
            {busy ? "Deleting…" : `Delete ${cap.name} permanently`}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
