"use client";

/**
 * TaskCard - one task on the kanban board. A keyboard-accessible button opens
 * the cockpit (`/work/[id]`); a kebab overflow menu carries the quick actions
 * (move to a status, set priority - the keyboard path for everything drag
 * offers) above the triage items (mark done / not-needed / obsolete / delete /
 * restore). The menu's actions are wired by the parent (which owns the
 * mutation + refetch); the card just surfaces the at-a-glance facts.
 */

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  GitBranch,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { cn } from "@/lib/cn";
import { labelColorClass, splitLabelKey } from "@/lib/work/label-meta";
import { isRailed } from "@/lib/work/board-dnd";
import type {
  Label,
  Member,
  Task,
  TaskCancelReason,
  TaskPriority,
  TaskStatus,
} from "@/lib/api/client";
import {
  BOARD_COLUMN_ORDER,
  CANCEL_REASON_LABEL,
  TASK_HEALTH_LABEL,
  TASK_STATUS_LABEL,
  TASK_TYPE_META,
  describeDue,
} from "@/lib/work/task-meta";
import { useSelection } from "@/lib/work/selection-context";

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export interface TaskCardActions {
  /** Move to another status column - the non-pointer twin of dragging the
   *  card. The menu offers every board status except the current one (and
   *  except `in_review` on railed tasks - the stage gate owns that state). */
  onMove?: (next: TaskStatus) => void;
  /** Set (or clear, with null) the task's priority. */
  onSetPriority?: (p: TaskPriority | null) => void;
  /** Move to `done` (a real outcome - stays a status, not a cancel). */
  onMarkDone?: () => void;
  /** Remove from the board with a structured reason → the Cancelled view. */
  onArchive?: (reason: TaskCancelReason) => void;
  /** Restore a cancelled task back to the board (→ backlog). */
  onRestore?: () => void;
  /** Permanently remove (soft-delete). */
  onDelete?: () => void;
}

