"use client";

/**
 * BoardColumn - one status bucket on the kanban board: a header (status pill +
 * count) over a vertical, internally-scrolling stack of TaskCards. Fluid width
 * (shares the viewport with its siblings) and capped render (long columns show
 * the first N with a "show all" expander) so a busy org stays usable.
 *
 * When the board is draggable (`dnd` present) the whole column is a native
 * HTML5 drop target and each card is draggable. The drop rules live in
 * `lib/work/board-dnd.ts`; the affordances stay understated - a token ring +
 * soft tint on a valid hover, reduced opacity on the in-flight card, and an
 * inline hint on a gate-blocked column. No animation is added, so
 * `prefers-reduced-motion` needs nothing special here.
 */

import { Fragment, useState, type DragEvent } from "react";

import { Stack } from "@/components/layout/primitives";
import { focusRing } from "@/components/ui/focus";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { cn } from "@/lib/cn";
import {
  TASK_DRAG_TYPE,
  canDropTo,
  dropHint,
  isRailed,
} from "@/lib/work/board-dnd";
import type { KanbanColumn, Label, Member, Task, TaskStatus } from "@/lib/api/client";

import { TaskCard, type TaskCardActions } from "./task-card";

/** Cap the cards rendered per column before the "show all" expander kicks in -
 *  bounds the DOM on a busy board while keeping every card reachable. */
const RENDER_CAP = 50;

/** Drag wiring handed down by a draggable board (absent = today's static
 *  board). The board owns the "which card is in flight" state so every column
 *  judges the same drag; the column owns only its own hover affordance. */
export interface BoardDnd {
  /** The task currently being dragged anywhere on the board (null between drags). */
  dragging: Task | null;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  /** A card was dropped on a column that accepts it. */
  onDrop: (task: Task, next: TaskStatus) => void;
}

export function BoardColumn({
  column,
  onTaskOpen,
  taskActions,
  busyId,
  membersById,
  labelsById,
  dnd,
}: {
  column: KanbanColumn;
  onTaskOpen?: (task: Task) => void;
  /** Per-task overflow-menu actions (mark done / archive / delete / restore). */
  taskActions?: (task: Task) => TaskCardActions | undefined;
  /** The task currently mid-mutation (its menu disables). */
  busyId?: string | null;
  /** Resolves owners to people for the card avatars. */
  membersById?: Map<string, Member>;
  /** Resolves label ids to chips. */
  labelsById?: Map<string, Label>;
  /** Present only on a draggable board - see `BoardDnd`. */
  dnd?: BoardDnd;
}) {
  const [showAll, setShowAll] = useState(false);
  // dragenter/dragleave also fire crossing the column's children, so a plain
  // boolean flickers; a counter nets out to "the pointer is inside".
  const [overCount, setOverCount] = useState(0);
  const visible =
    showAll || column.tasks.length <= RENDER_CAP
      ? column.tasks
      : column.tasks.slice(0, RENDER_CAP);
  const hidden = column.tasks.length - visible.length;

  const dragTask = dnd?.dragging ?? null;
  const droppable = dragTask
    ? canDropTo(dragTask, column.status, isRailed(dragTask))
    : false;
  const blocked = dragTask ? dropHint(dragTask, column.status) : null;
  const over = overCount > 0 && dragTask !== null;

  return (
    <div
      className={cn(
        // Translucent well - the column reads as a pane over the app sky
        // rather than an opaque box.
        "flex min-h-0 min-w-[176px] flex-1 basis-0 flex-col gap-2.5 rounded-xl bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)] p-2.5",
        over &&
          droppable &&
          "bg-[var(--primary-soft)] shadow-[0_0_0_2px_var(--ring),0_0_12px_var(--glow-accent)]",
      )}
      {...(dnd
        ? {
            onDragOver: (e: DragEvent<HTMLDivElement>) => {
              // Not preventing default on a refused column keeps the
              // browser's native no-drop cursor - the honest affordance.
              if (!droppable) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            },
            onDragEnter: (e: DragEvent<HTMLDivElement>) => {
              if (droppable) e.preventDefault();
              if (dragTask) setOverCount((c) => c + 1);
            },
            onDragLeave: () => setOverCount((c) => Math.max(0, c - 1)),
            onDrop: (e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setOverCount(0);
              if (!dragTask || !droppable) return;
              // The shared drag state is the source of truth; the id in the
              // dataTransfer cross-checks that this drag is ours at all.
              const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
              if (id && id !== dragTask.id) return;
              dnd.onDrop(dragTask, column.status);
            },
          }
        : {})}
    >
      <div className="flex items-center justify-between px-1">
        <TaskStatusPill status={column.status} />
        <span className="text-xs tabular-nums text-[var(--text-subtle)]">
          {column.total}
        </span>
      </div>
      {over && blocked && (
        <p className="px-1 text-micro text-[var(--text-muted)]">{blocked}</p>
      )}
      {column.tasks.length === 0 ? (
        // A faint dotted orbit marks the empty well (and the drop target when
        // dragging) without shouting; SR users still hear "No tasks".
        <div className="flex justify-center px-1 py-6">
          <span
            className="size-8 rounded-full border border-dashed border-[var(--constellation)]"
            aria-hidden
          />
          <span className="sr-only">No tasks</span>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 max-h-[calc(100vh_-_15rem)]">
          <Stack gap="2">
            {visible.map((task) => {
              const acts = taskActions?.(task);
              const card = (
                <TaskCard
                  task={task}
                  busy={busyId === task.id}
                  {...(onTaskOpen ? { onOpen: () => onTaskOpen(task) } : {})}
                  {...(acts ? { actions: acts } : {})}
                  {...(membersById ? { membersById } : {})}
                  {...(labelsById ? { labelsById } : {})}
                />
              );
              // Static board: the card renders bare, exactly as before.
              if (!dnd) return <Fragment key={task.id}>{card}</Fragment>;
              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
                    // Plain-text fallback for anything else inspecting the drop.
                    e.dataTransfer.setData("text/plain", task.display_id);
                    e.dataTransfer.effectAllowed = "move";
                    // The card itself is the drag image, anchored where it was
                    // grabbed - no bespoke ghost, nothing animated.
                    const rect = e.currentTarget.getBoundingClientRect();
                    e.dataTransfer.setDragImage(
                      e.currentTarget,
                      e.clientX - rect.left,
                      e.clientY - rect.top,
                    );
                    dnd.onDragStart(task);
                  }}
                  onDragEnd={dnd.onDragEnd}
                  className={cn(dragTask?.id === task.id && "opacity-40")}
                >
                  {card}
                </div>
              );
            })}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={cn(
                  "w-full rounded-md border border-dashed border-[var(--border)] py-1.5 text-center text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                  focusRing,
                )}
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
