"use client";

/**
 * SyncStatus — the ONE unified sync surface (Phase D).
 *
 * Consolidates the three drifting implementations that existed before:
 *   - `StalenessChip`  (inline in the cap page Repos tab)
 *   - `SyncStateChip`  (the dedicated repo route)
 *   - the ad-hoc "Sync now" buttons each wired their own stage vocabulary
 *
 * into a single chip + a single panel, sharing ONE state vocabulary. The
 * `<FreshnessPill>` (ScopeHeader) stays — it's the at-a-glance scope-level
 * indicator; this is the repo-level, action-bearing surface.
 *
 * Inputs are normalised into a `SyncSignals` shape so the chip renders the
 * same way whether the caller has a `CapabilityRepo` (list row) or a
 * `RepoKnowledge` + live `RepoSyncStatus` (repo page). Live-staleness gate
 * (contract #3): the Sync action shows ONLY when the repo is stale; when the
 * live HEAD check couldn't run (`checked_live === false`) we still allow a
 * manual sync behind a softer "couldn't verify" affordance.
 */

import { Loader2, RefreshCw, AlertTriangle, HelpCircle, Square, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type {
  CapabilityRepo,
  RepoKnowledge,
  RepoSyncStatus,
  RepoIngestProgress,
  SyncStage,
} from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils/format";
import type { FreshnessState } from "@/components/scope/freshness-pill";
import { IngestTimeline } from "./ingest-timeline";

/* ------------------------------- vocabulary ------------------------------- */

const IN_FLIGHT_STAGES: ReadonlySet<string> = new Set([
  "queued",
  "cloning",
  "parsing",
  "embedding",
  "indexing",
]);

function isInFlight(stage: string | null | undefined): boolean {
  return stage != null && IN_FLIGHT_STAGES.has(stage);
}

function prettyStage(stage: string | null | undefined): string {
  switch (stage) {
    case "queued":    return "Queued";
    case "cloning":   return "Cloning…";
    case "parsing":   return "Parsing…";
    case "embedding": return "Embedding…";
    case "indexing":  return "Indexing…";
    default:          return "Syncing";
  }
}

/** The single derived state the chip renders. */
export type SyncState =
  | "in_flight"
  | "syncing"
  | "failed"
  | "degraded"
  | "paused"
  | "never"
  | "behind"
  | "unverifiable"
  | "up_to_date";

/** Normalised signals — every input source collapses to this. */
export interface SyncSignals {
  stage: SyncStage | "cancelled" | null;
  indexedSha: string | null;
  headSha: string | null;
  commitsBehind: number | null;
  lastSyncAttemptAt: string | null;
  /** Live gate (contract #3): true → repo is stale; null → no live check. */
  isStale: boolean | null;
  /** Live gate: false → the GitHub HEAD check couldn't run. */
  checkedLive: boolean | null;
}

/** Build {@link SyncSignals} from a `CapabilityRepo` list row. */
export function signalsFromRepo(repo: CapabilityRepo): SyncSignals {
  return {
    stage: repo.current_sync_stage ?? null,
    indexedSha: repo.last_indexed_sha ?? null,
    headSha: repo.branch_head_sha ?? null,
    commitsBehind: repo.commits_behind ?? null,
    lastSyncAttemptAt: repo.last_sync_attempt_at ?? null,
    isStale: null,
    checkedLive: null,
  };
}

/** Build {@link SyncSignals} from the repo page's `RepoKnowledge` + the live
 *  `RepoSyncStatus`. The live status wins for staleness; the knowledge
 *  payload backfills stage / sha when the live check was light. */
export function signalsFromKnowledge(
  knowledge: RepoKnowledge | null,
  status: RepoSyncStatus | null,
): SyncSignals {
  return {
    stage: knowledge?.current_sync_stage ?? null,
    indexedSha: status?.last_indexed_sha ?? knowledge?.last_indexed_sha ?? null,
    headSha: status?.current_head_sha ?? knowledge?.branch_head_sha ?? null,
    commitsBehind: status?.commits_behind ?? knowledge?.commits_behind ?? null,
    lastSyncAttemptAt: knowledge?.last_ingested_at ?? null,
    isStale: status?.is_stale ?? null,
    checkedLive: status?.checked_live ?? null,
  };
}

/** Derive the single chip state from normalised signals + an optimistic
 *  "the caller just kicked off a sync" flag. */
export function deriveSyncState(signals: SyncSignals, syncing = false): SyncState {
  const { stage } = signals;
  if (isInFlight(stage)) return "in_flight";
  // Paused wins over an optimistic `syncing` flag — the worker stopped to ask
  // the user, so the skip/cancel affordance must show (item 1).
  if (stage === "paused") return "paused";
  if (syncing) return "syncing";
  if (stage === "failed" || stage === "cancelled") return "failed";
  if (stage === "degraded") return "degraded";
  if (!signals.indexedSha) return "never";
  // Live gate takes precedence when we have it.
  if (signals.isStale === true) return "behind";
  if (signals.checkedLive === false) return "unverifiable";
  if (signals.isStale === false) return "up_to_date";
  // Fall back to sha comparison when no live check ran.
  if (signals.headSha && signals.headSha !== signals.indexedSha) return "behind";
  return "up_to_date";
}

/** Map the live sync state onto the ScopeHeader's FreshnessState (+ an optional
 *  detail), so the header renders ONE accurate freshness indicator driven by
 *  the live gate — no second chip echoing "Up to date". The action-bearing
 *  chip + Sync button stay in <SyncStatusPanel> on the Blueprint tab. */
export function deriveFreshness(
  signals: SyncSignals,
  syncing = false,
): { state: FreshnessState; detail?: string } {
  const state = deriveSyncState(signals, syncing);
  switch (state) {
    case "in_flight":
    case "syncing":
      return { state: "indexing" };
    case "failed":
      // `cancelled` collapses into the `failed` SyncState (it shares the danger
      // tone), but it's a user Stop, not an error — label it honestly so the
      // header pill matches the panel's "Sync cancelled" instead of the
      // misleading "Sync failed" (the FreshnessState enum has no `cancelled`
      // variant; the cross-state-machine cleanup is checklist RD4).
      return signals.stage === "cancelled"
        ? { state: "failed", detail: "Sync cancelled" }
        : { state: "failed" };
    case "degraded":
      return { state: "failed" };
    case "paused":
      return { state: "failed", detail: "Paused — action needed" };
    case "never":
      return { state: "no_data" };
    case "behind": {
      const n = signals.commitsBehind ?? 0;
      const detail = n > 0 ? `${n} ${n === 1 ? "commit" : "commits"} behind` : "Update available";
      return { state: n > 10 ? "stale_major" : "stale_minor", detail };
    }
    case "unverifiable":
      return { state: "no_data", detail: "Couldn't verify" };
    case "up_to_date":
      return { state: "fresh" };
  }
}

/* -------------------------------- the chip -------------------------------- */

const STATE_TONE: Record<SyncState, string> = {
  in_flight:    "bg-[var(--primary-soft)] text-[var(--primary)]",
  syncing:      "bg-[var(--primary-soft)] text-[var(--primary)]",
  failed:       "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  degraded:     "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  paused:       "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  never:        "bg-[var(--surface-2)] text-[var(--text-muted)]",
  behind:       "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  unverifiable: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  up_to_date:   "bg-[var(--success-soft)] text-[var(--success-ink)]",
};

function stateLabel(state: SyncState, signals: SyncSignals): string {
  switch (state) {
    case "in_flight":    return prettyStage(signals.stage);
    case "syncing":      return "Syncing";
    case "failed":       return signals.stage === "cancelled" ? "Sync cancelled" : "Sync failed";
    case "degraded":     return "Synced (degraded)";
    case "paused":       return "Paused — action needed";
    case "never":        return "Never synced";
    case "behind": {
      const n = signals.commitsBehind;
      return typeof n === "number" && n > 0
        ? `${n} ${n === 1 ? "commit" : "commits"} behind`
        : "Update available";
    }
    case "unverifiable": return "Couldn't verify";
    case "up_to_date":   return "Up to date";
  }
}

function stateTitle(state: SyncState, signals: SyncSignals): string | undefined {
  const indexed = signals.indexedSha?.slice(0, 7);
  const head = signals.headSha?.slice(0, 7);
  const last = signals.lastSyncAttemptAt
    ? ` · Last synced ${formatRelativeTime(signals.lastSyncAttemptAt)}`
    : "";
  switch (state) {
    case "failed":
      return "The most recent sync failed — retry from the Sync button.";
    case "degraded":
      return "Some enrichments missing — retry to backfill embeddings, summaries, or tags.";
    case "paused":
      return "Ingestion paused on a file whose blueprint couldn't be generated — skip it or cancel.";
    case "behind":
      return `Knowledge may be stale — re-sync to pull the latest commits.${indexed && head ? ` Indexed ${indexed} · HEAD ${head}.` : ""}`;
    case "unverifiable":
      return "Couldn't reach GitHub to check for new commits. You can still sync manually.";
    case "up_to_date":
      return indexed ? `Indexed ${indexed}${last}` : undefined;
    default:
      return undefined;
  }
}

interface SyncStatusChipProps {
  signals: SyncSignals;
  /** Optimistic override — the caller already kicked off a sync. */
  syncing?: boolean;
  className?: string;
}

export function SyncStatusChip({ signals, syncing = false, className }: SyncStatusChipProps) {
  const state = deriveSyncState(signals, syncing);
  const spinning = state === "in_flight" || state === "syncing";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        STATE_TONE[state],
        className,
      )}
      data-sync-state={state}
      title={stateTitle(state, signals)}
    >
      {spinning && <Loader2 className="size-2.5 animate-spin" aria-hidden />}
      {state === "unverifiable" && <HelpCircle className="size-2.5" aria-hidden />}
      {stateLabel(state, signals)}
    </span>
  );
}

