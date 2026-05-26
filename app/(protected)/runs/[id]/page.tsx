"use client";

/**
 * /runs/[id] — run (a.k.a. task) detail page.
 *
 * Two phase tracks rendered by `kind`:
 *   - Implementation tasks (6 phases): Spec → Plan → Implement → Review → CI → PR
 *   - PRD tasks (4 phases):            Frame → Research → Draft → Sign-off
 *
 * Each phase has a dedicated detail component below that consumes
 * `/v1/runs/{id}/phases/{phaseKey}` and renders the full mock-v2 surface
 * (clarifying questions, KB sources, regenerate options, dependency matrix,
 * multi-stage runner, line-level diffs, per-repo CI checks, PR back-flow,
 * approve / reject / re-open gates).
 */

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye, FileText, GitPullRequest, Hammer, ListTree, ShieldCheck,
  Target, Search, Users,
  AlertTriangle, CheckCircle2, Circle, ExternalLink, GitCommit,
  Lightbulb, Loader2, MessageCircle, RotateCcw, Sparkles, Wand2, XCircle, Edit3,
  BookOpen, ChevronRight, Plus, ChevronDown, Bell, Calendar, ClipboardList,
  Database, Link as LinkIcon, Play, Send, TrendingUp, TrendingDown, Minus,
  GitBranch, Share2, Download, MessageSquare, Activity,
  type LucideIcon,
} from "lucide-react";

import {
  api, ApiError,
  type RunDetail, type PrFeedbackItem, type TaskDecision, type ActivityItem,
  type RunClarification,
  type ClarificationAnswer,
} from "@/lib/api/client";
import { useMascotStore } from "@/lib/stores/mascot";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveActivityStrip } from "@/components/runs/live-activity-strip";
import { DecisionEditDialog } from "@/components/runs/decision-edit-dialog";
import { useRunStream } from "@/features/runs/use-run-stream";
import { DocShell, type DocRevision } from "@/components/docs/doc-shell";
import { ImproveDrawer, type ImproveTarget } from "@/components/docs/improve-drawer";
import { renderClarificationInput } from "@/components/runs/clarifications/common";
import { ScopeCollisionsModal } from "@/components/runs/scope-collisions-modal";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

const IMPL_PHASES = [
  { key: "spec",      label: "Spec",         icon: FileText        },
  { key: "plan",      label: "Plan",         icon: ListTree        },
  { key: "implement", label: "Implement",    icon: Hammer          },
  { key: "review",    label: "Review",       icon: Eye             },
  { key: "ci",        label: "CI Gate",      icon: ShieldCheck     },
  { key: "pr",        label: "Pull request", icon: GitPullRequest  },
] as const;

const PRD_PHASES = [
  { key: "frame",    label: "Frame",     icon: Target   },
  { key: "research", label: "Research",  icon: Search   },
  { key: "draft",    label: "Draft",     icon: FileText },
  { key: "signoff",  label: "Sign-off",  icon: Users    },
] as const;