export function TaskCard({
  task,
  onOpen,
  actions,
  busy = false,
  membersById,
  labelsById,
}: {
  task: Task;
  onOpen?: () => void;
  actions?: TaskCardActions;
  busy?: boolean;
  /** Resolves owner_user_id -> a person for the owner avatar. Optional: the
   *  card degrades to an initial-less avatar when not provided. */
  membersById?: Map<string, Member>;
  /** Resolves label ids -> chips. Optional. */
  labelsById?: Map<string, Label>;
}) {
  const meta = TASK_TYPE_META[task.type];
  const Icon = meta.Icon;
  // AI execution is now the explicit `ai_delegated` flag, not an assignee
  // sentinel - a person still owns the task; Athena is the executor.
  const aiDelegated = task.ai_delegated;
  const urgent = task.priority === "urgent";
  const high = task.priority === "high";
  const isCancelled = task.status === "cancelled";
  // Risk lenses are meaningless on terminal tasks (a shipped task isn't "due").
  const isTerminal = isCancelled || task.status === "done";
  const due = isTerminal ? null : describeDue(task.target_date);
  const showHealth =
    !isTerminal && (task.health === "at_risk" || task.health === "blocked");
  // The hard-gate moment is the most important board signal - a "Review" pill
  // takes precedence over the priority badge in the header.
  const inReview = task.status === "in_review";
  // Who owns it (the accountable human). Athena is never the owner.
  const owner = task.owner_user_id ? membersById?.get(task.owner_user_id) : undefined;
  const ownerName = owner?.display_name ?? owner?.email ?? null;
  const age = isTerminal ? null : describeAge(task.created_at);
  // Labels: resolve to chips, capped at 2 (the card stays ~3 lines).
  const cardLabels: Label[] = labelsById
    ? task.label_ids
        .map((id) => labelsById.get(id))
        .filter((l): l is Label => Boolean(l))
    : [];
  const shownLabels = cardLabels.slice(0, 2);
  const moreLabels = cardLabels.length - shownLabels.length;
  // Multi-select: in select mode the card toggles selection instead of opening.
  const selection = useSelection();
  const selected = selection.selectable && selection.isSelected(task.id);
  const clickable = selection.selectable || Boolean(onOpen);
  const handleClick = selection.selectable
    ? () => selection.toggle(task.id)
    : onOpen;
  const hasMenu = Boolean(
    actions &&
      (actions.onMove ||
        actions.onSetPriority ||
        actions.onMarkDone ||
        actions.onArchive ||
        actions.onRestore ||
        actions.onDelete),
  );

  return (
    <Card
      className={cn(
        "relative p-0",
        // A subtle primary-tinted left edge marks an AI-delegated task at a
        // glance, without segregating it from human work.
        aiDelegated && "border-l-2 border-l-[var(--primary)]",
        selected && "ring-2 ring-[var(--primary)]",
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={!clickable}
        aria-pressed={selection.selectable ? selected : undefined}
        className={cn(
          "block w-full rounded-[inherit] p-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          clickable && "cursor-pointer transition-colors hover:bg-[var(--surface-2)]",
        )}
      >
        <span className="sr-only">
          {selection.selectable ? "Select task: " : "Open task: "}
        </span>
        <div className="flex items-center gap-1.5 pr-6 text-[11px] text-[var(--text-muted)]">
          {selection.selectable && (
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border",
                selected
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
                  : "border-[var(--border-strong)] bg-[var(--surface)]",
              )}
              aria-hidden
            >
              {selected && <Check className="size-3" />}
            </span>
          )}
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <TaskIdChip id={task.display_id} />
          <span>{meta.label}</span>
          {inReview ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]">
              <ShieldCheck className="size-3" aria-hidden />
              Review
            </span>
          ) : (
            (urgent || high) && (
              <span
                className={cn(
                  "ml-auto rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  urgent
                    ? "bg-[var(--danger-soft)] text-[var(--danger-ink)]"
                    : "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
                )}
              >
                {urgent ? "Urgent" : "High"}
              </span>
            )
          )}
        </div>

        <p
          className={cn(
            "mt-1.5 line-clamp-2 text-sm font-medium text-[var(--text)]",
            isCancelled && "text-[var(--text-muted)] line-through",
          )}
        >
          {task.title}
        </p>

        {isCancelled && task.cancel_reason && (
          <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
            Removed - {CANCEL_REASON_LABEL[task.cancel_reason]}
          </p>
        )}

        {shownLabels.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {shownLabels.map((l) => (
              <LabelChip key={l.id} label={l} />
            ))}
            {moreLabels > 0 && (
              <span className="text-[10px] text-[var(--text-subtle)]">
                +{moreLabels}
              </span>
            )}
          </div>
        )}

        {(showHealth || due) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {showHealth && (
              <Chip
                tone={task.health === "blocked" ? "danger" : "warning"}
                icon={<AlertTriangle className="size-3" aria-hidden />}
              >
                {task.health ? TASK_HEALTH_LABEL[task.health] : ""}
              </Chip>
            )}
            {due && (
              <Chip
                tone={
                  due.tone === "overdue"
                    ? "danger"
                    : due.tone === "soon"
                      ? "warning"
                      : "muted"
                }
                icon={<CalendarClock className="size-3" aria-hidden />}
              >
                {due.label}
              </Chip>
            )}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[var(--text-subtle)]">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <ActorAvatar
              name={ownerName ?? "Unassigned"}
              size={18}
              agent={false}
            />
            <span className="truncate">{ownerName ?? "Unassigned"}</span>
            {aiDelegated && (
              <span
                className="inline-flex items-center rounded-full bg-[var(--primary-soft)] p-0.5 shadow-[var(--glow)]"
                title="Athena runs this task"
                aria-label="Athena runs this task"
              >
                <ActorAvatar name="Athena" size={14} agent />
              </span>
            )}
          </span>
          {age && (
            <span
              className={cn("shrink-0", age.stale && "text-[var(--warning-ink)]")}
              title={`Created ${age.full}`}
            >
              {age.label}
            </span>
          )}
          {task.estimate_points != null && (
            <span
              className="shrink-0 rounded bg-[var(--surface-3)] px-1 py-0.5 text-[10px] font-medium tabular-nums text-[var(--text-muted)]"
              title={`${task.estimate_points} points`}
            >
              {task.estimate_points}pt
            </span>
          )}
          {task.children_total > 0 && (
            <span
              className="inline-flex items-center gap-1"
              title={subtaskSummary(task)}
              aria-label={subtaskSummary(task)}
            >
              <GitBranch className="size-3" aria-hidden />
              <span aria-hidden>
                {task.children_done}/{task.children_total}
              </span>
              {task.children_blocked > 0 && (
                <span
                  className="size-1.5 rounded-full bg-[var(--danger)]"
                  aria-hidden
                />
              )}
            </span>
          )}
          {task.spent_usd != null && task.spent_usd > 0 && (
            <span className="ml-auto tabular-nums">${task.spent_usd.toFixed(2)}</span>
          )}
        </div>
      </button>

      {hasMenu && actions && (
        <CardMenu task={task} actions={actions} busy={busy} />
      )}
    </Card>
  );
}

/** A label chip - the `key:value` prefix renders faintly as a group marker. */
function LabelChip({ label }: { label: Label }) {
  const { prefix, value } = splitLabelKey(label.key);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        labelColorClass(label.color),
      )}
      title={label.key}
    >
      {prefix && <span className="mr-0.5 opacity-60">{prefix}:</span>}
      {value}
    </span>
  );
}

