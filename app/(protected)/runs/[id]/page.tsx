"use client";

/**
 * /runs/[id] — run (a.k.a. task) detail page.
 *
 * Two phase tracks rendered by `kind`:
 *   - Implementation tasks (6 phases): Spec → Plan → Implement → Review → CI → PR
 *   - PRD tasks (4 phases):            Frame → Research → Draft → Sign-off
 *
 * The active phase's output is rendered by `<DocumentPhaseContent>`
 * (`components/runs/phases/phase-content`), which reads the latest
 * `documents` row for that phase and renders its markdown + citation chips
 * + per-section feedback. Per-phase clarifying questions sit above it; the
 * approve / reject / re-open gates live in `<PhaseActionsCluster>` in the
 * task header.
 */

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye, FileText, GitPullRequest, Hammer, ListTree, ShieldCheck,
  Target, Search, Users,
  AlertTriangle, CheckCircle2, Circle,
  Loader2, MessageCircle, RotateCcw, Sparkles, XCircle, Edit3, Trash2,
  BookOpen, ChevronRight, Plus, ChevronDown,
  Link as LinkIcon,
  Share2, Activity,
} from "lucide-react";

import {
  api, ApiError,
  type RunDetail, type TaskDecision, type ActivityItem,
  type RunClarification,
  type ClarificationAnswer,
} from "@/lib/api/client";
import { approveGate, rejectGate, phaseToGateKey } from "@/lib/api/gates";
import { GateBanner } from "@/components/runs/gates/gate-banner";
import { useMascotStore } from "@/lib/stores/mascot";
import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveActivityStrip } from "@/components/runs/live-activity-strip";
import { ProviderFallbackPill } from "@/components/runs/provider-fallback-pill";
import { DecisionEditDialog } from "@/components/runs/decision-edit-dialog";
import { useRunStream, isRunCancellable, isRunDeletable } from "@/features/runs/use-run-stream";
import { renderClarificationInput } from "@/components/runs/clarifications/common";
import { ScopeCollisionsModal } from "@/components/runs/scope-collisions-modal";
import { CancelRunModal } from "@/components/runs/cancel-run-modal";
import { DeleteRunModal } from "@/components/runs/delete-run-modal";
import { PhaseContent as DocumentPhaseContent } from "@/components/runs/phases/phase-content";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { formatRelativeTime, formatUsd } from "@/lib/utils/format";
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
  const [activityOpen, setActivityOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  // Cancel — close the confirm modal, toast, and re-fetch so the header
  // controls collapse to the terminal (cancelled) state. The agent-worker
  // sees the durable cancelled status at its next phase boundary and stops.
  const handleCancelled = useCallback(() => {
    setCancelOpen(false);
    toast.success("Task cancelled — Athena has stopped.");
    void loadRun();
  }, [loadRun]);

  // Delete is permanent + terminal-only — the task no longer exists, so we
  // leave the (now-404) detail page and return to the task list.
  const handleDeleted = useCallback(() => {
    setDeleteOpen(false);
    toast.success("Task deleted.");
    router.push("/runs");
  }, [router]);

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
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger-ink)]">{error}</p></Card>
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

      {/* §3.6 r6 — Approval-gate banner. Renders only when there is a
       * pending gate on this run; otherwise the hook returns null and the
       * section collapses. Sits above the phase rail so the awaiting
       * decision is the first thing the eye lands on. The per-phase
       * inline approve / reject buttons inside <PhaseActionsCluster>
       * remain — banner is the page-level surface for the active gate,
       * inline buttons are for per-phase rerun. */}
      <GateBanner run={run} />

      {cancelOpen && (
        <CancelRunModal
          runId={run.id}
          onClose={() => setCancelOpen(false)}
          onCancelled={handleCancelled}
        />
      )}

      {deleteOpen && (
        <DeleteRunModal
          runId={run.id}
          onClose={() => setDeleteOpen(false)}
          onDeleted={handleDeleted}
        />
      )}

      {/* === Task header card (mock-v2 .task-header) === */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <Stack gap="2" className="min-w-0 flex-1">
            <Cluster gap="2" align="center" className="flex-wrap">
              <span className={cn("pill", run.kind === "prd" ? "pill-warning" : "pill-info")}>
                <span className="dot" />
                {run.kind === "prd" ? "Change request / PRD" : "Implementation"}
              </span>
              <span className="pill pill-live pill-info">
                <span className="dot" />
                {phaseLabel} · {run.progress}%
              </span>
              {/* Readiness §5.28 row 1782 — over-cap queued badge. Renders only
               * when the BE-surfaced queueing_reason flips to "org_cap_reached"
               * (a fresh `queued` with no reason stays a plain status pill). */}
              {run.status === "queued" && run.queueing_reason === "org_cap_reached" && (
                <span
                  className="pill pill-info"
                  data-testid="queued-slot-frees-badge"
                  role="status"
                  aria-live="polite"
                  title="This org is at its concurrent-run cap. The run will start automatically when an earlier run finishes."
                >
                  <span className="dot" />
                  Queued — will start when a slot frees
                </span>
              )}
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
              <span className="pill">{formatUsd(run.spent_usd)}</span>
              <ProviderFallbackPill runId={run.id} />
            </Cluster>
          </Stack>
          <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
            <PhaseActionsCluster runId={run.id} phaseKey={activePhase} status={runStatusToPhaseStatus(run)} onChange={loadRun} />
            <Cluster gap="2" className="lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setActivityOpen(true)} aria-haspopup="dialog">
                <Activity className="size-3.5" />
                Activity
              </Button>
              <ShareMenu />
              {/* Cancel a non-terminal run. Stops the agent (the worker reads
                * the durable cancelled status at its next phase boundary), not
                * just the UI. Hidden once the run is terminal. */}
              {isRunCancellable(run.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  aria-haspopup="dialog"
                  data-testid="cancel-run-button"
                  className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  <XCircle className="size-3.5" />
                  Cancel
                </Button>
              )}
              {/* Permanently delete a terminal run. Mutually exclusive with
                * Cancel above (cancel an active run first, then delete the
                * finished record). Irreversible — confirmed in the modal. */}
              {isRunDeletable(run.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  aria-haspopup="dialog"
                  data-testid="delete-run-button"
                  className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              )}
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
       * The left column shows the per-phase "Clarifying questions" box above
       * the canonical document view (`<DocumentPhaseContent>`, which reads the
       * latest `documents` row for the active phase and renders its markdown +
       * citation chips + per-section feedback). Clarifications surface inline
       * here, not via a modal or page-level pause card. Decisions surface only
       * via the `<DecisionsStrip>` above; there is no second decisions tab. The
       * right column always shows the Info pane (participants + cost). */}
      <div className="mt-4 grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <Stack gap="4">
          <ClarifyingQuestions
            clarifications={clarifications.filter((c) => c.phase_key === activePhase)}
            phaseKey={activePhase}
            onSubmit={handleClarificationSubmit}
            onSkip={handleClarificationSkip}
            onDefer={handleClarificationDefer}
          />
          <DocumentPhaseContent runId={run.id} activePhase={activePhase} />
        </Stack>
        <Stack gap="4">
          <ParticipantsCard run={run} />
          <CostRuntimeCard run={run} />
        </Stack>
      </div>

      <ActivityDrawer open={activityOpen} taskId={run.id} onClose={() => setActivityOpen(false)} />
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
            <AlertTriangle className="size-4 text-[var(--warning-ink)]" aria-hidden />
            <span className="text-sm font-semibold text-[var(--warning-ink)]">
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