type PhaseKey = (typeof IMPL_PHASES)[number]["key"] | (typeof PRD_PHASES)[number]["key"];

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [decisions, setDecisions] = useState<TaskDecision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseKey | null>(null);
  const [improveTarget, setImproveTarget] = useState<ImproveTarget | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [clarifications, setClarifications] = useState<RunClarification[]>([]);
  const [phaseStalenessAck, setPhaseStalenessAck] = useState<Set<string>>(new Set());
  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);

  useEffect(() => { setScreenDefault("thinking"); }, [setScreenDefault]);

  const refreshClarifications = useCallback(async () => {
    try {
      const list = await api.runs.clarifications.list(id);
      setClarifications(list);
    } catch {
      // Soft-fail: clarifications are additive UI; missing endpoint shouldn't block the page.
      setClarifications([]);
    }
  }, [id]);

  const loadRun = useCallback(async () => {
    try {
      const [fetched, decisionList] = await Promise.all([
        api.runs.get(id),
        api.runs.decisions(id).catch(() => []),
      ]);
      setRun(fetched);
      setDecisions(decisionList);
      const phases = fetched.kind === "prd" ? PRD_PHASES : IMPL_PHASES;
      if (!activePhase) {
        setActivePhase(phases[Math.min(fetched.current_phase, phases.length - 1)]!.key);
      }
      await refreshClarifications();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load run");
    }
  }, [id, activePhase, refreshClarifications]);

  useEffect(() => { void loadRun(); }, [loadRun]);

  // §5.29.10 Item 2 — SSE-driven clarification refresh. The
  // ClarificationSseListener subscribes to the run's SSE feed and re-fetches
  // the typed clarification list whenever a `clarification_pending` /
  // `clarification_resolved` / `clarification_expired` event lands. Replaces
  // the prior 15-second polling interval — no more wasted polls when the
  // run is silent, and the pause UI now lights up in real time. Mounted
  // only when the run is loaded so we don't fire a no-op SSE on the empty
  // stream_url.

  const handleClarificationSubmit = useCallback(
    async ({ qid, phaseKey, answer }: { qid: string; phaseKey: string; answer: ClarificationAnswer }) => {
      try {
        await api.runs.clarifications.submit(id, phaseKey, qid, answer);
        toast.success("Athena will incorporate your answer.");
        await refreshClarifications();
        await loadRun();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't save your answer.");
      }
    },
    [id, refreshClarifications, loadRun],
  );

  const handleClarificationSkip = useCallback(
    async (qid: string, phaseKey: string) => {
      try {
        await api.runs.clarifications.skip(id, phaseKey, qid);
        await refreshClarifications();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't skip — only optional questions can be skipped.");
      }
    },
    [id, refreshClarifications],
  );

  const handleClarificationDefer = useCallback(
    async (qid: string, phaseKey: string) => {
      try {
        await api.runs.clarifications.defer(id, phaseKey, qid);
        toast.success("Deferred 24h.");
        await refreshClarifications();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't defer.");
      }
    },
    [id, refreshClarifications],
  );

  // F-04.13 — re-run handler for the cascading-staleness banner.
  const handleRerunPhase = useCallback(
    async (phaseKey: string) => {
      try {
        const key = `rerun-${id}-${phaseKey}-${Date.now()}`;
        await api.runs.phases.rerun(id, phaseKey, key);
        toast.success(`Re-running ${phaseKey} with the latest upstream context.`);
        await loadRun();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't re-run.");
      }
    },
    [id, loadRun],
  );

  if (error) {
    return (
      <Stack gap="4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/runs")}><ArrowLeft className="size-4" />Back to tasks</Button>
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>
      </Stack>
    );
  }

  if (!run || !activePhase) {
    return (
      <Stack gap="4">
        <div className="h-8 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-64 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  const phases = run.kind === "prd" ? PRD_PHASES : IMPL_PHASES;
  const phaseLabel = phases[Math.min(run.current_phase, phases.length - 1)]!.label;

  return (
    <Stack gap="0">
      <Cluster gap="2" align="center" className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/runs")}>
          <ArrowLeft className="size-4" />
          Back to tasks
        </Button>
      </Cluster>

      {/* === Task header card (mock-v2 .task-header) === */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <Stack gap="2" className="min-w-0 flex-1">
            <Cluster gap="2" align="center" className="flex-wrap">
              <span className="pill pill-violet"><span className="dot" />{run.kind === "prd" ? "Customer Insights" : "Billing"}</span>
              <span className={cn("pill", run.kind === "prd" ? "pill-warning" : "pill-info")}>
                <span className="dot" />
                {run.kind === "prd" ? "Change request / PRD" : "Implementation"}
              </span>
              <span className="pill pill-live pill-info">
                <span className="dot" />
                {phaseLabel} · {run.progress}%
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                opened {formatRelativeTime(run.created_at)} by {run.requested_by}
              </span>
            </Cluster>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">{run.goal}</h1>
            <p className="max-w-[760px] text-sm text-[var(--text-muted)]">{run.summary}</p>
            <Cluster gap="2" align="center" className="flex-wrap pt-1">
              <span className="text-xs text-[var(--text-muted)]">Source:</span>
              <span className="pill">
                <Sparkles className="size-3" />
                {run.source.label}
              </span>
              <span className="text-xs text-[var(--text-muted)]">·</span>
              <span className="text-xs text-[var(--text-muted)]">Cost so far</span>
              <span className="pill">${run.spent_usd.toFixed(2)}</span>
            </Cluster>
          </Stack>
          <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
            <PhaseActionsCluster runId={run.id} phaseKey={activePhase} status={runStatusToPhaseStatus(run)} onChange={loadRun} />
            <Cluster gap="2" className="lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)} aria-haspopup="dialog">
                <Activity className="size-3.5" />
                Activity
              </Button>
              <ShareMenu run={run} />
            </Cluster>
          </div>
        </div>

        {/* === Phase rail (chips with status + progress bar) === */}
        <div className="phase-rail mt-5">
          {phases.map((p, i) => {
            const isPast = i < run.current_phase;
            const isCurrent = i === run.current_phase;
            const isActive = p.key === activePhase;
            const visual = isPast ? "done" : isCurrent ? "active" : "locked";
            const progress = isPast ? 100 : isCurrent ? Math.max(15, run.progress - 5) : 0;
            const phaseStatus = isPast ? "approved" : isCurrent ? runStatusToPhaseStatus(run) : "idle";
            return (
              <button
                key={p.key}
                onClick={() => setActivePhase(p.key as PhaseKey)}
                className={cn("phase", visual, isActive && "selected")}
                style={{ ["--w" as string]: `${progress}%` }}
              >
                <div className="phase-num">{String(i + 1).padStart(2, "0")}</div>
                <div className="phase-name">{p.label}</div>
                <div className="mt-1.5">
                  <span className={cn("phase-status-pill", `s-${phaseStatus}`)}>
                    {phaseStatus === "approved" && <CheckCircle2 className="size-3" />}
                    {phaseStatus === "running" && <Sparkles className="size-3" />}
                    {phaseStatus === "needs-review" && <Eye className="size-3" />}
                    {phaseStatus === "blocked" && <XCircle className="size-3" />}
                    {phaseStatus === "idle" && <Circle className="size-3" />}
                    {phaseStatusLabel(phaseStatus)}
                  </span>
                </div>
                <div className="phase-progress" />
              </button>
            );
          })}
        </div>
      </div>

      {/* === Decisions strip (collapsible) === */}
      <DecisionsStrip decisions={decisions} runId={run.id} onChanged={loadRun} />

      {/* §5.29.10 Item 2 — SSE-driven clarification refresh (replaces 15s poll). */}
      <ClarificationSseListener
        runId={run.id}
        streamUrl={run.stream_url}
        runStatus={run.status}
        onSignal={refreshClarifications}
      />

      {/* === Live activity strip (collapsible SSE feed; compact by default) === */}
      <div className="mt-4">
        <LiveActivityStrip runId={run.id} streamUrl={run.stream_url} initialStatus={run.status} />
      </div>

      {/* F-04.13 — cascading-staleness banner when the active phase's output
       * was based on an earlier version of an upstream doc. */}
      <CascadingStalenessBanner
        run={run}
        activePhase={activePhase}
        acknowledged={phaseStalenessAck}
        onRerun={handleRerunPhase}
        onDismiss={(key) => setPhaseStalenessAck((s) => new Set(s).add(key))}
      />

      {/* === Phase content + right column ===
       *
       * Per the 2026-05-24 design pass: clarifications surface inline inside
       * the per-phase "Clarifying questions" box (rendered by `PhaseContent`),
       * not via a modal or page-level pause card. Decisions surface only via
       * the `<DecisionsStrip>` above; there is no second decisions tab. The
       * right column always shows the Info pane (participants + cost / PRD
       * approval). */}
      <div className="mt-4 grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <Stack gap="4">
          <PhaseSummaryStrip run={run} phaseKey={activePhase} phaseLabel={phaseLabel} status={runStatusToPhaseStatus(run)} />
          <PhaseContent
            runId={run.id}
            phaseKey={activePhase}
            run={run}
            onChange={loadRun}
            onImprove={setImproveTarget}
            richClarifications={clarifications.filter((c) => c.phase_key === activePhase)}
            onClarificationSubmit={handleClarificationSubmit}
            onClarificationSkip={handleClarificationSkip}
            onClarificationDefer={handleClarificationDefer}
          />
        </Stack>
        <Stack gap="4">
          <ParticipantsCard run={run} />
          {run.kind === "prd"
            ? <ApprovalQueueCard runId={run.id} />
            : <CostRuntimeCard run={run} />}
        </Stack>
      </div>

      <ActivityDrawer open={activityOpen} taskId={run.id} onClose={() => setActivityOpen(false)} />
      <ImproveDrawer target={improveTarget} onClose={() => setImproveTarget(null)} />
    </Stack>
  );
}


/** F-04.13 — banner shown on a downstream phase tab when upstream changes
 * have made the current output stale. */
function CascadingStalenessBanner({
  run,
  activePhase,
  acknowledged,
  onRerun,
  onDismiss,
}: {
  run: RunDetail;
  activePhase: string;
  acknowledged: Set<string>;
  onRerun: (phaseKey: string) => Promise<void> | void;
  onDismiss: (phaseKey: string) => void;
}) {
  if (!run.downstream_stale) return null;
  const staleness = run.phase_staleness?.[activePhase];
  if (!staleness) return null;
  if (acknowledged.has(activePhase)) return null;
  return (
    <Card className="mt-4 border-[var(--border-strong)] bg-[var(--warning-soft)]">
      <Cluster justify="between" align="center" className="flex-wrap gap-2">
        <Stack gap="0" className="min-w-0">
          <Cluster gap="2" align="center">
            <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
            <span className="text-sm font-semibold text-[var(--warning)]">
              This phase&apos;s output was based on an earlier version of {staleness.upstream_doc_label}.
            </span>
          </Cluster>
          <span className="text-xs text-[var(--text-muted)]">
            {staleness.upstream_doc_label} has since been improved ({formatRelativeTime(staleness.stale_since)}).
          </span>
        </Stack>
        <Cluster gap="2">
          <Button size="sm" variant="outline" onClick={() => onDismiss(activePhase)}>
            Keep as-is
          </Button>
          <Button size="sm" onClick={() => void onRerun(activePhase)}>
            <RotateCcw className="size-3.5" />
            Re-run this phase
          </Button>
        </Cluster>
      </Cluster>
    </Card>
  );
}

function phaseStatusLabel(s: "idle" | "running" | "needs-review" | "approved" | "blocked"): string {
  return {
    idle: "Not started",
    running: "Athena working",
    "needs-review": "Needs your review",
    approved: "Approved",
    blocked: "Blocked",
  }[s];
}

type ImproveHandler = (target: ImproveTarget | null) => void;

/**
 * Helper: extract the anchor rect from the click event + dispatch open.
 * Existing call sites pass `Omit<ImproveTarget, "anchor" | "scope">` plus an
 * optional `scope`. When omitted, scope defaults to `global` so legacy
 * "Iterate" buttons (one per doc/section) continue to behave the same.
 */
function fireImprove(
  e: React.MouseEvent<HTMLElement>,
  onImprove: ImproveHandler,
  fields: Omit<ImproveTarget, "anchor" | "scope"> & { scope?: ImproveTarget["scope"] },
) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  onImprove({
    ...fields,
    scope: fields.scope ?? { kind: "global" },
    anchor: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
  });
}

function runStatusToPhaseStatus(run: RunDetail): "idle" | "running" | "needs-review" | "approved" | "blocked" {
  if (run.status === "running")   return "running";
  if (run.status === "queued")    return "idle";
  if (run.status === "failed")    return "blocked";
  if (run.status === "cancelled") return "blocked";
  // Completed → if last phase, approved; else needs-review.
  return "needs-review";
}

/** Section header with an inline "Iterate" pill that scopes the drawer to that section. */
function SectionHeader({ title, onImprove, target, right }: {
  title: string;
  onImprove?: ImproveHandler;
  target?: Omit<ImproveTarget, "anchor" | "scope"> & { scope?: ImproveTarget["scope"] };
  right?: React.ReactNode;
}) {
  return (
    <Cluster justify="between" align="center">
      <span className="text-sm font-semibold">{title}</span>
      <Cluster gap="2" align="center">
        {right}
        {onImprove && target && (
          <button
            onClick={(e) => fireImprove(e, onImprove, target)}
            className="improve-btn"
          >
            <Wand2 className="size-2.5" />
            Iterate
          </button>
        )}
      </Cluster>
    </Cluster>
  );
}

/* -------------------------------------------------- Phase content router */
function PhaseContent({
  runId,
  phaseKey,
  run,
  onChange,
  onImprove,
  richClarifications,
  onClarificationSubmit,
  onClarificationSkip,
  onClarificationDefer,
}: {
  runId: string;
  phaseKey: PhaseKey;
  run: RunDetail;
  onChange: () => void;
  onImprove: ImproveHandler;
  richClarifications: RunClarification[];
  onClarificationSubmit: (ctx: { qid: string; phaseKey: string; answer: ClarificationAnswer }) => Promise<void> | void;
  onClarificationSkip: (qid: string, phaseKey: string) => Promise<void> | void;
  onClarificationDefer: (qid: string, phaseKey: string) => Promise<void> | void;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const result = await api.runs.phaseData(runId, phaseKey);
        // F-03.1 — `result.data` is now typed per phase; the existing
        // PhaseContent children read it as `Record<string, unknown>` and
        // cast individual fields. Cast at the boundary to preserve the
        // current call surface without rewriting every phase component.
        if (!cancelled) setData(result.data as unknown as Record<string, unknown>);
      } catch { if (!cancelled) setData(null); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [runId, phaseKey]);

  if (loading) {
    return (
      <Card aria-busy="true" aria-label={`Loading ${phaseKey}`}>
        <Stack gap="3">
          <div className="h-5 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <Stack gap="2">
            <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-3 w-11/12 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-3 w-4/5 animate-pulse rounded-md bg-[var(--surface-2)]" />
          </Stack>
          <div className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
      </Card>
    );
  }

  const props = { runId, data: data ?? {}, onChange };
  const phaseBody = (() => {
    switch (phaseKey) {
      case "spec":      return <SpecPhase {...props} run={run} onImprove={onImprove} />;
      case "plan":      return <PlanPhase {...props} onImprove={onImprove} />;
      case "implement": return <ImplementPhase {...props} />;
      case "review":    return <ReviewPhase {...props} />;
      case "ci":        return <CiPhase {...props} />;
      case "pr":        return <PrPhase {...props} />;
      case "frame":     return <FramePhase {...props} onImprove={onImprove} />;
      case "research":  return <ResearchPhase {...props} onImprove={onImprove} />;
      case "draft":     return <DraftPhase {...props} onImprove={onImprove} />;
      case "signoff":   return <SignoffPhase {...props} />;
      default:          return <Card><p className="text-sm text-[var(--text-muted)]">No data yet for {phaseKey}.</p></Card>;
    }
  })();

  return (
    <Stack gap="4">
      <ClarifyingQuestions
        clarifications={richClarifications}
        phaseKey={phaseKey}
        onSubmit={onClarificationSubmit}
        onSkip={onClarificationSkip}
        onDefer={onClarificationDefer}
      />
      {phaseBody}
    </Stack>
  );
}

/** Build the props object for `renderClarificationInput`, conditionally
 * including `onSkip` / `onDefer` only when the question's priority allows
 * the affordance. `exactOptionalPropertyTypes` requires we omit, not pass
 * `undefined`. */
function buildClarificationInputProps(
  c: RunClarification,
  phaseKey: string,
  onSubmit: (ctx: { qid: string; phaseKey: string; answer: ClarificationAnswer }) => Promise<void> | void,
  onSkip: (qid: string, phaseKey: string) => Promise<void> | void,
  onDefer: (qid: string, phaseKey: string) => Promise<void> | void,
): import("@/components/runs/clarifications/common").ClarificationInputProps {
  const base: import("@/components/runs/clarifications/common").ClarificationInputProps = {
    clarification: c,
    onSubmit: (answer) => onSubmit({ qid: c.qid, phaseKey, answer }),
  };
  if (c.priority === "optional") base.onSkip = () => onSkip(c.qid, phaseKey);
  if (c.priority !== "optional" && c.defer_count < 3) base.onDefer = () => onDefer(c.qid, phaseKey);
  return base;
}

/**
 * ClarifyingQuestions — the typed (8-kind) clarifications surface,
 * folded into the same per-phase placement as the legacy "Clarifying
 * questions" card. There is no modal, no page-blocker; an agent that needs
 * an answer adds it here and the user answers it in line.
 *
 * Skip / defer affordances are surfaced only when the question's priority
 * permits them (optional → skip; non-optional → defer up to 3×).
 */
function ClarifyingQuestions({
  clarifications,
  phaseKey,
  onSubmit,
  onSkip,
  onDefer,
}: {
  clarifications: RunClarification[];
  phaseKey: string;
  onSubmit: (ctx: { qid: string; phaseKey: string; answer: ClarificationAnswer }) => Promise<void> | void;
  onSkip: (qid: string, phaseKey: string) => Promise<void> | void;
  onDefer: (qid: string, phaseKey: string) => Promise<void> | void;
}) {
  // §5.29.10 r3 / F-04.10 — the first pending `origin === "scope_collisions"`
  // clarification opens its own modal on top of the inline strip so the
  // user can scan the conflict snapshot at full width. Dismissing the
  // modal leaves the row in the inline list (still pending) so they can
  // come back to it. Hooks must run unconditionally — declared above the
  // early-return below.
  const [collisionDismissed, setCollisionDismissed] = useState<string | null>(null);
  if (clarifications.length === 0) return null;
  const pendingCount = clarifications.filter((c) => c.status === "pending").length;
  const hasPending = pendingCount > 0;
  const collisionClarification = clarifications.find(
    (c) => c.status === "pending" && c.origin === "scope_collisions",
  );
  const showCollisionModal =
    collisionClarification !== undefined && collisionDismissed !== collisionClarification.qid;
  return (
    <Card className={cn(hasPending && "border-[var(--warning)] bg-[var(--warning-soft)]")}>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <MessageCircle className={cn("size-4", hasPending ? "text-[var(--warning)]" : "text-[var(--text-muted)]")} />
          <span className="text-sm font-semibold">Clarifying questions</span>
          {hasPending && (
            <span className="rounded-full bg-[var(--warning)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              {pendingCount} pending
            </span>
          )}
          <span className="ml-auto text-xs text-[var(--text-muted)]">{clarifications.length} total this phase</span>
        </Cluster>
        <Stack gap="3" as="ul">
          {clarifications.map((c) => (
            <li key={c.qid} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
              <Stack gap="2">
                <Cluster justify="between" align="start" gap="2">
                  <Stack gap="1" className="min-w-0">
                    <span className="text-sm font-medium">{c.question}</span>
                    {c.rationale && <p className="text-xs text-[var(--text-muted)]">{c.rationale}</p>}
                  </Stack>
                  <Cluster gap="1" className="shrink-0">
                    {c.priority === "blocker" && (
                      <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]">
                        Blocker
                      </span>
                    )}
                    {c.priority === "optional" && (
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Optional
                      </span>
                    )}
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      c.status === "answered" ? "bg-[var(--success-soft)] text-[var(--success)]"
                      : c.status === "skipped" ? "bg-[var(--surface-2)] text-[var(--text-subtle)]"
                      : "bg-[var(--warning-soft)] text-[var(--warning)]",
                    )}>{c.status}</span>
                  </Cluster>
                </Cluster>

                {c.status === "pending" ? (
                  <Stack gap="2">
                    {renderClarificationInput(buildClarificationInputProps(c, phaseKey, onSubmit, onSkip, onDefer))}
                  </Stack>
                ) : c.status === "answered" ? (
                  <Card className="border-[var(--border-strong)] bg-[var(--success-soft)] p-2">
                    <Cluster gap="2" align="center">
                      <CheckCircle2 className="size-3.5 text-[var(--success)]" />
                      <span className="text-xs">
                        Answered · resolved {c.resolved_at ? formatRelativeTime(c.resolved_at) : "just now"}
                      </span>
                    </Cluster>
                  </Card>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    {c.status === "skipped" ? "Skipped" : c.status === "expired" ? "Expired" : c.status}.
                  </p>
                )}
              </Stack>
            </li>
          ))}
        </Stack>
      </Stack>
      {showCollisionModal && collisionClarification && (
        <ScopeCollisionsModal
          clarification={collisionClarification}
          onSubmit={(answer) =>
            onSubmit({ qid: collisionClarification.qid, phaseKey, answer })
          }
          onClose={() => setCollisionDismissed(collisionClarification.qid)}
        />
      )}
    </Card>
  );
}

/* ================== Shared helpers ================== */

/* PhaseDocHeader removed: the rendered doc header lives in
   components/docs/doc-shell.tsx; the inline header below was dead code.
   The Regenerate affordance was removed entirely — the ImproveDrawer
   covers iterative refinement; PhaseActionsCluster covers approve /
   reopen / generate (idle) / re-run. */

function KbCallout({ sources }: { sources: { label: string; kind: string; count: number; icon?: string; detail?: string }[] | undefined }) {
  if (!sources || sources.length === 0) return null;
  const total = sources.reduce((a, s) => a + (s.count || 1), 0);
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <Lightbulb className="size-4 text-[var(--text-muted)]" />
          <span className="text-sm font-semibold">Pulled from your knowledge base</span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{total} source{total === 1 ? "" : "s"}</span>
        </Cluster>
        <ul className="flex flex-wrap gap-2">
          {sources.map((s, i) => (
            <li key={i} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs">
              <Cluster gap="2" align="center">
                <span className="font-medium text-[var(--text)]">{s.label}</span>
                <span className="text-[var(--text-muted)]">· {s.kind}{s.count && s.count > 1 ? ` · ${s.count}` : ""}</span>
              </Cluster>
              {s.detail && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{s.detail}</p>}
            </li>
          ))}
        </ul>
      </Stack>
    </Card>
  );
}

