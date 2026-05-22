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
  AlertTriangle, Bot, CheckCircle2, Circle, ExternalLink, GitCommit,
  Lightbulb, Loader2, MessageCircle, RotateCcw, Sparkles, Wand2, XCircle, Edit3,
  BookOpen, ChevronRight, Plus,
  type LucideIcon,
} from "lucide-react";

import {
  api, ApiError,
  type RunDetail, type PrFeedbackItem, type TaskDecision, type ActivityItem,
} from "@/lib/api/client";
import { useMascotStore } from "@/lib/stores/mascot";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { CostPill } from "@/components/runs/cost-pill";
import { RunStreamPanel } from "@/components/runs/run-stream-panel";
import { DocShell, type DocRevision } from "@/components/docs/doc-shell";
import { ImproveDrawer, type ImproveTarget } from "@/components/docs/improve-drawer";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

const STATUS_MAP: Record<RunDetail["status"], Status> = {
  queued: "queued", running: "running", completed: "completed", failed: "failed", cancelled: "cancelled",
};

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
  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);

  useEffect(() => { setScreenDefault("thinking"); }, [setScreenDefault]);

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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load run");
    }
  }, [id, activePhase]);

  useEffect(() => { void loadRun(); }, [loadRun]);

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
          <Cluster gap="2" className="shrink-0">
            <Button variant="outline" size="sm" onClick={() => handlePhaseAction("rerun", run.id, activePhase, loadRun)}>
              <RotateCcw className="size-3.5" />
              Re-run this phase
            </Button>
            <Button size="sm" onClick={() => handlePhaseAction("approve", run.id, activePhase, loadRun)}>
              <CheckCircle2 className="size-3.5" />
              Approve this phase
            </Button>
          </Cluster>
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
      <DecisionsStrip decisions={decisions} />

      {/* === Phase content + right column === */}
      <div className="grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <Stack gap="4">
          <PhaseContent runId={run.id} phaseKey={activePhase} run={run} onChange={loadRun} onImprove={setImproveTarget} />
          <PhaseApproveBar runId={run.id} phaseKey={activePhase} status={runStatusToPhaseStatus(run)} onChange={loadRun} />
        </Stack>
        <Stack gap="4">
          <TaskActivityRail taskId={run.id} />
          <ParticipantsCard run={run} />
          <CostRuntimeCard run={run} />
        </Stack>
      </div>

      <ImproveDrawer target={improveTarget} onClose={() => setImproveTarget(null)} />
    </Stack>
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

async function handlePhaseAction(action: "rerun" | "approve", runId: string, phaseKey: string, onChange: () => void) {
  try {
    if (action === "approve") await api.runs.approveGate(runId, phaseKey);
    else                       await api.runs.rejectGate(runId, phaseKey, "Re-run requested");
    toast.success(action === "approve" ? "Phase approved." : "Re-running this phase…");
    onChange();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Action failed.");
  }
}

type ImproveHandler = (target: ImproveTarget | null) => void;

/** Helper: extract the anchor rect from the click event + dispatch open. */
function fireImprove(
  e: React.MouseEvent<HTMLElement>,
  onImprove: ImproveHandler,
  fields: Omit<ImproveTarget, "anchor">,
) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  onImprove({
    ...fields,
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

/** Section header with an inline "Improve" pill that scopes the drawer to that section. */
function SectionHeader({ title, onImprove, target, right }: {
  title: string;
  onImprove?: ImproveHandler;
  target?: Omit<ImproveTarget, "anchor">;
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
            Improve
          </button>
        )}
      </Cluster>
    </Cluster>
  );
}

