import Link from "next/link";
import { ArrowUpRight, GitBranch } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
import type { ShowcaseRepoSummary } from "@/lib/api/public-client";

import { compact } from "./format";

function StatusBadge({ status, ready }: { status: string; ready: boolean }) {
  if (ready) return null;
  if (status === "failed") {
    return <Pill tone="danger" size="sm" dot>Failed</Pill>;
  }
  if (status === "indexing") {
    return <Pill tone="primary" size="sm" live>Indexing</Pill>;
  }
  return <Pill tone="neutral" size="sm" dot>Queued</Pill>;
}

function Metrics({ repo }: { repo: ShowcaseRepoSummary }) {
  const m = repo.metrics;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
      <span className="tabular-nums">{compact(m.lines_of_code)} LOC</span>
      <span className="tabular-nums">{compact(m.node_count)} nodes</span>
      {m.primary_language && <span>{m.primary_language}</span>}
    </div>
  );
}

export function ShowcaseRepoCard({ repo }: { repo: ShowcaseRepoSummary }) {
  const inner = (
    <Card
      variant="moment"
      interactive={repo.ready}
      className={cn(
        "group flex h-full flex-col gap-3 p-5",
        !repo.ready && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-[var(--text-subtle)]">{repo.owner}</p>
          <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--text)]">
            {repo.name}
          </h3>
        </div>
        {repo.ready ? (
          <ArrowUpRight className="size-4 shrink-0 text-[var(--text-subtle)] transition-colors group-hover:text-[var(--primary)]" aria-hidden />
        ) : (
          <StatusBadge status={repo.ingestion_status} ready={repo.ready} />
        )}
      </div>
      {repo.summary && (
        <p className="line-clamp-3 text-sm leading-relaxed text-[var(--text-muted)]">{repo.summary}</p>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-1">
        <Metrics repo={repo} />
        <span className="inline-flex items-center gap-1 text-micro text-[var(--text-subtle)]">
          <GitBranch className="size-3" aria-hidden /> {repo.default_branch}
        </span>
      </div>
    </Card>
  );

  if (!repo.ready) return inner;
  return (
    <Link href={`/showcase/${repo.slug}`} className={cn("block rounded-xl", focusRing)}>
      {inner}
    </Link>
  );
}
