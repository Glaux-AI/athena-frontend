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
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Layers,
  MoreHorizontal,
  Trash2,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type RelatedArtifact,
  type TaskCancelReason,
  type TaskChild,
  type TaskStage,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/overlay";
import { Cluster, Stack } from "@/components/layout/primitives";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { cn } from "@/lib/cn";
import { STAGE_PANEL_ID, StageRail, stageTabId } from "@/components/work/stage-rail";
import { StageWorklog } from "@/components/work/stage-worklog";
import { StageActions } from "@/components/work/stage-actions";
import { ArtifactCard } from "@/components/work/artifact-card";
import { DecisionSidebar } from "@/components/work/decision-sidebar";
import {
  useChildren,
  useLedger,
  useRelatedArtifacts,
  useStages,
  useTask,
  useThread,
} from "@/hooks/use-work";
import { useTaskStream, type StageStatus } from "@/features/work/use-task-stream";
import { useMembers } from "@/hooks/use-members";
import { useSession } from "@/lib/session/SessionProvider";
import { TaskOwnerControl } from "@/components/work/task-owner-control";
import { formatRelativeTime, formatUsd } from "@/lib/utils/format";

export default function TaskCockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const task = useTask(id);
  const stages = useStages(id);
  const thread = useThread(id);
  const related = useRelatedArtifacts(id);
  const children = useChildren(id);
  const { me } = useSession();
  const { members, byId: memberById } = useMembers();

  const router = useRouter();
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Stage key the user just told to run — an optimistic "running" until the
  // worker claims it (a beat later) and SSE reconciles. Cleared on the next
  // authoritative stage transition so a fail-safe-to-ready never sticks.
  const [optimisticRun, setOptimisticRun] = useState<string | null>(null);

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
  // advances without a reload. SSE is authoritative; the optimistic "running"
  // only fills the gap before the worker's first event lands (and only while
  // the fetched status is still a runnable one).
  const mergedStages: TaskStage[] = useMemo(
    () =>
      stages.data.map((s) => {
        const live = stream.stageUpdates[s.stage_key] as StageStatus | undefined;
        if (live) return { ...s, status: live };
        if (
          optimisticRun === s.stage_key &&
          (s.status === "ready" || s.status === "failed" || s.status === "rejected")
        ) {
          return { ...s, status: "running" };
        }
        return s;
      }),
    [stages.data, stream.stageUpdates, optimisticRun],
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
  useEffect(() => {
    // Every stage transition reconciles the rail against the DB (so a Stop, a
    // failure, or a settle is never stuck stale) AND re-fetches the task so the
    // header pill, spend, and child_ids (a decompose's new subtasks) stay live.
    if (!stream.stageSignal) return;
    setOptimisticRun(null);
    void stages.refresh();
    void task.refresh();
    void children.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.stageSignal?.seq]);

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

  const mutateTask = async (
    fn: () => Promise<unknown>,
    ok: string,
    thenBack = false,
  ) => {
    setTaskBusy(true);
    try {
      await fn();
      toast.success(ok);
      if (thenBack) router.push("/work");
      else await task.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work — try again.");
    } finally {
      setTaskBusy(false);
    }
  };

  // ai_unavailable is rendered inline in StageActions; surface every OTHER
  // stream error (and a lost connection) as a page banner so a failing/stalled
  // run is never silent.
  const streamErrored = Boolean(stream.error && stream.error.code !== "ai_unavailable");
  const streamDisconnected = stream.status === "error";
  const overBudget = t.budget_usd !== null && t.spent_usd >= t.budget_usd;
  const nearBudget =
    !overBudget && t.budget_usd !== null && t.spent_usd >= t.budget_usd * 0.8;

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
              <div className="mt-1">
                <TaskOwnerControl
                  taskId={id}
                  ownerUserId={t.owner_user_id}
                  assignee={t.assignee}
                  members={members}
                  byId={memberById}
                  meId={me?.id ?? null}
                  onChanged={() => task.refresh()}
                />
              </div>
            </Stack>
            <div className="flex shrink-0 items-start gap-2 lg:flex-col lg:items-end">
              <CostBlock
                spent={t.spent_usd}
                budget={t.budget_usd}
                near={nearBudget}
                over={overBudget}
              />
              <TaskActionsMenu
                status={t.status}
                busy={taskBusy}
                onMarkDone={() =>
                  void mutateTask(
                    () => api.tasks.patch(id, { status: "done" }),
                    "Marked done.",
                  )
                }
                onArchive={(reason) =>
                  void mutateTask(
                    () => api.tasks.cancel(id, reason),
                    "Removed from the board — find it under Removed.",
                  )
                }
                onRestore={() =>
                  void mutateTask(
                    () => api.tasks.patch(id, { status: "backlog" }),
                    "Restored to the board.",
                  )
                }
                onDelete={() => setConfirmDelete(true)}
              />
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

        {/* Run-health banners — a failing run or a dropped live connection is
            never silent (ai_unavailable is handled inline in StageActions). */}
        {(streamErrored || streamDisconnected) && (
          <div className="mt-4">
            {streamErrored && stream.error && (
              <Banner tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}>
                {stream.error.message || "The last run hit an error. Re-run it, or do the step by hand."}
              </Banner>
            )}
            {streamDisconnected && (
              <Banner tone="warning" icon={<WifiOff className="size-4" aria-hidden />}>
                Live updates dropped — reconnecting. Refresh if it doesn&apos;t resume.
              </Banner>
            )}
          </div>
        )}

        {/* === 2-col cockpit body === */}
        <div className="mt-4 grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <div
            role="tabpanel"
            id={STAGE_PANEL_ID}
            {...(selected ? { "aria-labelledby": stageTabId(selected.stage_key) } : {})}
          >
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
                  onStarted={() => setOptimisticRun(selected.stage_key)}
                />

                <StageWorklog
                  stageTitle={selected.title}
                  ledger={ledger.data}
                  ledgerLoading={ledger.isLoading}
                  events={stream.events}
                  stageKey={selected.stage_key}
                  status={stream.status}
                  isRunning={selected.status === "running"}
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
          </div>

          <Stack gap="4" className="lg:sticky lg:top-[78px] lg:self-start">
            <DecisionSidebar
              taskId={id}
              entries={thread.data}
              isLoading={thread.isLoading}
              onChanged={thread.refresh}
            />
            <RelatedCard
              related={related.data}
              childTasks={children.data}
              childrenLoading={children.isLoading}
              isLoading={related.isLoading}
            />
          </Stack>
        </div>
      </Stack>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this task?"
        description="This permanently removes the task and its history. To just take it off the board, use “Not needed” or “Obsolete” instead."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={taskBusy}
              onClick={() => {
                setConfirmDelete(false);
                void mutateTask(() => api.tasks.delete(id), "Task deleted.", true);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text)]">{t.title}</p>
      </Modal>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "danger" | "warning";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
        tone === "danger"
          ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
          : "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

