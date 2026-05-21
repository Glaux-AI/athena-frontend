"use client";

/**
 * Knowledge Sync card — the user-facing trigger for incremental knowledge updates.
 *
 * Shows the project's last-indexed sha, the current branch HEAD sha, and how
 * many commits the index is behind. The Sync button kicks off an incremental
 * update (delta only — never a full regeneration).
 *
 * Used on the dashboard and the project page.
 */

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, GitBranch, CheckCircle2, AlertCircle } from "lucide-react";

import { api, ApiError, type ProjectKnowledgeState, type SyncResult } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatRelativeTime } from "@/lib/utils/format";

export function KnowledgeSyncCard({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectKnowledgeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [pending, start] = useTransition();

  const refresh = async () => {
    try {
      const s = await api.projects.knowledge(projectId);
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load knowledge state");
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 15_000);  // catch webhook-driven changes
    return () => clearInterval(t);
  }, [projectId]);

  const doSync = () => {
    start(async () => {
      try {
        const result = await api.projects.sync(projectId);
        setLastResult(result);
        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Sync failed");
      }
    });
  };

  const simulatePush = () => {
    start(async () => {
      try {
        await api.projects.simulatePush(projectId);
        await refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Simulate failed");
      }
    });
  };

  if (!state && !error) {
    return (
      <Card>
        <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <CardHeader>
          <CardTitle className="text-base">Knowledge</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const s = state!;
  const upToDate = s.commits_behind === 0;

  return (
    <Card>
      <CardHeader>
        <Cluster justify="between" align="start">
          <Stack gap="0">
            <CardTitle>Knowledge</CardTitle>
            <CardDescription>
              Code knowledge graph + module docs. Updated incrementally from the
              last-indexed commit to HEAD.
            </CardDescription>
          </Stack>
          <Cluster gap="1" align="center" className="text-[var(--text-muted)]">
            <GitBranch className="size-3.5" aria-hidden />
            <span className="font-mono text-xs">{s.branch}</span>
          </Cluster>
        </Cluster>
      </CardHeader>
      <CardContent>
        <Stack gap="4">
          <Stack gap="2">
            <Row
              label="Repository"
              value={<span className="font-mono text-xs">{s.repo_full_name}</span>}
            />
            <Row
              label="Last indexed"
              value={
                s.last_indexed_sha ? (
                  <span className="font-mono text-xs">{s.last_indexed_sha}</span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">never</span>
                )
              }
            />
            <Row
              label="Branch HEAD"
              value={<span className="font-mono text-xs">{s.branch_head_sha}</span>}
            />
            <Row
              label="Status"
              value={
                upToDate ? (
                  <Cluster gap="1" align="center">
                    <CheckCircle2 className="size-3.5 text-[var(--success)]" aria-hidden />
                    <span className="text-xs text-[var(--success)]">Up to date</span>
                  </Cluster>
                ) : (
                  <Cluster gap="1" align="center">
                    <AlertCircle className="size-3.5 text-[var(--warning)]" aria-hidden />
                    <span className="text-xs text-[var(--warning)]">
                      {s.commits_behind} {s.commits_behind === 1 ? "commit" : "commits"} behind
                    </span>
                  </Cluster>
                )
              }
            />
            {s.last_synced_at && (
              <Row
                label="Last synced"
                value={
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatRelativeTime(s.last_synced_at)}
                  </span>
                }
              />
            )}
          </Stack>

          <Cluster gap="2">
            <Button onClick={doSync} loading={pending} disabled={upToDate || s.sync_in_progress}>
              <RefreshCw className="size-4" />
              {upToDate ? "Up to date" : "Sync"}
            </Button>
            <Button variant="ghost" size="sm" onClick={simulatePush} disabled={pending}>
              Simulate push
            </Button>
          </Cluster>

          {lastResult && (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                Last sync
              </p>
              <Stack gap="1" className="mt-2 text-xs text-[var(--text-muted)]">
                <span>
                  <span className="font-mono">{lastResult.from_sha}</span>
                  {" → "}
                  <span className="font-mono">{lastResult.to_sha}</span>
                </span>
                <span>
                  +{lastResult.files_added} added · ~{lastResult.files_modified} modified ·
                  −{lastResult.files_deleted} deleted
                </span>
                <span>
                  {lastResult.chunks_upserted} chunks upserted ·{" "}
                  {lastResult.knowledge_docs_proposed} doc updates proposed ·{" "}
                  {(lastResult.duration_ms / 1000).toFixed(1)}s
                </span>
              </Stack>
            </div>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  );
}
