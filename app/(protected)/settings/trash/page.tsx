"use client";

/**
 * /settings/trash - §5.31 stage-2 staging area.
 *
 * Three sections (in order of cascade scope, narrowest first):
 *   1. **Deleted domains** - soft-deleted caps in this org. Each
 *      row: name/slug + deleted-on + Restore + Delete-forever CTAs.
 *   2. **Deleted repos** - soft-deleted repos. Affects every cap that
 *      uses them - the attached-cap count is shown inline.
 *   3. **This organization** - when the active org is soft-deleted,
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
import { ConfirmDialog } from "@/components/ui/overlay";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { api, ApiError, type Domain, type RepoFull, type Org } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function TrashPage() {
  const router = useRouter();
  const { activeOrgId, me, refreshMe } = useSession();
  const myMembership = me?.memberships.find((mm) => mm.orgId === activeOrgId);
  const isOwner = !!myMembership?.isOwner;

  const [caps, setCaps] = useState<Domain[]>([]);
  const [repos, setRepos] = useState<RepoFull[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const [c, r, o] = await Promise.all([
        api.domains.list("only").catch(() => [] as Domain[]),
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
        subtitle="Soft-deleted domains, repos, and (if applicable) this organization. Restore re-enables them and re-ingests knowledge. Delete-forever cascades through every related row and cannot be undone."
      />

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
        >
          {error}
        </div>
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

      <Section title="Deleted domains" count={caps.length}>
        {loading ? <SkeletonRow /> : caps.length === 0 ? (
          <EmptyState title="No deleted domains" description="Soft-deleted domains will appear here for restore or permanent delete." />
        ) : (
          <Stack gap="2">
            {caps.map((c) => (
              <DomainTrashRow key={c.id} cap={c} onChanged={refresh} />
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Deleted repos" count={repos.length}>
        {loading ? <SkeletonRow /> : repos.length === 0 ? (
          <EmptyState title="No deleted repos" description="Soft-deleted repos will appear here. Each repo's blast radius shows how many domains it affected." />
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
      <div>
        <Cluster gap="2" align="baseline" className="pb-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {typeof count === "number" && (
            <Pill tone="neutral" size="sm" className="tabular-nums">{count}</Pill>
          )}
        </Cluster>
        <hr className="hr-horizon" aria-hidden="true" />
      </div>
      {children}
    </Stack>
  );
}

function SkeletonRow() {
  return <Skeleton className="h-16 rounded-md" />;
}

function DomainTrashRow({ cap, onChanged }: { cap: Domain; onChanged: () => Promise<void>; }) {
  const [busy, setBusy] = useState(false);
  const [dlgOpen, setDlgOpen] = useState(false);

  return (
    <Card>
      <CardContent>
        <Cluster justify="between" align="center">
          <Stack gap="0">
            <span className="font-medium">{cap.name}</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">dom:{cap.slug}</span>
            <span className="text-xs text-[var(--text-muted)]">
              Deleted {cap.deleted_at ? new Date(cap.deleted_at).toLocaleString() : "-"}
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
                  await api.domains.restore(cap.id);
                  toast.success(`Domain "${cap.name}" restored.`);
                  await onChanged();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Restore failed.");
                } finally { setBusy(false); }
              }}
            >
              <RotateCcw className="size-3" />
              Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setDlgOpen(true)}>
              <Trash2 className="size-3" />
              Delete forever
            </Button>
          </Cluster>
        </Cluster>
        <ConfirmDialog
          open={dlgOpen}
          onClose={() => setDlgOpen(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.domains.permanentDelete(cap.id, cap.slug);
              toast.success(`Domain "${cap.name}" permanently deleted.`);
              setDlgOpen(false);
              await onChanged();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Delete failed.");
            } finally { setBusy(false); }
          }}
          title={`Delete "${cap.name}" forever?`}
          description="This permanently deletes the domain, every attached repo's join row, and every knowledge node tied to this domain. It cannot be undone."
          tone="danger"
          confirmLabel="Delete forever"
          typeToConfirm={cap.slug}
          loading={busy}
        />
      </CardContent>
    </Card>
  );
}

function RepoTrashRow({ repo, onChanged }: { repo: RepoFull; onChanged: () => Promise<void>; }) {
  const [busy, setBusy] = useState(false);
  const [dlgOpen, setDlgOpen] = useState(false);

  return (
    <Card>
      <CardContent>
        <Cluster justify="between" align="center">
          <Stack gap="0">
            <Cluster gap="2" align="center">
              <GitBranch className="size-4 text-[var(--text-muted)]" />
              <span className="font-medium font-mono">{repo.full_name}</span>
            </Cluster>
            <span className="text-xs text-[var(--text-muted)]">
              Deleted {repo.deleted_at ? new Date(repo.deleted_at).toLocaleString() : "-"} -{" "}
              {repo.attached_domain_ids.length} domain/ies affected
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
              Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setDlgOpen(true)}>
              <Trash2 className="size-3" />
              Delete forever
            </Button>
          </Cluster>
        </Cluster>
        <ConfirmDialog
          open={dlgOpen}
          onClose={() => setDlgOpen(false)}
          onConfirm={async () => {
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
          title={`Delete ${repo.full_name} forever?`}
          description="This permanently deletes the repo and every knowledge node/edge tied to it across every domain. It cannot be undone."
          tone="danger"
          confirmLabel="Delete forever"
          typeToConfirm={repo.full_name}
          loading={busy}
        />
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
  const [permOpen, setPermOpen] = useState(false);

  return (
    <Card variant="elevated" className="border-[var(--danger)]">
      <CardHeader>
        <CardTitle className="text-[var(--danger)] flex items-center gap-2">
          <AlertTriangle className="size-4" />
          This organization is soft-deleted
        </CardTitle>
        <CardDescription>
          <strong>{org.name}</strong> was soft-deleted on{" "}
          <code>{org.deleted_at ? new Date(org.deleted_at).toLocaleString() : "-"}</code>.
          Every non-owner member is locked out. <strong>Restore</strong>{" "}
          re-enables it and re-ingests every attached repo;{" "}
          <strong>Delete forever</strong> cascades through every row
          (only the audit log survives).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Cluster gap="2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onRestore(); } finally { setBusy(false); } }}
          >
            <RotateCcw className="size-4" />
            Restore organization
          </Button>
          <Button variant="destructive" onClick={() => setPermOpen(true)}>
            <Trash2 className="size-4" />
            Delete forever
          </Button>
        </Cluster>
        <ConfirmDialog
          open={permOpen}
          onClose={() => setPermOpen(false)}
          onConfirm={async () => {
            setBusy(true);
            try { await onPermanentDelete(org.slug); } finally { setBusy(false); }
          }}
          title={`Delete ${org.name} forever?`}
          description="This permanently deletes the organization, every domain, every repo, every knowledge row, and every membership. Only the audit log survives."
          tone="danger"
          confirmLabel="Delete forever"
          typeToConfirm={org.slug}
          loading={busy}
        />
      </CardContent>
    </Card>
  );
}
