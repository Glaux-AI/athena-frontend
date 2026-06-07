"use client";

/**
 * KanbanBoard — the horizontal status board. Presentational: the parent fetches
 * tasks (org-wide `api.tasks.list` bucketed via `bucketTasksByStatus`, or a
 * domain's server-bucketed `api.tasks.board`) and passes `columns`. Columns
 * render in BOARD_COLUMN_ORDER; any extra statuses are appended.
 */

import { type ReactNode } from "react";
import { LayoutGrid } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { BOARD_COLUMN_ORDER } from "@/lib/work/task-meta";
import type { KanbanColumn, Task } from "@/lib/api/client";

import { BoardColumn } from "./board-column";

export function KanbanBoard({
  columns,
  onTaskClick,
  emptyAction,
}: {
  columns: KanbanColumn[];
  onTaskClick?: (task: Task) => void;
  emptyAction?: ReactNode;
}) {
  const total = columns.reduce((n, c) => n + c.total, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={<LayoutGrid className="size-5" />}
        title="No work yet"
        description="Create a task and Athena will work it through its lifecycle — frame, plan, execute, review."
        action={emptyAction}
      />
    );
  }

  return (
    // Horizontal-scroll track: no layout primitive models a no-wrap scrolling
    // board, so a bespoke flex is the justified exception here (UX standard §5).
    <div className="flex gap-3 overflow-x-auto pb-2">
      {orderColumns(columns).map((column) => (
        <BoardColumn key={column.status} column={column} onTaskClick={onTaskClick} />
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
