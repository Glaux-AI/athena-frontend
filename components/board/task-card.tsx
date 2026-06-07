"use client";

/**
 * TaskCard — one task on the kanban board. Presentational; the column owns the
 * click handler. Status is implied by the column, so the card surfaces the
 * other at-a-glance facts: type, title, assignee, subtask count, spend.
 */

import { GitBranch, Sparkles, User } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/api/client";
import { TASK_TYPE_META } from "@/lib/work/task-meta";

export function TaskCard({
  task,
  onClick,
}: {
  task: Task;
  onClick?: () => void;
}) {
  const meta = TASK_TYPE_META[task.type];
  const Icon = meta.Icon;
  const isAthena = task.assignee === "athena";
  const urgent = task.priority === "urgent";
  const high = task.priority === "high";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-3",
        onClick && "cursor-pointer hover:border-[var(--border-accent)]",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>{meta.label}</span>
        {(urgent || high) && (
          <span
            className={cn(
              "ml-auto inline-flex size-1.5 rounded-full",
              urgent ? "bg-[var(--danger)]" : "bg-[var(--warning)]",
            )}
            aria-label={`${task.priority} priority`}
          />
        )}
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm font-medium text-[var(--text)]">
        {task.title}
      </p>

      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[var(--text-subtle)]">
        <span className="inline-flex items-center gap-1">
          {isAthena ? (
            <Sparkles className="size-3 text-[var(--primary)]" aria-hidden />
          ) : (
            <User className="size-3" aria-hidden />
          )}
          {isAthena ? "Athena" : "Assigned"}
        </span>
        {task.child_ids.length > 0 && (
          <span className="inline-flex items-center gap-1" title="Subtasks">
            <GitBranch className="size-3" aria-hidden />
            {task.child_ids.length}
          </span>
        )}
        {task.spent_usd > 0 && (
          <span className="ml-auto tabular-nums">${task.spent_usd.toFixed(2)}</span>
        )}
      </div>
    </Card>
  );
}
