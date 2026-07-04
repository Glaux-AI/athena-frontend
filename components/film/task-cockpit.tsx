"use client";

/**
 * Film-only layout chrome that mirrors the REAL /work/[id] cockpit exactly
 * (per the current FE): a header CARD (chip cluster + title + owner on the
 * left, cost + controls on the right) with the StageRail at its foot INSIDE
 * the card, then a 2fr/1fr body (worklog -> artifacts -> composer on the
 * left, sticky sidebar on the right). Scenes fill `left`/`right` with the
 * real prop-driven work components so this stays pure layout.
 */

import type { CSSProperties, ReactNode } from "react";
import { Layers, GitPullRequest, MoreHorizontal, Eye } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { StageRail } from "@/components/work/stage-rail";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { OwlGlyph } from "@/components/mascot/owl-glyph";
import type { TaskStage, TaskStatus } from "@/lib/api/client";

/** A browser window framing the real Athena app at any size - a chrome bar
 *  (traffic lights + URL) over a slim Athena top bar (owl + wordmark + org).
 *  Lets a focused cockpit read unmistakably as "the Athena web app" when
 *  shown at half-width beside a coding agent. */
export function AthenaChrome({
  url = "app.tryathena.dev/work/FEAT-14",
  children,
  style,
}: {
  url?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        background: "var(--bg)",
        outline: "1px solid var(--border)",
        boxShadow: "0 24px 90px oklch(20% 0.02 250 / 0.28)",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[oklch(72%_0.17_25)]" />
          <span className="size-2.5 rounded-full bg-[oklch(80%_0.15_85)]" />
          <span className="size-2.5 rounded-full bg-[oklch(72%_0.16_150)]" />
        </span>
        <div className="ml-2 flex-1 truncate rounded-md bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-muted)]">
          {url}
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
        <span className="size-6">
          <OwlGlyph mood="working" interactive={false} />
        </span>
        <span className="text-sm font-semibold text-[var(--text)]">Athena</span>
        <span className="ml-2 rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
          Meridian Systems
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function TypePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium capitalize text-[var(--text-muted)]">
      <GitPullRequest className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function CostBlock({ spent, budget }: { spent: number; budget: number }) {
  const pct = Math.min(1, spent / budget);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="text-sm font-semibold tabular-nums text-[var(--text)]">
        ${spent.toFixed(2)}{" "}
        <span className="text-xs font-normal text-[var(--text-muted)]">/ ${budget.toFixed(0)}</span>
      </div>
      <div className="h-1 w-28 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function ControlChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-muted)]">
      {children}
    </span>
  );
}

/** Right-sidebar Subtasks card (matches the real "Subtasks" section wrapper). */
export function SubtasksCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
      <Stack gap="3">
        <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Layers className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--text)]">Subtasks</span>
        </Cluster>
        {children}
      </Stack>
    </div>
  );
}

