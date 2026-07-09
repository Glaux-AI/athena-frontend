"use client";

/**
 * KanbanBoard - the status board. Columns are FLUID (flex-1, basis-0) so the
 * full set shares the viewport width and fits on screen instead of forcing a
 * horizontal scroll; below a min-width floor the track scrolls as a fallback.
 * Presentational: the parent fetches + buckets tasks and owns the per-task
 * actions. Columns render in BOARD_COLUMN_ORDER; extras are appended.
 *
 * Static (no `onTaskMove`): only columns that HAVE tasks render - an empty
 * status column is pure clutter when status changes go through the card menu.
 * Draggable (`onTaskMove` present): cards drag between columns and the full
 * column set renders (minus `cancelled`) so a card can be dropped into an
 * empty status too. The drop rules live in `lib/work/board-dnd.ts`. The
 * whole-board empty state still shows when there is no work at all.
 */

import { LayoutGrid } from "lucide-react";
import { useState, type ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { boardColumns } from "@/lib/work/board-dnd";
import type { KanbanColumn, Label, Member, Task, TaskStatus } from "@/lib/api/client";

import { BoardColumn, type BoardDnd } from "./board-column";
import { type TaskCardActions } from "./task-card";

export function KanbanBoard({
  columns,
  onTaskOpen,
  taskActions,
  busyId,
  emptyAction,
  membersById,
  labelsById,
  onTaskMove,
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
  /** Makes the board draggable: a card dropped on a column asks the parent to
   *  move it there (the parent owns the mutation + optimistic state + revert).
   *  Absent = today's static board. */
  onTaskMove?: (task: Task, next: TaskStatus) => void;
}) {
  // Which card is in flight - board-level so every column judges the same
  // drag (dataTransfer payloads are unreadable during dragover by spec).
  const [dragging, setDragging] = useState<Task | null>(null);
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

  const dnd: BoardDnd | undefined = onTaskMove
    ? {
        dragging,
        onDragStart: setDragging,
        onDragEnd: () => setDragging(null),
        onDrop: (task, next) => {
          setDragging(null);
          onTaskMove(task, next);
        },
      }
    : undefined;

  return (
    // Fluid track: columns flex to share the width (fit-on-screen); a min-width
    // floor per column lets the track scroll only when the viewport is too
    // narrow for all of them.
    <div className="flex gap-3 overflow-x-auto pb-2">
      {boardColumns(columns, Boolean(onTaskMove)).map((column) => (
        <BoardColumn
          key={column.status}
          column={column}
          {...(onTaskOpen ? { onTaskOpen } : {})}
          {...(taskActions ? { taskActions } : {})}
          {...(busyId !== undefined ? { busyId } : {})}
          {...(membersById ? { membersById } : {})}
          {...(labelsById ? { labelsById } : {})}
          {...(dnd ? { dnd } : {})}
        />
      ))}
    </div>
  );
}
