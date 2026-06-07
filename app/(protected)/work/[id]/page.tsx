"use client";

/**
 * /work/[id] — the task cockpit.
 *
 * The transparency surface for the recursive-Task workflow: the full record of
 * what Athena is doing on one task, with every step, decision, and artifact
 * reachable (no black box). Layout mirrors the v4 mock
 * (prototypes/product-work-v4.html):
 *
 *   Header — title / type / status (TaskStatusPill) + cost (spent/budget) + a
 *            back link to /work.
 *   Left (2fr)  — StageRail (full width) → selected stage's ArtifactCard +
 *                 StageActions → StageWorklog (foldable SSE work log).
 *   Right (1fr, sticky) — DecisionSidebar (thread / input log) + a related-
 *                         artifacts / subtasks card.
 *
 * Live updates ride the task SSE stream (`useTaskStream`); each typed signal
 * (phase_step / artifact_ready / thread_entry / gate_pending) triggers a
 * targeted re-fetch of just that slice. Loading is skeleton-shaped, not a
 * spinner (UX standard).
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GitBranch, Layers } from "lucide-react";

import type { RelatedArtifact, TaskStage } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { StageRail } from "@/components/work/stage-rail";
import { StageWorklog } from "@/components/work/stage-worklog";
import { StageActions } from "@/components/work/stage-actions";
import { ArtifactCard } from "@/components/work/artifact-card";
import { DecisionSidebar } from "@/components/work/decision-sidebar";
import {
  useLedger,
  useRelatedArtifacts,
  useStages,
  useTask,
  useThread,
} from "@/hooks/use-work";
import { useTaskStream, type StageStatus } from "@/features/work/use-task-stream";
import { formatRelativeTime, formatUsd } from "@/lib/utils/format";

export default function TaskCockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const task = useTask(id);
  const stages = useStages(id);
  const thread = useThread(id);
  const related = useRelatedArtifacts(id);

  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  // Select the first non-approved stage by default (where the work is); fall
  // back to the first stage. Runs once stages are loaded.
  useEffect(() => {
    if (selectedStage || stages.data.length === 0) return;
    const next = stages.data.find((s) => s.status !== "approved") ?? stages.data[0];
    if (next) setSelectedStage(next.stage_key);
  }, [stages.data, selectedStage]);

  // Live stream — drives the header status + per-stage FSM + re-fetch signals.
  const stream = useTaskStream(id, task.data?.stream_url ?? "", task.data?.status ?? "todo");

  // Merge live `phase_step` updates over the fetched stages so the rail
  // advances without a reload.
  const mergedStages: TaskStage[] = useMemo(
    () =>
      stages.data.map((s) => {
        const live = stream.stageUpdates[s.stage_key] as StageStatus | undefined;
        return live ? { ...s, status: live } : s;
      }),
    [stages.data, stream.stageUpdates],
  );

  const selected = mergedStages.find((s) => s.stage_key === selectedStage) ?? null;

  // Targeted re-fetches keyed off the stream signals.
  const ledger = useLedger(id, selectedStage ?? undefined);
  useEffect(() => {
    if (stream.threadSignal) void thread.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.threadSignal?.seq]);
  useEffect(() => {
    if (stream.latestArtifact) {
      void stages.refresh();
      void ledger.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.latestArtifact?.seq]);
  useEffect(() => {
    // A phase_step or a pending gate means the rail FSM changed — re-fetch the
    // authoritative stages so the artifact id / gate id are fresh.
    void stages.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.gatePending?.seq]);

  // AI-unavailable surfacing — an error event whose code marks the LLM offline.
  const aiUnavailable =
    stream.error?.code === "ai_unavailable" &&
    (!stream.error.stage || stream.error.stage === selectedStage);

  // Downstream count for the "editing re-derives N stages" confirm — the
  // approved stages after the selected one in registry order.
  const downstreamCount = useMemo(() => {
    if (!selected) return 0;
    return mergedStages.filter((s) => s.ordinal > selected.ordinal).length;
  }, [mergedStages, selected]);

  if (task.error) {
    return (
      <div className="p-6">
        <Stack gap="4">
          <BackLink />
          <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
            <p className="text-sm text-[var(--danger-ink)]">{task.error}</p>
          </Card>
        </Stack>
      </div>
    );
  }

  if (task.isLoading || !task.data) {
    return <CockpitSkeleton />;
  }

  const t = task.data;
  const typeMeta = TASK_TYPE_META[t.type];

  const refreshStageSlices = async () => {
    await Promise.all([stages.refresh(), ledger.refresh(), task.refresh()]);
  };

  return (
    <div className="p-6">
      <Stack gap="0">
        <Cluster gap="2" align="center" className="mb-3">
          <BackLink />
        </Cluster>

        {/* === Task header === */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <Stack gap="2" className="min-w-0 flex-1">
              <Cluster gap="2" align="center" className="flex-wrap">
                <span className="pill">
                  <typeMeta.Icon className="size-3" aria-hidden />
                  {typeMeta.label}
                </span>
                <TaskStatusPill status={stream.taskStatus} />
                <span className="text-xs text-[var(--text-muted)]">
                  opened {formatRelativeTime(t.created_at)}
                </span>
              </Cluster>
              <h1 className="text-[22px] font-bold leading-tight tracking-tight">{t.title}</h1>
              {t.body && (
                <p className="max-w-[760px] text-sm text-[var(--text-muted)]">{t.body}</p>
              )}
            </Stack>
            <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
              <CostBlock spent={t.spent_usd} budget={t.budget_usd} />
            </div>
          </div>

          {/* === Stage rail === */}
          {stages.isLoading && mergedStages.length === 0 ? (
            <div className="phase-rail mt-5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-md bg-[var(--surface-2)]" />
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <StageRail
                stages={mergedStages}
                selectedStage={selectedStage}
                onSelect={setSelectedStage}
              />
            </div>
          )}
        </div>

        {/* === 2-col cockpit body === */}
        <div className="mt-4 grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <Stack gap="4">
            {selected ? (
              <>
                {selected.artifact_id ? (
                  <ArtifactCard
                    taskId={id}
                    artifactId={selected.artifact_id}
                    artifactKind={selected.artifact_kind}
                    stageTitle={selected.title}
                    refreshKey={stream.latestArtifact?.seq}
                  />
                ) : (
                  <Card variant="elevated">
                    <p className="text-sm text-[var(--text-muted)]">
                      No artifact yet for <span className="font-medium text-[var(--text)]">{selected.title}</span>.
                      Run it with Athena or author it yourself below.
                    </p>
                  </Card>
                )}

                <StageActions
                  taskId={id}
                  stage={selected}
                  downstreamCount={downstreamCount}
                  aiUnavailable={aiUnavailable}
                  {...(stream.error?.message ? { aiUnavailableMessage: stream.error.message } : {})}
                  onChanged={refreshStageSlices}
                />

                <StageWorklog
                  stageTitle={selected.title}
                  ledger={ledger.data}
                  ledgerLoading={ledger.isLoading}
                  events={stream.events}
                  stageKey={selected.stage_key}
                  status={stream.status}
                />
              </>
            ) : (
              <Card>
                <p className="text-sm text-[var(--text-muted)]">
                  This task has no stages yet.
                </p>
              </Card>
            )}
          </Stack>

          <Stack gap="4" className="lg:sticky lg:top-[78px] lg:self-start">
            <DecisionSidebar
              taskId={id}
              entries={thread.data}
              isLoading={thread.isLoading}
              onChanged={thread.refresh}
            />
            <RelatedCard
              related={related.data}
              childIds={t.child_ids}
              isLoading={related.isLoading}
            />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/work"
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to work
    </Link>
  );
}