function runStatusToPhaseStatus(run: RunDetail): "idle" | "running" | "needs-review" | "approved" | "blocked" {
  if (run.status === "running")   return "running";
  if (run.status === "queued")    return "idle";
  if (run.status === "failed")    return "blocked";
  if (run.status === "cancelled") return "blocked";
  // Completed → if last phase, approved; else needs-review.
  return "needs-review";
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
          <MessageCircle className={cn("size-4", hasPending ? "text-[var(--warning-ink)]" : "text-[var(--text-muted)]")} />
          <span className="text-sm font-semibold">Clarifying questions</span>
          {hasPending && (
            <span className="rounded-full bg-[var(--warning)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-fg)]">
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
                      <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger-ink)]">
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
                      c.status === "answered" ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                      : c.status === "skipped" ? "bg-[var(--surface-2)] text-[var(--text-subtle)]"
                      : "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
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
                      <CheckCircle2 className="size-3.5 text-[var(--success-ink)]" />
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

/** Share menu — surfaces copy-link on the task header. */
function ShareMenu() {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "Copy link",          icon: LinkIcon,      action: () => { void navigator.clipboard?.writeText(window.location.href); toast.success("Link copied to clipboard."); } },
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
          <div role="menu" className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-2)]">
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
      if (action === "generate") {
        await api.runs.phases.rerun(runId, phaseKey);
        toast.success("Generating…");
      } else {
        // approve / rerun / reopen all hit the gate endpoint — translate
        // the FE phase key into the canonical BE gate_key first.
        const gateKey = phaseToGateKey(phaseKey);
        if (!gateKey) {
          toast.error(`No approval gate is associated with this phase.`);
          return;
        }
        if (action === "approve") {
          await approveGate(runId, gateKey);
          toast.success("Phase approved — Athena advances.");
        } else if (action === "reopen") {
          await rejectGate(runId, gateKey, "Re-opened for changes");
          toast.success("Phase re-opened.");
        } else {
          await rejectGate(runId, gateKey, "Re-run requested");
          toast.success("Re-running this phase.");
        }
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
        className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[1px] animate-in fade-in"
      />
      <aside
        role="dialog"
        aria-label="Task activity"
        className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-3)] animate-in slide-in-from-right"
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
    { name: run.requested_by, role: "Requester", agent: false },
    { name: "Athena",         role: "Agent",     agent: true  },
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
          <KpiBlockTall label="Spent"    value={formatUsd(run.spent_usd)} />
          <KpiBlockTall label="Started"  value={formatRelativeTime(run.created_at)} />
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
