"use client";

/**
 * BoardColumn - one status bucket on the kanban board: a header (status pill +
 * count) over a vertical, internally-scrolling stack of TaskCards. Fluid width
 * (shares the viewport with its siblings) and capped render (long columns show
 * the first N with a "show all" expander) so a busy org stays usable.
 */

import { useState } from "react";

import { Stack } from "@/components/layout/primitives";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import type { KanbanColumn, Task } from "@/lib/api/client";

import { TaskCard, type TaskCardActions } from "./task-card";

/** Cap the cards rendered per column before the "show all" expander kicks in -
 *  bounds the DOM on a busy board while keeping every card reachable. */
const RENDER_CAP = 50;

export function BoardColumn({
  column,
  onTaskOpen,
  taskActions,
  busyId,
}: {
  column: KanbanColumn;
  onTaskOpen?: (task: Task) => void;
  /** Per-task overflow-menu actions (mark done / archive / delete / restore). */
  taskActions?: (task: Task) => TaskCardActions | undefined;
  /** The task currently mid-mutation (its menu disables). */
  busyId?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible =
    showAll || column.tasks.length <= RENDER_CAP
      ? column.tasks
      : column.tasks.slice(0, RENDER_CAP);
  const hidden = column.tasks.length - visible.length;

  return (
    <div className="flex min-h-0 min-w-[176px] flex-1 basis-0 flex-col gap-2.5 rounded-xl bg-[var(--surface-2)] p-2.5">
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
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 max-h-[calc(100vh_-_15rem)]">
          <Stack gap="2">
            {visible.map((task) => {
              const acts = taskActions?.(task);
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  busy={busyId === task.id}
                  {...(onTaskOpen ? { onOpen: () => onTaskOpen(task) } : {})}
                  {...(acts ? { actions: acts } : {})}
                />
              );
            })}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full rounded-md border border-dashed border-[var(--border)] py-1.5 text-center text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                Show {hidden} more
              </button>
            )}
          </Stack>
        </div>
      )}
    </div>
  );
}