/** Citation chip — `{ label, icon?, title? }`. Mirrors mock-v2 citationChip(). */
type Citation = { label: string; icon?: string; title?: string };
const CITATION_ICON: Record<string, LucideIcon> = {
  database: Database,
  "message-circle": MessageCircle,
  "file-text": FileText,
  search: Search,
  clipboard: ClipboardList,
  "book-open": BookOpen,
  target: Target,
  "list-tree": ListTree,
  users: Users,
  link: LinkIcon,
};
function CitationChip({ c }: { c: Citation }) {
  const Icon = CITATION_ICON[c.icon ?? "link"] ?? LinkIcon;
  return (
    <span
      title={c.title}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]"
    >
      <Icon className="size-3" />
      {c.label}
    </span>
  );
}
function CitationsRow({ items, maxVisible = 3 }: { items: Citation[] | undefined; maxVisible?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!items || items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, maxVisible);
  const hidden = items.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((c, i) => <CitationChip key={`${c.label}-${i}`} c={c} />)}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          +{hidden} more
        </button>
      )}
    </div>
  );
}

/** Phase KPI strip — label/value tiles at the top of a phase. */
function PhaseKpiStrip({ items }: { items: { label: string; value: string | number; hint?: string | undefined }[] }) {
  if (items.length === 0) return null;
  return (
    <Grid cols="auto-fit-140" gap="2">
      {items.map((k) => (
        <div key={k.label} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{k.label}</div>
          <div className="text-xl font-bold tabular-nums leading-tight">{k.value}</div>
          {k.hint && <div className="mt-0.5 text-xs text-[var(--text-muted)]">{k.hint}</div>}
        </div>
      ))}
    </Grid>
  );
}

/** Bucket a 0-1 confidence into a coarse label that's easier to scan than a raw %. */
function confidenceBucket(n: number): { label: "High" | "Medium" | "Low"; tone: string } {
  if (n >= 0.8) return { label: "High",   tone: "bg-[var(--success-soft)] text-[var(--success)]" };
  if (n >= 0.6) return { label: "Medium", tone: "bg-[var(--info-soft)] text-[var(--info)]" };
  return        { label: "Low",    tone: "bg-[var(--warning-soft)] text-[var(--warning)]" };
}
function ConfidenceTag({ value, label }: { value: number; label?: string }) {
  const b = confidenceBucket(value);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", b.tone)}>
      {b.label}
      <span className="font-normal normal-case opacity-75">· {Math.round(value * 100)}%</span>
      {label && <span className="font-normal normal-case opacity-75">{label}</span>}
    </span>
  );
}

/** Share menu — surfaces export + copy-link + Slack on the task header. */
function ShareMenu({ run }: { run: RunDetail }) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "Copy link",          icon: LinkIcon,      action: () => { void navigator.clipboard?.writeText(window.location.href); toast.success("Link copied to clipboard."); } },
    { label: "Export markdown",    icon: Download,      action: () => toast.success(`Exporting ${run.kind === "prd" ? "PRD" : "task"} as markdown…`) },
    { label: "Send to Slack",      icon: MessageSquare, action: () => toast.success("Posted to #product-review.") },
  ];
  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Share2 className="size-3.5" />
        Share
        <ChevronDown className="size-3" />
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close share menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div role="menu" className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg">
            {items.map((i) => (
              <button
                key={i.label}
                role="menuitem"
                onClick={() => { i.action(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <i.icon className="size-3.5 text-[var(--text-muted)]" />
                {i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** VP-grade summary strip rendered above every phase: status · progress/readiness · blockers · last activity. */
function PhaseSummaryStrip({ run, phaseKey, phaseLabel, status }: {
  run: RunDetail;
  phaseKey: string;
  phaseLabel: string;
  status: "idle" | "running" | "needs-review" | "approved" | "blocked";
}) {
  const [blockers, setBlockers] = useState(0);
  const [lastActivity, setLastActivity] = useState<string>("—");
  useEffect(() => {
    (async () => {
      try {
        const page = await api.activity.list({ limit: 1 });
        const first = page.items.find((a) => !a.task_id || a.task_id === run.id);
        if (first) setLastActivity(first.when);
      } catch { /* ignore */ }
      try {
        const result = await api.runs.phaseData(run.id, phaseKey);
        // F-03.1 — phaseKey is `string` here (typed from PhaseKey or any),
        // so the typed slice falls back to the discriminated union. Cast
        // down to a generic record for the field-level access below.
        const d = result.data as unknown as Record<string, unknown>;
        const cq = (d.clarifyingQuestions as Array<{ status: string }> | undefined) ?? [];
        const stakeholders = (d.stakeholders as Array<{ state: string }> | undefined) ?? [];
        const pendingQ = cq.filter((q) => q.status === "pending").length;
        const stakeBlockers = stakeholders.filter((s) => s.state === "changes-requested" || s.state === "pending").length;
        setBlockers(pendingQ + stakeBlockers);
      } catch { setBlockers(0); }
    })();
  }, [run.id, phaseKey]);

  const statusTone = (() => {
    switch (status) {
      case "running":      return "bg-[var(--info-soft)] text-[var(--info)]";
      case "needs-review": return "bg-[var(--warning-soft)] text-[var(--warning)]";
      case "approved":     return "bg-[var(--success-soft)] text-[var(--success)]";
      case "blocked":      return "bg-[var(--danger-soft)] text-[var(--danger)]";
      default:             return "bg-[var(--surface-3)] text-[var(--text-subtle)]";
    }
  })();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs">
      <Cluster gap="2" align="center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Phase</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", statusTone)}>
          {phaseLabel}
        </span>
      </Cluster>
      <span aria-hidden className="text-[var(--text-subtle)]">·</span>
      <Cluster gap="1.5" align="center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Progress</span>
        <span className="font-semibold tabular-nums text-[var(--text)]">{run.progress}%</span>
      </Cluster>
      <span aria-hidden className="text-[var(--text-subtle)]">·</span>
      <Cluster gap="1.5" align="center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Blockers</span>
        <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums", blockers > 0 ? "bg-[var(--warning)] text-white" : "bg-[var(--surface-3)] text-[var(--text-muted)]")}>
          {blockers}
        </span>
      </Cluster>
      <span aria-hidden className="text-[var(--text-subtle)]">·</span>
      <Cluster gap="1.5" align="center">
        <Activity className="size-3 text-[var(--text-subtle)]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Last activity</span>
        <span className="text-[var(--text)]">{lastActivity}</span>
      </Cluster>
    </div>
  );
}

/** Approval queue card — replaces the cost card on PRD tasks. Lists stakeholders who haven't given green light. */
function ApprovalQueueCard({ runId }: { runId: string }) {
  const [queue, setQueue] = useState<Array<{ name: string; role: string; avatar: string; state: string; nextAction?: string }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const result = await api.runs.phaseData(runId, "signoff");
        // F-03.1 — drop down to `unknown` then re-cast; the local shape this
        // function reads is a subset of `SignoffPhasePayloadV1.stakeholders`.
        const d = result.data as unknown as Record<string, unknown>;
        const stakeholders = (d.stakeholders as Array<{ name: string; role: string; avatar: string; state: string; nextAction?: string }> | undefined) ?? [];
        setQueue(stakeholders.filter((s) => s.state !== "approved" && s.state !== "owner"));
      } catch { /* ignore */ }
    })();
  }, [runId]);
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <span className="text-[13px] font-semibold">Approval queue</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{queue.length} open</span>
        </Cluster>
        {queue.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">All stakeholders have green-lit this PRD. Ready for sign-off.</p>
        ) : (
          <Stack gap="2" as="ul">
            {queue.map((s) => (
              <li key={s.name} className="rounded-md border border-[var(--border)] p-2 text-xs">
                <Cluster justify="between" align="center">
                  <Cluster gap="2" align="center">
                    <div className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold">{s.avatar}</div>
                    <Stack gap="0">
                      <span className="text-[13px] font-semibold leading-tight">{s.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{s.role}</span>
                    </Stack>
                  </Cluster>
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    s.state === "changes-requested" ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}>{s.state}</span>
                </Cluster>
                {s.nextAction && (
                  <p className="mt-1 text-xs text-[var(--primary)]">
                    <strong>Next:</strong> {s.nextAction}
                  </p>
                )}
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/* The legacy `<ClarifyingQuestions>` component was removed in the 2026-05-24
 * design pass — the per-phase widget now consumes only the rich
 * `RunClarification[]` shape (8 question kinds, priority ladder, lifecycle).
 * See `ClarifyingQuestions` (defined below) and ADR-068. */

/* ================== Spec phase ================== */
function SpecPhase({ data, run, onChange, onImprove }: { data: Record<string, unknown>; run: RunDetail; onChange: () => void; onImprove: ImproveHandler }) {
  const doc = (data.doc as string) ?? "spec.md";
  const version = (data.currentVersion as string) ?? "v1";
  const status = (data.status as "draft" | "needs-review" | "approved") ?? "draft";
  const revisions = (data.revisions as DocRevision[]) ?? [];
  const body = data.body as string | undefined;
  const markdown = data.markdown as string | undefined;
  const capabilitiesDetected = (data.capabilitiesDetected as Array<{ id: string; confidence: number; primary: boolean; why: string; files: number }>) ?? [];
  const blastRadius = data.blastRadius as { repos: { id: string; files: number; kind: string; desc: string }[]; services?: { name: string; impact: string; risk: string }[]; dataStores?: { name: string; impact: string; risk: string }[]; compliance?: string[] } | undefined;
  const approvedBy = (data.approvedBy as { name: string; role: string; avatar?: string }[]) ?? [];
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set(capabilitiesDetected.filter((c) => c.primary).map((c) => c.id)));
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set(blastRadius?.repos.map((r) => r.id) ?? []));
  const totalSelected = selectedCaps.size + selectedRepos.size;
  const totalAvailable = capabilitiesDetected.length + (blastRadius?.repos.length ?? 0);
  const toggleCap = (id: string) => setSelectedCaps((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleRepo = (id: string) => setSelectedRepos((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSave = async ({ note }: { markdown: string; note: string }) => {
    toast.success(`Saved new revision · ${note || "no note"}.`);
    onChange();
  };

  return (
    <Stack gap="4">
      <PhaseKpiStrip items={[
        { label: "Repos affected", value: blastRadius?.repos.length ?? 0 },
        { label: "Services",       value: blastRadius?.services?.length ?? 0 },
        { label: "Data stores",    value: blastRadius?.dataStores?.length ?? 0 },
        { label: "Compliance",     value: blastRadius?.compliance?.length ?? 0, hint: blastRadius?.compliance?.join(" · ") },
      ]} />


      <DocShell
        doc={doc}
        version={version}
        status={status}
        body={body}
        markdown={markdown}
        revisions={revisions}
        approvedBy={approvedBy}
        onSave={handleSave}
        headerActions={
          <button
            onClick={(e) => fireImprove(e, onImprove, {
              label: "spec.md",
              currentText: markdown ?? run.summary,
              kind: "spec",
              onSubmit: async () => { onChange(); },
            })}
            className="improve-btn"
          >
            <Wand2 className="size-2.5" />
            Iterate
          </button>
        }
      />

      <Card>
        <Stack gap="2">
          <SectionHeader
            title="Why this task"
            onImprove={onImprove}
            target={{ label: "spec.md · Why", currentText: run.summary, onSubmit: async () => { onChange(); } }}
          />
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{run.summary}</p>
        </Stack>
      </Card>

      <KbCallout sources={data.kbSources as { label: string; kind: string; count: number; icon?: string; detail?: string }[] | undefined} />

      {capabilitiesDetected.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">Capabilities affected</span>
              <span className="text-xs text-[var(--text-muted)]">Athena&apos;s detection · click rows to scope</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {capabilitiesDetected.map((c) => {
                const isSel = selectedCaps.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggleCap(c.id)}
                      aria-pressed={isSel}
                      className={cn(
                        "w-full rounded-md border p-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                        isSel ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <Cluster justify="between" align="center">
                        <Cluster gap="2" align="center">
                          <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", isSel ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]" : "border-[var(--border-strong)] bg-[var(--surface)]")}>
                            {isSel && <CheckCircle2 className="size-3" />}
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", c.primary ? "bg-[var(--primary)] text-[var(--primary-fg)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>
                            {c.primary ? "Primary" : "Touch"}
                          </span>
                          <span className="font-medium">{c.id}</span>
                        </Cluster>
                        <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                          <span>{Math.round(c.confidence * 100)}% confidence</span>
                          <span>·</span>
                          <span>{c.files} file{c.files === 1 ? "" : "s"}</span>
                        </Cluster>
                      </Cluster>
                      <p className="mt-1 text-xs text-[var(--text-subtle)]">{c.why}</p>
                    </button>
                  </li>
                );
              })}
            </Stack>
          </Stack>
        </Card>
      )}

      {blastRadius && (
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">Blast radius</span>
              <span className="text-xs text-[var(--text-muted)]">click repos to scope</span>
            </Cluster>
            <Stack gap="2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Repos</span>
              <Stack gap="1" as="ul">
                {blastRadius.repos.map((r) => {
                  const isSel = selectedRepos.has(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => toggleRepo(r.id)}
                        aria-pressed={isSel}
                        className={cn(
                          "w-full rounded-md border p-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                          isSel ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:border-[var(--border-strong)]",
                        )}
                      >
                        <Cluster justify="between" align="center">
                          <Cluster gap="2" align="center">
                            <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", isSel ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]" : "border-[var(--border-strong)] bg-[var(--surface)]")}>
                              {isSel && <CheckCircle2 className="size-3" />}
                            </span>
                            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase", r.kind === "create" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>{r.kind}</span>
                            <span className="font-medium">{r.id}</span>
                          </Cluster>
                          <span className="text-xs text-[var(--text-muted)]">{r.files} file{r.files === 1 ? "" : "s"}</span>
                        </Cluster>
                        <p className="ml-6 text-xs text-[var(--text-subtle)]">{r.desc}</p>
                      </button>
                    </li>
                  );
                })}
              </Stack>
            </Stack>
            {blastRadius.services && blastRadius.services.length > 0 && (
              <Stack gap="2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Services</span>
                <Stack gap="1" as="ul">
                  {blastRadius.services.map((s) => (
                    <li key={s.name} className="text-xs">
                      <Cluster justify="between" align="center">
                        <span><strong>{s.name}</strong> — {s.impact}</span>
                        <RiskPill risk={s.risk} />
                      </Cluster>
                    </li>
                  ))}
                </Stack>
              </Stack>
            )}
            {blastRadius.dataStores && blastRadius.dataStores.length > 0 && (
              <Stack gap="2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Data stores</span>
                <Stack gap="1" as="ul">
                  {blastRadius.dataStores.map((s) => (
                    <li key={s.name} className="text-xs">
                      <Cluster justify="between" align="center">
                        <span><strong>{s.name}</strong> — {s.impact}</span>
                        <RiskPill risk={s.risk} />
                      </Cluster>
                    </li>
                  ))}
                </Stack>
              </Stack>
            )}
            {blastRadius.compliance && blastRadius.compliance.length > 0 && (
              <Stack gap="2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Compliance gates</span>
                <Cluster gap="1.5">
                  {blastRadius.compliance.map((c) => (
                    <span key={c} className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning)]">{c}</span>
                  ))}
                </Cluster>
              </Stack>
            )}
          </Stack>
        </Card>
      )}

      {totalAvailable > 0 && (
        <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
          <Cluster justify="between" align="center">
            <Stack gap="0">
              <span className="text-sm font-semibold">{totalSelected} of {totalAvailable} items selected for scope</span>
              <span className="text-xs text-[var(--text-muted)]">Toggle items above, then iterate the spec scoped to your selection.</span>
            </Stack>
            <Button
              size="sm"
              disabled={totalSelected === 0}
              onClick={(e) => fireImprove(e, onImprove, {
                label: `spec.md · scoped to ${totalSelected} item${totalSelected === 1 ? "" : "s"}`,
                currentText: markdown ?? run.summary,
                kind: "spec",
                onSubmit: async () => { onChange(); },
              })}
            >
              <Wand2 className="size-3.5" />
              Apply selection &amp; iterate
            </Button>
          </Cluster>
        </Card>
      )}

    </Stack>
  );
}

