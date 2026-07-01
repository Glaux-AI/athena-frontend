"use client";

/**
 * IngestTimeline - 5-step horizontal pipeline (Cloning → Parsing →
 * Embedding → Indexing → Completed) backed by ``RepoIngestProgress``.
 * Exposes per-attempt timing + history the BE already persists.
 * Pure-presentation; parent owns polling (see
 * ``features/repos/use-ingest-progress.ts``). Step nodes pulse on
 * `current` only outside `prefers-reduced-motion`.
 */

import { useState } from "react";

import { AlertTriangle, ChevronDown, ChevronRight, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import type {
  IngestStageTransition,
  RepoIngestProgress,
  ShardSummary,
  ShardWave,
} from "@/lib/api/client";

type TimelineStage = "cloning" | "parsing" | "embedding" | "indexing" | "completed";
const TIMELINE_STAGES: readonly TimelineStage[] = ["cloning", "parsing", "embedding", "indexing", "completed"];
// Short labels for the stepper nodes (must fit under each dot).
const STAGE_LABEL: Record<TimelineStage, string> = {
  cloning: "Cloning", parsing: "Scanning", embedding: "Embedding", indexing: "Indexing", completed: "Completed",
};
// What each backend stage ACTUALLY does - used in the narration line + per-node
// tooltip (the short labels can't say it). `parsing` is a fast file-filter,
// `embedding` is the per-file enrichment pass (summary + vector + symbols), and
// `indexing` is the post-node graph wiring (edges + blueprints + projections).
const STAGE_NARRATION: Record<TimelineStage, string> = {
  cloning: "Cloning the repository",
  parsing: "Scanning files",
  embedding: "Reading & embedding files",
  indexing: "Wiring the graph & blueprints",
  completed: "Completed",
};
type StageState = "completed" | "current" | "pending" | "failed";

// The worker bumps the progress heartbeat at least once a minute while it is
// genuinely alive (server-computed ``heartbeat_age_ms``), so three missed
// ticks on an in-flight stage means the sync really is stalled - say so
// instead of pulsing a live-looking spinner forever.
const STALL_AFTER_MS = 180_000;

interface StepView { stage: TimelineStage; state: StageState }

function buildStepStates(current: IngestStageTransition): { steps: StepView[]; failedStage: TimelineStage | null } {
  const cur = current.stage;
  // Without a stage-events table we can't pin the exact failure step
  // - colour the first node `failed` and let the error text below
  // carry the detail.
  if (cur === "failed" || cur === "cancelled") {
    return {
      failedStage: "cloning",
      steps: TIMELINE_STAGES.map((s, i) => ({ stage: s, state: i === 0 ? "failed" : "pending" as const })),
    };
  }
  const idx = TIMELINE_STAGES.indexOf(cur as TimelineStage);
  return {
    failedStage: null,
    steps: TIMELINE_STAGES.map((s, i) => {
      if (idx === -1) return { stage: s, state: "pending" };
      if (i < idx) return { stage: s, state: "completed" };
      if (i === idx) return { stage: s, state: cur === "completed" ? "completed" : "current" };
      return { stage: s, state: "pending" };
    }),
  };
}

function truncateMiddle(path: string, head = 16, tail = 24): string {
  return path.length <= head + tail + 1 ? path : `${path.slice(0, head)}…${path.slice(-tail)}`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1_000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** When an attempt was retried, `duration_ms` (cumulative since the first
 *  attempt at this sha) exceeds `attempt_duration_ms` (the current run). The
 *  primary timer shows the current run; surface the cumulative as a hover
 *  title. Returns undefined when there's no meaningful retry gap. */
function totalRetryTitle(attemptMs: number | null, totalMs: number | null): string | undefined {
  if (attemptMs == null || totalMs == null) return undefined;
  if (totalMs - attemptMs <= 1_000) return undefined;
  return `${formatDuration(totalMs)} total across retries`;
}

const NODE_TONE: Record<StageState, string> = {
  // The node renders a step number (text) on a solid fill - use the AA-correct
  // semantic foreground, not text-surface (white-on-success failed AA in light).
  completed: "bg-[var(--success)] border-[var(--success)] text-[var(--success-fg)]",
  current: "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-fg)] motion-safe:animate-pulse",
  pending: "bg-[var(--surface)] border-[var(--border-strong)] text-[var(--text-muted)]",
  failed: "bg-[var(--danger)] border-[var(--danger)] text-[var(--danger-fg)]",
};

const CONNECTOR_TONE: Record<StageState, string> = {
  completed: "bg-[var(--success)]",
  current: "bg-[var(--primary-soft)]",
  pending: "bg-[var(--border)]",
  failed: "bg-[var(--danger-soft)]",
};

/** Stage-label tone - emphasises the CURRENT stage so the row reads as
 *  "what's happening now", and dims stages not yet reached. */
const LABEL_TONE: Record<StageState, string> = {
  completed: "text-[var(--text-muted)]",
  current:   "text-[var(--primary)] font-semibold",
  pending:   "text-[var(--text-subtle)]",
  failed:    "text-[var(--danger)] font-semibold",
};

const HISTORY_PILL_TONE: Record<IngestStageTransition["stage"], string> = {
  queued:    "bg-[var(--surface-2)] text-[var(--text-muted)]",
  cloning:   "bg-[var(--primary-soft)] text-[var(--primary)]",
  parsing:   "bg-[var(--primary-soft)] text-[var(--primary)]",
  embedding: "bg-[var(--primary-soft)] text-[var(--primary)]",
  indexing:  "bg-[var(--primary-soft)] text-[var(--primary)]",
  completed: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  degraded:  "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  failed:    "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  cancelled: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  paused:    "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

// Headline for the live sharded-ingest panel - what the parallel fan-out is
// doing right now, in plain words.
const PHASE_LABEL: Record<ShardSummary["phase"], string> = {
  scanning: "Scanning files",
  enriching: "Enriching knowledge",
  finalizing: "Finalizing",
};

/** One wave's row in the live sharded-ingest breakdown: a label, the coarse
 *  shard count (always moving), the finer file/node count, and a thin bar. A
 *  paused shard (a file the LLM couldn't enrich) tints the row warning. */
function ShardWaveRow({ wave }: { wave: ShardWave }) {
  const complete = wave.shards_total > 0 && wave.shards_done >= wave.shards_total && wave.shards_failed === 0;
  const pct = wave.units_total > 0 ? Math.min(100, Math.round((wave.units_done / wave.units_total) * 100)) : complete ? 100 : 0;
  const barTone = wave.shards_failed > 0 ? "bg-[var(--warning)]" : complete ? "bg-[var(--success)]" : "bg-[var(--primary)]";
  return (
    <Stack gap="1" data-testid="ingest-shard-wave" data-wave={wave.wave}>
      <Cluster gap="2" align="center" justify="between" className="text-[11px]">
        <span className={cn("font-medium", complete ? "text-[var(--text-muted)]" : "text-[var(--text)]")}>{wave.label}</span>
        <span className="tabular-nums text-[var(--text-subtle)]">
          {wave.shards_done}/{wave.shards_total} shards
          {wave.units_total > 0 ? ` · ${wave.units_done.toLocaleString()}/${wave.units_total.toLocaleString()}` : ""}
          {wave.shards_failed > 0 ? ` · ${wave.shards_failed} paused` : ""}
        </span>
      </Cluster>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div className={cn("h-full rounded-full transition-[width] duration-500", barTone)} style={{ width: `${pct}%` }} />
      </div>
    </Stack>
  );
}

/** Live wave-by-wave breakdown of a heavy-repo (sharded) ingest. Replaces the
 *  otherwise-frozen single progress row's "what's happening now" - the
 *  coordinator returns immediately, so without the ledger the FE would show a
 *  stuck pill for the whole run. */
function ShardBreakdown({ shards }: { shards: ShardSummary }) {
  return (
    <div
      className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2"
      data-testid="ingest-shards"
      role="status"
    >
      <Stack gap="2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Parallel ingest · {PHASE_LABEL[shards.phase]}
        </span>
        {shards.waves.map((w) => (
          <ShardWaveRow key={w.wave} wave={w} />
        ))}
      </Stack>
    </div>
  );
}

interface IngestTimelineProps {
  progress: RepoIngestProgress | null;
  canManage?: boolean;
  onRetrySync?: () => void;
  className?: string;
}

export function IngestTimeline({ progress, canManage = false, onRetrySync, className }: IngestTimelineProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!progress) {
    return (
      <div role="status" aria-label="Never synced"
        className={cn("rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-4 text-center", className)}>
        <p className="text-sm text-[var(--text-muted)]">Never synced.</p>
        <p className="text-xs text-[var(--text-subtle)]">Run a sync to populate the knowledge graph for this repo.</p>
      </div>
    );
  }

  const { current, history } = progress;
  const { steps, failedStage } = buildStepStates(current);
  const isFailed = current.stage === "failed" || current.stage === "cancelled";
  const stageIdx = TIMELINE_STAGES.indexOf(current.stage as TimelineStage);
  const total = current.files_total ?? progress.files_total ?? 0;
  const processed = current.files_processed ?? progress.files_processed ?? 0;
  const path = current.last_processed_path ?? progress.last_processed_path ?? null;
  const inFlight = !isFailed && current.stage !== "completed"
    && current.stage !== "degraded" && current.stage !== "paused";
  const heartbeatAge = progress.heartbeat_age_ms ?? null;
  const stalled = inFlight && heartbeatAge != null && heartbeatAge > STALL_AFTER_MS;

  return (
    <div
      className={cn("rounded-md border border-[var(--border)] bg-[var(--surface)] p-3", className)}
      data-testid="ingest-timeline"
      role="region"
      aria-label="Ingest progress timeline"
    >
      <Stack gap="2">
        {!isFailed && stageIdx >= 0 && current.stage !== "completed" && (
          <Cluster gap="2" align="center" justify="between" className="text-xs">
            <span className="truncate text-[var(--text-muted)]" title={current.phase_detail ?? path ?? undefined} data-testid="ingest-narration">
              {STAGE_NARRATION[current.stage as TimelineStage] ?? current.stage}
              {/* The `indexing` finalize tail has no file counter and can run
                  minutes; show the live sub-phase label so it never looks
                  frozen. Falls back to the embedding file path. */}
              {current.phase_detail
                ? ` - ${current.phase_detail}`
                : current.stage === "embedding" && path
                  ? ` - ${truncateMiddle(path)}`
                  : ""}
            </span>
            {total > 0 && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
                {processed.toLocaleString()}/{total.toLocaleString()}
              </span>
            )}
          </Cluster>
        )}

        {/* Stepper - each stage label sits directly under its node (absolute, so
            the dots stay evenly spaced); end labels anchor to their edge so they
            don't overflow, and the current label is emphasised. */}
        <ol
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={TIMELINE_STAGES.length}
          aria-valuenow={Math.max(0, stageIdx)}
          aria-label="Ingest stage pipeline"
          className="flex items-start pb-5"
        >
          {steps.map((s, i) => (
            <li key={s.stage} className={cn("flex items-center", i < steps.length - 1 ? "flex-1" : "flex-none")}>
              <div className="relative shrink-0">
                <div tabIndex={0} aria-label={`${STAGE_NARRATION[s.stage]} - ${s.state}`}
                  title={`${STAGE_NARRATION[s.stage]} · ${s.state}`} data-stage={s.stage} data-state={s.state}
                  className={cn("flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-colors duration-200", NODE_TONE[s.state])}>
                  {i + 1}
                </div>
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute top-7 whitespace-nowrap text-[10px] uppercase tracking-wider transition-colors duration-200",
                    i === 0 ? "left-0" : i === steps.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                    LABEL_TONE[s.state],
                  )}
                >
                  {STAGE_LABEL[s.stage]}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div aria-hidden className={cn("h-0.5 flex-1 transition-colors duration-200", CONNECTOR_TONE[s.state])} />
              )}
            </li>
          ))}
        </ol>

        {/* Live sharded-ingest detail - the single stepper above can't show the
            parallel fan-out, so a heavy-repo run surfaces its real wave/shard
            progress here instead of a frozen pill. */}
        {progress.shards?.active && !isFailed && <ShardBreakdown shards={progress.shards} />}

        {/* Honest stall state: the backend heartbeats every minute while the
            worker is alive, so prolonged silence on an in-flight stage means
            the sync is actually stuck (dead worker), not just slow. */}
        {stalled && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-2 py-2"
            data-testid="ingest-timeline-stalled"
          >
            <AlertTriangle className="size-3.5 shrink-0 text-[var(--warning-ink)]" aria-hidden />
            <p className="text-[11px] text-[var(--warning-ink)]">
              No signal from the sync worker for {formatDuration(heartbeatAge)}.
              The sync may have stalled; it will be marked failed automatically
              if the worker doesn&apos;t recover.
            </p>
          </div>
        )}

        {isFailed && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-2"
            data-testid="ingest-timeline-failed"
          >
            <AlertTriangle className="size-3.5 shrink-0 text-[var(--danger-ink)]" aria-hidden />
            <Stack gap="1" className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--danger-ink)]">
                {current.stage === "cancelled" ? "Sync cancelled" : "Sync failed"}
                {failedStage ? ` (during ${STAGE_LABEL[failedStage]})` : ""}
              </p>
              {current.error && (
                <p className="line-clamp-3 break-all text-[11px] text-[var(--text-muted)]">{current.error}</p>
              )}
              {canManage && onRetrySync && (
                <div>
                  <Button size="sm" variant="outline" onClick={onRetrySync}>
                    <RotateCw className="size-3" aria-hidden />Retry sync
                  </Button>
                </div>
              )}
            </Stack>
          </div>
        )}

        <Cluster gap="2" align="center" justify="between">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            aria-controls="ingest-timeline-history"
            className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {historyOpen ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
            {historyOpen ? "Hide history" : "View history"}
            <span className="tabular-nums text-[var(--text-subtle)]">({history.length})</span>
          </button>
          {(current.attempt_duration_ms ?? current.duration_ms) != null && (
            <span
              className="text-[10px] tabular-nums text-[var(--text-subtle)]"
              title={totalRetryTitle(current.attempt_duration_ms ?? current.duration_ms, current.duration_ms)}
            >
              {current.stage === "completed" || isFailed ? "ran for" : "running for"} {formatDuration(current.attempt_duration_ms ?? current.duration_ms)}
            </span>
          )}
        </Cluster>

        {historyOpen && (
          <ul id="ingest-timeline-history" className="flex flex-col gap-1 border-t border-[var(--border)] pt-2">
            {history.length === 0 && <li className="text-xs text-[var(--text-muted)]">No prior attempts yet.</li>}
            {history.map((t, idx) => {
              // Each attempt is a DISTINCT sha - label the row with its OWN sha
              // (older clients fall back to the envelope's latest sha).
              const sha = t.branch_sha ?? progress.branch_sha;
              return (
              <li key={`${t.entered_at}-${idx}`} data-testid="ingest-timeline-history-row"
                className="flex flex-col gap-1 rounded border border-[var(--border)] px-2 py-1.5 text-[11px]">
                <Cluster gap="2" align="center">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", HISTORY_PILL_TONE[t.stage])}>{t.stage}</span>
                  <code className="font-mono text-[10px] text-[var(--text-subtle)]" title={sha}>{sha.slice(0, 7)}</code>
                  <span className="tabular-nums text-[var(--text-muted)]">{formatRelativeTime(t.entered_at)}</span>
                  <span
                    className="ml-auto tabular-nums text-[var(--text-subtle)]"
                    title={totalRetryTitle(t.attempt_duration_ms ?? t.duration_ms, t.duration_ms)}
                  >{formatDuration(t.attempt_duration_ms ?? t.duration_ms)}</span>
                </Cluster>
                {/* The server-built recap of what happened (files indexed /
                    skipped / degraded, or the failure reason) - so history is a
                    summary, not just the terminal stage word. Falls back to the
                    raw error for pre-rollout responses without a summary. */}
                {(t.summary || t.error) && (
                  <span
                    className={cn("truncate", t.stage === "failed" || t.stage === "cancelled" ? "text-[var(--danger)]" : "text-[var(--text-muted)]")}
                    title={t.summary || t.error || undefined}
                  >{t.summary || t.error}</span>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </Stack>
    </div>
  );
}