/* -------------------------------- the panel ------------------------------- */

interface SyncStatusPanelProps {
  signals: SyncSignals;
  /** Ingest-progress payload — drives the inline `<IngestTimeline>`. */
  progress?: RepoIngestProgress | null;
  /** Live "the caller kicked off a sync" flag. */
  syncing?: boolean;
  /** Fires the sync mutation. When omitted the action button is hidden. */
  onSync?: () => void;
  /** Fires the cancel/stop mutation. When omitted the Stop button is hidden.
   *  The Stop button is the in-flight counterpart to Sync — it appears ONLY
   *  while ingestion is in flight (stage queued/cloning/parsing/embedding/
   *  indexing). */
  onStop?: () => void;
  /** Optimistic "the caller just clicked Stop" flag — flips the button to
   *  "Cancelling…" and disables it until the refetch confirms `cancelled`. */
  cancelling?: boolean;
  /** Re-run failed per-file enrichments (only meaningful when degraded). */
  onRetryEnrichments?: () => void;
  retrying?: boolean;
  /** item 1 — skip the paused file (resolve it WITHOUT the LLM, then resume).
   *  Only meaningful while paused. When omitted the Skip button is hidden. */
  onSkipFile?: () => void;
  /** Optimistic "the caller just clicked Skip this file" flag. */
  skipping?: boolean;
  /** §5.30 — gates the action buttons behind cap-admin. */
  canManage?: boolean;
  className?: string;
}

