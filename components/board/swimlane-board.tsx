"use client";

/**
 * SwimlaneBoard - the board grouped into horizontal lanes (one per owner /
 * priority / domain / type), each lane carrying its own status-column row. The
 * org-scale "slice the board by who/what" view; the plain status board
 * (`KanbanBoard`) is the default. Presentational: the page computes the lanes
 * (`groupIntoLanes`) and owns actions + selection (via `SelectionProvider`).
 *
 * With `onTaskMove`, cards drag between a lane's status columns (each lane
 * renders the full column set so empty statuses are reachable). A drag changes
 * STATUS only - lane identity (owner / team / ...) is not changed by drag in
 * v1, so a drop landing in another lane's column is just a status move.
 */

import { useState, type ReactNode } from "react";
import { LayoutGrid } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Stack } from "@/components/layout/primitives";
import { boardColumns } from "@/lib/work/board-dnd";
import type { Label, Member, Task, TaskStatus } from "@/lib/api/client";
import type { Swimlane } from "@/lib/work/board-group";

import { BoardColumn, type BoardDnd } from "./board-column";
import { type TaskCardActions } from "./task-card";

export function SwimlaneBoard({
  lanes,
  onTaskOpen,
  taskActions,
  busyId,
  emptyAction,
  membersById,
  labelsById,
  onTaskMove,
}: {
  lanes: Swimlane[];
  onTaskOpen?: (task: Task) => void;
  taskActions?: (task: Task) => TaskCardActions | undefined;
  busyId?: string | null;
  emptyAction?: ReactNode;
  /** Resolves owners to people for the card avatars. */
  membersById?: Map<string, Member>;
  /** Resolves label ids to chips. */
  labelsById?: Map<string, Label>;
  /** Makes the board draggable: a card dropped on a column asks the parent to
   *  move it there (status only - see the header note). Absent = static. */
  onTaskMove?: (task: Task, next: TaskStatus) => void;
}) {
  // One drag state across every lane - see KanbanBoard for why board-level.
  const [dragging, setDragging] = useState<Task | null>(null);
  const total = lanes.reduce((n, l) => n + l.total, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-5" />}
        title="No work here"
        description="Nothing matches these filters. Clear a filter, or switch the grouping back to Status."
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
    <Stack gap="5">
      {lanes.map((lane) => (
        <div key={lane.key}>
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-sm font-semibold text-[var(--text)]">
              {lane.label}
            </span>
            <Pill tone="neutral" size="sm" className="tabular-nums">
              {lane.total}
            </Pill>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {boardColumns(lane.columns, Boolean(onTaskMove)).map((column) => (
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
        </div>
      ))}
    </Stack>
  );
}
