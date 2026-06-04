"use client";

/**
 * "Ingestion cost by repo" — per-repo knowledge-ingestion spend, with a
 * per-sync-cycle drill-down. Mirrors the redesigned cost cards (prominent
 * title, ranked rows, share bars, tabular numerics) and the TopTasks list
 * idiom, adding an expandable row: clicking a repo lazily fetches its sync
 * history (one row per commit/cycle) via `api.cost.repoIngestCycles`.
 *
 * Scoped by the page's date-range + billing source (the parent threads
 * `from`/`to`/`source`). Empty until a sync is attributed in the window —
 * spend that predates the per-repo attribution stays in the org-wide
 * "Knowledge ingestion" phase total on the breakdown card.
 */

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight, FolderGit2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  type CostBillingSource,
  type CostSummary,
  type RepoIngestCycles,
} from "@/lib/api/client";
import { formatRelativeTime, formatTokens, formatUsdPrecise } from "@/lib/utils/format";

type RepoRow = NonNullable<CostSummary["spend_by_repo"]>[number];
type CycleState = RepoIngestCycles["cycles"] | "loading" | "error" | undefined;

interface RepoIngestCostCardProps {
  rows: RepoRow[];
  source: CostBillingSource;
  from: string;
  to: string;
}

export function RepoIngestCostCard({ rows, source, from, to }: RepoIngestCostCardProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [cyclesById, setCyclesById] = useState<Record<string, CycleState>>({});
  // Share is of total INGESTION spend (not org-wide) so the bars answer
  // "which repo dominates ingestion cost" — the question this card is about.
  const ingestTotal = Math.max(1, rows.reduce((s, r) => s + r.usd, 0));

  const toggle = useCallback(
    async (repoId: string) => {
      setOpenId((cur) => (cur === repoId ? null : repoId));
      // Lazy-fetch the drill-down once; cache (incl. loading/error) avoids refetch.
      if (cyclesById[repoId] !== undefined) return;
      setCyclesById((m) => ({ ...m, [repoId]: "loading" }));
      try {
        const res = await api.cost.repoIngestCycles(repoId, { from, to, source });
        setCyclesById((m) => ({ ...m, [repoId]: res.cycles }));
      } catch {
        setCyclesById((m) => ({ ...m, [repoId]: "error" }));
      }
    },
    [cyclesById, from, to, source],
  );

  return (
    <Card variant="elevated" className="p-5">
      <Stack gap="4">
        <Stack gap="0.5" className="border-b border-[var(--border)] pb-3">
          <h2 className="text-lg font-semibold leading-snug">Ingestion cost by repo</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Knowledge-ingestion spend per repository — expand a repo for its per-sync cost
          </p>
        </Stack>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="size-6" />}
            title="No per-repo ingestion spend yet"
            description="Per-repo cost appears here after a sync in this window. New syncs are attributed by repo; older ingestion spend stays in the org-wide total on the breakdown card."
          />
        ) : (
          <Stack gap="0.5" as="ul">
            {rows.map((r) => {
              const open = openId === r.repo_id;
              const share = Math.round((r.usd / ingestTotal) * 100);
              return (
                <li key={r.repo_id} className="rounded-md">
                  <button
                    type="button"
                    onClick={() => void toggle(r.repo_id)}
                    aria-expanded={open}
                    data-testid="repo-ingest-row"
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <span className="w-4 shrink-0 text-center text-[var(--text-subtle)]" aria-hidden>
                      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </span>
                    <Stack gap="1" className="min-w-0 flex-1">
                      <Cluster gap="2" justify="between" align="center">
                        <span className="line-clamp-1 text-sm font-medium text-[var(--text)]">{r.name}</span>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text)]">{formatUsdPrecise(r.usd)}</span>
                      </Cluster>
                      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${share}%` }} />
                      </span>
                      <span className="text-xs text-[var(--text-subtle)]">
                        {share}% of ingestion · {formatTokens(r.prompt_tokens + r.completion_tokens)} tokens · {r.calls.toLocaleString()} calls
                        {r.last_used ? ` · last synced ${formatRelativeTime(r.last_used)}` : ""}
                      </span>
                    </Stack>
                  </button>
                  {open && (
                    <div className="pb-3 pl-9 pr-2">
                      <RepoCycles state={cyclesById[r.repo_id]} />
                    </div>
                  )}
                </li>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/** The per-repo drill-down: one row per sync cycle (commit), newest first. */
function RepoCycles({ state }: { state: CycleState }) {
  if (state === undefined || state === "loading") {
    return <div className="h-16 w-full animate-pulse rounded bg-[var(--surface-2)]" aria-label="Loading sync history" />;
  }
  if (state === "error") {
    return <p className="text-xs text-[var(--danger)]">Couldn&apos;t load this repo&apos;s sync history.</p>;
  }
  if (state.length === 0) {
    return <p className="text-xs text-[var(--text-subtle)]">No per-sync cost recorded in this window.</p>;
  }
  return (
    <table className="w-full text-xs" data-testid="repo-ingest-cycles">
      <thead>
        <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          <th className="py-1 pr-3 font-semibold">Commit</th>
          <th className="py-1 pr-3 font-semibold">Synced</th>
          <th className="py-1 pr-3 text-right font-semibold">Calls</th>
          <th className="py-1 pr-3 text-right font-semibold">Tokens</th>
          <th className="py-1 text-right font-semibold">Cost</th>
        </tr>
      </thead>
      <tbody>
        {state.map((c) => (
          <tr key={c.branch_sha} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]">
            <td className="py-1 pr-3 font-mono text-[var(--text-muted)]">{c.branch_sha.slice(0, 7)}</td>
            <td className="py-1 pr-3 text-[var(--text-muted)]">{c.started_at ? formatRelativeTime(c.started_at) : "—"}</td>
            <td className="py-1 pr-3 text-right tabular-nums text-[var(--text-muted)]">{c.calls.toLocaleString()}</td>
            <td className="py-1 pr-3 text-right tabular-nums text-[var(--text-muted)]">{formatTokens(c.prompt_tokens + c.completion_tokens)}</td>
            <td className="py-1 text-right font-medium tabular-nums text-[var(--text)]">{formatUsdPrecise(c.usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
