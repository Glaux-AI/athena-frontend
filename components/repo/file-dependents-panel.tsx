"use client";

/**
 * FileDependentsPanel — §6.5.6 FE-mirror for `find_dependents` /
 * `find_dependencies` / `expand_slice`. Tree grouped by `hop_distance`
 * (1 / 2 / 3+) with cross-repo highlight; row click re-targets parent
 * drawer via `onNavigate(fileId)`. Wire shape: canonical KGEnvelope —
 * `{items, freshness, search_quality}` per ADR-032 snake_case truth.
 */

import { useEffect, useState } from "react";
import { ExternalLink, Network } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import {
  api,
  type FileDependentsEnvelope,
  type FileDependentsItem,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

export type FileDependentsMode = "dependents" | "dependencies" | "neighborhood";

export interface FileDependentsPanelProps {
  repoId: string;
  fileId: string;
  mode: FileDependentsMode;
  /** Repo full_name of the *seed* file — peer rows with a different
   *  `repo_full_name` get the cross-repo highlight. */
  seedRepoFullName?: string;
  /** Click-handler replaces the current drawer state with the picked
   *  file (parent owns the routing). */
  onNavigate?: (fileId: string) => void;
}

const _COPY: Record<FileDependentsMode, [string, string]> = {
  dependents: ["Who depends on this file?", "No callers found within 3 hops."],
  dependencies: ["What does this file depend on?", "No dependencies found within 3 hops."],
  neighborhood: ["Immediate neighbourhood (siblings + direct edges).", "No neighbours found."],
};

export function FileDependentsPanel({
  repoId,
  fileId,
  mode,
  seedRepoFullName,
  onNavigate,
}: FileDependentsPanelProps) {
  const [envelope, setEnvelope] = useState<FileDependentsEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const call =
      mode === "dependents"
        ? api.repos.files.dependents(repoId, fileId, { max_hops: 3, kind: "imports" }, { signal: ctrl.signal })
        : mode === "dependencies"
          ? api.repos.files.dependencies(repoId, fileId, { max_hops: 3, kind: "imports" }, { signal: ctrl.signal })
          : api.repos.files.slice(repoId, fileId, { max_hops: 2 }, { signal: ctrl.signal });
    call
      .then((e) => { if (!cancelled) setEnvelope(e); })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load graph walk");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; ctrl.abort(); };
  }, [repoId, fileId, mode]);

  if (loading) return <PanelSkeleton testid={`file-dependents-${mode}-skeleton`} />;
  if (error) {
    return (
      <p
        className="text-sm text-[var(--danger)]"
        role="alert"
        data-testid={`file-dependents-${mode}-error`}
      >
        {error}
      </p>
    );
  }
  if (!envelope || envelope.items.length === 0) {
    return (
      <EmptyState
        icon={<Network className="size-6" aria-hidden />}
        title={_COPY[mode][1]}
        description={_COPY[mode][0]}
      />
    );
  }

  const groups = _groupByHop(envelope.items);
  return (
    <Stack gap="3" data-testid={`file-dependents-${mode}`}>
      <FreshnessBar envelope={envelope} />
      {groups.map(([hopLabel, rows]) => (
        <section key={hopLabel} aria-labelledby={`hop-${mode}-${hopLabel}`}>
          <h4
            id={`hop-${mode}-${hopLabel}`}
            className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
          >
            Hop {hopLabel} · {rows.length}
          </h4>
          <Stack gap="1" as="ul">
            {rows.map((row) => (
              <DependentRow
                key={row.id}
                row={row}
                isCrossRepo={Boolean(seedRepoFullName && row.repo_full_name !== seedRepoFullName)}
                {...(onNavigate ? { onNavigate } : {})}
              />
            ))}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}

function _groupByHop(items: FileDependentsItem[]): Array<[string, FileDependentsItem[]]> {
  const buckets = new Map<string, FileDependentsItem[]>();
  for (const r of items) {
    const label = r.hop_distance >= 3 ? "3+" : String(r.hop_distance);
    const arr = buckets.get(label) ?? [];
    arr.push(r);
    buckets.set(label, arr);
  }
  return [...buckets.entries()].sort((a, b) =>
    a[0].replace("+", "") < b[0].replace("+", "") ? -1 : 1,
  );
}

function FreshnessBar({ envelope }: { envelope: FileDependentsEnvelope }) {
  const sha = envelope.freshness.kg_snapshot_id;
  return (
    <Cluster gap="1.5" align="center" data-testid="file-dependents-freshness"
      className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-[11px] text-[var(--text-muted)]">
      <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">snapshot</span>
      <code className="font-mono text-[var(--text)]">{sha ? sha.slice(0, 7) : "—"}</code>
      <span aria-hidden>·</span><span>quality: {envelope.search_quality}</span>
      <span aria-hidden>·</span><span>{envelope.items.length} hits</span>
    </Cluster>
  );
}

function DependentRow({ row, isCrossRepo, onNavigate }: {
  row: FileDependentsItem; isCrossRepo: boolean; onNavigate?: (fileId: string) => void;
}) {
  return (
    <li className={cn("rounded-md", isCrossRepo && "border border-[var(--primary)]/40 bg-[var(--primary)]/5")}>
      <button type="button" onClick={() => onNavigate?.(row.id)}
        data-testid="file-dependents-row" data-cross-repo={isCrossRepo ? "true" : "false"}
        className={cn(
          "flex w-full min-h-11 items-start gap-2 rounded-md px-2 py-1.5 text-left",
          "hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
        )}>
        <Stack gap="0.5" className="min-w-0 flex-1">
          <Cluster gap="1.5" align="baseline">
            <span className="truncate font-semibold text-[var(--text)]" title={row.name}>{row.name}</span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {row.node_kind}
            </span>
            {isCrossRepo && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                <ExternalLink className="size-2.5" aria-hidden />cross-repo
              </span>
            )}
          </Cluster>
          <code className="block truncate font-mono text-[11px] text-[var(--text-muted)]"
            title={`${row.repo_full_name}/${row.path}`}>
            {row.path}
          </code>
        </Stack>
        <span
          className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-muted)]"
          aria-label={`hop distance ${row.hop_distance}`}
        >
          h{row.hop_distance}
        </span>
      </button>
    </li>
  );
}

function PanelSkeleton({ testid }: { testid: string }) {
  return (
    <Stack gap="2" aria-busy="true" data-testid={testid}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="motion-safe:animate-pulse h-11 w-full rounded-md bg-[var(--surface-2)]" />
      ))}
    </Stack>
  );
}
