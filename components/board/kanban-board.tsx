"use client";

/**
 * KanbanBoard - the status board. Columns are FLUID (flex-1, basis-0) so the
 * full set shares the viewport width and fits on screen instead of forcing a
 * horizontal scroll; below a min-width floor the track scrolls as a fallback.
 * Presentational: the parent fetches + buckets tasks and owns the per-task
 * actions. Columns render in BOARD_COLUMN_ORDER; extras are appended.
 *
 * Only columns that HAVE tasks are rendered - an empty status column is pure
 * clutter here (the board has no drag-and-drop; status changes via the card
 * menu), so a board with work in two buckets shows two columns, not seven. The
 * whole-board empty state still shows when there is no work at all.
 */

import { LayoutGrid } from "lucide-react";
import { type ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { BOARD_COLUMN_ORDER } from "@/lib/work/task-meta";
import type { KanbanColumn, Label, Member, Task } from "@/lib/api/client";

import { BoardColumn } from "./board-column";
import { type TaskCardActions } from "./task-card";

export function KanbanBoard({
  columns,
  onTaskOpen,
  taskActions,
  busyId,
  emptyAction,
  membersById,
  labelsById,
}: {
  columns: KanbanColumn[];
  onTaskOpen?: (task: Task) => void;
  taskActions?: (task: Task) => TaskCardActions | undefined;
  busyId?: string | null;
  emptyAction?: ReactNode;
  /** Resolves owners to people for the card avatars. */
  membersById?: Map<string, Member>;
  /** Resolves label ids to chips. */
  labelsById?: Map<string, Label>;
}) {
  const total = columns.reduce((n, c) => n + c.total, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-5" />}
        title="No work here"
        description="Create a task and Athena will work it through its lifecycle - frame, plan, execute, review. Or clear a filter to see more."
        action={emptyAction}
      />
    );
  }

  return (
    // Fluid track: columns flex to share the width (fit-on-screen); a min-width
    // floor per column lets the track scroll only when the viewport is too
    // narrow for all of them.
    <div className="flex gap-3 overflow-x-auto pb-2">
      {orderColumns(columns)
        .filter((column) => column.total > 0)
        .map((column) => (
          <BoardColumn
            key={column.status}
            column={column}
            {...(onTaskOpen ? { onTaskOpen } : {})}
            {...(taskActions ? { taskActions } : {})}
            {...(busyId !== undefined ? { busyId } : {})}
            {...(membersById ? { membersById } : {})}
            {...(labelsById ? { labelsById } : {})}
          />
        ))}
    </div>
  );
}

function orderColumns(columns: KanbanColumn[]): KanbanColumn[] {
  const byStatus = new Map(columns.map((c) => [c.status, c]));
  const ordered: KanbanColumn[] = [];
  for (const status of BOARD_COLUMN_ORDER) {
    const column = byStatus.get(status);
    if (column) {
      ordered.push(column);
      byStatus.delete(status);
    }
  }
  for (const column of byStatus.values()) ordered.push(column);
  return ordered;
}
