/**
 * Board drag-and-drop - the pure rules behind the kanban drag surface
 * (`components/board/*`). Hand-rolled HTML5 DnD (repo ethos: the diff viewer
 * and charts are dependency-free; @dnd-kit stays out), so the components carry
 * only event wiring and every rule lives here where it is unit-testable.
 */

import type { KanbanColumn, Task, TaskStatus } from "@/lib/api/client";
import { BOARD_COLUMN_ORDER } from "./task-meta";

/** The dataTransfer type carrying the dragged task's id. A custom MIME keeps
 *  foreign drags (text selections, files) from ever looking like a card. */
export const TASK_DRAG_TYPE = "application/x-athena-task-id";

/** A task is "railed" when its type carries a per-type AI workflow (stage
 *  rail) - every type except the plain `task`. Matters to the board because
 *  the stage gate owns `in_review` on railed tasks. */
export function isRailed(task: Task): boolean {
  return task.type !== "task";
}

/**
 * The drop matrix. Same-status drops are no-ops; `in_review` is blocked for
 * railed tasks (the hard gate owns that state); everything else - including
 * `done` (= Mark done) - is offered. The server still gets the final say
 * (a dep-gated move 409s); this only decides what the board offers.
 */
export function canDropTo(
  task: Task,
  next: TaskStatus,
  railed: boolean,
): boolean {
  if (task.status === next) return false;
  if (next === "in_review" && railed) return false;
  return true;
}

/** Why a drop is refused - surfaced when a drag hovers a blocked column (and
 *  reusable by whatever toast the page raises). Null when the drop is allowed
 *  or is merely a same-status no-op (silence, not an error). */
export function dropHint(task: Task, next: TaskStatus): string | null {
  if (next === "in_review" && task.status !== "in_review" && isRailed(task)) {
    return "In review is set by the stage gate.";
  }
  return null;
}

/**
 * The columns a board actually renders, in BOARD_COLUMN_ORDER (extras the
 * server returns are appended as-is). A static board drops empty columns - an
 * empty status column is pure clutter when nothing can be dropped into it. A
 * draggable board renders the full set, fabricating empty columns, so a card
 * can be dropped into a status nothing occupies yet. `cancelled` is never
 * fabricated (removal goes through the card menu's structured reasons, not a
 * drag).
 */
export function boardColumns(
  columns: KanbanColumn[],
  draggable: boolean,
): KanbanColumn[] {
  const byStatus = new Map(columns.map((c) => [c.status, c]));
  const ordered: KanbanColumn[] = [];
  for (const status of BOARD_COLUMN_ORDER) {
    const column = byStatus.get(status);
    if (column) {
      ordered.push(column);
      byStatus.delete(status);
    } else if (draggable) {
      ordered.push({ status, tasks: [], total: 0 });
    }
  }
  for (const column of byStatus.values()) ordered.push(column);
  return draggable ? ordered : ordered.filter((c) => c.total > 0);
}
