"use client";

/**
 * BacklogList - a team's ranked backlog (Work OS rehaul W5): the not-yet-
 * committed work (`cycle_id` null, statuses backlog/triage/todo) as ONE
 * ordered list. Drag a row to reorder (the `tasks.rank` writer via
 * `api.tasks.reorder`), point it inline, and "Move to sprint" commits it to
 * the team's next cycle. Hand-rolled HTML5 drag - no dependency, understated
 * affordances, keyboard path via the row's Move up/down menu-free buttons.
 */

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api, type Cycle, type Task } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack } from "@/components/layout/primitives";
import { TaskIdChip } from "@/components/work/task-id-chip";
import {
  EstimateControl,
  PriorityControl,
} from "@/components/work/property-controls";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { cn } from "@/lib/cn";

/** The neighbors a row lands between when dropped at `index` (an insertion
 *  point in the FULL list, dragged row included). Positions past the dragged
 *  row shift up by one once it is removed - without that adjustment every
 *  downward drag landed one slot lower than the drop indicator (review fix).
 *  Exported for tests. */
export function reorderNeighbors(
  ordered: readonly { id: string }[],
  draggedId: string,
  index: number,
): { after_id?: string; before_id?: string } {
  const fromIdx = ordered.findIndex((t) => t.id === draggedId);
  const rest = ordered.filter((t) => t.id !== draggedId);
  const effective = fromIdx !== -1 && index > fromIdx ? index - 1 : index;
  const clamped = Math.min(Math.max(effective, 0), rest.length);
  const after = rest[clamped - 1];
  const before = rest[clamped];
  return {
    ...(after ? { after_id: after.id } : {}),
    ...(before ? { before_id: before.id } : {}),
  };
}

export function BacklogList({
  tasks,
  targetCycle,
  onOpen,
  onChanged,
}: {
  /** Ranked backlog rows (server order = rank, created_at). */
  tasks: Task[];
  /** Where "Move to sprint" commits to (the active or next planned cycle). */
  targetCycle: Cycle | null;
  onOpen: (id: string) => void;
  /** Re-fetch after a reorder / commit / inline edit. */
  onChanged: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const mutate = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusyId(id);
    try {
      await fn();
      if (ok) toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work - try again.");
    } finally {
      setBusyId(null);
    }
  };

  const dropAt = (index: number) => {
    if (!dragId || busyId !== null) return;
    const from = tasks.findIndex((t) => t.id === dragId);
    const id = dragId;
    setDragId(null);
    setOverIndex(null);
    if (from === -1 || from === index || from === index - 1) return;
    const neighbors = reorderNeighbors(tasks, id, index);
    if (!neighbors.after_id && !neighbors.before_id) return;
    void mutate(id, () => api.tasks.reorder(id, neighbors));
  };

  const moveBy = (task: Task, delta: -1 | 1) => {
    if (busyId !== null) return;
    const from = tasks.findIndex((t) => t.id === task.id);
    const to = delta === -1 ? from - 1 : from + 2;
    if (from === -1 || to < 0 || to > tasks.length) return;
    const neighbors = reorderNeighbors(tasks, task.id, to);
    if (!neighbors.after_id && !neighbors.before_id) return;
    void mutate(task.id, () => api.tasks.reorder(task.id, neighbors));
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Backlog is clear"
        description="Everything is committed to a sprint or done. New tasks without a sprint land here."
      />
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <Stack gap="0" className="divide-y divide-[var(--border)]">
        {tasks.map((task, i) => {
          const meta = TASK_TYPE_META[task.type];
          const Icon = meta.Icon;
          return (
            <div
              key={task.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const below = e.clientY > rect.top + rect.height / 2;
                setOverIndex(below ? i + 1 : i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropAt(overIndex ?? i);
              }}
              className={cn(
                "group relative flex items-center gap-2 px-2 py-2 transition-colors hover:bg-[var(--surface-2)]",
                dragId === task.id && "opacity-50",
                overIndex === i &&
                  dragId &&
                  "before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:rounded before:bg-[var(--primary)]",
                overIndex === i + 1 &&
                  dragId &&
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded after:bg-[var(--primary)]",
              )}
            >
              <span
                draggable={busyId === null}
                onDragStart={(e) => {
                  setDragId(task.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", task.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverIndex(null);
                }}
                className="cursor-grab text-[var(--text-subtle)] active:cursor-grabbing"
                aria-hidden
              >
                <GripVertical className="size-4" />
              </span>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-subtle)]">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <Icon className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                <TaskIdChip id={task.display_id} />
                <span className="truncate text-sm font-medium text-[var(--text)]">
                  {task.title}
                </span>
              </button>
              <span
                className="flex shrink-0 items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <PriorityControl
                  value={task.priority}
                  onChange={(p) =>
                    mutate(task.id, () => api.tasks.patch(task.id, { priority: p }))
                  }
                />
                <EstimateControl
                  value={task.estimate_points}
                  onChange={(pts) =>
                    mutate(
                      task.id,
                      () => api.tasks.patch(task.id, { estimate_points: pts }),
                    )
                  }
                />
                {/* Keyboard reorder path (drag is pointer-only). */}
                <span className="hidden items-center gap-0.5 group-focus-within:inline-flex group-hover:inline-flex">
                  <button
                    type="button"
                    aria-label={`Move ${task.display_id} up`}
                    disabled={i === 0 || busyId === task.id}
                    onClick={() => moveBy(task, -1)}
                    className="rounded p-0.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${task.display_id} down`}
                    disabled={i === tasks.length - 1 || busyId === task.id}
                    onClick={() => moveBy(task, 1)}
                    className="rounded p-0.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </button>
                </span>
                {targetCycle && (
                  <button
                    type="button"
                    disabled={busyId === task.id}
                    onClick={() =>
                      void mutate(
                        task.id,
                        () => api.tasks.patch(task.id, { cycle_id: targetCycle.id }),
                        `Moved to ${targetCycle.name}.`,
                      )
                    }
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] disabled:opacity-40"
                  >
                    Move to sprint
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </Stack>
    </Card>
  );
}
