import Link from "next/link";
import { ArrowUpRight, GitBranch } from "lucide-react";

import { cn } from "@/lib/cn";
import type { ShowcaseRepoSummary } from "@/lib/api/public-client";

import { compact } from "./format";

function StatusBadge({ status, ready }: { status: string; ready: boolean }) {
  if (ready) return null;
  const label = status === "failed" ? "Failed" : status === "indexing" ? "Indexing" : "Queued";
  return (
    <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
      {label}
    </span>
  );
}

function Metrics({ repo }: { repo: ShowcaseRepoSummary }) {
  const m = repo.metrics;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
      <span className="tabular-nums">{compact(m.lines_of_code)} LOC</span>
      <span className="tabular-nums">{compact(m.files_indexed)} files</span>
      <span className="tabular-nums">{compact(m.node_count)} nodes</span>
      {m.primary_language && <span>{m.primary_language}</span>}
    </div>
  );
}

export function ShowcaseRepoCard({ repo }: { repo: ShowcaseRepoSummary }) {
  const inner = (
    <div
      className={cn(
        "group flex h-full flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all",
        repo.ready
          ? "hover:border-[var(--primary)] hover:shadow-[var(--shadow-1)]"
          : "opacity-70",
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
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-subtle)]">
          <GitBranch className="size-3" aria-hidden /> {repo.default_branch}
        </span>
      </div>
    </div>
  );

  if (!repo.ready) return inner;
  return (
    <Link href={`/showcase/${repo.slug}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-xl">
      {inner}
    </Link>
  );
}
