"use client";

/**
 * /work/[id] - the task detail page (Work OS rehaul W8): a task page first,
 * with the AI cockpit inside when the type has a stage rail.
 *
 *   Header - back link, id chip, type, status pill, watch + overflow. Facts
 *            (owner / priority / due / team / …) live in the right rail's
 *            <TaskProperties>, not the header.
 *   Main (2fr)  - Description card → [railed only: the chat-like stage flow:
 *                 StageWorklog (Athena's work, streams while running) →
 *                 StageArtifacts (the deliverable, inline Edit) →
 *                 StageComposer (runs / steers / approves in one place)] →
 *                 ActivityThread (comments + decisions + the comment composer).
 *   Right (1fr, sticky) - TaskProperties → Subtasks (railed; a plain task's
 *                 subtasks sit in the main column) → SuggestedNext → Related.
 *
 * A plain `task` (type === "task") has NO rail: no stage chrome, no run /
 * auto-approve affordances - the page reads Description → Subtasks →
 * Activity, like a normal work item.
 *
 * Live updates ride the task SSE stream (`useTaskStream`); each typed signal
 * (phase_step / artifact_ready / thread_entry / gate_pending) triggers a
 * targeted re-fetch of just that slice. Loading is skeleton-shaped, not a
 * spinner (UX standard).
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUrlParam } from "@/hooks/use-url-state";
import * as Popover from "@radix-ui/react-popover";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CornerLeftUp,
  Layers,
  MoreHorizontal,
  Pencil,
  Save,
  Trash2,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type RelatedArtifact,
  type StageRefineInput,
  type SubtaskNode,
  type TaskCancelReason,
  type TaskStage,
  type TaskUsage,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Pill } from "@/components/ui/pill";
import { focusRing } from "@/components/ui/focus";
import { Cluster, Stack } from "@/components/layout/primitives";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { groupRelatedByTask } from "@/lib/work/related-grouping";
import { lastRequestedChange } from "@/lib/work/last-requested-change";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { cn } from "@/lib/cn";
import { STAGE_PANEL_ID, StageRail, stageTabId } from "@/components/work/stage-rail";
import { StageWorklog } from "@/components/work/stage-worklog";
import { StageComposer } from "@/components/work/stage-composer";
import { StageArtifacts } from "@/components/work/stage-artifacts";
import { ArtifactMarkdown } from "@/components/work/artifact-markdown";
import { ActivityThread } from "@/components/work/decision-sidebar";
import { SubtaskPanel } from "@/components/work/subtask-panel";
import { SuggestedNext } from "@/components/work/suggested-next";
import { LocalRunLauncher } from "@/components/desktop/local-run-launcher";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { WatchToggle } from "@/components/work/watch-toggle";
import { AutoApproveToggle } from "@/components/work/auto-approve-toggle";
import { TaskProperties, isRailedTask } from "@/components/work/task-properties";
import {
  useLedger,
  useRelatedArtifacts,
  useStages,
  useSubtree,
  useSuggestions,
  useTask,
  useTaskUsage,
  useThread,
} from "@/hooks/use-work";
import { useTaskStream, type StageStatus } from "@/features/work/use-task-stream";
import { useTaskMascot } from "@/features/mascot/use-mascot-activity";
import { useMembers } from "@/hooks/use-members";
import { useDomains } from "@/hooks/use-domains";
import { useSession } from "@/lib/session/SessionProvider";
import {
  formatTokens,
  formatUsd,
  formatUsdPrecise,
} from "@/lib/utils/format";
import { headlineTokens, usageExactness } from "@/lib/work/usage-display";

export default function TaskCockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const task = useTask(id);
  const usage = useTaskUsage(id);
  const stages = useStages(id);
  const thread = useThread(id);
  const related = useRelatedArtifacts(id);
  const subtree = useSubtree(id);
  const suggestions = useSuggestions(id);
  const { me } = useSession();
  const { members, byId: memberById, isLoading: membersLoading } = useMembers();
  const { byId: domainById } = useDomains();
  // Child→parent breadcrumb: the parent task's title (soft-fail - while loading
  // or when the parent is unreadable the crumb shows a generic "parent task").
  const parentTitle = useParentTitle(task.data?.parent_id ?? null);
  // A decomposed task isn't truly finished until its subtasks are - gates the
  // "Suggested next" follow-ups so they never surface mid-breakdown.
  const hasOpenSubtasks = subtree.data.some(
    (s) => s.status !== "done" && s.status !== "cancelled",
  );

  const router = useRouter();
  // The focused stage lives in the URL (`?stage=<key>`) so the Back button
  // returns to the previously-viewed stage instead of leaving the cockpit.
  const [selectedStage, setSelectedStage] = useUrlParam("stage");
  const [taskBusy, setTaskBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Inline edit of the task's title + description - the Description card flips
  // to a form (also reachable from the header overflow menu).
  const [editingDetails, setEditingDetails] = useState(false);
  // Stage key the user just told to run - an optimistic "running" until the
  // worker claims it (a beat later) and SSE reconciles. Cleared on the next
  // authoritative stage transition so a fail-safe-to-ready never sticks.
  const [optimisticRun, setOptimisticRun] = useState<string | null>(null);
  // Athena's live-work log (StageWorklog). When a run/refine/steer starts we
  // scroll it into view so the user immediately sees the agent status stream
  // in (the composer they clicked from is at the foot of the flow).
  const worklogRef = useRef<HTMLDivElement>(null);
  const scrollToWorklog = useCallback(() => {
    // Defer a frame so the optimistic `running` state has flipped the worklog
    // into its live/expanded form before we scroll to it.
    requestAnimationFrame(() =>
      worklogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);
  // Stages whose LIVE status proved wrong (a gate decision 409'd: the panel
  // showed `in_review` but the DB had moved on - an SSE drift / already-resolved
  // gate). For these we stop trusting `stream.stageUpdates` and fall back to the
  // authoritative fetch (refreshed on every stage signal), so the gate can never
  // get stuck on a phantom "awaiting your review".
  const [staleStages, setStaleStages] = useState<Set<string>>(() => new Set());

  // Select the first non-approved stage by default (where the work is); fall
  // back to the first stage. Runs once stages are loaded.
  useEffect(() => {
    if (stages.data.length === 0) return;
    // Keep the param only if it names a real stage of THIS task. A hand-edited,
    // stale, or cross-task `?stage=` would otherwise resolve to no stage and
    // render the misleading "no stages yet" card; treat it as absent and land
    // on a real stage instead, self-healing the URL.
    const known = selectedStage != null && stages.data.some((s) => s.stage_key === selectedStage);
    if (known) return;
    const next = stages.data.find((s) => s.status !== "approved") ?? stages.data[0];
    // `replace` so the default (or the heal) doesn't add a spurious history
    // entry the user has to Back through to leave the cockpit.
    if (next) setSelectedStage(next.stage_key, { replace: true });
  }, [stages.data, selectedStage, setSelectedStage]);

  // Live stream - drives the header status + per-stage FSM + re-fetch signals.
  const stream = useTaskStream(id, task.data?.stream_url ?? "", task.data?.status ?? "todo");

  // Drive the TopBar Sophia owl from this task's live activity (agent steps →
  // thinking/reading/writing, tools → working, open gate → waiting, terminal →
  // happy/focused). Resets on unmount so the mood doesn't follow you out.
  useTaskMascot(stream);

  // Merge live `phase_step` updates over the fetched stages so the rail
  // advances without a reload. SSE is authoritative; the optimistic "running"
  // only fills the gap before the worker's first event lands (and only while
  // the fetched status is still a runnable one).
  const mergedStages: TaskStage[] = useMemo(
    () =>
      stages.data.map((s) => {
        // A stage whose live status was proven stale (a gate 409) trusts the
        // authoritative fetch instead of the SSE payload, so a phantom
        // "awaiting your review" can never strand the gate buttons.
        const live = staleStages.has(s.stage_key)
          ? undefined
          : (stream.stageUpdates[s.stage_key] as StageStatus | undefined);
        // Live executor attribution rides phase_step too - "Claude Code
        // working" flips on the instant an external MCP agent claims.
        const exec = stream.executorUpdates[s.stage_key];
        const withExec = exec
          ? { ...s, executor_kind: exec.kind, executor_label: exec.label }
          : s;
        if (live) return { ...withExec, status: live };
        if (
          optimisticRun === s.stage_key &&
          (s.status === "ready" || s.status === "failed" || s.status === "rejected")
        ) {
          return { ...withExec, status: "running" };
        }
        return withExec;
      }),
    [stages.data, stream.stageUpdates, stream.executorUpdates, optimisticRun, staleStages],
  );

  // Resolve synchronously, with the same fallback the default-select effect
  // uses, so an absent/stale `?stage=` renders a real stage on the FIRST paint
  // (the effect then rewrites the URL). Without this fallback the cockpit would
  // flash the "no stages yet" empty card for one frame before the effect runs.
  const selected =
    mergedStages.find((s) => s.stage_key === selectedStage) ??
    mergedStages.find((s) => s.status !== "approved") ??
    mergedStages[0] ??
    null;

  // The note from the most recent "request changes" on the selected stage. A
  // gate reject returns the stage to `ready`, so this is what lets StageComposer
  // show the user's own words as a read-only "Changes requested" note. It is NOT
  // re-sent on the next run - the backend already folds it into the brief via the
  // gate-feedback channel; re-sending it as a steer is what used to double-post.
  const priorRequest = useMemo(
    () => lastRequestedChange(thread.data, selected?.stage_key),
    [selected?.stage_key, thread.data],
  );

  // The external coding agent currently driving a stage (if any) - the
  // header chip names it ("Claude Code · working").
  const externalExecutor = useMemo(() => {
    const running = mergedStages.find(
      (s) =>
        s.status === "running" &&
        s.executor_kind === "external" &&
        s.executor_label,
    );
    return running?.executor_label ?? null;
  }, [mergedStages]);

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
      void usage.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.latestArtifact?.seq]);
  useEffect(() => {
    // A pending gate means the rail FSM changed - re-fetch the authoritative
    // stages so the artifact id / gate id are fresh, AND the thread: the gate
    // rides a task_inputs row the main-column Activity feed renders live
    // ("Waiting on your review" must not wait for the next thread_entry).
    void stages.refresh();
    void thread.refresh();
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
    void usage.refresh();
    void subtree.refresh();
    void suggestions.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.stageSignal?.seq]);

  // AI-unavailable surfacing - an error event whose code marks the LLM offline.
  const aiUnavailable =
    stream.error?.code === "ai_unavailable" &&
    (!stream.error.stage || stream.error.stage === selectedStage);

  // Downstream count for the "editing re-derives N stages" confirm - only the
  // stages after the selected one that would actually re-derive (approved or
  // in_review), matching the warning copy.
  const downstreamCount = useMemo(() => {
    if (!selected) return 0;
    return mergedStages.filter(
      (s) =>
        s.ordinal > selected.ordinal &&
        (s.status === "approved" || s.status === "in_review"),
    ).length;
  }, [mergedStages, selected]);

  if (task.error) {
    return (
      <div className="p-6">
        <Stack gap="4">
          <BackLink />
          <div
            role="alert"
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
          >
            {task.error}
          </div>
        </Stack>
      </div>
    );
  }

  if (task.isLoading || !task.data) {
    return <CockpitSkeleton />;
  }

  const t = task.data;
  const typeMeta = TASK_TYPE_META[t.type];
  // The one lens split (W1): a plain `task` has no stage rail - the page shows
  // no run / gate / auto-approve chrome at all.
  const railed = isRailedTask(t.type);

  const refreshStageSlices = async () => {
    await Promise.all([stages.refresh(), ledger.refresh(), task.refresh()]);
  };

  // After a hard-gate approval, keep the reviewer moving instead of parking them
  // on the stage they just signed off: advance the cockpit to the next phase the
  // approval unlocked. When the approved stage was the LAST phase the task is now
  // done (the backend set it `done`), so jump to the next task awaiting this
  // user's sign-off - the "On you" My Work bucket - or My Work itself when that
  // queue is empty.
  const advanceAfterApproval = async () => {
    if (!selected) return;
    const next = mergedStages.find((s) => s.ordinal === selected.ordinal + 1);
    if (next) {
      setSelectedStage(next.stage_key);
      return;
    }
    try {
      const mine = await api.tasks.myWork();
      const nextTask = mine.on_you.find((tk) => tk.id !== id);
      router.push(nextTask ? `/work/${nextTask.id}` : "/my-work");
    } catch {
      router.push("/my-work");
    }
  };

  // DSGN-1 "edit by asking AI": refine the selected design prototype (optionally
  // scoped to a clicked element) at the picked effort/model. Re-runs the design
  // stage; SSE then streams the new version. Re-throws on failure so the
  // prototype editor stays open to retry.
  const refineDesign = async (req: StageRefineInput) => {
    if (!selected) return;
    try {
      await api.tasks.refineStage(id, selected.stage_key, req);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start the refine.");
      throw e;
    }
    toast.success("Athena is refining the design - watch the work log.");
    setOptimisticRun(selected.stage_key);
    scrollToWorklog();
    await refreshStageSlices();
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
      toast.error(e instanceof ApiError ? e.message : "That didn't work - try again.");
    } finally {
      setTaskBusy(false);
    }
  };

  // ai_unavailable is rendered inline in StageComposer; surface every OTHER
  // stream error (and a lost connection) as a page banner so a failing/stalled
  // run is never silent.
  const streamErrored = Boolean(stream.error && stream.error.code !== "ai_unavailable");
  const streamDisconnected = stream.status === "error";
  // spent_usd is null when the caller lacks cost:read - no budget signal then.
  const overBudget =
    t.spent_usd !== null && t.budget_usd !== null && t.spent_usd >= t.budget_usd;
  const nearBudget =
    !overBudget &&
    t.spent_usd !== null &&
    t.budget_usd !== null &&
    t.spent_usd >= t.budget_usd * 0.8;

  // The thread composer's Steer segment only makes sense while Athena can act
  // on it: the task is railed AND (delegated to the driver or a stage is live).
  const canSteer =
    railed &&
    (t.ai_delegated || mergedStages.some((s) => s.status === "running"));

  // Refresh everything a manual subtask / dependency change touches.
  const refreshBreakdown = () => {
    void subtree.refresh();
    void task.refresh();
  };

  const subtasksCard = (
    <SubtasksCard
      taskId={id}
      subtasks={subtree.data}
      loading={subtree.isLoading}
      dependsOn={t.depends_on}
      onChanged={refreshBreakdown}
    />
  );

  return (
    // The shell's main container already pads the page (px-4→8 py-5→8);
    // adding p-6 here double-padded the whole /work family vs its siblings.
    <div>
      <Stack gap="0">
        <Cluster gap="2" align="center" className="mb-2">
          <BackLink />
        </Cluster>

        {/* === Task header - identity + live status; facts live in the rail.
            Kept COMPACT: chips + title only (one L2 starfield moment) - the
            body below is the page, the header is just its nameplate. === */}
        <Card variant="elevated" className="relative overflow-hidden px-5 py-4">
          <div className="starfield opacity-40" aria-hidden="true" />
          <div className="relative flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <Stack gap="2" className="min-w-0 flex-1">
              {t.parent_id && (
                <Link
                  href={`/work/${t.parent_id}`}
                  className="inline-flex w-fit max-w-full items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                >
                  <CornerLeftUp className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">Part of: {parentTitle ?? "parent task"}</span>
                </Link>
              )}
              <Cluster gap="2" align="center" className="flex-wrap">
                <TaskIdChip
                  id={t.display_id}
                  className="text-xs text-[var(--text-muted)]"
                />
                <Pill tone="neutral">
                  <span className="inline-flex items-center gap-1">
                    <typeMeta.Icon className="size-3" aria-hidden />
                    {typeMeta.label}
                  </span>
                </Pill>
                <TaskStatusPill status={stream.taskStatus} />
                {externalExecutor && (
                  <Pill
                    tone="info"
                    size="sm"
                    live
                    data-testid="external-executor-chip"
                    title={`${externalExecutor} is executing a stage of this task over MCP - its progress streams below and lands in the same review gates.`}
                  >
                    {externalExecutor} · working
                  </Pill>
                )}
              </Cluster>
              <h1 className="text-xl font-semibold leading-tight tracking-tight">{t.title}</h1>
            </Stack>
            <div className="flex shrink-0 flex-wrap items-start gap-2 lg:flex-col lg:items-end">
              {railed && (
                <CostBlock
                  spent={t.spent_usd}
                  budget={t.budget_usd}
                  near={nearBudget}
                  over={overBudget}
                  usage={usage.data}
                />
              )}
              <Cluster gap="2" align="center">
                <WatchToggle taskId={id} />
                <TaskActionsMenu
                  status={t.status}
                  busy={taskBusy}
                  onEdit={() => setEditingDetails(true)}
                  onMarkDone={() =>
                    void mutateTask(
                      () => api.tasks.patch(id, { status: "done" }),
                      "Marked done.",
                    )
                  }
                  onArchive={(reason) =>
                    void mutateTask(
                      () => api.tasks.cancel(id, reason),
                      "Removed from the board - find it under Removed.",
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
              </Cluster>
            </div>
          </div>

          {/* === Stage rail (railed tasks only - a plain task has none) === */}
          {railed &&
            (stages.isLoading && mergedStages.length === 0 ? (
              <div className="phase-rail relative mt-4" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-[92px] rounded-md" />
                ))}
              </div>
            ) : (
              <div className="relative mt-4">
                {/* Auto-approve sits with the rail it governs (railed only). */}
                <Cluster justify="end" align="center" className="mb-1.5">
                  <AutoApproveToggle
                    taskId={id}
                    enabled={t.auto_approve}
                    cascadeEnabled={t.auto_approve_descendants}
                    onChanged={() => task.refresh()}
                  />
                </Cluster>
                <StageRail
                  stages={mergedStages}
                  selectedStage={selectedStage}
                  onSelect={(key) => setSelectedStage(key)}
                />
              </div>
            ))}
        </Card>

        {/* Run-health banners - a failing run or a dropped live connection is
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
                Live updates dropped - reconnecting. Refresh if it doesn&apos;t resume.
              </Banner>
            )}
          </div>
        )}

        {/* === 2-col body === */}
        <div className="mt-4 grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          {/* min-w-0 on BOTH columns: a grid item's implicit min-width is
              `auto`, so one long unbroken artifact line would otherwise widen
              the whole layout instead of wrapping/scrolling inside its card. */}
          <div className="min-w-0">
            <Stack gap="4">
              {/* Description - the task's markdown body, inline-editable. */}
              <Card>
                <Stack gap="3">
                  <CardHeader rule className="mb-0">
                    <Cluster justify="between" align="center">
                      <span className="text-sm font-semibold">Description</span>
                      {!editingDetails && (
                        <button
                          type="button"
                          onClick={() => setEditingDetails(true)}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          <Pencil className="size-3" aria-hidden />
                          Edit
                        </button>
                      )}
                    </Cluster>
                  </CardHeader>
                  {editingDetails ? (
                    <TaskDetailsEditor
                      taskId={id}
                      initialTitle={t.title}
                      initialBody={t.body}
                      onCancel={() => setEditingDetails(false)}
                      onSaved={async () => {
                        setEditingDetails(false);
                        await task.refresh();
                      }}
                    />
                  ) : t.body ? (
                    <TaskDescription body={t.body} />
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      No description yet. Add the context, the evidence, and what
                      done looks like.
                    </p>
                  )}
                </Stack>
              </Card>

              {/* The AI panel - unchanged cockpit machinery, railed tasks only. */}
              {railed && (
                <div
                  role="tabpanel"
                  id={STAGE_PANEL_ID}
                  className="min-w-0"
                  {...(selected ? { "aria-labelledby": stageTabId(selected.stage_key) } : {})}
                >
                  {selected ? (
                    <Stack gap="4">
                      {/* Chat-like stage flow: Athena's work rises to the top and
                          streams while it runs, the deliverable settles in below it,
                          and the composer at the foot drives every action (run /
                          steer / approve / request changes) in one place. */}
                      <div ref={worklogRef} className="scroll-mt-4">
                        <StageWorklog
                          stageTitle={selected.title}
                          ledger={ledger.data}
                          ledgerLoading={ledger.isLoading}
                          events={stream.events}
                          stageKey={selected.stage_key}
                          status={stream.status}
                          isRunning={selected.status === "running"}
                          executorLabel={
                            selected.status === "running" &&
                            selected.executor_kind === "external"
                              ? (selected.executor_label ?? null)
                              : null
                          }
                        />
                      </div>

                      <StageArtifacts
                        taskId={id}
                        stage={selected}
                        refreshKey={stream.latestArtifact?.seq}
                        onRefine={refineDesign}
                        downstreamCount={downstreamCount}
                        designTokenSetIds={t.design_token_set_ids}
                        onEdited={refreshStageSlices}
                      />

                      <StageComposer
                        taskId={id}
                        stage={selected}
                        downstreamCount={downstreamCount}
                        aiUnavailable={aiUnavailable}
                        {...(stream.error?.message ? { aiUnavailableMessage: stream.error.message } : {})}
                        onChanged={refreshStageSlices}
                        onApproved={advanceAfterApproval}
                        onStarted={() => {
                          setOptimisticRun(selected.stage_key);
                          scrollToWorklog();
                        }}
                        onStaleGate={(key) => setStaleStages((prev) => new Set(prev).add(key))}
                        priorRequest={priorRequest}
                      />
                    </Stack>
                  ) : (
                    <EmptyState
                      className="py-6"
                      icon={<Layers className="size-5" aria-hidden />}
                      title="No stages yet"
                      description="Stages appear here once this task's flow is set up."
                    />
                  )}
                </div>
              )}

              {/* A plain task's breakdown reads inline, between the description
                  and the discussion - like a normal task page. */}
              {!railed && subtasksCard}

              <ActivityThread
                taskId={id}
                entries={thread.data}
                isLoading={thread.isLoading}
                onChanged={thread.refresh}
                memberById={memberById}
                meId={me?.id ?? null}
                members={members}
                canSteer={canSteer}
              />
            </Stack>
          </div>

          <Stack gap="4" className="min-w-0 lg:sticky lg:top-[78px] lg:self-start">
            {/* Every work-item fact, inline-editable, in one place. */}
            <TaskProperties
              task={t}
              members={members}
              membersLoading={membersLoading}
              memberById={memberById}
              meId={me?.id ?? null}
              domainById={domainById}
              onChanged={() => task.refresh()}
            />
            {/* Desktop-only: run this stage locally with Claude Code (gated
                executor). Renders nothing on the web build; run affordances
                are rail-only. */}
            {railed && (
              <LocalRunLauncher
                taskId={id}
                taskDisplayId={t.display_id}
                stage={selectedStage}
              />
            )}
            {railed && subtasksCard}
            {/* "What comes next" only makes sense once this task's own breakdown
                is finished - hide the proposals while any subtask is still open
                (the parent can be `done` on its stages while subtasks run). */}
            {!hasOpenSubtasks && (
              <SuggestedNext
                taskId={id}
                suggestions={suggestions.data}
                onChanged={() => {
                  void suggestions.refresh();
                  void subtree.refresh();
                }}
              />
            )}
            <RelatedArtifactsCard related={related.data} isLoading={related.isLoading} />
          </Stack>
        </div>
      </Stack>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void mutateTask(() => api.tasks.delete(id), "Task deleted.", true);
        }}
        title="Delete this task?"
        description="This permanently removes the task and its history. To just take it off the board, use “Not needed” or “Obsolete” instead."
        tone="danger"
        confirmLabel="Delete"
        loading={taskBusy}
        body={<p className="text-sm text-[var(--text)]">{t.title}</p>}
      />
    </div>
  );
}