/**
 * The action-bearing repo sync surface. Renders the chip + a live-gated
 * Sync action + the rich `<IngestTimeline>` disclosure. The Sync button
 * appears ONLY when the repo is actionably stale (behind / unverifiable /
 * never / failed / degraded) — a fresh repo shows no button, removing the
 * "why is there a Sync button when I'm up to date?" confusion.
 */
export function SyncStatusPanel({
  signals,
  progress = null,
  syncing = false,
  onSync,
  onStop,
  cancelling = false,
  onRetryEnrichments,
  retrying = false,
  onSkipFile,
  skipping = false,
  canManage = true,
  className,
}: SyncStatusPanelProps) {
  const state = deriveSyncState(signals, syncing);
  const inFlight = state === "in_flight" || state === "syncing";
  const showPaused = state === "paused";
  const pausedPath = progress?.current?.paused_path ?? null;
  const pausedError = progress?.current?.error ?? null;
  // Live-staleness gate — only offer the Sync action when there's something
  // to sync. A confirmed-fresh repo (isStale === false) shows no button.
  const showSync =
    !!onSync &&
    !inFlight &&
    (state === "behind" ||
      state === "unverifiable" ||
      state === "never" ||
      state === "failed" ||
      state === "degraded");
  // Stop is the in-flight counterpart to Sync — shown ONLY when the worker
  // reports a real in-flight stage (queued/cloning/parsing/embedding/
  // indexing). The optimistic "syncing" state has nothing to cancel yet, so
  // it's deliberately excluded.
  const showStop = !!onStop && state === "in_flight";
  const showRetry = !!onRetryEnrichments && state === "degraded";

  return (
    <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--inner-highlight)]", className)} data-testid="sync-status-panel">
      <Stack gap="3">
        <Cluster gap="2" align="center" justify="between" className="flex-wrap">
          <Cluster gap="2" align="center">
            <SyncStatusChip signals={signals} syncing={syncing} />
            {state === "unverifiable" && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <AlertTriangle className="size-3 text-[var(--warning)]" aria-hidden />
                Couldn&apos;t reach GitHub to check for new commits.
              </span>
            )}
          </Cluster>
          <Cluster gap="2" align="center">
            {showStop && (
              <Button
                size="sm"
                variant="destructive"
                onClick={onStop}
                disabled={!canManage || cancelling}
                data-testid="sync-status-stop"
                title={
                  !canManage
                    ? "Cap-admin required to stop ingestion"
                    : "Stop the in-flight ingestion — the worker halts within the current batch."
                }
              >
                {cancelling ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Square className="size-3" aria-hidden />}
                {cancelling ? "Cancelling…" : "Stop"}
              </Button>
            )}
            {showRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetryEnrichments}
                disabled={!canManage || retrying}
                data-testid="sync-status-retry-enrichments"
                title={
                  !canManage
                    ? "Cap-admin required to retry enrichments"
                    : "Re-run the failed per-file LLM enrichments (embeddings, summaries, tags)."
                }
              >
                {retrying ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />}
                {retrying ? "Retrying…" : "Retry enrichments"}
              </Button>
            )}
            {showSync && (
              <Button
                size="sm"
                onClick={onSync}
                disabled={!canManage || syncing}
                data-testid="sync-status-sync"
                title={!canManage ? "Cap-admin required to sync knowledge" : undefined}
              >
                {syncing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />}
                Sync now
              </Button>
            )}
          </Cluster>
        </Cluster>
        {showPaused && (
          <div
            role="alert"
            data-testid="sync-status-paused"
            className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] p-3"
          >
            <Cluster gap="2" align="start">
              <AlertTriangle className="size-4 shrink-0 text-[var(--warning-ink)]" aria-hidden />
              <Stack gap="2" className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[var(--text)]">
                  Ingestion paused — a file&apos;s blueprint couldn&apos;t be generated.
                </p>
                {pausedPath && (
                  <p
                    className="truncate font-mono text-[11px] text-[var(--text-muted)]"
                    title={pausedPath}
                  >
                    {pausedPath}
                  </p>
                )}
                {pausedError && (
                  <p className="text-[11px] text-[var(--text-muted)]">{pausedError}</p>
                )}
                <Cluster gap="2" align="center" className="flex-wrap">
                  {onSkipFile && (
                    <Button
                      size="sm"
                      onClick={onSkipFile}
                      disabled={!canManage || skipping || cancelling}
                      data-testid="sync-status-skip-file"
                      title={
                        !canManage
                          ? "Cap-admin required to manage this sync"
                          : "Skip this file (use its raw content, no LLM) and continue the sync."
                      }
                    >
                      {skipping ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <SkipForward className="size-3" aria-hidden />}
                      {skipping ? "Skipping…" : "Skip this file"}
                    </Button>
                  )}
                  {onStop && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onStop}
                      disabled={!canManage || cancelling || skipping}
                      data-testid="sync-status-paused-cancel"
                      title={!canManage ? "Cap-admin required to manage this sync" : "Cancel the whole sync."}
                    >
                      {cancelling ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Square className="size-3" aria-hidden />}
                      {cancelling ? "Cancelling…" : "Cancel sync"}
                    </Button>
                  )}
                </Cluster>
              </Stack>
            </Cluster>
          </div>
        )}
        <IngestTimeline
          progress={progress}
          canManage={canManage}
          {...(onSync ? { onRetrySync: onSync } : {})}
        />
      </Stack>
    </div>
  );
}
