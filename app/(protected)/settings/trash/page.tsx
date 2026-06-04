"use client";

/**
 * /settings/trash — §5.31 stage-2 staging area.
 *
 * Three sections (in order of cascade scope, narrowest first):
 *   1. **Deleted capabilities** — soft-deleted caps in this org. Each
 *      row: name/slug + deleted-on + Restore + Delete-forever CTAs.
 *   2. **Deleted repos** — soft-deleted repos. Affects every cap that
 *      uses them — the attached-cap count is shown inline.
 *   3. **This organization** — when the active org is soft-deleted,
 *      the owner sees a single banner with Restore + Delete-forever
 *      CTAs. Non-owners can't reach this page at all (the BE
 *      `current_membership` dep 403s `org_deleted`).
 *
 * Owner-only (the org section). Non-owners can still see the cap +
 * repo sections (cap-admins can restore caps they admin).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, RotateCcw, GitBranch, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { api, ApiError, type Capability, type RepoFull, type Org } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function TrashPage() {
  const router = useRouter();
  const { activeOrgId, me, refreshMe } = useSession();
  const myMembership = me?.memberships.find((mm) => mm.orgId === activeOrgId);
  const isOwner = !!myMembership?.isOwner;

  const [caps, setCaps] = useState<Capability[]>([]);
  const [repos, setRepos] = useState<RepoFull[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const [c, r, o] = await Promise.all([
        api.capabilities.list("only").catch(() => [] as Capability[]),
        api.repos.list("only").catch(() => [] as RepoFull[]),
        api.orgs.get(activeOrgId).catch(() => null),
      ]);
      setCaps(c);
      setRepos(r);
      setOrg(o);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load trash.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <Stack gap="6">
      <SettingsPageHeader
        title="Trash"
        subtitle="Soft-deleted capabilities, repos, and (if applicable) this organization. Restore re-enables them and re-ingests knowledge. Delete-forever cascades through every related row and cannot be undone."
      />

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {isOwner && org?.deleted_at && (
        <DeletedOrgBanner
          org={org}
          onRestore={async () => {
            try {
              await api.orgs.restore(org.id);
              toast.success("Organization restored.");
              await refreshMe();
              await refresh();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Failed to restore.");
            }
          }}
          onPermanentDelete={async (slug) => {
            try {
              await api.orgs.permanentDelete(org.id, slug);
              toast.success("Organization permanently deleted.");
              await refreshMe();
              router.replace("/orgs/new");
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Failed to delete forever.");
            }
          }}
        />
      )}

      <Section title="Deleted capabilities" count={caps.length}>
        {loading ? <SkeletonRow /> : caps.length === 0 ? (
          <EmptyState title="No deleted capabilities" description="Soft-deleted capabilities will appear here for restore or permanent delete." />
        ) : (
          <Stack gap="2">
            {caps.map((c) => (
              <CapTrashRow key={c.id} cap={c} onChanged={refresh} />
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Deleted repos" count={repos.length}>
        {loading ? <SkeletonRow /> : repos.length === 0 ? (
          <EmptyState title="No deleted repos" description="Soft-deleted repos will appear here. Each repo's blast radius shows how many capabilities it affected." />
        ) : (
          <Stack gap="2">
            {repos.map((r) => (
              <RepoTrashRow key={r.id} repo={r} onChanged={refresh} />
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

/* --------------------- Sub-components --------------------- */

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Stack gap="3">
      <Cluster gap="2" align="baseline" className="border-b border-[var(--border)] pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {typeof count === "number" && (
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs tabular-nums text-[var(--text-muted)]">
            {count}
          </span>
        )}
      </Cluster>
      {children}
    </Stack>
  );
}

function SkeletonRow() {
  return <div className="h-16 animate-pulse rounded-md bg-[var(--surface-2)]" />;
}

