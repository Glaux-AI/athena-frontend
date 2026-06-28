"use client";

/**
 * SwimlaneBoard - the board grouped into horizontal lanes (one per owner /
 * priority / domain / type), each lane carrying its own status-column row. The
 * org-scale "slice the board by who/what" view; the plain status board
 * (`KanbanBoard`) is the default. Presentational: the page computes the lanes
 * (`groupIntoLanes`) and owns actions + selection (via `SelectionProvider`).
 */

import { type ReactNode } from "react";
import { LayoutGrid } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Stack } from "@/components/layout/primitives";
import type { Label, Member, Task } from "@/lib/api/client";
import type { Swimlane } from "@/lib/work/board-group";

import { BoardColumn } from "./board-column";
import { type TaskCardActions } from "./task-card";

export function SwimlaneBoard({
  lanes,
  onTaskOpen,
  taskActions,
  busyId,
  emptyAction,
  membersById,
  labelsById,
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
}) {
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

  return (
    <Stack gap="5">
      {lanes.map((lane) => (
        <div key={lane.key}>
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-sm font-semibold text-[var(--text)]">
              {lane.label}
            </span>
            <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--text-muted)]">
              {lane.total}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {lane.columns.map((column) => (
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
        </div>
      ))}
    </Stack>
  );
}
