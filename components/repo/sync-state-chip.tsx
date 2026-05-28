/**
 * SyncStateChip — compact chip describing a repo's sync state on the
 * dedicated Repo route (`/capabilities/[id]/repos/[repo_id]`).
 *
 * Mirrors the `StalenessChip` from the cap-page Repos tab but lives in
 * its own module so the dedicated route can drop it next to the
 * <FreshnessPill> without inheriting the cap-page's local helpers.
 *
 * State derivation matches the cap-page:
 *   - in-flight (`queued/cloning/parsing/embedding/indexing`) → primary
 *   - `failed`                                                → danger
 *   - never synced (no `last_indexed_sha`)                    → muted
 *   - HEAD ahead of indexed                                   → warning
 *     (label = "N commits behind" when `commits_behind > 0`,
 *      else "Update available")
 *   - HEAD === indexed                                        → success
 *
 * The chip never owns its own sync action; the parent route wires the
 * "Sync now" button separately.
 *
 * `variant="timeline"` renders the full `<IngestTimeline>` underneath
 * the pill — used on the Topology tab so the rich disclosure lives in
 * its ADR-073 §4 canonical home, while the header chip stays compact.
 */

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";
import type { CapabilityRepo, RepoIngestProgress, SyncStage } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils/format";
import { IngestTimeline } from "./ingest-timeline";

const IN_FLIGHT_STAGES: ReadonlySet<SyncStage> = new Set([
  "queued",
  "cloning",
  "parsing",
  "embedding",
  "indexing",
]);

function isInFlight(stage: SyncStage | null | undefined): boolean {
  return stage != null && IN_FLIGHT_STAGES.has(stage);
}

function prettyStage(stage: SyncStage | null | undefined): string {
  switch (stage) {
    case "queued":    return "Queued";
    case "cloning":   return "Cloning…";
    case "parsing":   return "Parsing…";
    case "embedding": return "Embedding…";
    case "indexing":  return "Indexing…";
    default:          return "Syncing";
  }
}

export interface SyncStateChipProps {
  repo: CapabilityRepo;
  /** Optional override — caller already knows a local sync was kicked off. */
  syncing?: boolean;
  className?: string;
  /** `"compact"` (default) renders just the pill. `"timeline"` renders the
   *  pill stacked with the rich `<IngestTimeline>` disclosure underneath. */
  variant?: "compact" | "timeline";
  /** Optional `RepoIngestProgress` payload. Required when
   *  ``variant === "timeline"``; ignored otherwise. */
  progress?: RepoIngestProgress | null;
  /** Forwarded to `<IngestTimeline>`. */
  canManage?: boolean;
  onRetrySync?: () => void;
}

export function SyncStateChip({
  repo, syncing = false, className, variant = "compact", progress = null, canManage = false, onRetrySync,
}: SyncStateChipProps) {
  const pill = renderPill(repo, syncing, className);
  if (variant === "timeline") {
    return (
      <div className="flex flex-col gap-2">
        {pill}
        <IngestTimeline
          progress={progress}
          canManage={canManage}
          {...(onRetrySync ? { onRetrySync } : {})}
        />
      </div>
    );
  }
  return pill;
}

function renderPill(repo: CapabilityRepo, syncing: boolean, className?: string) {
  const indexed = repo.last_indexed_sha;
  const head = repo.branch_head_sha;
  const stage = repo.current_sync_stage;
  const lastAttempt = repo.last_sync_attempt_at;

  const stageInFlight = isInFlight(stage);
  if (stageInFlight || syncing) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]",
          className,
        )}
        data-sync-state={stageInFlight ? "in-flight" : "syncing"}
        title={lastAttempt ? `Sync started ${formatRelativeTime(lastAttempt)}` : undefined}
      >
        <Loader2 className="size-2.5 animate-spin" aria-hidden />
        {stageInFlight ? prettyStage(stage) : "Syncing"}
      </span>
    );
  }

  if (stage === "failed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]",
          className,
        )}
        data-sync-state="failed"
        title={lastAttempt ? `Last attempt ${formatRelativeTime(lastAttempt)}` : "The most recent sync failed — retry from the Sync button."}
      >
        Sync failed
      </span>
    );
  }

  if (!indexed) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
          className,
        )}
        data-sync-state="never"
      >
        Never synced
      </span>
    );
  }

  if (head && head !== indexed) {
    const count = repo.commits_behind;
    const behind =
      typeof count === "number" && count > 0
        ? `${count} ${count === 1 ? "commit" : "commits"} behind`
        : "Update available";
    const lastBit = lastAttempt ? ` · Last synced ${formatRelativeTime(lastAttempt)}` : "";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning)]",
          className,
        )}
        data-sync-state="behind"
        title={`Knowledge may be stale — re-sync to pull the latest commits. Indexed ${indexed.slice(0, 7)} · HEAD ${head.slice(0, 7)}.`}
      >
        {behind}{lastBit}
      </span>
    );
  }

  const upToDateBit = lastAttempt ? ` · Last synced ${formatRelativeTime(lastAttempt)}` : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]",
        className,
      )}
      data-sync-state="up-to-date"
      title={indexed ? `Indexed ${indexed.slice(0, 7)}` : undefined}
    >
      Up to date{upToDateBit}
    </span>
  );
}
