"use client";

/**
 * BranchesTab - the per-repo multi-branch picker (ADR-058 amendment).
 *
 * Lists the repo's SCM branches with their per-branch knowledge-index state and
 * lets a user index a non-default branch (or re-sync a stale one). The default
 * branch is always indexed; its state mirrors the repo scalars. Indexing a
 * feature branch builds a coexisting snapshot so an agent can later work
 * against that branch's knowledge.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GitBranch } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type RepoBranch,
  type RepoBranchesResponse,
} from "@/lib/api/client";
import {
  SyncStatusChip,
  type SyncSignals,
} from "@/components/repo/sync-status";

const IN_FLIGHT_STAGES = new Set([
  "queued",
  "cloning",
  "parsing",
  "embedding",
  "indexing",
]);

/** Build {@link SyncSignals} for the chip from a single branch row. */
function signalsFromBranch(b: RepoBranch): SyncSignals {
  const stale =
    b.last_indexed_sha == null
      ? true
      : (b.commits_behind != null && b.commits_behind > 0) ||
        (b.head_sha != null && b.head_sha !== b.last_indexed_sha);
  return {
    stage: b.sync_stage,
    indexedSha: b.last_indexed_sha,
    headSha: b.head_sha,
    commitsBehind: b.commits_behind,
    lastSyncAttemptAt: null,
    // A not-yet-indexed branch has no staleness verdict (the chip renders
    // "never indexed"); an indexed branch derives stale from its shas.
    isStale: b.indexed ? stale : null,
    checkedLive: false,
  };
}

function isInFlight(b: RepoBranch): boolean {
  return b.sync_stage != null && IN_FLIGHT_STAGES.has(b.sync_stage);
}

function BranchesSkeleton() {
  return (
    <Stack className="gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
        />
      ))}
    </Stack>
  );
}

interface BranchRowProps {
  branch: RepoBranch;
  busy: boolean;
  onSync: () => void;
}

function BranchRow({ branch, busy, onSync }: BranchRowProps) {
  const inFlight = isInFlight(branch);
  const stale =
    branch.indexed &&
    ((branch.commits_behind != null && branch.commits_behind > 0) ||
      (branch.last_indexed_sha != null &&
        branch.head_sha != null &&
        branch.head_sha !== branch.last_indexed_sha));
  const showCta = !inFlight && (!branch.indexed || stale);
  const ctaLabel = branch.indexed ? "Sync" : "Index";

  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <Cluster className="min-w-0 items-center gap-2">
        <GitBranch
          className="size-4 shrink-0 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <span className="truncate font-mono text-sm text-[var(--text)]">
          {branch.name}
        </span>
        {branch.is_default && (
          <span className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
            default
          </span>
        )}
      </Cluster>
      <Cluster className="shrink-0 items-center gap-3">
        <SyncStatusChip signals={signalsFromBranch(branch)} syncing={busy || inFlight} />
        {showCta && (
          <Button
            size="sm"
            variant={branch.indexed ? "secondary" : "primary"}
            loading={busy}
            onClick={onSync}
          >
            {ctaLabel}
          </Button>
        )}
      </Cluster>
    </Card>
  );
}

export function BranchesTab({
  domainId,
  repoId,
}: {
  domainId: string;
  repoId: string;
}) {
  const [data, setData] = useState<RepoBranchesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.domains.repoBranches(domainId, repoId);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, [domainId, repoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSync = useCallback(
    async (branch: RepoBranch) => {
      setBusy(branch.name);
      try {
        await api.domains.syncRepoKnowledge(
          domainId,
          repoId,
          branch.is_default ? undefined : { branch: branch.name },
        );
        toast.success(`Indexing ${branch.name}…`);
        await load();
      } catch (e) {
        toast.error(
          e instanceof ApiError ? e.message : "Couldn't start indexing",
        );
      } finally {
        setBusy(null);
      }
    },
    [domainId, repoId, load],
  );

  if (loading) return <BranchesSkeleton />;
  if (error) {
    return (
      <EmptyState
        icon={<GitBranch className="size-5" />}
        title="Couldn't load branches"
        description={error}
      />
    );
  }
  if (!data || data.branches.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="size-5" />}
        title="No branches found"
        description="Athena couldn't list this repo's branches. Check the integration still has access."
      />
    );
  }

  return (
    <Stack className="gap-3">
      <p className="text-sm text-[var(--text-muted)]">
        Pick which branches Athena indexes. The default branch is always
        indexed; index a feature branch to build a coexisting snapshot you can
        work against.
      </p>
      {data.branches.map((b) => (
        <BranchRow
          key={b.name}
          branch={b}
          busy={busy === b.name}
          onSync={() => onSync(b)}
        />
      ))}
    </Stack>
  );
}