/** A small at-a-glance lens chip (risk / due) on the card body. */
function Chip({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: "danger" | "warning" | "muted";
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        tone === "danger"
          ? "bg-[var(--danger-soft)] text-[var(--danger-ink)]"
          : tone === "warning"
            ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]"
            : "bg-[var(--surface-2)] text-[var(--text-muted)]",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Compact age since creation ("3d", "5w") with a stale flag past 14 days, so a
 *  card that's been sitting around quietly surfaces. */
function describeAge(createdAt: string): { label: string; stale: boolean; full: string } {
  const created = new Date(createdAt);
  const days = Math.floor((Date.now() - created.getTime()) / 86_400_000);
  const full = created.toLocaleString();
  if (days < 1) return { label: "today", stale: false, full };
  if (days < 14) return { label: `${days}d`, stale: false, full };
  if (days < 70) return { label: `${Math.floor(days / 7)}w`, stale: true, full };
  return { label: `${Math.floor(days / 30)}mo`, stale: true, full };
}

/** "3 of 5 subtasks done, 1 blocked" - the subtask chip's tooltip / SR text. */
function subtaskSummary(task: Task): string {
  const base = `${task.children_done} of ${task.children_total} subtasks done`;
  return task.children_blocked > 0
    ? `${base}, ${task.children_blocked} blocked`
    : base;
}

function CardMenu({
  task,
  actions,
  busy,
}: {
  task: Task;
  actions: TaskCardActions;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isCancelled = task.status === "cancelled";
  const isDone = task.status === "done";
  // Quick actions don't apply to a cancelled task - restore is its one path
  // back to the board. Every board status except the current one is a move
  // target, minus `in_review` on railed tasks (the stage gate owns it).
  const moveTargets =
    actions.onMove && !isCancelled
      ? BOARD_COLUMN_ORDER.filter(
          (s) => s !== task.status && !(s === "in_review" && isRailed(task)),
        )
      : [];
  const showPriority = Boolean(actions.onSetPriority) && !isCancelled;
  const hasQuickActions = moveTargets.length > 0 || showPriority;
  // Mirrors the render conditions below, so the separator never dangles.
  const hasTriageActions = Boolean(
    (!isCancelled && !isDone && actions.onMarkDone) ||
      (!isCancelled && actions.onArchive) ||
      ((isCancelled || isDone) && actions.onRestore) ||
      actions.onDelete,
  );

  const run = (fn?: () => void) => {
    setOpen(false);
    fn?.();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Task actions"
          disabled={busy}
          className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-md text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="glass animate-modal-in z-50 w-48 rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none"
        >
          {moveTargets.length > 0 && (
            <>
              <MenuLabel>Move to</MenuLabel>
              {moveTargets.map((s) => (
                <MenuItem key={s} onClick={() => run(() => actions.onMove?.(s))}>
                  {TASK_STATUS_LABEL[s]}
                </MenuItem>
              ))}
            </>
          )}
          {showPriority && (
            <>
              <MenuLabel>Set priority</MenuLabel>
              {PRIORITIES.map((p) => (
                <MenuItem
                  key={p}
                  onClick={() => run(() => actions.onSetPriority?.(p))}
                >
                  {PRIORITY_LABEL[p]}
                  {task.priority === p && (
                    <Check
                      className="ml-auto size-3 text-[var(--text-subtle)]"
                      aria-hidden
                    />
                  )}
                </MenuItem>
              ))}
              <MenuItem onClick={() => run(() => actions.onSetPriority?.(null))}>
                Clear priority
              </MenuItem>
            </>
          )}
          {hasQuickActions && hasTriageActions && (
            <div className="my-1 h-px bg-[var(--border)]" />
          )}
          {!isCancelled && !isDone && actions.onMarkDone && (
            <MenuItem onClick={() => run(actions.onMarkDone)}>
              <CheckCircle2 className="size-3.5 text-[var(--success-ink)]" aria-hidden />
              Mark as done
            </MenuItem>
          )}
          {!isCancelled && actions.onArchive && (
            <>
              <MenuLabel>Remove from board</MenuLabel>
              <MenuItem onClick={() => run(() => actions.onArchive?.("not_needed"))}>
                <XCircle className="size-3.5" aria-hidden />
                Not needed
              </MenuItem>
              <MenuItem onClick={() => run(() => actions.onArchive?.("obsolete"))}>
                <XCircle className="size-3.5" aria-hidden />
                Obsolete
              </MenuItem>
            </>
          )}
          {isCancelled && actions.onRestore && (
            <MenuItem onClick={() => run(actions.onRestore)}>
              <RotateCcw className="size-3.5" aria-hidden />
              Restore to board
            </MenuItem>
          )}
          {isDone && actions.onRestore && (
            <MenuItem onClick={() => run(actions.onRestore)}>
              <RotateCcw className="size-3.5" aria-hidden />
              Reopen
            </MenuItem>
          )}
          {actions.onDelete && (
            <>
              {(actions.onMarkDone || actions.onArchive || actions.onRestore) && (
                <div className="my-1 h-px bg-[var(--border)]" />
              )}
              <MenuItem onClick={() => run(actions.onDelete)} danger>
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </MenuItem>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

function MenuItem({
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