function CapTrashRow({ cap, onChanged }: { cap: Capability; onChanged: () => Promise<void>; }) {
  const [busy, setBusy] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [dlgOpen, setDlgOpen] = useState(false);
  const matches = confirmInput === cap.slug;

  return (
    <Card className="transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
      <CardContent>
        <Cluster justify="between" align="center">
          <Stack gap="0">
            <span className="font-medium">{cap.name}</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">cap:{cap.slug}</span>
            <span className="text-xs text-[var(--text-muted)]">
              Deleted {cap.deleted_at ? new Date(cap.deleted_at).toLocaleString() : "—"}
              {cap.deleted_by_user_id ? ` by ${cap.deleted_by_user_id}` : ""}
            </span>
          </Stack>
          <Cluster gap="2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.capabilities.restore(cap.id);
                  toast.success(`Capability "${cap.name}" restored.`);
                  await onChanged();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Restore failed.");
                } finally { setBusy(false); }
              }}
            >
              <RotateCcw className="size-3" />
              Reindex
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { setDlgOpen(true); setConfirmInput(""); }}>
              <Trash2 className="size-3" />
              Delete forever
            </Button>
          </Cluster>
        </Cluster>
        {dlgOpen && (
          <Stack gap="2" className="mt-3 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
            <p className="text-xs">
              This permanently deletes the capability + every attached
              repo&apos;s join row + every knowledge node tied to this cap.
              Type <code>{cap.slug}</code> to confirm.
            </p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={cap.slug}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <Cluster gap="2" justify="end">
              <Button size="sm" variant="outline" onClick={() => setDlgOpen(false)} disabled={busy}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!matches || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.capabilities.permanentDelete(cap.id, cap.slug);
                    toast.success(`Capability "${cap.name}" permanently deleted.`);
                    setDlgOpen(false);
                    await onChanged();
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : "Delete failed.");
                  } finally { setBusy(false); }
                }}
              >
                {busy ? "Deleting…" : "Delete forever"}
              </Button>
            </Cluster>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function RepoTrashRow({ repo, onChanged }: { repo: RepoFull; onChanged: () => Promise<void>; }) {
  const [busy, setBusy] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [dlgOpen, setDlgOpen] = useState(false);
  const matches = confirmInput === repo.full_name;

  return (
    <Card className="transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
      <CardContent>
        <Cluster justify="between" align="center">
          <Stack gap="0">
            <Cluster gap="2" align="center">
              <GitBranch className="size-4 text-[var(--text-muted)]" />
              <span className="font-medium font-mono">{repo.full_name}</span>
            </Cluster>
            <span className="text-xs text-[var(--text-muted)]">
              Deleted {repo.deleted_at ? new Date(repo.deleted_at).toLocaleString() : "—"} —{" "}
              {repo.attached_capability_ids.length} capability/ies affected
            </span>
          </Stack>
          <Cluster gap="2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.repos.restore(repo.id);
                  toast.success(`Repo restored. Re-ingest enqueued at HEAD.`);
                  await onChanged();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Restore failed.");
                } finally { setBusy(false); }
              }}
            >
              <RotateCcw className="size-3" />
              Reindex
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { setDlgOpen(true); setConfirmInput(""); }}>
              <Trash2 className="size-3" />
              Delete forever
            </Button>
          </Cluster>
        </Cluster>
        {dlgOpen && (
          <Stack gap="2" className="mt-3 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
            <p className="text-xs">
              This permanently deletes the repo + every knowledge node/edge
              tied to it across every capability. Type{" "}
              <code>{repo.full_name}</code> to confirm.
            </p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={repo.full_name}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <Cluster gap="2" justify="end">
              <Button size="sm" variant="outline" onClick={() => setDlgOpen(false)} disabled={busy}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!matches || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.repos.permanentDelete(repo.id, repo.full_name);
                    toast.success(`Repo permanently deleted.`);
                    setDlgOpen(false);
                    await onChanged();
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : "Delete failed.");
                  } finally { setBusy(false); }
                }}
              >
                {busy ? "Deleting…" : "Delete forever"}
              </Button>
            </Cluster>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function DeletedOrgBanner({
  org,
  onRestore,
  onPermanentDelete,
}: {
  org: Org;
  onRestore: () => Promise<void>;
  onPermanentDelete: (slug: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [permOpen, setPermOpen] = useState(false);
  const matches = confirmInput === org.slug;

  return (
    <Card variant="elevated" className="border-[var(--danger)]">
      <CardHeader>
        <CardTitle className="text-[var(--danger)] flex items-center gap-2">
          <AlertTriangle className="size-4" />
          This organization is soft-deleted
        </CardTitle>
        <CardDescription>
          <strong>{org.name}</strong> was soft-deleted on{" "}
          <code>{org.deleted_at ? new Date(org.deleted_at).toLocaleString() : "—"}</code>.
          Every non-owner member is locked out. <strong>Reindex</strong>{" "}
          re-enables it and re-ingests every attached repo;{" "}
          <strong>Delete forever</strong> cascades through every row
          (only the audit log survives).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          <Cluster gap="2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => { setBusy(true); try { await onRestore(); } finally { setBusy(false); } }}
            >
              <RotateCcw className="size-4" />
              Restore organization (Reindex)
            </Button>
            <Button variant="destructive" onClick={() => { setPermOpen(true); setConfirmInput(""); }}>
              <Trash2 className="size-4" />
              Delete forever
            </Button>
          </Cluster>
          {permOpen && (
            <Stack gap="2" className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
              <p className="text-xs">
                This permanently deletes the organization + every cap +
                every repo + every knowledge row + every membership.
                Only the audit log survives. Type <code>{org.slug}</code>{" "}
                to confirm.
              </p>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={org.slug}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <Cluster gap="2" justify="end">
                <Button size="sm" variant="outline" onClick={() => setPermOpen(false)} disabled={busy}>Cancel</Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!matches || busy}
                  onClick={async () => { setBusy(true); try { await onPermanentDelete(org.slug); } finally { setBusy(false); } }}
                >
                  {busy ? "Deleting…" : "Delete forever"}
                </Button>
              </Cluster>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
