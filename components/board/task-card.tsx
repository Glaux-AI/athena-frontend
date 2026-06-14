"use client";

/**
 * TaskCard - one task on the kanban board. A keyboard-accessible button opens
 * the cockpit (`/work/[id]`); a kebab overflow menu removes the task from the
 * board (mark done / not-needed / obsolete / delete) or restores a cancelled
 * one. The menu's actions are wired by the parent (which owns the mutation +
 * refetch); the card just surfaces the at-a-glance facts.
 */

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
  Trash2,
  User,
  XCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { cn } from "@/lib/cn";
import type { Task, TaskCancelReason } from "@/lib/api/client";
import {
  CANCEL_REASON_LABEL,
  TASK_HEALTH_LABEL,
  TASK_TYPE_META,
  describeDue,
} from "@/lib/work/task-meta";

export interface TaskCardActions {
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
}: {
  task: Task;
  onOpen?: () => void;
  actions?: TaskCardActions;
  busy?: boolean;
}) {
  const meta = TASK_TYPE_META[task.type];
  const Icon = meta.Icon;
  const isAthena = task.assignee === "athena";
  const urgent = task.priority === "urgent";
  const high = task.priority === "high";
  const isCancelled = task.status === "cancelled";
  // Risk lenses are meaningless on terminal tasks (a shipped task isn't "due").
  const isTerminal = isCancelled || task.status === "done";
  const due = isTerminal ? null : describeDue(task.target_date);
  const showHealth =
    !isTerminal && (task.health === "at_risk" || task.health === "blocked");
  const hasMenu = Boolean(
    actions &&
      (actions.onMarkDone ||
        actions.onArchive ||
        actions.onRestore ||
        actions.onDelete),
  );

  return (
    <Card className="relative p-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className={cn(
          "block w-full rounded-[inherit] p-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          onOpen && "cursor-pointer transition-colors hover:bg-[var(--surface-2)]",
        )}
      >
        <span className="sr-only">Open task: </span>
        <div className="flex items-center gap-1.5 pr-6 text-[11px] text-[var(--text-muted)]">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <TaskIdChip id={task.display_id} />
          <span>{meta.label}</span>
          {(urgent || high) && (
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
          <span className="inline-flex items-center gap-1">
            {isAthena ? (
              <Sparkles className="size-3 text-[var(--primary)]" aria-hidden />
            ) : (
              <User className="size-3" aria-hidden />
            )}
            {isAthena ? "Athena" : "Assigned"}
          </span>
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
          {task.spent_usd > 0 && (
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