export function TaskCockpit({
  idChip,
  title,
  status,
  typeLabel = "feat",
  owner,
  domainLabel,
  spent = 0,
  budget = 20,
  createdAt = "Jul 1, 2026",
  externalExecutor,
  autoApprove = false,
  stages,
  selectedStage,
  left,
  right,
}: {
  idChip: string;
  title: string;
  status: TaskStatus;
  typeLabel?: string;
  owner?: { name: string } | null;
  domainLabel?: string;
  spent?: number;
  budget?: number;
  createdAt?: string;
  externalExecutor?: string;
  autoApprove?: boolean;
  stages: TaskStage[];
  selectedStage: string;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="p-1" style={{ height: 800 }}>
      <Stack gap="0">
        {/* back link */}
        <Cluster gap="2" align="center" className="mb-3">
          <span className="text-sm text-[var(--text-muted)]">&larr; Back to work</span>
        </Cluster>

        {/* header card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <Stack gap="2" className="min-w-0 flex-1">
              <Cluster gap="2" align="center" className="flex-wrap">
                <TaskIdChip id={idChip} className="text-xs text-[var(--text-muted)]" />
                <TypePill label={typeLabel} />
                <TaskStatusPill status={status} />
                {domainLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]">
                    {domainLabel}
                  </span>
                )}
                {externalExecutor && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--info-ink)]">
                    <span className="size-1.5 animate-pulse rounded-full bg-[var(--info)]" />
                    {externalExecutor} · working
                  </span>
                )}
                <span className="text-xs text-[var(--text-muted)]">Created {createdAt}</span>
              </Cluster>
              <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[var(--text)]">
                {title}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                {owner ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text)]">
                    <ActorAvatar name={owner.name} size={18} />
                    {owner.name}
                  </span>
                ) : (
                  <span className="rounded-full border border-dashed border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
                    Assign
                  </span>
                )}
              </div>
            </Stack>

            <div className="flex shrink-0 flex-wrap items-start gap-2 lg:flex-col lg:items-end">
              <CostBlock spent={spent} budget={budget} />
              <Cluster gap="2" align="center">
                <ControlChip>
                  <span className={`size-3 rounded-full ${autoApprove ? "bg-[var(--success)]" : "border border-[var(--border-strong)]"}`} />
                  Auto-approve
                </ControlChip>
                <ControlChip>
                  <Eye className="size-3.5" aria-hidden />
                  Watch
                </ControlChip>
                <span className="inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)]">
                  <MoreHorizontal className="size-4" aria-hidden />
                </span>
              </Cluster>
            </div>
          </div>

          {/* stage rail at the foot of the header card */}
          <div className="mt-5">
            <StageRail stages={stages} selectedStage={selectedStage} onSelect={() => {}} />
          </div>
        </div>

        {/* 2fr / 1fr body */}
        <div className="mt-4 grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="min-w-0">
            <Stack gap="4">{left}</Stack>
          </div>
          <div className="min-w-0 lg:self-start">
            <Stack gap="4">{right}</Stack>
          </div>
        </div>
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------- gate composer */

/** The StageComposer gate bar, matching the real visible strings per mode.
 * Kept prop-driven (film realm has no /v1/tasks mutation surface). */
export function GateComposer({
  mode,
  stageTitle,
  approveLabel,
  runningLabel,
  approvedLabel,
}: {
  mode: "running" | "review" | "approved";
  stageTitle: string;
  // Only rendered in review mode; optional so approved/running gates can omit it.
  approveLabel?: string;
  runningLabel?: string;
  approvedLabel?: string;
}) {
  if (mode === "running") {
    return (
      <div className="athena-working rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-2)]">
        <Cluster gap="2" align="center">
          <span className="size-2 animate-pulse rounded-full bg-[var(--primary)]" />
          <span className="text-sm font-medium text-[var(--text)]">
            {runningLabel ?? "Athena is working - every step shows up above."}
          </span>
          <span className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
            Stop Athena
          </span>
        </Cluster>
      </div>
    );
  }
  if (mode === "approved") {
    return (
      <div className="rounded-xl border border-l-4 border-[var(--border)] border-l-[var(--success)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
        <span className="text-sm font-medium text-[var(--success-ink)]">
          {approvedLabel ?? "Approved - recorded as a decision. The next step is unlocked."}
        </span>
      </div>
    );
  }
  // review
  return (
    <div className="rounded-xl border border-l-4 border-[var(--border)] border-l-[var(--warning)] bg-[var(--surface)] p-4 shadow-[var(--shadow-2)]">
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warning-ink)]">
            Your call
          </span>
          <span className="text-sm font-medium text-[var(--text)]">Review the {stageTitle}</span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Approve it, or request changes and Athena redoes it with your note - one click either way.
        </p>
        <Cluster gap="2" align="center">
          <span className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-fg)]">
            {approveLabel ?? "Approve"}
          </span>
          <span className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
            Request changes
          </span>
        </Cluster>
      </Stack>
    </div>
  );
}
