/**
 * Bucket a flat task list into kanban columns - for the org-wide `/work` board,
 * which reads `api.tasks.list` and buckets client-side (a single domain's board
 * comes server-bucketed from `api.tasks.board`). Columns follow
 * BOARD_COLUMN_ORDER; any status outside it is appended.
 */

import type { KanbanColumn, Task, TaskStatus } from "@/lib/api/client";

import { BOARD_COLUMN_ORDER } from "./task-meta";

export function bucketTasksByStatus(tasks: Task[]): KanbanColumn[] {
  const buckets = new Map<TaskStatus, Task[]>();
  for (const status of BOARD_COLUMN_ORDER) buckets.set(status, []);
  for (const task of tasks) {
    const arr = buckets.get(task.status);
    if (arr) arr.push(task);
    else buckets.set(task.status, [task]);
  }
  return [...buckets.entries()].map(([status, bucketed]) => ({
    status,
    tasks: bucketed,
    total: bucketed.length,
  }));
}
