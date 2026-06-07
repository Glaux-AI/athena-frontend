"use client";

/**
 * BoardColumn — one status bucket on the kanban board: a header (status pill +
 * count) over a vertical stack of TaskCards. Presentational.
 */

import { Stack } from "@/components/layout/primitives";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import type { KanbanColumn, Task } from "@/lib/api/client";

import { TaskCard } from "./task-card";

export function BoardColumn({
  column,
  onTaskClick,
}: {
  column: KanbanColumn;
  onTaskClick?: (task: Task) => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-2.5 rounded-xl bg-[var(--surface-2)] p-2.5">
      <div className="flex items-center justify-between px-1">
        <TaskStatusPill status={column.status} />
        <span className="text-xs tabular-nums text-[var(--text-subtle)]">
          {column.total}
        </span>
      </div>
      {column.tasks.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-[var(--text-subtle)]">
          No tasks
        </p>
      ) : (
        <Stack gap="2">
          {column.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick ? () => onTaskClick(task) : undefined}
            />
          ))}
        </Stack>
      )}
    </div>
  );
}