function CostBlock({ spent, budget }: { spent: number; budget: number | null }) {
  return (
    <Cluster gap="2" align="center" className="lg:justify-end">
      <span className="text-xs text-[var(--text-muted)]">Cost so far</span>
      <span className="pill">
        {formatUsd(spent)}
        {budget !== null && (
          <span className="text-[var(--text-subtle)]"> / {formatUsd(budget)}</span>
        )}
      </span>
    </Cluster>
  );
}

/** Related artifacts (parent / sibling / dependency) + subtask pointers. */
function RelatedCard({
  related,
  childIds,
  isLoading,
}: {
  related: RelatedArtifact[];
  childIds: string[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Layers className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-semibold">Related &amp; subtasks</span>
        </Cluster>

        <Stack gap="1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Subtasks
          </span>
          {childIds.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              None yet — a subtask is just a Task with a parent. Athena proposes them as the work
              reveals them.
            </p>
          ) : (
            <Stack gap="1.5" as="ul">
              {childIds.map((cid) => (
                <li key={cid}>
                  <Link
                    href={`/work/${cid}`}
                    className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-sm transition-colors hover:border-[var(--border-strong)]"
                  >
                    <GitBranch className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                    <span className="truncate font-mono text-xs text-[var(--text-muted)]">{cid}</span>
                  </Link>
                </li>
              ))}
            </Stack>
          )}
        </Stack>

        <Stack gap="1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Related artifacts
          </span>
          {isLoading ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-[var(--surface-2)]" />
              ))}
            </div>
          ) : related.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Nothing linked from parent, sibling, or dependency tasks.
            </p>
          ) : (
            <Stack gap="1.5" as="ul">
              {related.map((r) => (
                <li
                  key={r.artifact_id}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5"
                >
                  <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    {r.relation}
                  </span>
                  <Link
                    href={`/work/${r.task_id}`}
                    className="min-w-0 flex-1 truncate text-sm text-[var(--text)] hover:underline"
                  >
                    {r.title || r.kind.replace(/_/g, " ")}
                  </Link>
                </li>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

/** Content-shaped skeleton (page-level loading uses skeletons, not spinners). */
function CockpitSkeleton() {
  return (
    <div className="p-6">
      <Stack gap="0">
        <div className="mb-3 h-7 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
          <Stack gap="3">
            <div className="h-5 w-40 animate-pulse rounded bg-[var(--surface-2)]" />
            <div className="h-7 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--surface-2)]" />
          </Stack>
          <div className="phase-rail mt-5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-md bg-[var(--surface-2)]" />
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <Stack gap="4">
            <div className="h-64 animate-pulse rounded-lg bg-[var(--surface-2)]" />
            <div className="h-32 animate-pulse rounded-lg bg-[var(--surface-2)]" />
          </Stack>
          <Stack gap="4">
            <div className="h-80 animate-pulse rounded-lg bg-[var(--surface-2)]" />
            <div className="h-40 animate-pulse rounded-lg bg-[var(--surface-2)]" />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}