/** The cockpit breadcrumb's parent-task title. Soft-fail: returns null while
 *  loading or when the parent can't be read - the caller falls back to a
 *  generic "parent task" so the crumb still navigates. */
function useParentTitle(parentId: string | null): string | null {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    setTitle(null);
    if (!parentId) return;
    let cancelled = false;
    (async () => {
      try {
        const parent = await api.tasks.get(parentId);
        if (!cancelled) setTitle(`${parent.display_id} · ${parent.title}`);
      } catch {
        // Keep the crumb useful even when the parent is unreadable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parentId]);
  return title;
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
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        tone === "danger"
          ? "border-[var(--border-strong)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
          : "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

/** Per-task overflow menu in the header - the task-level twin of the board
 *  card menu (remove / restore / delete the whole task). */
function TaskActionsMenu({
  status,
  busy,
  onEdit,
  onMarkDone,
  onArchive,
  onRestore,
  onDelete,
}: {
  status: string;
  busy: boolean;
  onEdit: () => void;
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
          className="glass-panel animate-modal-in z-[var(--z-popover)] w-52 p-1 focus:outline-none"
        >
          <MenuRow onClick={() => run(onEdit)}>
            <Pencil className="size-3.5" aria-hidden />
            Edit title & description
          </MenuRow>
          <hr className="hr-horizon my-1" aria-hidden />
          {!isCancelled && !isDone && (
            <MenuRow onClick={() => run(onMarkDone)}>
              <CheckCircle2 className="size-3.5 text-[var(--success-ink)]" aria-hidden />
              Mark task done
            </MenuRow>
          )}
          {!isCancelled && (
            <>
              <Eyebrow className="block px-2 pb-0.5 pt-1.5">Remove from board</Eyebrow>
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
          <hr className="hr-horizon my-1" aria-hidden />
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
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        focusRing,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to work
    </Link>
  );
}

/** Mirrors the create dialog's title cap so edited titles stay board-legible. */
const TITLE_MAX = 150;

/** Inline editor for the task title + description (`body`), living in the
 *  Description card (opened from its Edit button or the task-actions menu).
 *  Saves via the existing `PATCH /v1/tasks/{id}` slice and refreshes the page.
 *  Access is enforced server-side (`task:update`); a caller without it gets a
 *  clear error message, no silent no-op. */
function TaskDetailsEditor({
  taskId,
  initialTitle,
  initialBody,
  onSaved,
  onCancel,
}: {
  taskId: string;
  initialTitle: string;
  initialBody: string;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("A title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.tasks.patch(taskId, { title: trimmedTitle, body: body.trim() });
      toast.success("Updated the task.");
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="2.5" className="max-w-[760px]">
      <Stack gap="1.5">
        <Cluster justify="between" align="center">
          <label htmlFor="task-title-edit" className="text-xs font-medium text-[var(--text-muted)]">
            Title
          </label>
          <span className="text-micro tabular-nums text-[var(--text-subtle)]">
            {title.length}/{TITLE_MAX}
          </span>
        </Cluster>
        <input
          id="task-title-edit"
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          autoFocus
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base font-semibold text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </Stack>
      <Stack gap="1.5">
        <label htmlFor="task-body-edit" className="text-xs font-medium text-[var(--text-muted)]">
          Description
        </label>
        <textarea
          id="task-body-edit"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Who is it for, what's the context, what does done look like? Markdown supported."
          className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </Stack>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
        >
          {error}
        </p>
      )}
      <Cluster gap="2">
        <Button size="sm" loading={saving} disabled={saving} onClick={() => void save()}>
          <Save className="size-3.5" />
          Save changes
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </Cluster>
    </Stack>
  );
}

/** The task description (`body`) - agent-generated markdown, rendered with full
 *  formatting (headings, lists, tables, fenced code, kn://repo:// citations) via
 *  the shared `ArtifactMarkdown` renderer rather than as a raw-text blob. Long
 *  descriptions are collapsed to a max height with a See more / See less toggle
 *  so the card stays compact; the toggle only appears when the collapsed
 *  content actually overflows (measured), so short descriptions render plainly
 *  with no button. */
function TaskDescription({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Measure overflow only while collapsed (expanding removes the clamp, so
  // scrollHeight would equal clientHeight and falsely hide the button). The
  // last collapsed measurement is retained while expanded. A max-height clip is
  // used rather than `line-clamp` because the rendered markdown is a stack of
  // block elements (headings / lists / code) that line-clamp can't span.
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [body, expanded]);

  return (
    <div>
      <div
        ref={ref}
        className={cn(
          "text-[var(--text-muted)]",
          !expanded && "max-h-[16rem] overflow-hidden",
        )}
      >
        <ArtifactMarkdown text={body} />
      </div>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 rounded text-xs font-medium text-[var(--primary)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}

/** Human label per usage-provenance bucket (see `TaskUsageSource.source`). */
const USAGE_SOURCE_LABEL: Record<string, string> = {
  internal: "Athena",
  client_measured: "measured by your agent (exact)",
  measured_mcp_io: "measured MCP I/O (floor)",
  self_reported: "agent self-reported (estimate)",
};

function CostBlock({
  spent,
  budget,
  near = false,
  over = false,
  usage = null,
}: {
  spent: number | null;
  budget: number | null;
  near?: boolean;
  over?: boolean;
  usage?: TaskUsage | null;
}) {
  // spent is null when the caller lacks cost:read - the whole cost block
  // (spend + token total) is leadership-only, so render nothing.
  if (spent === null) return null;
  // External-agent work is partially observable. EXACT when a usage hook
  // reported real transcript counts (client_measured); otherwise only the
  // server-metered floor + the agent's estimate exist, so the total is a
  // lower bound - say which, honestly.
  const splitTitle = usage?.by_source.length
    ? usage.by_source
        .map(
          (b) =>
            `${USAGE_SOURCE_LABEL[b.source] ?? b.source}: ${formatTokens(b.total_tokens)} tokens (${b.calls} calls)`,
        )
        .join("\n")
    : undefined;
  const { hasExact, onlyEstimated, equivalentUsd: equivalent } =
    usageExactness(usage);
  // Exact-grade headline when exact data exists; the all-bucket >= total only
  // for the floor/estimate case (never sum the floor into an "exact" number).
  const tokens = headlineTokens(usage);
  return (
    <Stack gap="1" className="items-start lg:items-end">
      <Cluster gap="2" align="center" className="lg:justify-end">
        <span className="text-xs text-[var(--text-muted)]">Cost so far</span>
        <Pill
          tone={over ? "danger" : near ? "warning" : "neutral"}
          title={
            over
              ? "Over budget"
              : near
                ? "Approaching budget"
                : undefined
          }
        >
          <span className="inline-flex items-center gap-1">
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
        </Pill>
      </Cluster>
      {usage !== null && tokens > 0 && (
        <span
          className="cursor-default text-xs text-[var(--text-muted)]"
          title={splitTitle}
          data-testid="task-token-total"
        >
          {onlyEstimated ? "≥ " : ""}
          {formatTokens(tokens)} tokens
          {hasExact && (
            <span className="text-[var(--text-subtle)]"> · exact</span>
          )}
          {onlyEstimated && (
            <span className="text-[var(--text-subtle)]"> · estimated</span>
          )}
        </span>
      )}
      {hasExact && equivalent > 0 && (
        <span
          className="cursor-default text-micro text-[var(--text-subtle)]"
          title="List-price equivalent of the exact tokens your coding agent spent. Billed to your AI subscription, not Athena credit."
          data-testid="task-equivalent-usd"
        >
          ≈ {formatUsdPrecise(equivalent)} on your subscription
        </span>
      )}
      {onlyEstimated && (
        <span className="text-micro text-[var(--text-subtle)]">
          External-agent total is a lower bound - install the Athena usage hook
          for exact numbers.
        </span>
      )}
    </Stack>
  );
}

/** Subtasks + manual breakdown - one card, used in the right rail (railed
 *  tasks) or inline in the main column (plain tasks). */
function SubtasksCard({
  taskId,
  subtasks,
  loading,
  dependsOn,
  onChanged,
}: {
  taskId: string;
  subtasks: SubtaskNode[];
  loading: boolean;
  dependsOn: string[];
  onChanged: () => void | Promise<void>;
}) {
  return (
    <Card>
      <Stack gap="3">
        <CardHeader rule className="mb-0">
          <Cluster gap="2" align="center">
            <Layers className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Subtasks</span>
          </Cluster>
        </CardHeader>
        <SubtaskPanel
          subtasks={subtasks}
          loading={loading}
          taskId={taskId}
          dependsOn={dependsOn}
          onChanged={onChanged}
        />
      </Stack>
    </Card>
  );
}

/** Related artifacts (parent / sibling / dependency) - one row per related task. */
function RelatedArtifactsCard({
  related,
  isLoading,
}: {
  related: RelatedArtifact[];
  isLoading: boolean;
}) {
  const groups = useMemo(() => groupRelatedByTask(related), [related]);
  return (
    <Card>
      <Stack gap="3">
        <CardHeader rule className="mb-0">
          <Cluster gap="2" align="center">
            <Layers className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Related artifacts</span>
          </Cluster>
        </CardHeader>

        <Stack gap="1.5">
          {isLoading ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="skeleton h-8 rounded-md" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              className="py-6"
              title="Nothing linked yet"
              description="Nothing linked from parent, sibling, or dependency tasks."
            />
          ) : (
            <Stack gap="1.5" as="ul">
              {/* One row per related TASK (all its artifacts live on that
                  task's page anyway) - never one row per document. */}
              {groups.map((g) => (
                <li
                  key={g.taskId}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Pill size="sm" kind="outline" className="shrink-0">
                      {g.relation}
                    </Pill>
                    <Link
                      href={`/work/${g.taskId}`}
                      className="min-w-0 flex-1 truncate text-sm text-[var(--text)] hover:underline"
                    >
                      {g.title || g.kinds[0]?.replace(/_/g, " ") || "artifact"}
                    </Link>
                  </div>
                  <p className="ml-0.5 mt-0.5 truncate text-micro text-[var(--text-subtle)]">
                    {g.kinds.map((k) => k.replace(/_/g, " ")).join(" · ")}
                  </p>
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
        <div className="skeleton mb-3 h-7 w-32 rounded-md" />
        <Card variant="elevated" className="p-5">
          <Stack gap="3">
            <div className="skeleton h-5 w-40 rounded" />
            <div className="skeleton h-7 w-2/3 rounded" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </Stack>
          <div className="phase-rail mt-5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[92px] rounded-md" />
            ))}
          </div>
        </Card>
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <Stack gap="4">
            <div className="skeleton h-64 rounded-lg" />
            <div className="skeleton h-32 rounded-lg" />
          </Stack>
          <Stack gap="4">
            <div className="skeleton h-80 rounded-lg" />
            <div className="skeleton h-40 rounded-lg" />
          </Stack>
        </div>
      </Stack>
    </div>
  );
}