/* -------------------------------------------------- Phase rail (mock-v2 style) */
function PhaseRail({
  phases, activeKey, currentIdx, onSelect, status,
}: {
  phases: ReadonlyArray<{ key: string; label: string; icon: LucideIcon }>;
  activeKey: string;
  currentIdx: number;
  onSelect: (key: string) => void;
  status: "idle" | "running" | "needs-review" | "approved" | "blocked";
}) {
  const statusPill = (() => {
    switch (status) {
      case "running":      return { text: "Athena working",     tone: "bg-[var(--primary-soft)] text-[var(--primary)]"  };
      case "needs-review": return { text: "Needs your review",  tone: "bg-[var(--warning-soft)] text-[var(--warning)]" };
      case "approved":     return { text: "Approved",            tone: "bg-[var(--success-soft)] text-[var(--success)]" };
      case "blocked":      return { text: "Blocked",             tone: "bg-[var(--danger-soft)] text-[var(--danger)]"  };
      default:             return { text: "Not started",         tone: "bg-[var(--surface-2)] text-[var(--text-muted)]" };
    }
  })();

  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", statusPill.tone)}>
          {statusPill.text}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          Phase {currentIdx + 1} of {phases.length} · {phases[Math.min(currentIdx, phases.length - 1)]?.label}
        </span>
      </Cluster>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
        <ol className="flex items-stretch gap-1">
          {phases.map((p, i) => {
            const isPast = i < currentIdx;
            const isCurrent = i === currentIdx;
            const isActive = p.key === activeKey;
            const num = String(i + 1).padStart(2, "0");
            return (
              <li key={p.key} className="flex flex-1 items-center gap-0">
                <button
                  onClick={() => onSelect(p.key)}
                  className={cn(
                    "group flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isActive ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                  )}
                >
                  <span className={cn(
                    "relative flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold transition-all",
                    isPast    ? "bg-[var(--success)] text-white"
                    : isCurrent ? "bg-[var(--primary)] text-[var(--primary-fg)] phase-current ring-2 ring-[var(--primary-soft)]"
                    : isActive  ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}>
                    {isPast ? <CheckCircle2 className="size-3.5" /> : num}
                  </span>
                  <Stack gap="0" className="min-w-0">
                    <span className="truncate text-sm font-medium leading-tight">{p.label}</span>
                    <span className="truncate text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                      {isPast ? "Done" : isCurrent ? "Current" : "Up next"}
                    </span>
                  </Stack>
                </button>
                {i < phases.length - 1 && (
                  <span className={cn(
                    "hidden h-0.5 w-3 rounded-full sm:block",
                    isPast ? "bg-[var(--success)]" : "bg-[var(--border)]",
                  )} />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Stack>
  );
}

/* -------------------------------------------------- Decisions rail (right column) */
function DecisionsRail({ decisions }: { decisions: TaskDecision[] }) {
  const [expanded, setExpanded] = useState(false);
  if (decisions.length === 0) return null;
  const visible = expanded ? decisions : decisions.slice(0, 4);
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <span className="text-sm font-semibold">Decisions log</span>
          <span className="text-xs text-[var(--text-muted)]">{decisions.length} total</span>
        </Cluster>
        <Stack gap="2" as="ul">
          {visible.map((d) => (
            <li key={d.id} className={cn(
              "pl-2",
              d.kind === "clarify"   && "border-l-2 border-[var(--warning)]",
              d.kind === "iterate"   && "border-l-2 border-[var(--primary)]",
              d.kind === "selection" && "border-l-2 border-[var(--success)]",
              d.kind === "manual"    && "border-l-2 border-[var(--border-strong)]",
            )}>
              <Cluster gap="2" align="center">
                <ActorAvatar name={d.who_name} initials={d.who_avatar} agent={d.who_kind === "agent"} size={20} />
                <span className="text-xs font-medium">{d.title}</span>
              </Cluster>
              <p className="ml-7 mt-0.5 text-xs text-[var(--text-muted)]">{d.body}</p>
              <Cluster gap="2" align="center" className="ml-7 mt-0.5 text-[10px] text-[var(--text-subtle)]">
                <span>{d.who_name}</span>
                <span>·</span>
                <span>{d.phase}</span>
                <span>·</span>
                <span>{d.when}</span>
              </Cluster>
            </li>
          ))}
        </Stack>
        {decisions.length > 4 && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs font-medium text-[var(--primary)] hover:underline">
            {expanded ? "Show fewer" : `Show all ${decisions.length}`}
          </button>
        )}
      </Stack>
    </Card>
  );
}

/* -------------------------------------------------- Phase content router */
function PhaseContent({ runId, phaseKey, run, onChange, onImprove }: {
  runId: string; phaseKey: PhaseKey; run: RunDetail; onChange: () => void; onImprove: ImproveHandler;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const result = await api.runs.phaseData(runId, phaseKey);
        if (!cancelled) setData(result.data);
      } catch { if (!cancelled) setData(null); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [runId, phaseKey]);

  if (loading) {
    return <Card><Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading {phaseKey}…</span></Cluster></Card>;
  }

  const props = { runId, data: data ?? {}, onChange };
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
}

/* ================== Shared helpers ================== */

function PhaseDocHeader({ doc, version, status, onApprove, onReopen, onRegenerate }: {
  doc: string; version: string; status: string;
  onApprove?: () => void;
  onReopen?: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <Card>
      <Cluster justify="between" align="center">
        <Cluster gap="3" align="center">
          <FileText className="size-4 text-[var(--text-muted)]" />
          <Stack gap="0">
            <span className="text-sm font-semibold">{doc}</span>
            <span className="text-xs text-[var(--text-muted)]">current revision: {version}</span>
          </Stack>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            status === "approved" ? "bg-[var(--success-soft)] text-[var(--success)]"
            : status === "draft" ? "bg-[var(--primary-soft)] text-[var(--primary)]"
            : status === "needs-review" ? "bg-[var(--warning-soft)] text-[var(--warning)]"
            : "bg-[var(--surface-2)] text-[var(--text-muted)]",
          )}>{status.replace("-", " ")}</span>
        </Cluster>
        <Cluster gap="2">
          {status === "approved" && onReopen && (
            <Button variant="outline" size="sm" onClick={onReopen}>
              <RotateCcw className="size-3.5" />
              Re-open for changes
            </Button>
          )}
          {onRegenerate && (
            <Button variant="outline" size="sm" onClick={onRegenerate}>
              <Wand2 className="size-3.5" />
              Regenerate
            </Button>
          )}
          {status !== "approved" && onApprove && (
            <Button size="sm" onClick={onApprove}>
              <CheckCircle2 className="size-3.5" />
              Approve
            </Button>
          )}
        </Cluster>
      </Cluster>
    </Card>
  );
}

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
              {s.detail && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{s.detail}</p>}
            </li>
          ))}
        </ul>
      </Stack>
    </Card>
  );
}

