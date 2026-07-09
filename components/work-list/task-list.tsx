"use client";

/**
 * TaskList - the /work List view (Work OS rehaul W3): a dense, inline-editable
 * table over the server-sorted `api.tasks.list` rows - the daily driver. The
 * board stays one click away; this surface is for scanning and triaging many
 * tasks at once.
 *
 * The component owns the inline mutations (PATCH a fact, attach/detach a
 * label) and calls the parent's `onReload` after each one - non-optimistic by
 * design for v1 (the dependency start-gate can 409 a status move; a refetch
 * is always truthful). Errors surface as a toast and change nothing.
 *
 * Grouping is presentation-only: `groupBy` sections the already-fetched rows
 * via `groupIntoSections` (server sort preserved within each section).
 */

import { useState } from "react";
import { ListTodo } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type Cycle,
  type Label,
  type Member,
  type Task,
  type TaskPatchInput,
} from "@/lib/api/client";
import { EmptyState } from "@/components/ui/empty-state";
import {
  groupIntoSections,
  type GroupContext,
  type GroupBy,
  type ListSection,
} from "@/lib/work/board-group";
import type { ListGroupBy } from "@/components/board/board-toolbar";
import { TaskListRow, LIST_COLUMN_COUNT } from "./task-list-row";

const HEADER_CELL =
  "whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]";

export function TaskList({
  tasks,
  groupBy,
  groupCtx,
  members,
  membersLoading,
  labels,
  cyclesById,
  meId,
  onOpen,
  onReload,
  emptyAction,
}: {
  /** Server-sorted rows (the page owns fetch + narrowing). */
  tasks: Task[];
  /** "none" = flat rows; anything else sections the list with headers. */
  groupBy: ListGroupBy;
  /** Lookup maps for section labels (owner/domain/team/label names). */
  groupCtx: GroupContext;
  members: Member[];
  membersLoading: boolean;
  labels: Label[];
  cyclesById: Map<string, Cycle>;
  meId: string | null;
  onOpen: (id: string) => void;
  /** Refetch after any inline mutation (non-optimistic v1). */
  onReload: () => void;
  /** "New task" CTA for the empty state. */
  emptyAction?: React.ReactNode;
}) {
  // One in-flight mutation at a time per row; the row's editors lock while
  // its PATCH runs so a slow request can't double-fire.
  const [busyId, setBusyId] = useState<string | null>(null);

  const patchTask = async (id: string, patch: TaskPatchInput, ok: string) => {
    setBusyId(id);
    try {
      await api.tasks.patch(id, patch);
      toast.success(ok);
      onReload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work - try again.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleLabel = async (taskId: string, labelId: string, next: boolean) => {
    try {
      if (next) await api.labels.attach(taskId, labelId);
      else await api.labels.detach(taskId, labelId);
      onReload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update labels.");
    }
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ListTodo className="size-5" />}
        title="No tasks match this view"
        description="Try widening the scope or removing a filter - or start something new."
        {...(emptyAction ? { action: emptyAction } : {})}
      />
    );
  }

  const sections: ListSection[] =
    groupBy === "none"
      ? [{ key: "__all", label: "", total: tasks.length, tasks }]
      : groupIntoSections(tasks, groupBy as GroupBy, groupCtx);
  const grouped = groupBy !== "none";

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th scope="col" className={HEADER_CELL}>
              ID
            </th>
            <th scope="col" className={HEADER_CELL}>
              <span className="sr-only">Type</span>
            </th>
            <th scope="col" className={HEADER_CELL}>
              Title
            </th>
            <th scope="col" className={HEADER_CELL}>
              Status
            </th>
            <th scope="col" className={HEADER_CELL}>
              Assignee
            </th>
            <th scope="col" className={HEADER_CELL}>
              Priority
            </th>
            <th scope="col" className={HEADER_CELL}>
              Due
            </th>
            <th scope="col" className={HEADER_CELL}>
              Labels
            </th>
            <th scope="col" className={HEADER_CELL}>
              Sprint
            </th>
            <th scope="col" className={HEADER_CELL}>
              Est.
            </th>
            <th scope="col" className={HEADER_CELL}>
              Updated
            </th>
          </tr>
        </thead>
        {sections.map((section) => (
          <tbody key={section.key}>
            {grouped && (
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                <th
                  scope="colgroup"
                  colSpan={LIST_COLUMN_COUNT}
                  className="px-3 py-1.5 text-left text-xs font-semibold text-[var(--text-muted)]"
                >
                  {section.label}
                  <span className="ml-1.5 font-normal text-[var(--text-subtle)]">
                    {section.total}
                  </span>
                </th>
              </tr>
            )}
            {section.tasks.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                membersById={groupCtx.membersById}
                members={members}
                membersLoading={membersLoading}
                labels={labels}
                labelsById={groupCtx.labelsById}
                cyclesById={cyclesById}
                meId={meId}
                busy={busyId === task.id}
                onOpen={onOpen}
                onPatch={(patch, ok) => patchTask(task.id, patch, ok)}
                onToggleLabel={(labelId, next) => toggleLabel(task.id, labelId, next)}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** Row-shaped placeholder for the initial load (skeletons, not spinners). */
export function TaskListSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      aria-hidden
    >
      <div className="border-b border-[var(--border)] px-3 py-2.5">
        <div className="h-3 w-64 animate-pulse rounded bg-[var(--surface-3)]" />
      </div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <div
          key={row}
          className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0"
        >
          <div className="h-3 w-14 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-3 flex-1 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--surface-3)]" />
          <div className="size-4 animate-pulse rounded-full bg-[var(--surface-3)]" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-3)]" />
        </div>
      ))}
    </div>
  );
}
