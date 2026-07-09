"use client";

/**
 * One List-view row - a task's facts as dense cells, every fact editable in
 * place through the shared property controls (Work OS rehaul W3: the same
 * editors the board card menu and the cockpit rail use, so an edit behaves
 * identically everywhere). The row itself navigates to the cockpit; the
 * editors stop propagation, so clicking a pill edits instead of opening.
 */

import Link from "next/link";
import { UserPlus } from "lucide-react";

import type {
  Cycle,
  Label,
  Member,
  Task,
  TaskPatchInput,
} from "@/lib/api/client";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { MemberPicker } from "@/components/ui/member-picker";
import { TaskIdChip } from "@/components/work/task-id-chip";
import {
  DueDateControl,
  EstimateControl,
  LabelsControl,
  PriorityControl,
  StatusControl,
} from "@/components/work/property-controls";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { labelColorClass, splitLabelKey } from "@/lib/work/label-meta";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

/** Keep in sync with the header row in `task-list.tsx`. */
export const LIST_COLUMN_COUNT = 11;

const CELL = "px-3 py-1.5 align-middle";

export function TaskListRow({
  task,
  membersById,
  members,
  membersLoading,
  labels,
  labelsById,
  cyclesById,
  meId,
  busy,
  onOpen,
  onPatch,
  onToggleLabel,
}: {
  task: Task;
  /** Lookup incl. deactivated people - a departed assignee still shows a name. */
  membersById: Map<string, Member>;
  /** Active members only - the assign picker's candidate pool. */
  members: Member[];
  membersLoading: boolean;
  labels: Label[];
  labelsById: Map<string, Label>;
  /** Cycles known to the page (the in-scope team's) - resolves the sprint
   *  name; an out-of-scope cycle renders a generic chip (list v1). */
  cyclesById: Map<string, Cycle>;
  meId: string | null;
  /** A mutation for this row is in flight - the editors lock, the row dims. */
  busy: boolean;
  onOpen: (id: string) => void;
  onPatch: (patch: TaskPatchInput, ok: string) => Promise<void>;
  onToggleLabel: (labelId: string, next: boolean) => Promise<void>;
}) {
  const typeMeta = TASK_TYPE_META[task.type];
  const TypeIcon = typeMeta.Icon;
  const assignee = task.assignee ? membersById.get(task.assignee) ?? null : null;
  const taskLabels = task.label_ids
    .map((id) => labelsById.get(id))
    .filter((l): l is Label => Boolean(l));
  const cycleName = task.cycle_id
    ? cyclesById.get(task.cycle_id)?.name ?? "Sprint"
    : null;

  return (
    <tr
      onClick={() => onOpen(task.id)}
      className={cn(
        "cursor-pointer border-b border-[var(--border)] transition-colors last:border-b-0 hover:bg-[var(--surface-2)]",
        busy && "opacity-60",
      )}
    >
      <td className={cn(CELL, "whitespace-nowrap")}>
        <TaskIdChip id={task.display_id} />
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <TypeIcon
          className="size-3.5 text-[var(--text-muted)]"
          role="img"
          aria-label={typeMeta.label}
        />
      </td>
      {/* The title is the row header AND a real link - keyboard users tab to
          it; mouse users can click anywhere on the row. */}
      <th scope="row" className={cn(CELL, "w-full max-w-0 text-left font-normal")}>
        <Link
          href={`/work/${task.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate text-sm text-[var(--text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {task.title}
        </Link>
      </th>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <StatusControl
          value={task.status}
          railed={task.type !== "task"}
          disabled={busy}
          onChange={(s) => onPatch({ status: s }, "Status updated.")}
        />
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <MemberPicker
          members={members}
          value={task.assignee}
          loading={membersLoading}
          onSelect={(m) => void onPatch({ assignee: m.user_id }, "Assigned.")}
          listLabel="Members"
          {...(meId && task.assignee !== meId
            ? {
                header: (close: () => void) => (
                  <PickerActionRow
                    onClick={() => {
                      close();
                      void onPatch({ assignee: meId }, "Assigned to you.");
                    }}
                  >
                    <UserPlus className="size-3.5 text-[var(--primary)]" aria-hidden />
                    Assign to me
                  </PickerActionRow>
                ),
              }
            : {})}
          {...(task.assignee
            ? {
                footer: (close: () => void) => (
                  <>
                    <div className="my-1 h-px bg-[var(--border)]" />
                    <PickerActionRow
                      onClick={() => {
                        close();
                        void onPatch({ assignee: null }, "Unassigned.");
                      }}
                    >
                      Unassign
                    </PickerActionRow>
                  </>
                ),
              }
            : {})}
        >
          <button
            type="button"
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            aria-label={
              assignee
                ? `Change assignee (now ${assignee.display_name})`
                : task.assignee
                  ? "Change assignee"
                  : "Assign someone"
            }
            className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            {assignee ? (
              <>
                <ActorAvatar name={assignee.display_name} size={18} />
                <span className="truncate text-[var(--text)]">{assignee.display_name}</span>
              </>
            ) : task.assignee ? (
              // Set but unresolvable (roster loading / removed user) - show
              // "Assigned", never a misleading empty "Assign".
              <>
                <ActorAvatar name="Member" size={18} />
                <span className="text-[var(--text-muted)]">Assigned</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--text-subtle)]">
                <UserPlus className="size-3" aria-hidden />
                Assign
              </span>
            )}
          </button>
        </MemberPicker>
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <PriorityControl
          value={task.priority}
          disabled={busy}
          onChange={(p) => onPatch({ priority: p }, p ? "Priority updated." : "Priority cleared.")}
        />
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <DueDateControl
          value={task.target_date}
          disabled={busy}
          onChange={(d) => onPatch({ target_date: d }, d ? "Due date set." : "Due date cleared.")}
        />
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <LabelsControl
          value={task.label_ids}
          labels={labels}
          disabled={busy}
          onToggle={(labelId, next) => onToggleLabel(labelId, next)}
          {...(taskLabels.length > 0
            ? {
                trigger: (
                  <span className="flex items-center gap-1">
                    {taskLabels.slice(0, 2).map((l) => {
                      const { prefix, value } = splitLabelKey(l.key);
                      return (
                        <span
                          key={l.id}
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                            labelColorClass(l.color),
                          )}
                        >
                          {prefix && <span className="mr-0.5 opacity-60">{prefix}:</span>}
                          {value}
                        </span>
                      );
                    })}
                    {taskLabels.length > 2 && (
                      <span className="text-[10px] text-[var(--text-subtle)]">
                        +{taskLabels.length - 2}
                      </span>
                    )}
                  </span>
                ),
              }
            : {})}
        />
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        {/* Plain chip in list v1 - the sprint editor needs the task's team's
            cycles, which the list doesn't fetch per row. */}
        {cycleName && (
          <span className="text-xs text-[var(--text-muted)]">{cycleName}</span>
        )}
      </td>
      <td className={cn(CELL, "whitespace-nowrap")}>
        <EstimateControl
          value={task.estimate_points}
          disabled={busy}
          onChange={(n) => onPatch({ estimate_points: n }, n != null ? "Estimate set." : "Estimate cleared.")}
        />
      </td>
      <td className={cn(CELL, "whitespace-nowrap text-xs text-[var(--text-muted)]")}>
        {formatDateTime(task.updated_at)}
      </td>
    </tr>
  );
}

/** A quiet action row inside the assign picker (header/footer slots). */
function PickerActionRow({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {children}
    </button>
  );
}