function ClarifyingQuestions({ runId, phaseKey, questions, onChange }: {
  runId: string; phaseKey: string;
  questions: Array<{
    id: string; status: "answered" | "pending";
    question: string; context: string;
    suggestedAnswers: { id: string; label: string; description: string }[];
    chosen: string | null; answer: string | null; answeredBy: string | null; answeredAt: string | null;
  }> | undefined;
  onChange: () => void;
}) {
  if (!questions || questions.length === 0) return null;
  const answerQ = async (qid: string, choice: string) => {
    try {
      await api.runs.answerClarifyingQuestion(runId, phaseKey, qid, choice);
      toast.success("Athena will incorporate your answer.");
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save your answer.");
    }
  };
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <MessageCircle className="size-4 text-[var(--text-muted)]" />
          <span className="text-sm font-semibold">Clarifying questions</span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{questions.filter((q) => q.status === "pending").length} pending</span>
        </Cluster>
        <Stack gap="3" as="ul">
          {questions.map((q) => (
            <li key={q.id} className="rounded-md border border-[var(--border)] p-3">
              <Stack gap="2">
                <Cluster justify="between" align="start">
                  <span className="text-sm font-medium">{q.question}</span>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    q.status === "answered" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--warning-soft)] text-[var(--warning)]",
                  )}>{q.status}</span>
                </Cluster>
                <p className="text-xs text-[var(--text-muted)]">{q.context}</p>
                {q.status === "answered" ? (
                  <Card className="border-[var(--border-strong)] bg-[var(--success-soft)] p-2">
                    <Cluster gap="2" align="center">
                      <CheckCircle2 className="size-3.5 text-[var(--success)]" />
                      <span className="text-xs"><strong>{q.answeredBy}</strong> · {q.answeredAt} — {q.answer}</span>
                    </Cluster>
                  </Card>
                ) : (
                  <Stack gap="1">
                    {q.suggestedAnswers.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => answerQ(q.id, a.id)}
                        className="rounded-md border border-[var(--border)] p-2 text-left text-sm hover:border-[var(--ring)] hover:bg-[var(--surface-2)]"
                      >
                        <span className="font-medium">{a.label}</span>
                        <p className="text-xs text-[var(--text-muted)]">{a.description}</p>
                      </button>
                    ))}
                  </Stack>
                )}
              </Stack>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function RegenerateOptions({ runId, phaseKey, options, onChange }: {
  runId: string; phaseKey: string;
  options: { id: string; label: string; description: string }[] | undefined;
  onChange: () => void;
}) {
  if (!options || options.length === 0) return null;
  const pick = async (opt: string) => {
    try {
      await api.runs.regenerate(runId, phaseKey, opt);
      toast.success("Regenerating — Athena will post a new revision shortly.");
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Regenerate failed.");
    }
  };
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <Wand2 className="size-4 text-[var(--text-muted)]" />
          <span className="text-sm font-semibold">Don&apos;t love it? Regenerate with…</span>
        </Cluster>
        <Stack gap="2">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              className="rounded-md border border-[var(--border)] p-3 text-left hover:border-[var(--ring)] hover:bg-[var(--surface-2)]"
            >
              <span className="text-sm font-medium">{o.label}</span>
              <p className="text-xs text-[var(--text-muted)]">{o.description}</p>
            </button>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/* ================== Spec phase ================== */
function SpecPhase({ runId, data, run, onChange, onImprove }: { runId: string; data: Record<string, unknown>; run: RunDetail; onChange: () => void; onImprove: ImproveHandler }) {
  const doc = (data.doc as string) ?? "spec.md";
  const version = (data.currentVersion as string) ?? "v1";
  const status = (data.status as "draft" | "needs-review" | "approved") ?? "draft";
  const revisions = (data.revisions as DocRevision[]) ?? [];
  const body = data.body as string | undefined;
  const markdown = data.markdown as string | undefined;
  const capabilitiesDetected = (data.capabilitiesDetected as Array<{ id: string; confidence: number; primary: boolean; why: string; files: number }>) ?? [];
  const blastRadius = data.blastRadius as { repos: { id: string; files: number; kind: string; desc: string }[]; services?: { name: string; impact: string; risk: string }[]; dataStores?: { name: string; impact: string; risk: string }[] } | undefined;
  const approvedBy = (data.approvedBy as { name: string; role: string; avatar?: string }[]) ?? [];

  const handleApprove = async () => {
    try { await api.runs.approveGate(runId, "spec"); toast.success("Spec approved."); onChange(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Approve failed."); }
  };
  const handleReopen = async () => {
    try { await api.runs.rejectGate(runId, "spec", "Re-opened for changes."); toast.success("Spec re-opened."); onChange(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Re-open failed."); }
  };
  const handleSave = async ({ note }: { markdown: string; note: string }) => {
    toast.success(`Saved new revision · ${note || "no note"}.`);
    onChange();
  };

  return (
    <Stack gap="4">
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
          <Cluster gap="2">
            <Button variant="ghost" size="sm" onClick={(e) => fireImprove(e, onImprove, {
              label: "spec.md",
              currentText: markdown ?? run.summary,
              kind: "spec",
              onSubmit: async () => { onChange(); },
            })}>
              <Wand2 className="size-3.5" />
              Improve
            </Button>
            {status === "approved"
              ? <Button variant="outline" size="sm" onClick={handleReopen}><RotateCcw className="size-3.5" />Re-open for changes</Button>
              : <Button size="sm" onClick={handleApprove}><CheckCircle2 className="size-3.5" />Approve</Button>}
          </Cluster>
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
              <span className="text-xs text-[var(--text-muted)]">Athena&apos;s detection</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {capabilitiesDetected.map((c) => (
                <li key={c.id} className="rounded-md border border-[var(--border)] p-2 text-sm">
                  <Cluster justify="between" align="center">
                    <Cluster gap="2" align="center">
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
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {blastRadius && (
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">Blast radius</span>
            </Cluster>
            <Stack gap="2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Repos</span>
              <Stack gap="1" as="ul">
                {blastRadius.repos.map((r) => (
                  <li key={r.id} className="text-sm">
                    <Cluster justify="between" align="center">
                      <Cluster gap="2" align="center">
                        <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase", r.kind === "create" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>{r.kind}</span>
                        <span className="font-medium">{r.id}</span>
                      </Cluster>
                      <span className="text-xs text-[var(--text-muted)]">{r.files} file{r.files === 1 ? "" : "s"}</span>
                    </Cluster>
                    <p className="text-xs text-[var(--text-subtle)]">{r.desc}</p>
                  </li>
                ))}
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
          </Stack>
        </Card>
      )}

      <ClarifyingQuestions
        runId={runId}
        phaseKey="spec"
        questions={data.clarifyingQuestions as Parameters<typeof ClarifyingQuestions>[0]["questions"]}
        onChange={onChange}
      />

      <RegenerateOptions runId={runId} phaseKey="spec" options={data.regenerateOptions as { id: string; label: string; description: string }[] | undefined} onChange={onChange} />
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
function PlanPhase({ runId, data, onChange, onImprove }: { runId: string; data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
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
  }>) ?? [];

  const status = (data.status as "draft" | "needs-review" | "approved") ?? "draft";
  const version = (data.currentVersion as string) ?? "v1";
  const revisions = (data.revisions as DocRevision[]) ?? [];
  const body = data.body as string | undefined;
  const markdown = data.markdown as string | undefined;

  const handleApprove = async () => {
    try { await api.runs.approveGate(runId, "plan"); toast.success("Plan approved."); onChange(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Approve failed."); }
  };
  const handleReopen = async () => {
    try { await api.runs.rejectGate(runId, "plan", "Re-opened for changes."); toast.success("Plan re-opened."); onChange(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Re-open failed."); }
  };
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
          <Cluster gap="2">
            <Button variant="ghost" size="sm" onClick={(e) => fireImprove(e, onImprove, {
              label: "plan.md",
              currentText: markdown ?? "(no plan text yet)",
              kind: "plan",
              onSubmit: async () => { onChange(); },
            })}>
              <Wand2 className="size-3.5" />
              Improve
            </Button>
            {status === "approved"
              ? <Button variant="outline" size="sm" onClick={handleReopen}><RotateCcw className="size-3.5" />Re-open</Button>
              : <Button size="sm" onClick={handleApprove}><CheckCircle2 className="size-3.5" />Approve</Button>}
          </Cluster>
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
                </Cluster>
                <p className="text-sm text-[var(--text)]">{c.plainEnglish}</p>
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]">Technical detail</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-[var(--code-bg)] p-2 font-mono text-[11px]">{c.technical}</pre>
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
                        <span className={cn("mr-1 inline-block rounded px-1 py-0.5 text-[9px] font-semibold uppercase", f.change === "create" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--info-soft)] text-[var(--info)]")}>{f.change}</span>
                        <code className="font-mono">{f.name}</code>
                      </li>
                    ))}
                  </ul>
                </details>
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
                <p className="text-xs text-[var(--text-muted)]">Read: row C<em>n</em> depends on column C<em>m</em>. <span className="text-[var(--primary)]">→</span> means "must land first".</p>
              </Stack>
            </Card>
          )}
        </Stack>
      )}

      {tab === "consequences" && consequences && (
        <Stack gap="3">
          <Card>
            <Stack gap="2">
              <Cluster gap="2" align="center">
                <AlertTriangle className="size-4 text-[var(--text-muted)]" />
                <span className="text-sm font-semibold">Severity: {consequences.severity}</span>
              </Cluster>
              <p className="text-sm text-[var(--text-muted)]">{consequences.summary}</p>
            </Stack>
          </Card>

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
            <span className="text-sm font-semibold">{subtasks.length} subtasks</span>
            <Stack gap="2" as="ul">
              {subtasks.map((s) => (
                <li key={s.id} className="rounded-md border border-[var(--border)] p-3 text-sm">
                  <Cluster justify="between" align="center">
                    <Stack gap="0">
                      <span className="font-medium">{s.title}</span>
                      <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                        <span>{s.component}</span>
                        <span>·</span>
                        <code className="font-mono">{s.jira}</code>
                        {s.dependsOn.length > 0 && <><span>·</span><span>depends on {s.dependsOn.join(", ")}</span></>}
                      </Cluster>
                    </Stack>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      s.status === "done"     ? "bg-[var(--success-soft)] text-[var(--success)]"
                      : s.status === "running"  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : s.status === "blocked"  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                    )}>{s.status}</span>
                  </Cluster>
                  {s.acceptanceCriteria.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
                      {s.acceptanceCriteria.map((ac) => (
                        <li key={ac} className="flex items-start gap-1.5">
                          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success)]" />
                          <span>{ac}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      <RegenerateOptions runId={runId} phaseKey="plan" options={data.regenerateOptions as { id: string; label: string; description: string }[] | undefined} onChange={onChange} />
    </Stack>
  );
}

/* ================== Implement phase ================== */
function ImplementPhase({ data }: { runId: string; data: Record<string, unknown>; onChange: () => void }) {
  const stages = (data.stages as Array<{ name: string; state: "done" | "active" | "pending"; detail: string; duration: string }>) ?? [];
  const stats = data.stats as { files: number; totalTests: number; retries: number; costSoFar: number; tokens: number } | undefined;
  const summary = data.summaryPM as string | undefined;
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Sparkles className="size-4 text-[var(--primary)]" />
            <span className="text-sm font-semibold">Implementation summary</span>
          </Cluster>
          {summary && <p className="text-sm text-[var(--text-muted)]">{summary}</p>}
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
function ReviewPhase({ data }: { runId: string; data: Record<string, unknown>; onChange: () => void }) {
  const diffStats = data.diffStats as { files: number; additions: number; deletions: number; repos: number } | undefined;
  const reviewers = (data.reviewers as { name: string; role: string; avatar?: string; state: string; note: string }[]) ?? [];
  const policy = (data.approvalPolicy as { label: string; met: boolean }[]) ?? [];
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
              <li key={p.label} className="flex items-center gap-2 text-sm">
                {p.met ? <CheckCircle2 className="size-4 text-[var(--success)]" /> : <XCircle className="size-4 text-[var(--text-subtle)]" />}
                <span className={p.met ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>{p.label}</span>
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
function CiPhase({ data }: { runId: string; data: Record<string, unknown>; onChange: () => void }) {
  const overall = data.state as string | undefined;
  const elapsed = data.elapsedSeconds as number | undefined;
  const attemptsByRepo = data.attemptsByRepo as Record<string, {
    branch: string; sha: string; ciTool: string;
    checks: { name: string; state: "success" | "failure" | "running" | "pending"; startedAt?: string; completedAt?: string; outputSummary?: string }[];
    classifier: null | { category: string; confidence: number; deterministic: boolean; errorExcerpt: string; failingFiles: string[]; triageNote: string; resolution: string };
  }> | undefined;
  const healHistory = (data.healHistory as { n: number; outcome: string; filesModified: number; costUsd: number; note: string }[]) ?? [];

  return (
    <Stack gap="4">
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
            {elapsed && <span className="text-xs text-[var(--text-muted)]">elapsed: {Math.floor(elapsed / 60)}m {elapsed % 60}s</span>}
          </Cluster>
        </Stack>
      </Card>

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
                  </Cluster>
                  <p className="text-xs">{attempt.classifier.triageNote}</p>
                  <pre className="overflow-x-auto rounded bg-[var(--code-bg)] p-2 font-mono text-[10px]">{attempt.classifier.errorExcerpt}</pre>
                  <span className="text-xs"><strong>Resolution:</strong> {attempt.classifier.resolution}</span>
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
function PrPhase({ runId, data }: { runId: string; data: Record<string, unknown>; onChange: () => void }) {
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

  return (
    <Stack gap="4">
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
            <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>
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
function FramePhase({ runId, data, onChange, onImprove }: { runId: string; data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
  const problem = data.problemStatement as string;
  const whyNow = data.whyNow as string;
  const users = (data.affectedUsers as Array<{ id: string; role: string; description: string; impact: string; source: string }>) ?? [];
  const urgency = data.urgency as string;
  const confidence = data.problemConfidence as number;
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="2">
          <SectionHeader
            title="Problem statement"
            onImprove={onImprove}
            target={{ label: "frame · problem", currentText: problem, onSubmit: async () => { onChange(); } }}
            right={<span className="rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--info)]">{Math.round(confidence * 100)}% confidence</span>}
          />
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{problem}</p>
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
function ResearchPhase({ runId, data, onChange, onImprove }: { runId: string; data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
  const synthesis = data.synthesis as string;
  const confidence = data.synthesisConfidence as number;
  const pastPrds = (data.pastPrds as { id: string; title: string; date: string; status: string; relevance: string }[]) ?? [];
  const customerSignals = (data.customerSignals as { source: string; count: number; trend: string; summary: string }[]) ?? [];
  const competitiveLandscape = (data.competitiveLandscape as { name: string; supports: string; notes: string }[]) ?? [];
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="2">
          <SectionHeader
            title="Synthesis"
            onImprove={onImprove}
            target={{ label: "research · synthesis", currentText: synthesis, onSubmit: async () => { onChange(); } }}
            right={<span className="rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--info)]">{Math.round(confidence * 100)}% confidence</span>}
          />
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{synthesis}</p>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Past PRDs</span>
          <Stack gap="2" as="ul">
            {pastPrds.map((p) => (
              <li key={p.id} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <Stack gap="0">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-[var(--text-muted)]">{p.date} · {p.status}</span>
                  </Stack>
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
                    <span>{s.trend}</span>
                  </Cluster>
                </Cluster>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{s.summary}</p>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>
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
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}

/* ================== PRD: Draft ================== */
function DraftPhase({ runId, data, onChange, onImprove }: { runId: string; data: Record<string, unknown>; onChange: () => void; onImprove: ImproveHandler }) {
  const goals = (data.goals as { id: string; text: string; primary: boolean }[]) ?? [];
  const nonGoals = (data.nonGoals as string[]) ?? [];
  const options = (data.options as { id: string; title: string; recommended: boolean; effort: string; risk: string; duration: string; adoption: string; pros: string[]; cons: string[]; description: string }[]) ?? [];
  const chosenOptionId = data.chosenOptionId as string;
  const rationale = data.chosenRationale as string;
  const metrics = (data.metrics as { id: string; name: string; baseline: string; target: string; owner: string }[]) ?? [];
  const status = (data.status as "draft" | "needs-review" | "approved") ?? "draft";
  const version = (data.currentVersion as string) ?? "v1";
  const revisions = (data.revisions as DocRevision[]) ?? [];
  const body = data.body as string | undefined;
  const markdown = data.markdown as string | undefined;

  const handleSave = async ({ note }: { markdown: string; note: string }) => {
    toast.success(`Saved new revision · ${note || "no note"}.`);
    onChange();
  };
  const handleApprove = async () => {
    try { await api.runs.approveGate(runId, "draft"); toast.success("Draft approved — ready for sign-off."); onChange(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Approve failed."); }
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
          <Cluster gap="2">
            <Button variant="ghost" size="sm" onClick={(e) => fireImprove(e, onImprove, {
              label: "prd.md",
              currentText: markdown ?? "(no PRD text yet)",
              kind: "spec",
              onSubmit: async () => { onChange(); },
            })}>
              <Wand2 className="size-3.5" />
              Improve
            </Button>
            {status !== "approved" &&
              <Button size="sm" onClick={handleApprove}><CheckCircle2 className="size-3.5" />Ready for sign-off</Button>}
          </Cluster>
        }
      />

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Goals</span>
          <Stack gap="1" as="ul">
            {goals.map((g) => (
              <li key={g.id} className="flex items-start gap-2 text-sm">
                {g.primary
                  ? <span className="mt-0.5 rounded bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--primary-fg)]">Primary</span>
                  : <span className="mt-0.5 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-muted)]">Secondary</span>}
                <span>{g.text}</span>
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

      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Options considered</span>
          <Stack gap="2">
            {options.map((o) => (
              <Card key={o.id} className={cn(o.id === chosenOptionId && "border-[var(--primary)] ring-1 ring-[var(--primary)]")}>
                <Stack gap="2">
                  <Cluster justify="between" align="center">
                    <Stack gap="0">
                      <Cluster gap="2" align="center">
                        <span className="text-sm font-semibold">{o.title}</span>
                        {o.id === chosenOptionId && <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--primary-fg)]">Chosen</span>}
                        {o.recommended && o.id !== chosenOptionId && <span className="rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--info)]">Recommended</span>}
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
                </Stack>
              </Card>
            ))}
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
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}

/* ================== PRD: Sign-off ================== */
function SignoffPhase({ runId, data, onChange }: { runId: string; data: Record<string, unknown>; onChange: () => void }) {
  const readinessScore = (data.readinessScore as number) ?? 0;
  const stakeholders = (data.stakeholders as { name: string; role: string; avatar: string; state: string; comment: string }[]) ?? [];
  const commentThread = (data.commentThread as { author: string; avatar: string; date: string; text: string }[]) ?? [];

  const handleApprove = async () => {
    try { await api.runs.approveGate(runId, "signoff"); toast.success("PRD signed off."); onChange(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : "Approve failed."); }
  };

  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Readiness</span>
            <span className="text-xs text-[var(--text-muted)]">{Math.round(readinessScore * 100)}%</span>
          </Cluster>
          <div className="h-2 w-full rounded-full bg-[var(--surface-2)]">
            <div className={cn("h-full rounded-full", readinessScore >= 0.8 ? "bg-[var(--success)]" : readinessScore >= 0.6 ? "bg-[var(--warning)]" : "bg-[var(--danger)]")} style={{ width: `${readinessScore * 100}%` }} />
          </div>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Stakeholders</span>
            <Button size="sm" onClick={handleApprove}>
              <CheckCircle2 className="size-3.5" />
              Sign off
            </Button>
          </Cluster>
          <Stack gap="2" as="ul">
            {stakeholders.map((s) => (
              <li key={s.name} className="rounded-md border border-[var(--border)] p-2 text-sm">
                <Cluster justify="between" align="center">
                  <Cluster gap="2" align="center">
                    <div className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold">{s.avatar}</div>
                    <Stack gap="0">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">{s.role}</span>
                    </Stack>
                  </Cluster>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    s.state === "approved" ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : s.state === "changes-requested" ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                    : s.state === "owner" ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}>{s.state}</span>
                </Cluster>
                {s.comment && <p className="ml-8 mt-1 text-xs italic text-[var(--text-muted)]">&quot;{s.comment}&quot;</p>}
              </li>
            ))}
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

/* ================== Decisions strip (collapsible, top of task) ================== */
function DecisionsStrip({ decisions }: { decisions: TaskDecision[] }) {
  const [expanded, setExpanded] = useState(false);
  const latest = decisions[0];
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
          onClick={(e) => { e.stopPropagation(); toast.info("Decision capture coming soon."); }}
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
                <button className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label="Edit decision">
                  <Edit3 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================== Phase approve bar (sticky footer below content) ================== */
function PhaseApproveBar({ runId, phaseKey, status, onChange }: {
  runId: string;
  phaseKey: string;
  status: "idle" | "running" | "needs-review" | "approved" | "blocked";
  onChange: () => void;
}) {
  const handle = async (action: "approve" | "rerun") => {
    try {
      if (action === "approve") {
        await api.runs.approveGate(runId, phaseKey);
        toast.success("Phase approved — Athena advances.");
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
    <div className="phase-approve-bar">
      <span className={cn("phase-status-pill", `s-${status}`)}>
        {status === "approved" && <CheckCircle2 className="size-3" />}
        {status === "running" && <Sparkles className="size-3" />}
        {status === "needs-review" && <Eye className="size-3" />}
        {status === "blocked" && <XCircle className="size-3" />}
        {status === "idle" && <Circle className="size-3" />}
        {phaseStatusLabel(status)}
      </span>
      <div className="phase-approve-bar-status">
        <div className="phase-approve-bar-status-label">{phaseKey}</div>
        <div className="phase-approve-bar-status-text">{statusText}</div>
      </div>
      <Cluster gap="2" className="phase-approve-bar-actions">
        {status !== "approved" && status !== "idle" && (
          <Button variant="ghost" size="sm" onClick={() => handle("rerun")}>
            <RotateCcw className="size-3.5" />
            Re-run
          </Button>
        )}
        {status !== "approved" && (
          <Button size="sm" disabled={status === "idle" || status === "running"} onClick={() => handle("approve")}>
            <CheckCircle2 className="size-3.5" />
            Approve & advance
          </Button>
        )}
      </Cluster>
    </div>
  );
}

/* ================== Task-scoped activity rail (right column) ================== */
function TaskActivityRail({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [showTech, setShowTech] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const page = await api.activity.list({ limit: 12 });
        setItems(page.items.filter((a) => !a.task_id || a.task_id === taskId).slice(0, 8));
      } catch { /* ignore */ }
    })();
  }, [taskId]);
  return (
    <div className="activity-rail">
      <div className="activity-rail-header">
        <h3>Activity</h3>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={showTech}
            onChange={(e) => setShowTech(e.target.checked)}
            className="accent-[var(--primary)]"
          />
          Tech
        </label>
      </div>
      <div className="activity-list">
        {items.map((a) => (
          <div key={a.id} className="activity-item">
            <span className="activity-dot" style={{ background: a.who_kind === "agent" ? "var(--primary)" : "var(--success)" }} />
            <Stack gap="0">
              {showTech ? (
                <code className="activity-text tech">{a.tech}</code>
              ) : (
                <span className="activity-text">
                  <span className="activity-tag cap">task</span>
                  <strong>{a.who}</strong> <span dangerouslySetInnerHTML={{ __html: a.text_html }} />
                </span>
              )}
              <span className="activity-time">{a.when}</span>
            </Stack>
          </div>
        ))}
        {items.length === 0 && (
          <p className="p-3 text-xs text-[var(--text-muted)]">No activity yet on this task.</p>
        )}
      </div>
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