/** Per-task overflow menu in the cockpit header — the task-level twin of the
 *  board card menu (remove / restore / delete the whole task). */
function TaskActionsMenu({
  status,
  busy,
  onMarkDone,
  onArchive,
  onRestore,
  onDelete,
}: {
  status: string;
  busy: boolean;
  onMarkDone: () => void;
  onArchive: (reason: TaskCancelReason) => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isCancelled = status === "cancelled";
  const isDone = status === "done";
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Task actions"
          disabled={busy}
          className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="glass animate-modal-in z-50 w-52 rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none"
        >
          {!isCancelled && !isDone && (
            <MenuRow onClick={() => run(onMarkDone)}>
              <CheckCircle2 className="size-3.5 text-[var(--success-ink)]" aria-hidden />
              Mark task done
            </MenuRow>
          )}
          {!isCancelled && (
            <>
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Remove from board
              </p>
              <MenuRow onClick={() => run(() => onArchive("not_needed"))}>
                <XCircle className="size-3.5" aria-hidden />
                Not needed
              </MenuRow>
              <MenuRow onClick={() => run(() => onArchive("obsolete"))}>
                <XCircle className="size-3.5" aria-hidden />
                Obsolete
              </MenuRow>
            </>
          )}
          {isCancelled && (
            <MenuRow onClick={() => run(onRestore)}>
              <ArrowLeft className="size-3.5" aria-hidden />
              Restore to board
            </MenuRow>
          )}
          <div className="my-1 h-px bg-[var(--border)]" />
          <MenuRow onClick={() => run(onDelete)} danger>
            <Trash2 className="size-3.5" aria-hidden />
            Delete task
          </MenuRow>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MenuRow({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        danger
          ? "text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
          : "text-[var(--text)] hover:bg-[var(--surface-2)]",
      )}
    >
      {children}
    </button>
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

function CostBlock({
  spent,
  budget,
  near = false,
  over = false,
}: {
  spent: number;
  budget: number | null;
  near?: boolean;
  over?: boolean;
}) {
  return (
    <Cluster gap="2" align="center" className="lg:justify-end">
      <span className="text-xs text-[var(--text-muted)]">Cost so far</span>
      <span
        className={cn(
          "pill inline-flex items-center gap-1",
          over && "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
          near && "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
        )}
        title={
          over
            ? "Over budget"
            : near
              ? "Approaching budget"
              : undefined
        }
      >
        {(over || near) && (
          <>
            <AlertTriangle className="size-3" aria-hidden />
            <span className="sr-only">{over ? "Over budget:" : "Approaching budget:"}</span>
          </>
        )}
        {formatUsd(spent)}
        {budget !== null && (
          <span className={cn(!over && !near && "text-[var(--text-subtle)]")}>
            {" "}
            / {formatUsd(budget)}
          </span>
        )}
      </span>
    </Cluster>
  );
}

/** Related artifacts (parent / sibling / dependency) + subtask summaries. */
function RelatedCard({
  related,
  childTasks,
  childrenLoading,
  isLoading,
}: {
  related: RelatedArtifact[];
  childTasks: TaskChild[];
  childrenLoading: boolean;
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
          {childrenLoading && childTasks.length === 0 ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-[var(--surface-2)]" />
              ))}
            </div>
          ) : childTasks.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              None yet — a subtask is just a Task with a parent. Athena proposes them as the work
              reveals them.
            </p>
          ) : (
            <Stack gap="1.5" as="ul">
              {childTasks.map((child) => {
                const ChildIcon = TASK_TYPE_META[child.type].Icon;
                return (
                  <li key={child.id}>
                    <Link
                      href={`/work/${child.id}`}
                      className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-sm transition-colors hover:border-[var(--border-strong)]"
                    >
                      <ChildIcon className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[var(--text)]">{child.title}</span>
                      <TaskStatusPill status={child.status} />
                    </Link>
                  </li>
                );
              })}
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