function RiskPill({ risk }: { risk: string }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
      risk === "high"   ? "bg-[var(--danger-soft)]  text-[var(--danger)]"
      : risk === "medium" ? "bg-[var(--warning-soft)] text-[var(--warning)]"
      : "bg-[var(--success-soft)] text-[var(--success)]",
    )}>{risk}</span>
  );
}

/* ================== Plan phase ================== */
function PlanPhase({ data, onChange, onImprove }: { data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
  const [tab, setTab] = useState<"plan" | "consequences" | "subtasks">("plan");
  const components = (data.components as Array<{
    n: number; name: string; plainEnglish: string; technical: string; why: string; repo: string;
    touchpoints: { consumes: string[]; publishes: string[]; calls: string[]; writes: string[]; exposes: string[] };
    files: { name: string; change: string }[];
  }>) ?? [];
  const dependencyMatrix = (data.dependencyMatrix as string[][]) ?? [];
  const consequences = data.consequences as {
    severity: string; summary: string;
    breakingChanges: { area: string; desc: string; risk: string }[];
    dataImpacts:     { entity: string; impact: string; risk: string }[];
    runtimeRisks:    { name: string; desc: string; severity: string }[];
    mitigations:     { kind: string; desc: string }[];
  } | undefined;
  const subtasks = (data.subtasks as Array<{
    id: string; title: string; component: string; status: string; files?: number; jira: string; dependsOn: string[];
    acceptanceCriteria: string[];
    doc?: { current: string; revisions: DocRevision[]; body: string };
    aiSuggestPromote?: boolean;
    promoteReason?: string;
  }>) ?? [];
  const [expandedSubtask, setExpandedSubtask] = useState<string | null>(null);
  const [expandedComponent, setExpandedComponent] = useState<number | null>(null);
  const handlePromoteSubtask = (s: typeof subtasks[number]) => {
    const newTaskId = `tsk_${Math.random().toString(36).slice(2, 7)}`;
    toast.success(`Promoted ${s.id} → ${newTaskId}. Spec + plan auto-approved from this task's context. Now on Implement.`, { duration: 6000 });
  };

  const status = (data.status as "draft" | "needs-review" | "approved") ?? "draft";
  const version = (data.currentVersion as string) ?? "v1";
  const revisions = (data.revisions as DocRevision[]) ?? [];
  const body = data.body as string | undefined;
  const markdown = data.markdown as string | undefined;

  const handleSave = async ({ note }: { markdown: string; note: string }) => {
    toast.success(`Saved new revision · ${note || "no note"}.`);
    onChange();
  };

  return (
    <Stack gap="4">

      <DocShell
        doc="plan.md"
        version={version}
        status={status}
        body={body}
        markdown={markdown}
        revisions={revisions}
        onSave={handleSave}
        headerActions={
          <button
            onClick={(e) => fireImprove(e, onImprove, {
              label: "plan.md",
              currentText: markdown ?? "(no plan text yet)",
              kind: "plan",
              onSubmit: async () => { onChange(); },
            })}
            className="improve-btn"
          >
            <Wand2 className="size-2.5" />
            Iterate
          </button>
        }
      />

      <div className="border-b border-[var(--border)]">
        <Cluster gap="0">
          {(["plan", "consequences", "subtasks"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize",
                tab === t ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {t === "plan" ? "Components" : t}
            </button>
          ))}
        </Cluster>
      </div>

      {tab === "plan" && (
        <Stack gap="3">
          <PhaseKpiStrip items={[
            { label: "Components", value: components.length },
            { label: "Subtasks",   value: subtasks.length },
            { label: "Severity",   value: consequences?.severity ?? "—" },
          ]} />

          {components.map((c) => (
            <Card key={c.n}>
              <Stack gap="2">
                <Cluster justify="between" align="center">
                  <Cluster gap="2" align="center">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-semibold text-[var(--primary)]">C{c.n}</span>
                    <Stack gap="0">
                      <span className="text-sm font-semibold">{c.name}</span>
                      <code className="font-mono text-xs text-[var(--text-muted)]">{c.repo}</code>
                    </Stack>
                  </Cluster>
                  <button
                    onClick={(e) => fireImprove(e, onImprove, {
                      label: `plan.md · C${c.n} ${c.name}`,
                      currentText: c.plainEnglish,
                      kind: "plan",
                      onSubmit: async () => { onChange(); },
                    })}
                    className="improve-btn"
                  >
                    <Wand2 className="size-2.5" />
                    Iterate
                  </button>
                </Cluster>
                <p className="text-sm text-[var(--text)]">{c.plainEnglish}</p>
                <button
                  type="button"
                  onClick={() => setExpandedComponent(expandedComponent === c.n ? null : c.n)}
                  className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                  aria-expanded={expandedComponent === c.n}
                >
                  {expandedComponent === c.n ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  Technical detail
                </button>
                {expandedComponent === c.n && (
                  <div className="text-xs">
                    <pre className="mt-1 overflow-x-auto rounded bg-[var(--code-bg)] p-2 font-mono text-xs">{c.technical}</pre>
                    <p className="mt-1 text-[var(--text-muted)]"><strong>Why:</strong> {c.why}</p>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[var(--text-muted)]">
                      {c.touchpoints.consumes.length > 0  && <div><strong>Consumes</strong>: {c.touchpoints.consumes.join(", ")}</div>}
                      {c.touchpoints.publishes.length > 0 && <div><strong>Publishes</strong>: {c.touchpoints.publishes.join(", ")}</div>}
                      {c.touchpoints.calls.length > 0     && <div><strong>Calls</strong>: {c.touchpoints.calls.join(", ")}</div>}
                      {c.touchpoints.writes.length > 0    && <div><strong>Writes</strong>: {c.touchpoints.writes.join(", ")}</div>}
                      {c.touchpoints.exposes.length > 0   && <div><strong>Exposes</strong>: {c.touchpoints.exposes.join(", ")}</div>}
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {c.files.map((f) => (
                        <li key={f.name} className="text-[var(--text-muted)]">
                          <span className={cn("mr-1 inline-block rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider", f.change === "create" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--info-soft)] text-[var(--info)]")}>{f.change}</span>
                          <code className="font-mono">{f.name}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Stack>
            </Card>
          ))}

          {dependencyMatrix.length > 0 && (
            <Card>
              <Stack gap="2">
                <span className="text-sm font-semibold">Dependency matrix</span>
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <tbody>
                      {dependencyMatrix.map((row, r) => (
                        <tr key={r}>
                          {row.map((cell, c) => (
                            <td key={c} className={cn(
                              "border border-[var(--border)] px-3 py-1 text-center font-mono",
                              r === 0 || c === 0 ? "bg-[var(--surface-2)] font-semibold" : "",
                              cell === "→" ? "text-[var(--primary)]" : "",
                            )}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--text-muted)]">Read: row C<em>n</em> depends on column C<em>m</em>. <span className="text-[var(--primary)]">→</span> means &quot;must land first&quot;.</p>
              </Stack>
            </Card>
          )}
        </Stack>
      )}

      {tab === "consequences" && consequences && (
        <Stack gap="3">
          <Card className={cn(
            "border-[var(--border-strong)]",
            consequences.severity === "high"   ? "bg-[var(--danger-soft)]"
            : consequences.severity === "medium" ? "bg-[var(--warning-soft)]"
            : "bg-[var(--success-soft)]",
          )}>
            <Stack gap="2">
              <Cluster gap="2" align="center">
                <AlertTriangle className={cn(
                  "size-4",
                  consequences.severity === "high"   ? "text-[var(--danger)]"
                  : consequences.severity === "medium" ? "text-[var(--warning)]"
                  : "text-[var(--success)]",
                )} />
                <span className="text-sm font-semibold uppercase tracking-wider">Severity: {consequences.severity}</span>
              </Cluster>
              <p className="text-sm">{consequences.summary}</p>
            </Stack>
          </Card>

          <PhaseKpiStrip items={[
            { label: "Breaking",    value: consequences.breakingChanges.length },
            { label: "Data impacts",value: consequences.dataImpacts.length },
            { label: "Runtime",     value: consequences.runtimeRisks.length },
            { label: "Mitigations", value: consequences.mitigations.length },
          ]} />

          <Card>
            <Stack gap="2">
              <span className="text-sm font-semibold">Breaking changes</span>
              <Stack gap="1" as="ul">
                {consequences.breakingChanges.map((b) => (
                  <li key={b.area} className="text-sm">
                    <Cluster justify="between" align="center">
                      <span><strong>{b.area}</strong>: {b.desc}</span>
                      <RiskPill risk={b.risk} />
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Card>
            <Stack gap="2">
              <span className="text-sm font-semibold">Data impacts</span>
              <Stack gap="1" as="ul">
                {consequences.dataImpacts.map((d) => (
                  <li key={d.entity} className="text-sm">
                    <Cluster justify="between" align="center">
                      <span><strong>{d.entity}</strong>: {d.impact}</span>
                      <RiskPill risk={d.risk} />
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Card>
            <Stack gap="2">
              <span className="text-sm font-semibold">Runtime risks</span>
              <Stack gap="1" as="ul">
                {consequences.runtimeRisks.map((r) => (
                  <li key={r.name} className="text-sm">
                    <Cluster justify="between" align="center">
                      <span><strong>{r.name}</strong>: {r.desc}</span>
                      <RiskPill risk={r.severity} />
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Card>
            <Stack gap="2">
              <span className="text-sm font-semibold">Mitigations</span>
              <Stack gap="1" as="ul">
                {consequences.mitigations.map((m) => (
                  <li key={m.kind} className="text-sm">
                    <strong>{m.kind}</strong>: {m.desc}
                  </li>
                ))}
              </Stack>
            </Stack>
          </Card>
        </Stack>
      )}

      {tab === "subtasks" && (
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">{subtasks.length} subtasks</span>
              <span className="text-xs text-[var(--text-muted)]">click a row to view its draft + revisions</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {subtasks.map((s) => {
                const open = expandedSubtask === s.id;
                return (
                  <li key={s.id} className="rounded-md border border-[var(--border)] text-sm">
                    <button
                      type="button"
                      onClick={() => setExpandedSubtask(open ? null : s.id)}
                      className="w-full p-3 text-left hover:bg-[var(--surface-2)]"
                    >
                      <Cluster justify="between" align="center">
                        <Cluster gap="2" align="center">
                          {open ? <ChevronDown className="size-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="size-3.5 text-[var(--text-muted)]" />}
                          <Stack gap="0">
                            <span className="font-medium">{s.title}</span>
                            <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                              <span>{s.component}</span>
                              <span>·</span>
                              <code className="font-mono">{s.jira}</code>
                              {s.dependsOn.length > 0 && <><span>·</span><span>depends on {s.dependsOn.join(", ")}</span></>}
                            </Cluster>
                          </Stack>
                        </Cluster>
                        <Cluster gap="2" align="center">
                          {s.aiSuggestPromote && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]"
                              title={s.promoteReason ?? "Athena suggests promoting this subtask to its own task."}
                            >
                              <Sparkles className="size-2.5" />
                              AI: promote
                            </span>
                          )}
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            s.status === "done"     ? "bg-[var(--success-soft)] text-[var(--success)]"
                            : s.status === "running"  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                            : s.status === "blocked"  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                            : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                          )}>{s.status}</span>
                        </Cluster>
                      </Cluster>
                      {s.acceptanceCriteria.length > 0 && (
                        <ul className="ml-5 mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
                          {s.acceptanceCriteria.map((ac) => (
                            <li key={ac} className="flex items-start gap-1.5">
                              <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success)]" />
                              <span>{ac}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                    {open && (
                      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-3">
                        <Cluster justify="between" align="center" className="mb-2 flex-wrap">
                          <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                            <FileText className="size-3.5" />
                            <span>{s.id}.md</span>
                            {s.doc && <><span>·</span><span>current revision: {s.doc.current}</span></>}
                          </Cluster>
                          <Cluster gap="1.5" className="flex-wrap">
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); toast.info(`Running ${s.id} — Athena will post progress to activity.`); }}>
                              <Play className="size-3" />
                              Run
                            </Button>
                            <button
                              onClick={(e) => { e.stopPropagation(); fireImprove(e, onImprove, {
                                label: `${s.id}.md`,
                                currentText: s.doc?.body ?? s.title,
                                kind: "plan",
                                onSubmit: async () => { onChange(); },
                              }); }}
                              className="improve-btn"
                            >
                              <Wand2 className="size-2.5" />
                              Iterate
                            </button>
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toast.info(`Opening ${s.jira} in Jira.`); }}>
                              <ExternalLink className="size-3" />
                              {s.jira}
                            </Button>
                            {s.aiSuggestPromote && (
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handlePromoteSubtask(s); }}
                                title="Spin off as a new task with this task as a dependency. Spec + plan auto-approve from the parent context; new task starts at Implement."
                              >
                                <GitBranch className="size-3" />
                                Promote to task
                              </Button>
                            )}
                            {!s.aiSuggestPromote && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); handlePromoteSubtask(s); }}
                                title="Spin off as a new task with this task as a dependency."
                              >
                                <GitBranch className="size-3" />
                                Promote
                              </Button>
                            )}
                          </Cluster>
                        </Cluster>
                        {s.aiSuggestPromote && (
                          <div className="mb-3 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] p-2">
                            <Cluster gap="2" align="center" className="mb-1">
                              <Sparkles className="size-3.5 text-[var(--primary)]" />
                              <span className="text-xs font-semibold text-[var(--primary)]">Athena suggests promoting this subtask</span>
                            </Cluster>
                            {s.promoteReason && <p className="text-xs leading-relaxed text-[var(--text)]">{s.promoteReason}</p>}
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              The new task inherits only this subtask&apos;s scope (component, acceptance criteria, blast-radius slice) and a dependency on this task. Spec + plan auto-approve from the parent context — execution starts at Implement.
                            </p>
                          </div>
                        )}
                        {s.doc?.body && <p className="whitespace-pre-line text-xs leading-relaxed text-[var(--text)]">{s.doc.body}</p>}
                        {s.doc?.revisions && s.doc.revisions.length > 0 && (
                          <div className="mt-3 border-t border-[var(--border)] pt-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Revisions</span>
                            <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
                              {s.doc.revisions.map((r) => (
                                <li key={r.id}>
                                  <strong className="text-[var(--text)]">{r.id}</strong> · {r.author} · {r.date} — {r.note}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </Stack>
          </Stack>
        </Card>
      )}

    </Stack>
  );
}

/* ================== Implement phase ================== */
function ImplementPhase({ data }: { data: Record<string, unknown> }) {
  const stages = (data.stages as Array<{ name: string; state: "done" | "active" | "pending"; detail: string; duration: string }>) ?? [];
  const stats = data.stats as { files: number; totalTests: number; retries: number; costSoFar: number; tokens: number } | undefined;
  const summary = data.summaryPM as string | undefined;
  const allGreen = stages.length > 0 && stages.every((s) => s.state === "done");
  return (
    <Stack gap="4">

      <Card className={cn("border-[var(--border-strong)]", allGreen ? "bg-[var(--success-soft)]" : undefined)}>
        <Stack gap="2">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <Sparkles className={cn("size-4", allGreen ? "text-[var(--success)]" : "text-[var(--primary)]")} />
              <span className="text-sm font-semibold">Implementation summary</span>
            </Cluster>
            {allGreen && (
              <span className="rounded-full bg-[var(--success)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                All stages green
              </span>
            )}
          </Cluster>
          {summary && <p className="text-sm">{summary}</p>}
        </Stack>
      </Card>

      {stats && (
        <Grid cols="auto-fit-140" gap="2">
          <KpiBlock label="Files touched" value={stats.files.toString()} />
          <KpiBlock label="Tests added"   value={stats.totalTests.toString()} />
          <KpiBlock label="Retries"       value={stats.retries.toString()} />
          <KpiBlock label="Cost"          value={`$${stats.costSoFar.toFixed(2)}`} />
          <KpiBlock label="Tokens"        value={`${(stats.tokens / 1000).toFixed(1)}k`} />
        </Grid>
      )}

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Stages</span>
          <ol className="space-y-1">
            {stages.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  s.state === "done"   ? "bg-[var(--success)] text-white"
                  : s.state === "active" ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                  : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                )}>
                  {s.state === "done" ? <CheckCircle2 className="size-3" /> : s.state === "active" ? <Loader2 className="size-3 animate-spin" /> : <Circle className="size-3" />}
                </span>
                <Stack gap="0" className="flex-1 min-w-0">
                  <Cluster justify="between" align="center">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">{s.duration}</span>
                  </Cluster>
                  <span className="text-xs text-[var(--text-muted)]">{s.detail}</span>
                </Stack>
              </li>
            ))}
          </ol>
        </Stack>
      </Card>

    </Stack>
  );
}

/* ================== Review phase ================== */
function ReviewPhase({ data }: { data: Record<string, unknown> }) {
  const diffStats = data.diffStats as { files: number; additions: number; deletions: number; repos: number } | undefined;
  const reviewers = (data.reviewers as { name: string; role: string; avatar?: string; state: string; note: string }[]) ?? [];
  const policy = (data.approvalPolicy as { label: string; met: boolean; blocker?: string }[]) ?? [];
  const diffs = (data.diffs as Array<{
    repo: string; file: string; additions: number; deletions: number; purposePM: string;
    hunks: { header: string; lines: { type: "add" | "rem" | "ctx"; n: number; t: string }[] }[];
  }>) ?? [];
  const [expandedDiff, setExpandedDiff] = useState<string | null>(diffs[0] ? `${diffs[0].repo}/${diffs[0].file}` : null);

  return (
    <Stack gap="4">

      {diffStats && (
        <Card>
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Diff summary</span>
            <Cluster gap="3" align="center" className="text-sm">
              <span><strong>{diffStats.files}</strong> <span className="text-[var(--text-muted)]">files across {diffStats.repos} repos</span></span>
              <span className="text-[var(--success)]">+{diffStats.additions}</span>
              <span className="text-[var(--danger)]">−{diffStats.deletions}</span>
            </Cluster>
          </Cluster>
        </Card>
      )}

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Reviewers</span>
          <Stack gap="2" as="ul">
            {reviewers.map((r) => (
              <li key={r.name} className="text-sm">
                <Cluster justify="between" align="center">
                  <Cluster gap="2" align="center">
                    <div className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold">{r.avatar ?? r.name.split(" ").map(w => w[0]).join("")}</div>
                    <Stack gap="0">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{r.role}</span>
                    </Stack>
                  </Cluster>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    r.state === "approved" ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : r.state === "changes-requested" ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}>{r.state}</span>
                </Cluster>
                {r.note && <p className="ml-8 mt-1 text-xs italic text-[var(--text-muted)]">&quot;{r.note}&quot;</p>}
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Card>
        <Stack gap="2">
          <span className="text-sm font-semibold">Approval policy</span>
          <Stack gap="1" as="ul">
            {policy.map((p) => (
              <li key={p.label} className="flex items-start gap-2 text-sm">
                {p.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" />}
                <Stack gap="0" className="min-w-0">
                  <span className={p.met ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>{p.label}</span>
                  {p.blocker && <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{p.blocker}</span>}
                </Stack>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      {diffs.length > 0 && (
        <Card>
          <Stack gap="3">
            <span className="text-sm font-semibold">Files</span>
            <Stack gap="2">
              {diffs.map((d) => {
                const key = `${d.repo}/${d.file}`;
                const open = expandedDiff === key;
                return (
                  <div key={key} className="rounded-md border border-[var(--border)]">
                    <button
                      onClick={() => setExpandedDiff(open ? null : key)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                    >
                      <Cluster gap="2" align="center">
                        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]">{d.repo}</span>
                        <code className="font-mono text-xs">{d.file}</code>
                      </Cluster>
                      <Cluster gap="2" align="center" className="text-xs">
                        <span className="text-[var(--success)]">+{d.additions}</span>
                        <span className="text-[var(--danger)]">−{d.deletions}</span>
                      </Cluster>
                    </button>
                    {open && (
                      <Stack gap="2" className="border-t border-[var(--border)] px-3 py-3">
                        <p className="text-xs italic text-[var(--text-muted)]">{d.purposePM}</p>
                        {d.hunks.map((h, hi) => (
                          <pre key={hi} className="overflow-x-auto rounded bg-[var(--code-bg)] font-mono text-[11px] leading-snug">
                            <div className="bg-[var(--surface-2)] px-2 py-1 text-[var(--text-muted)]">{h.header}</div>
                            <div className="px-2 py-1">
                              {h.lines.map((line, li) => (
                                <div key={li} className={cn(
                                  line.type === "add" ? "bg-[var(--diff-add)] text-[var(--text)]"
                                  : line.type === "rem" ? "bg-[var(--diff-del)] text-[var(--text)]"
                                  : "text-[var(--text-muted)]",
                                )}>
                                  <span className="mr-2 inline-block w-6 select-none text-right text-[var(--text-subtle)]">{line.n}</span>
                                  <span className="mr-1 select-none">{line.type === "add" ? "+" : line.type === "rem" ? "−" : " "}</span>
                                  <span>{line.t || " "}</span>
                                </div>
                              ))}
                            </div>
                          </pre>
                        ))}
                      </Stack>
                    )}
                  </div>
                );
              })}
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

/* ================== CI phase ================== */
function CiPhase({ data }: { data: Record<string, unknown> }) {
  const overall = data.state as string | undefined;
  const elapsed = data.elapsedSeconds as number | undefined;
  const attemptsByRepo = data.attemptsByRepo as Record<string, {
    branch: string; sha: string; ciTool: string;
    checks: { name: string; state: "success" | "failure" | "running" | "pending"; startedAt?: string; completedAt?: string; outputSummary?: string }[];
    classifier: null | { category: string; confidence: number; deterministic: boolean; errorExcerpt: string; failingFiles?: string[]; triageNote: string; resolution?: string };
  }> | undefined;
  const healHistory = (data.healHistory as { n: number; outcome: string; filesModified: number; costUsd: number; note: string }[]) ?? [];

  const repos = attemptsByRepo ? Object.keys(attemptsByRepo) : [];
  const totalChecks = attemptsByRepo ? Object.values(attemptsByRepo).reduce((a, r) => a + r.checks.length, 0) : 0;
  const healCost = healHistory.reduce((a, h) => a + h.costUsd, 0);
  const elapsedLabel = elapsed ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : "—";

  return (
    <Stack gap="4">
      <PhaseKpiStrip items={[
        { label: "Repos",     value: repos.length },
        { label: "Checks",    value: totalChecks },
        { label: "Elapsed",   value: elapsedLabel },
        { label: "Heal cost", value: `$${healCost.toFixed(2)}` },
      ]} />


      <Card>
        <Stack gap="2">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <ShieldCheck className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">CI gate</span>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                overall === "passed" ? "bg-[var(--success-soft)] text-[var(--success)]"
                : overall === "failed" ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                : "bg-[var(--primary-soft)] text-[var(--primary)]",
              )}>{overall ?? "running"}</span>
            </Cluster>
            {elapsed && <span className="text-xs text-[var(--text-muted)]">elapsed: {elapsedLabel}</span>}
          </Cluster>
        </Stack>
      </Card>

      {healHistory.length > 0 && (
        <Card className="border-[var(--border-strong)] bg-[var(--info-soft)]">
          <Cluster gap="2" align="center">
            <Sparkles className="size-4 text-[var(--info)]" />
            <Stack gap="0">
              <span className="text-sm font-semibold text-[var(--info)]">Auto-heal engaged</span>
              <span className="text-xs text-[var(--text-muted)]">{healHistory.length} attempt{healHistory.length === 1 ? "" : "s"} · ${healCost.toFixed(2)} cost · see heal history below.</span>
            </Stack>
          </Cluster>
        </Card>
      )}

      {attemptsByRepo && Object.entries(attemptsByRepo).map(([repo, attempt]) => (
        <Card key={repo}>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <Cluster gap="2" align="center">
                <span className="text-sm font-semibold">{repo}</span>
                <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[10px]">{attempt.sha}</code>
              </Cluster>
              <span className="text-xs text-[var(--text-muted)]">{attempt.ciTool} · {attempt.branch}</span>
            </Cluster>
            <Stack gap="1" as="ul">
              {attempt.checks.map((c) => (
                <li key={c.name} className="flex items-center justify-between rounded-md border border-[var(--border)] p-2 text-sm">
                  <Cluster gap="2" align="center">
                    {c.state === "success" ? <CheckCircle2 className="size-3.5 text-[var(--success)]" /> : c.state === "failure" ? <XCircle className="size-3.5 text-[var(--danger)]" /> : c.state === "running" ? <Loader2 className="size-3.5 animate-spin text-[var(--primary)]" /> : <Circle className="size-3.5 text-[var(--text-muted)]" />}
                    <span>{c.name}</span>
                  </Cluster>
                  <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                    {c.completedAt && <span>{c.completedAt}</span>}
                    {c.outputSummary && <span className="hidden md:inline">{c.outputSummary}</span>}
                  </Cluster>
                </li>
              ))}
            </Stack>
            {attempt.classifier && (
              <Card className="border-[var(--border-strong)] bg-[var(--warning-soft)]">
                <Stack gap="2">
                  <Cluster gap="2" align="center">
                    <Lightbulb className="size-4 text-[var(--warning)]" />
                    <span className="text-sm font-semibold text-[var(--warning)]">Classifier: {attempt.classifier.category}</span>
                    <span className="rounded-full bg-[var(--warning)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">{Math.round(attempt.classifier.confidence * 100)}%</span>
                    {attempt.classifier.deterministic && <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">deterministic</span>}
                  </Cluster>
                  <p className="text-xs">{attempt.classifier.triageNote}</p>
                  <pre className="overflow-x-auto rounded bg-[var(--code-bg)] p-2 font-mono text-[10px]">{attempt.classifier.errorExcerpt}</pre>
                  {attempt.classifier.failingFiles && attempt.classifier.failingFiles.length > 0 && (
                    <Stack gap="0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Failing files</span>
                      <ul className="space-y-0.5 text-xs">
                        {attempt.classifier.failingFiles.map((f) => (
                          <li key={f}><code className="font-mono text-[var(--text-muted)]">{f}</code></li>
                        ))}
                      </ul>
                    </Stack>
                  )}
                  {attempt.classifier.resolution && (
                    <span className="text-xs"><strong>Resolution:</strong> {attempt.classifier.resolution}</span>
                  )}
                  <Cluster gap="2" className="pt-1">
                    <Button size="sm" variant="outline" onClick={() => toast.success("Auto-heal queued.")}>
                      <Sparkles className="size-3" />
                      Auto-heal
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toast.info("Marked as expected — won't block CI again.")}>
                      <CheckCircle2 className="size-3" />
                      Mark as expected
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toast.info("Opening CI logs…")}>
                      <ExternalLink className="size-3" />
                      Open logs
                    </Button>
                  </Cluster>
                </Stack>
              </Card>
            )}
          </Stack>
        </Card>
      ))}

      {healHistory.length > 0 && (
        <Card>
          <Stack gap="2">
            <span className="text-sm font-semibold">Heal history</span>
            <Stack gap="1" as="ul">
              {healHistory.map((h) => (
                <li key={h.n} className="rounded-md border border-[var(--border)] p-2 text-sm">
                  <Cluster justify="between" align="center">
                    <Cluster gap="2" align="center">
                      <Sparkles className="size-3.5 text-[var(--primary)]" />
                      <span>Attempt #{h.n}: <strong>{h.outcome}</strong></span>
                    </Cluster>
                    <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                      <span>{h.filesModified} file{h.filesModified === 1 ? "" : "s"} changed</span>
                      <span>·</span>
                      <span>${h.costUsd.toFixed(2)}</span>
                    </Cluster>
                  </Cluster>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{h.note}</p>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

    </Stack>
  );
}

/* ================== PR phase + back-flow ================== */
function PrPhase({ runId, data }: { runId: string; data: Record<string, unknown> }) {
  const [feedback, setFeedback] = useState<PrFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setFeedback(await api.runs.prFeedback(runId)); }
      catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [runId]);

  const prs = (data.prs as { repo: string; branch: string; sha?: string; status: string; number: number; files: number; additions: number; deletions: number; url: string }[] | undefined) ?? [];
  const mode = (data.mode as string | undefined) ?? "draft";
  const totalAdditions = prs.reduce((a, p) => a + p.additions, 0);
  const totalDeletions = prs.reduce((a, p) => a + p.deletions, 0);

  return (
    <Stack gap="4">
      <PhaseKpiStrip items={[
        { label: "Repos",   value: prs.length },
        { label: "Diff",    value: `+${totalAdditions} / −${totalDeletions}` },
        { label: "PR mode", value: mode.charAt(0).toUpperCase() + mode.slice(1) },
      ]} />


      <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
        <Cluster gap="2" align="center">
          <Lightbulb className="size-4 text-[var(--text-muted)]" />
          <Stack gap="0">
            <span className="text-sm font-semibold">Athena always opens PRs as drafts</span>
            <span className="text-xs text-[var(--text-muted)]">A human flips to ready-for-review once they&apos;ve eyeballed the diff. Set policy in Settings → PR mode.</span>
          </Stack>
        </Cluster>
      </Card>

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Pull requests</span>
          <Stack gap="2" as="ul">
            {prs.length === 0 ? <p className="text-sm text-[var(--text-muted)]">PRs not opened yet.</p> : prs.map((p) => (
              <li key={p.url} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <Stack gap="0">
                    <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline">
                      {p.repo}#{p.number}
                      <ExternalLink className="size-3" />
                    </a>
                    <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                      <span>{p.branch}</span>
                      {p.sha && <><span>·</span><code className="font-mono">{p.sha}</code></>}
                    </Cluster>
                  </Stack>
                  <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                    <span className="text-[var(--success)]">+{p.additions}</span>
                    <span className="text-[var(--danger)]">−{p.deletions}</span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      p.status === "merged" ? "bg-[var(--success-soft)] text-[var(--success)]"
                      : p.status === "open" ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                    )}>{p.status}</span>
                  </Cluster>
                </Cluster>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Reviewer comments → Athena</span>
            <span className="text-xs text-[var(--text-muted)]">{feedback.length} thread{feedback.length === 1 ? "" : "s"}</span>
          </Cluster>
          {loading ? (
            <Stack gap="3" aria-busy="true" aria-label="Loading reviewer comments">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-md border border-[var(--border)] p-3">
                  <Stack gap="2">
                    <Cluster justify="between" align="center">
                      <Cluster gap="2" align="center">
                        <div className="size-6 animate-pulse rounded-full bg-[var(--surface-2)]" />
                        <div className="h-3 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
                        <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
                      </Cluster>
                      <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
                    </Cluster>
                    <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                    <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  </Stack>
                </div>
              ))}
            </Stack>
          ) : feedback.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No reviewer comments yet.</p>
          ) : (
            <Stack gap="3" as="ul">
              {feedback.map((f) => (
                <li key={f.id} className="rounded-md border border-[var(--border)] p-3">
                  <Stack gap="2">
                    <Cluster justify="between" align="center">
                      <Cluster gap="2" align="center">
                        <ActorAvatar name={f.reviewer} initials={f.reviewer_avatar ?? undefined} size={24} />
                        <span className="text-sm font-medium">{f.reviewer}</span>
                        <span className="text-xs text-[var(--text-muted)]">on {f.file}:{f.line}</span>
                      </Cluster>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        f.status === "addressed" ? "bg-[var(--success-soft)] text-[var(--success)]"
                        : f.status === "in_progress" ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "bg-[var(--warning-soft)] text-[var(--warning)]",
                      )}>{f.status.replace("_", " ")}</span>
                    </Cluster>
                    <p className="text-sm text-[var(--text-muted)]">&quot;{f.body}&quot;</p>
                    {f.athena_response && (
                      <div className="rounded-md bg-[var(--primary-soft)] p-2 text-sm">
                        <Cluster gap="2" align="center">
                          <ActorAvatar name="Athena" agent size={20} mood="happy" />
                          <span className="font-medium text-[var(--primary)]">Athena · {f.athena_response.at}</span>
                        </Cluster>
                        <p className="mt-1">{f.athena_response.summary}</p>
                        {f.athena_response.commits.map((c) => (
                          <Cluster key={c.sha} gap="2" align="center" className="mt-1 text-xs text-[var(--text-muted)]">
                            <GitCommit className="size-3" />
                            <code className="font-mono">{c.sha}</code>
                            <span>{c.msg}</span>
                          </Cluster>
                        ))}
                      </div>
                    )}
                    {f.status === "awaiting_athena" && (
                      <Card className="border-[var(--border-strong)] bg-[var(--warning-soft)] p-2 text-xs text-[var(--warning)]">
                        Waiting on Athena to draft a response. ETA usually under a minute.
                      </Card>
                    )}
                  </Stack>
                </li>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

    </Stack>
  );
}

/* ================== PRD: Frame ================== */
function FramePhase({ data, onChange, onImprove }: { data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
  const problem = data.problemStatement as string;
  const whyNow = data.whyNow as string;
  const users = (data.affectedUsers as Array<{ id: string; role: string; description: string; impact: string; source: string }>) ?? [];
  const urgency = data.urgency as string;
  const confidence = data.problemConfidence as number;
  const problemCitations = data.problemCitations as Citation[] | undefined;
  const whyNowCitations = data.whyNowCitations as Citation[] | undefined;
  return (
    <Stack gap="4">

      <Card>
        <Stack gap="2">
          <SectionHeader
            title="Problem statement"
            onImprove={onImprove}
            target={{ label: "frame · problem", currentText: problem, onSubmit: async () => { onChange(); } }}
            right={<ConfidenceTag value={confidence} label="confidence" />}
          />
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{problem}</p>
          <CitationsRow items={problemCitations} />
        </Stack>
      </Card>
      <Card>
        <Stack gap="2">
          <SectionHeader
            title="Why now"
            onImprove={onImprove}
            target={{ label: "frame · why now", currentText: whyNow, onSubmit: async () => { onChange(); } }}
            right={<span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", urgency === "high" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>{urgency} urgency</span>}
          />
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{whyNow}</p>
          <CitationsRow items={whyNowCitations} />
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Affected users</span>
          <Stack gap="2" as="ul">
            {users.map((u) => (
              <li key={u.id} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <span className="font-medium">{u.role}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", u.impact === "high" || u.impact === "blocker" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--info-soft)] text-[var(--info)]")}>{u.impact}</span>
                </Cluster>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{u.description}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">Source: {u.source}</p>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>
      <KbCallout sources={data.kbSources as { label: string; kind: string; count: number; icon?: string; detail?: string }[] | undefined} />
    </Stack>
  );
}

/* ================== PRD: Research ================== */
function ResearchPhase({ data, onChange, onImprove }: { data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
  const synthesis = data.synthesis as string;
  const confidence = data.synthesisConfidence as number;
  const breakdown = data.synthesisBreakdown as { pastPrds: number; signals: number; decisions: number } | undefined;
  const pastPrds = (data.pastPrds as { id: string; title: string; date: string; status: string; relevance: string }[]) ?? [];
  const customerSignals = (data.customerSignals as { source: string; count: number; trend: string; summary: string; cite?: Citation }[]) ?? [];
  const relatedDecisions = (data.relatedDecisions as { id: string; title: string; relevance: string }[]) ?? [];
  const resourcesUsed = (data.resourcesUsed as { title: string; kind: string; nodes: number }[]) ?? [];
  const competitiveLandscape = (data.competitiveLandscape as { name: string; supports: string; notes: string; cite?: Citation }[]) ?? [];
  const trendIcon = (t: string) => {
    if (t.startsWith("+")) return <TrendingUp className="size-3 text-[var(--success)]" />;
    if (t.startsWith("-")) return <TrendingDown className="size-3 text-[var(--danger)]" />;
    return <Minus className="size-3 text-[var(--text-muted)]" />;
  };
  return (
    <Stack gap="4">

      <Card>
        <Stack gap="2">
          <SectionHeader
            title="Synthesis"
            onImprove={onImprove}
            target={{ label: "research · synthesis", currentText: synthesis, onSubmit: async () => { onChange(); } }}
            right={<ConfidenceTag value={confidence} label="confidence" />}
          />
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{synthesis}</p>
          {breakdown && (
            <p className="text-xs text-[var(--text-subtle)]">
              Built from {breakdown.pastPrds} past PRD{breakdown.pastPrds === 1 ? "" : "s"} · {breakdown.signals} customer signal{breakdown.signals === 1 ? "" : "s"} · {breakdown.decisions} decision record{breakdown.decisions === 1 ? "" : "s"}.
            </p>
          )}
        </Stack>
      </Card>

      <KbCallout sources={data.kbSources as { label: string; kind: string; count: number; icon?: string; detail?: string }[] | undefined} />

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Past PRDs</span>
          <Stack gap="2" as="ul">
            {pastPrds.map((p) => (
              <li key={p.id} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <Stack gap="0">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-[var(--text-muted)]">{p.date}</span>
                  </Stack>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    p.status === "shipped" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}>{p.status}</span>
                </Cluster>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{p.relevance}</p>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Customer signals</span>
          <Stack gap="2" as="ul">
            {customerSignals.map((s) => (
              <li key={s.source} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <span className="font-medium">{s.source}</span>
                  <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                    <span>{s.count} items</span>
                    <span>·</span>
                    <Cluster gap="1" align="center">
                      {trendIcon(s.trend)}
                      <span>{s.trend}</span>
                    </Cluster>
                  </Cluster>
                </Cluster>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{s.summary}</p>
                {s.cite && <div className="mt-1"><CitationChip c={s.cite} /></div>}
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      {relatedDecisions.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <BookOpen className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">Related decisions</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">constraining this PRD</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {relatedDecisions.map((d) => (
                <li key={d.id} className="rounded-md border border-[var(--border)] p-2 text-sm">
                  <Cluster gap="2" align="center">
                    <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[10px]">{d.id}</code>
                    <span className="font-medium">{d.title}</span>
                  </Cluster>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{d.relevance}</p>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {resourcesUsed.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <Database className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">Resources used</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">{resourcesUsed.reduce((a, r) => a + r.nodes, 0)} nodes pulled</span>
            </Cluster>
            <Stack gap="1" as="ul">
              {resourcesUsed.map((r) => (
                <li key={r.title} className="flex items-center justify-between rounded-md border border-[var(--border)] p-2 text-sm">
                  <Stack gap="0" className="min-w-0">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-xs text-[var(--text-muted)]">{r.kind}</span>
                  </Stack>
                  <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                    <span>{r.nodes} node{r.nodes === 1 ? "" : "s"}</span>
                    <Button size="sm" variant="ghost" onClick={() => toast.info(`Opening ${r.title}…`)}>
                      <ExternalLink className="size-3" />
                      Open
                    </Button>
                  </Cluster>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Competitive landscape</span>
          <Stack gap="2" as="ul">
            {competitiveLandscape.map((c) => (
              <li key={c.name} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{c.supports}</span>
                </Cluster>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{c.notes}</p>
                {c.cite && <div className="mt-1"><CitationChip c={c.cite} /></div>}
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

    </Stack>
  );
}

/* ================== PRD: Draft ================== */
function DraftPhase({ data, onChange, onImprove }: { data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
  const goals = (data.goals as { id: string; text: string; primary: boolean; cites?: Citation[] }[]) ?? [];
  const nonGoals = (data.nonGoals as string[]) ?? [];
  const options = (data.options as { id: string; title: string; recommended: boolean; effort: string; risk: string; duration: string; adoption: string; pros: string[]; cons: string[]; description: string; informedBy?: Citation[] }[]) ?? [];
  const chosenOptionId = data.chosenOptionId as string;
  const rationale = data.chosenRationale as string;
  const metrics = (data.metrics as { id: string; name: string; baseline: string; target: string; owner: string; how?: string; cites?: Citation[] }[]) ?? [];
  const personas = (data.users as { persona: string; goals: string; success: string }[]) ?? [];
  const constraints = (data.constraints as { text: string; cite?: Citation }[]) ?? [];
  const timeline = data.timeline as string | undefined;
  const status = (data.status as "draft" | "needs-review" | "approved") ?? "draft";
  const version = (data.currentVersion as string) ?? "v1";
  const revisions = (data.revisions as DocRevision[]) ?? [];
  const body = data.body as string | undefined;
  const markdown = data.markdown as string | undefined;

  const handleSave = async ({ note }: { markdown: string; note: string }) => {
    toast.success(`Saved new revision · ${note || "no note"}.`);
    onChange();
  };

  const handleOptionPick = async (o: typeof options[number]) => {
    if (o.id === chosenOptionId) return;
    toast.success(`Switched to "${o.title}". Athena will redraft the recommendation section.`, { duration: 5000 });
    onChange();
  };

  return (
    <Stack gap="4">

      <DocShell
        doc="prd.md"
        version={version}
        status={status}
        body={body}
        markdown={markdown}
        revisions={revisions}
        onSave={handleSave}
        headerActions={
          <button
            onClick={(e) => fireImprove(e, onImprove, {
              label: "prd.md",
              currentText: markdown ?? "(no PRD text yet)",
              kind: "spec",
              onSubmit: async () => { onChange(); },
            })}
            className="improve-btn"
          >
            <Wand2 className="size-2.5" />
            Iterate
          </button>
        }
      />

      <KbCallout sources={data.kbSources as { label: string; kind: string; count: number; icon?: string; detail?: string }[] | undefined} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Goals</span>
          <Stack gap="2" as="ul">
            {goals.map((g) => (
              <li key={g.id}>
                <div className="flex items-start gap-2 text-sm">
                  {g.primary
                    ? <span className="mt-0.5 rounded bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--primary-fg)]">Primary</span>
                    : <span className="mt-0.5 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-muted)]">Secondary</span>}
                  <Stack gap="1" className="min-w-0">
                    <span>{g.text}</span>
                    <CitationsRow items={g.cites} />
                  </Stack>
                </div>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Card>
        <Stack gap="2">
          <span className="text-sm font-semibold">Non-goals</span>
          <ul className="space-y-1 text-sm text-[var(--text-muted)]">
            {nonGoals.map((n, i) => <li key={i}>· {n}</li>)}
          </ul>
        </Stack>
      </Card>

      {personas.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <Users className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">Personas &amp; jobs to be done</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {personas.map((p) => (
                <li key={p.persona} className="rounded-md border border-[var(--border)] p-2 text-sm">
                  <span className="font-medium">{p.persona}</span>
                  <Stack gap="0.5" className="mt-1">
                    <span className="text-xs"><strong className="text-[var(--text-subtle)]">Goal:</strong> {p.goals}</span>
                    <span className="text-xs"><strong className="text-[var(--text-subtle)]">Success:</strong> {p.success}</span>
                  </Stack>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {constraints.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">Constraints</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {constraints.map((c, i) => (
                <li key={i} className="rounded-md border border-[var(--border)] p-2 text-sm">
                  <span>{c.text}</span>
                  {c.cite && <div className="mt-1"><CitationChip c={c.cite} /></div>}
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {timeline && (
        <Card>
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <Calendar className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">Timeline</span>
            </Cluster>
            <p className="text-sm text-[var(--text-muted)]">{timeline}</p>
          </Stack>
        </Card>
      )}
      </div>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Options considered</span>
            <span className="text-xs text-[var(--text-muted)]">click an option to switch choice</span>
          </Cluster>
          <Stack gap="2">
            {options.map((o) => {
              const isChosen = o.id === chosenOptionId;
              return (
                <button
                  type="button"
                  key={o.id}
                  onClick={() => handleOptionPick(o)}
                  aria-pressed={isChosen}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isChosen
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] ring-1 ring-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <Stack gap="2">
                    <Cluster justify="between" align="center">
                      <Stack gap="0">
                        <Cluster gap="2" align="center">
                          <span className="text-sm font-semibold">{o.title}</span>
                          {isChosen && <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-fg)]">Chosen</span>}
                          {!isChosen && o.recommended && <span className="rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--info)]">Recommended</span>}
                          {!isChosen && !o.recommended && <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Considered</span>}
                        </Cluster>
                        <span className="text-xs text-[var(--text-muted)]">{o.duration} · effort: {o.effort} · risk: {o.risk}</span>
                      </Stack>
                    </Cluster>
                    <p className="text-sm text-[var(--text-muted)]">{o.description}</p>
                    <Grid cols="2" gap="2">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]">Pros</span>
                        <ul className="space-y-0.5 text-xs text-[var(--text-muted)]">{o.pros.map((p) => <li key={p}>· {p}</li>)}</ul>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]">Cons</span>
                        <ul className="space-y-0.5 text-xs text-[var(--text-muted)]">{o.cons.map((c) => <li key={c}>· {c}</li>)}</ul>
                      </div>
                    </Grid>
                    {o.adoption && (
                      <p className="text-xs text-[var(--text-muted)]"><strong className="text-[var(--text-subtle)]">Adoption read:</strong> {o.adoption}</p>
                    )}
                    {o.informedBy && o.informedBy.length > 0 && (
                      <Stack gap="1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Informed by</span>
                        <CitationsRow items={o.informedBy} />
                      </Stack>
                    )}
                  </Stack>
                </button>
              );
            })}
          </Stack>
        </Stack>
      </Card>

      <Card>
        <Stack gap="2">
          <span className="text-sm font-semibold">Why this option</span>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{rationale}</p>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Success metrics</span>
          <Stack gap="2" as="ul">
            {metrics.map((m) => (
              <li key={m.id} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">owner: {m.owner}</span>
                </Cluster>
                <Cluster gap="2" align="center" className="mt-1 text-xs">
                  <span className="text-[var(--text-muted)]">baseline: <strong className="text-[var(--text)]">{m.baseline}</strong></span>
                  <span className="text-[var(--text-muted)]">target: <strong className="text-[var(--text)]">{m.target}</strong></span>
                </Cluster>
                {m.how && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]"><strong className="text-[var(--text-subtle)]">How we measure:</strong> {m.how}</p>
                )}
                {m.cites && m.cites.length > 0 && (
                  <div className="mt-1"><CitationsRow items={m.cites} /></div>
                )}
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

    </Stack>
  );
}

/* ================== PRD: Sign-off ================== */
function SignoffPhase({ data }: { data: Record<string, unknown> }) {
  const readinessScore = (data.readinessScore as number) ?? 0;
  const breakdown = data.readinessBreakdown as { approved: number; blockers: number; pending: number } | undefined;
  const stakeholders = (data.stakeholders as { name: string; role: string; avatar: string; state: string; comment: string; source?: string; order?: number; nextAction?: string }[]) ?? [];
  const currentUserName = "Demo User";
  const commentThread = (data.commentThread as { author: string; avatar: string; date: string; text: string }[]) ?? [];
  const [reply, setReply] = useState("");

  const handleReply = () => {
    if (!reply.trim()) return;
    toast.success("Reply posted.");
    setReply("");
  };
  const handleNudge = (name: string) => toast.success(`Nudged ${name}. They'll get a Slack DM in a minute.`);

  const pct = Math.round(readinessScore * 100);
  const ringColor = readinessScore >= 0.8 ? "var(--success)" : readinessScore >= 0.6 ? "var(--warning)" : "var(--danger)";
  const ringBg = `conic-gradient(${ringColor} ${pct * 3.6}deg, var(--surface-2) 0)`;

  return (
    <Stack gap="4">

      <Card>
        <Cluster gap="4" align="center">
          <div className="relative flex size-24 shrink-0 items-center justify-center rounded-full" style={{ backgroundImage: ringBg }} role="img" aria-label={`Readiness ${pct}%`}>
            <div className="absolute inset-1.5 flex flex-col items-center justify-center rounded-full bg-[var(--surface)]">
              <span className="text-xl font-bold tabular-nums">{pct}%</span>
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">ready</span>
            </div>
          </div>
          <Stack gap="2" className="flex-1 min-w-0">
            <span className="text-sm font-semibold">Readiness</span>
            {breakdown && (
              <Cluster gap="3" className="text-xs">
                <span><strong className="text-[var(--success)]">{breakdown.approved}</strong> <span className="text-[var(--text-muted)]">approved</span></span>
                <span><strong className="text-[var(--warning)]">{breakdown.blockers}</strong> <span className="text-[var(--text-muted)]">blocker{breakdown.blockers === 1 ? "" : "s"}</span></span>
                <span><strong className="text-[var(--text-muted)]">{breakdown.pending}</strong> <span className="text-[var(--text-muted)]">pending</span></span>
              </Cluster>
            )}
            {breakdown && breakdown.blockers > 0 && (
              <Button size="sm" variant="outline" className="w-fit" onClick={() => toast.info("Iterate flow for blockers — coming up.")}>
                <Wand2 className="size-3.5" />
                Iterate on the blockers
              </Button>
            )}
          </Stack>
        </Cluster>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Stakeholders</span>
            <Button size="sm" variant="ghost" onClick={() => toast.info("Add stakeholder — coming up.")}>
              <Plus className="size-3" />
              Add
            </Button>
          </Cluster>
          <Stack gap="2" as="ul">
            {stakeholders.map((s) => {
              const isYou = s.name === currentUserName;
              const turn: "you" | "them" | "done" =
                isYou && s.state === "owner" ? "you"
                : s.state === "approved" ? "done"
                : "them";
              return (
                <li key={s.name} className="rounded-md border border-[var(--border)] p-2 text-sm">
                  <Cluster justify="between" align="center">
                    <Cluster gap="2" align="center">
                      {typeof s.order === "number" && s.order > 0 && (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-mono text-[10px] font-semibold text-[var(--text-muted)]">#{s.order}</span>
                      )}
                      <div className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold">{s.avatar}</div>
                      <Stack gap="0">
                        <Cluster gap="1.5" align="center">
                          <span className="font-medium">{s.name}</span>
                          {isYou && <span className="rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">you</span>}
                        </Cluster>
                        <span className="text-xs text-[var(--text-muted)]">{s.role}</span>
                      </Stack>
                    </Cluster>
                    <Cluster gap="2" align="center">
                      {(s.state === "pending" || s.state === "changes-requested") && (
                        <Button size="sm" variant="ghost" onClick={() => handleNudge(s.name)}>
                          <Bell className="size-3" />
                          Nudge
                        </Button>
                      )}
                      <Stack gap="0.5" className="items-end">
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          s.state === "approved" ? "bg-[var(--success-soft)] text-[var(--success)]"
                          : s.state === "changes-requested" ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                          : s.state === "owner" ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                        )}>{s.state}</span>
                        <span className={cn(
                          "text-[10px] uppercase tracking-wider",
                          turn === "you" ? "font-semibold text-[var(--primary)]"
                          : turn === "done" ? "text-[var(--success)]"
                          : "text-[var(--text-subtle)]",
                        )}>
                          {turn === "you" ? "Your turn" : turn === "done" ? "Done" : "Their turn"}
                        </span>
                      </Stack>
                    </Cluster>
                  </Cluster>
                  {s.source && (
                    <div className="ml-8 mt-1">
                      <CitationChip c={{ label: s.source, icon: "users" }} />
                    </div>
                  )}
                  {s.nextAction && (
                    <p className="ml-8 mt-1 text-xs text-[var(--primary)]">
                      <strong>Next:</strong> {s.nextAction}
                    </p>
                  )}
                  {s.comment && <p className="ml-8 mt-1 text-xs italic text-[var(--text-muted)]">&quot;{s.comment}&quot;</p>}
                </li>
              );
            })}
          </Stack>
        </Stack>
      </Card>

      {commentThread.length > 0 && (
        <Card>
          <Stack gap="3">
            <span className="text-sm font-semibold">Comments</span>
            <Stack gap="3" as="ul">
              {commentThread.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold">{c.avatar}</div>
                  <Stack gap="0" className="flex-1 min-w-0">
                    <Cluster gap="2" align="center">
                      <span className="font-medium">{c.author}</span>
                      <span className="text-xs text-[var(--text-muted)]">{c.date}</span>
                    </Cluster>
                    <p className="text-[var(--text-muted)]">{c.text}</p>
                  </Stack>
                </li>
              ))}
            </Stack>
            <Stack gap="2" className="border-t border-[var(--border)] pt-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to the thread…"
                rows={2}
                className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm focus:border-[var(--ring)] focus:outline-none"
              />
              <Cluster justify="between" align="center">
                <span className="text-xs text-[var(--text-muted)]">Markdown supported. @ to mention.</span>
                <Button size="sm" disabled={!reply.trim()} onClick={handleReply}>
                  <Send className="size-3" />
                  Post reply
                </Button>
              </Cluster>
            </Stack>
          </Stack>
        </Card>
      )}

    </Stack>
  );
}

function KpiBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/* ================== Clarification SSE listener (no UI) ================== */
/**
 * §5.29.10 Item 2 — Subscribes to the run's SSE feed and fires `onSignal`
 * whenever a clarification lifecycle event lands. Mounted by the page only
 * after `run` is loaded so we never connect on an empty stream URL.
 */
function ClarificationSseListener({
  runId,
  streamUrl,
  runStatus,
  onSignal,
}: {
  runId: string;
  streamUrl: string;
  runStatus: RunDetail["status"];
  onSignal: () => Promise<void> | void;
}) {
  const { clarificationSignal } = useRunStream(runId, streamUrl, runStatus);
  useEffect(() => {
    if (!clarificationSignal) return;
    void onSignal();
  }, [clarificationSignal, onSignal]);
  return null;
}

/* ================== Decisions strip (collapsible, top of task) ================== */
function DecisionsStrip({
  decisions,
  runId,
  onChanged,
}: {
  decisions: TaskDecision[];
  runId: string;
  onChanged: () => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Modal state for inline Add/Update (task-level only — Revert/Escalate
  // live on cap/repo Decisions tabs per the §5.29.10 scoping).
  const [dialogMode, setDialogMode] = useState<"closed" | "create" | "edit">("closed");
  const [editing, setEditing] = useState<TaskDecision | null>(null);
  const latest = decisions[0];

  const openCreate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(null);
    setDialogMode("create");
  };
  const openEdit = (d: TaskDecision) => {
    setEditing(d);
    setDialogMode("edit");
  };
  const handleSaved = async () => {
    await onChanged();
  };

  return (
    <div className={cn("decisions-strip", expanded && "expanded")}>
      <div className="decisions-strip-head" onClick={() => setExpanded((v) => !v)}>
        <span className="chev"><ChevronRight className="size-4" /></span>
        <div className="title">
          <BookOpen className="size-4 text-[var(--primary)]" />
          Decisions
          <span className="count">{decisions.length}</span>
        </div>
        {!expanded && latest ? (
          <div className="peek">
            <strong>Latest:</strong> &quot;{latest.title}&quot; — {latest.who_name} · {latest.when}
          </div>
        ) : (
          <div className="peek">{decisions.length ? "" : "No decisions yet. They are recorded automatically as the task moves."}</div>
        )}
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
        >
          <Plus className="size-3" />
          Add
        </button>
      </div>
      <div className="decisions-body">
        <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
          The team&apos;s choices and constraints — captured automatically from clarifying answers, scope edits, and iterate prompts. Every agent in every phase reads these before generating output.
        </p>
        <div className="decisions-list">
          {decisions.map((d) => (
            <div key={d.id} className={cn("decision-card", `kind-${d.kind}`)}>
              <div className={cn("decision-avatar", d.who_kind === "human" && "human")}>{d.who_avatar}</div>
              <Stack gap="0" className="min-w-0">
                <div className="decision-title">{d.title}</div>
                <div className="decision-row">
                  <span className="decision-phase-pill">{d.phase}</span>
                  <span className="decision-kind-tag">{d.kind}</span>
                  <span><strong className="text-[var(--text)]">{d.who_name}</strong> · {d.when}</span>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span className="text-[var(--text-muted)]">{d.source}</span>
                </div>
                <div className="decision-body">{d.body}</div>
              </Stack>
              <div className="flex items-start">
                <button
                  type="button"
                  onClick={() => openEdit(d)}
                  className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                  aria-label="Edit decision"
                >
                  <Edit3 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DecisionEditDialog
        open={dialogMode !== "closed"}
        onOpenChange={(o) => { if (!o) setDialogMode("closed"); }}
        runId={runId}
        mode={dialogMode === "edit" ? "edit" : "create"}
        existing={dialogMode === "edit" ? editing : null}
        onSaved={handleSaved}
      />
    </div>
  );
}

/* ================== Phase actions cluster (lives in task header top-right) ================== */
function PhaseActionsCluster({ runId, phaseKey, status, onChange }: {
  runId: string;
  phaseKey: string;
  status: "idle" | "running" | "needs-review" | "approved" | "blocked";
  onChange: () => void;
}) {
  const handle = async (action: "approve" | "rerun" | "reopen" | "generate") => {
    try {
      if (action === "approve") {
        await api.runs.approveGate(runId, phaseKey);
        toast.success("Phase approved — Athena advances.");
      } else if (action === "reopen") {
        await api.runs.rejectGate(runId, phaseKey, "Re-opened for changes");
        toast.success("Phase re-opened.");
      } else if (action === "generate") {
        await api.runs.regenerate(runId, phaseKey, "default");
        toast.success("Generating…");
      } else {
        await api.runs.rejectGate(runId, phaseKey, "Re-run requested");
        toast.success("Re-running this phase.");
      }
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed.");
    }
  };

  const statusText =
    status === "approved" ? "This phase is locked in. Athena has moved on."
    : status === "needs-review" ? "Athena drafted this. Read it, edit if needed, then approve to advance."
    : status === "running" ? "Athena is working on this phase."
    : status === "blocked" ? "Blocked — resolve the open items before approving."
    : "Not started yet. Click Generate to have Athena draft this phase.";

  return (
    <Cluster gap="2" align="center" className="lg:justify-end">
      <span className={cn("phase-status-pill", `s-${status}`)} title={statusText} aria-label={statusText}>
        {status === "approved" && <CheckCircle2 className="size-3" />}
        {status === "running" && <Loader2 className="size-3 animate-spin" />}
        {status === "needs-review" && <Eye className="size-3" />}
        {status === "blocked" && <XCircle className="size-3" />}
        {status === "idle" && <Circle className="size-3" />}
        {phaseStatusLabel(status)}
      </span>
      {status === "idle" && (
        <Button size="sm" onClick={() => handle("generate")}>
          <Sparkles className="size-3.5" />
          Generate
        </Button>
      )}
      {status === "running" && (
        <Button variant="outline" size="sm" onClick={() => handle("rerun")}>
          <RotateCcw className="size-3.5" />
          Re-run
        </Button>
      )}
      {(status === "needs-review" || status === "blocked") && (
        <>
          <Button variant="outline" size="sm" onClick={() => handle("rerun")}>
            <RotateCcw className="size-3.5" />
            Re-run
          </Button>
          <Button size="sm" disabled={status === "blocked"} onClick={() => handle("approve")}>
            <CheckCircle2 className="size-3.5" />
            Approve &amp; advance
          </Button>
        </>
      )}
      {status === "approved" && (
        <Button variant="outline" size="sm" onClick={() => handle("reopen")}>
          <RotateCcw className="size-3.5" />
          Re-open
        </Button>
      )}
    </Cluster>
  );
}

/* ================== Activity drawer (slide-over, default closed) ================== */
function ActivityDrawer({ open, taskId, onClose }: { open: boolean; taskId: string; onClose: () => void }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [showTech, setShowTech] = useState(false);
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const page = await api.activity.list({ limit: 20 });
        setItems(page.items.filter((a) => !a.task_id || a.task_id === taskId).slice(0, 20));
      } catch { /* ignore */ }
    })();
  }, [open, taskId]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close activity"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px] animate-in fade-in"
      />
      <aside
        role="dialog"
        aria-label="Task activity"
        className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl animate-in slide-in-from-right"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <Cluster gap="2" align="center">
            <Activity className="size-4 text-[var(--text-muted)]" />
            <h3 className="text-sm font-semibold">Activity</h3>
          </Cluster>
          <Cluster gap="2" align="center">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={showTech}
                onChange={(e) => setShowTech(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              Show tech
            </label>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close activity drawer"
              className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <XCircle className="size-4" />
            </button>
          </Cluster>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No activity yet on this task.</p>
          ) : (
            <Stack gap="3" as="ul">
              {items.map((a) => (
                <li key={a.id} className="flex gap-2 text-xs">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: a.who_kind === "agent" ? "var(--primary)" : "var(--success)" }} />
                  <Stack gap="0" className="min-w-0 flex-1">
                    {showTech ? (
                      <code className="font-mono text-[11px] text-[var(--text-muted)]">{a.tech}</code>
                    ) : (
                      <span className="text-[var(--text)]">
                        <strong>{a.who}</strong> <span dangerouslySetInnerHTML={{ __html: a.text_html }} />
                      </span>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{a.when}</span>
                  </Stack>
                </li>
              ))}
            </Stack>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ================== Participants card (right column) ================== */
function ParticipantsCard({ run }: { run: RunDetail }) {
  const raw = [
    { name: run.requested_by, role: "Requester",     agent: false },
    { name: "Athena",         role: "Agent",         agent: true  },
    { name: "Avi Patel",      role: "Eng reviewer",  agent: false },
    { name: "Priya Shah",     role: "Spec approver", agent: false },
  ];
  // De-dup by name so requested_by + spec_approver overlap collapses.
  const seen = new Set<string>();
  const participants = raw.filter((p) => seen.has(p.name) ? false : (seen.add(p.name), true));
  return (
    <Card>
      <Stack gap="3">
        <span className="text-[13px] font-semibold">Participants</span>
        <Stack gap="2" as="ul">
          {participants.map((p) => (
            <li key={p.name} className="flex items-center gap-2.5">
              <ActorAvatar name={p.name} agent={p.agent} size={28} />
              <Stack gap="0" className="min-w-0">
                <span className="text-[13px] font-semibold leading-tight">{p.name}</span>
                <span className="text-[11.5px] text-[var(--text-muted)]">{p.role}</span>
              </Stack>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/* ================== Cost / runtime card (right column) ================== */
function CostRuntimeCard({ run }: { run: RunDetail }) {
  return (
    <Card>
      <Stack gap="2">
        <span className="text-[13px] font-semibold">Cost &amp; runtime</span>
        <div className="grid grid-cols-2 gap-3">
          <KpiBlockTall label="Spent"    value={`$${run.spent_usd.toFixed(2)}`} />
          <KpiBlockTall label="Tokens"   value="42k" />
          <KpiBlockTall label="Started"  value={formatRelativeTime(run.created_at)} />
          <KpiBlockTall label="ETA"      value="~ 2h" />
        </div>
      </Stack>
    </Card>
  );
}

function KpiBlockTall({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      <span className="text-[18px] font-bold tabular-nums">{value}</span>
    </Stack>
  );
}
