/** Metrics header for a showcase repo - the "numbers on top" row. */

import { GitCommit, Clock } from "lucide-react";

import type { ShowcaseRepoMetrics } from "@/lib/api/public-client";

import { compact, relativeTime, usd } from "./format";

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex flex-col gap-0.5" title={title}>
      <span className="text-lg font-semibold leading-none tracking-tight text-[var(--text)] tabular-nums">
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
        {label}
      </span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-xs font-medium text-[var(--primary)]">
      {children}
    </span>
  );
}

export function ShowcaseMetricsBar({ metrics }: { metrics: ShowcaseRepoMetrics }) {
  const m = metrics;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Stat label="Lines of code" value={compact(m.lines_of_code)} title={`${m.lines_of_code.toLocaleString()} LOC`} />
        <Stat label="Files" value={compact(m.files_indexed)} />
        <Stat label="Knowledge nodes" value={compact(m.node_count)} />
        <Stat label="Relationships" value={compact(m.edge_count)} />
        {m.exports > 0 && <Stat label="Public exports" value={compact(m.exports)} />}
        <Stat
          label="Indexing cost"
          value={usd(m.ingest_cost_usd)}
          title="Total LLM spend Athena used to generate this knowledge"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        {m.primary_language && <Badge>{m.primary_language}</Badge>}
        {m.architectural_pattern && <Badge>{m.architectural_pattern}</Badge>}
        {m.commit_short && (
          <span className="inline-flex items-center gap-1 font-mono">
            <GitCommit className="size-3.5" aria-hidden /> {m.commit_short}
          </span>
        )}
        {m.last_synced_at && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> indexed {relativeTime(m.last_synced_at)}
          </span>
        )}
      </div>
    </div>
  );
}
