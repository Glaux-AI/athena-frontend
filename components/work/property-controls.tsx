"use client";

/**
 * Inline property editors - the one set of controls every work surface uses
 * to edit a task fact in place (Work OS rehaul W3/W8): the List view's cells,
 * the board card quick actions, and the cockpit's properties rail all compose
 * these, so an edit behaves identically everywhere.
 *
 * Each control renders a compact trigger (the current value) and opens a
 * small popover; picking a value calls the async `onChange` and closes. The
 * parent owns the mutation + refetch (these are presentation + intent only).
 * Click/keydown stop propagation so a control inside a row-link edits instead
 * of navigating.
 */

import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarClock, Check, Minus } from "lucide-react";

import { cn } from "@/lib/cn";
import type {
  Cycle,
  Label,
  TaskPriority,
  TaskStatus,
} from "@/lib/api/client";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { labelColorClass, splitLabelKey } from "@/lib/work/label-meta";
import { BOARD_COLUMN_ORDER, TASK_STATUS_LABEL } from "@/lib/work/task-meta";

/** Statuses a human may move a task to by hand. `cancelled` is a separate
 *  remove-with-reason action (never a plain status pick). */
const HUMAN_STATUS_TARGETS: TaskStatus[] = BOARD_COLUMN_ORDER.filter(
  (s) => s !== "cancelled",
);

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Shared popover shell: a borderless trigger that reads as content until
 *  hover, then affords the edit. */
export function PropertyPopover({
  trigger,
  children,
  open,
  onOpenChange,
  ariaLabel,
  disabled = false,
  align = "start",
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  align?: "start" | "end";
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left",
            "transition-colors hover:bg-[var(--surface-2)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            disabled && "cursor-default hover:bg-transparent",
          )}
        >
          {trigger}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="glass animate-modal-in z-50 w-56 rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none"
        >
          {children(() => onOpenChange(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function OptionRow({
  selected,
  onPick,
  children,
  muted = false,
}: {
  selected: boolean;
  onPick: () => void;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        muted ? "text-[var(--text-muted)]" : "text-[var(--text)]",
        "hover:bg-[var(--surface-2)]",
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {selected && <Check className="size-3.5" aria-hidden />}
      </span>
      {children}
    </button>
  );
}

/** Status - the pill IS the trigger. Railed tasks exclude `in_review` (the
 *  gate parks/releases that state; a manual move would lie to the rail). */
export function StatusControl({
  value,
  onChange,
  railed,
  disabled = false,
}: {
  value: TaskStatus;
  onChange: (next: TaskStatus) => Promise<void> | void;
  /** True when the task has an AI stage rail (every type except `task`). */
  railed: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const targets = HUMAN_STATUS_TARGETS.filter(
    (s) => !(railed && s === "in_review"),
  );
  return (
    <PropertyPopover
      open={open}
      onOpenChange={setOpen}
      ariaLabel={`Change status (now ${TASK_STATUS_LABEL[value]})`}
      disabled={disabled}
      trigger={<TaskStatusPill status={value} />}
    >
      {(close) => (
        <div role="menu">
          {targets.map((s) => (
            <OptionRow
              key={s}
              selected={s === value}
              onPick={() => {
                close();
                if (s !== value) void onChange(s);
              }}
            >
              <TaskStatusPill status={s} />
            </OptionRow>
          ))}
          {railed && (
            <p className="px-2 pb-1 pt-1.5 text-[10px] text-[var(--text-subtle)]">
              In review is set by the stage gate, not by hand.
            </p>
          )}
        </div>
      )}
    </PropertyPopover>
  );
}

/** Priority - urgent..low plus an explicit "No priority". */
export function PriorityControl({
  value,
  onChange,
  disabled = false,
}: {
  value: TaskPriority | null;
  onChange: (next: TaskPriority | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PropertyPopover
      open={open}
      onOpenChange={setOpen}
      ariaLabel={`Change priority (now ${value ? PRIORITY_LABEL[value] : "none"})`}
      disabled={disabled}
      trigger={
        value ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              value === "urgent"
                ? "bg-[var(--danger-soft)] text-[var(--danger-ink)]"
                : value === "high"
                  ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]"
                  : "bg-[var(--surface-3)] text-[var(--text-muted)]",
            )}
          >
            {PRIORITY_LABEL[value]}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-subtle)]">
            <Minus className="size-3" aria-hidden />
            Priority
          </span>
        )
      }
    >
      {(close) => (
        <div role="menu">
          {PRIORITY_ORDER.map((p) => (
            <OptionRow
              key={p}
              selected={p === value}
              onPick={() => {
                close();
                if (p !== value) void onChange(p);
              }}
            >
              {PRIORITY_LABEL[p]}
            </OptionRow>
          ))}
          <OptionRow
            selected={value === null}
            muted
            onPick={() => {
              close();
              if (value !== null) void onChange(null);
            }}
          >
            No priority
          </OptionRow>
        </div>
      )}
    </PropertyPopover>
  );
}

/** Due date - a native date input in a popover (no calendar dependency). */
export function DueDateControl({
  value,
  onChange,
  disabled = false,
}: {
  /** ISO date (yyyy-mm-dd) or null. */
  value: string | null;
  onChange: (next: string | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  return (
    <PropertyPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value ?? "");
      }}
      ariaLabel={value ? `Change due date (now ${value})` : "Set a due date"}
      disabled={disabled}
      trigger={
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            value ? "text-[var(--text-muted)]" : "text-[var(--text-subtle)]",
          )}
        >
          <CalendarClock className="size-3" aria-hidden />
          {value ?? "Due date"}
        </span>
      }
    >
      {(close) => (
        <div className="p-2">
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Due date"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                close();
                if (value !== null) void onChange(null);
              }}
              className="rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                const next = draft.trim() || null;
                if (next !== value) void onChange(next);
              }}
              className="rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-[var(--primary-fg)] transition-opacity hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </PropertyPopover>
  );
}

/** Estimate points - a small number input (team scale renders later). */
export function EstimateControl({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange: (next: number | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  return (
    <PropertyPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value != null ? String(value) : "");
      }}
      ariaLabel={
        value != null ? `Change estimate (now ${value} points)` : "Set an estimate"
      }
      disabled={disabled}
      trigger={
        value != null ? (
          <span className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[10px] font-medium tabular-nums text-[var(--text-muted)]">
            {value}pt
          </span>
        ) : (
          <span className="text-xs text-[var(--text-subtle)]">Estimate</span>
        )
      }
    >
      {(close) => (
        <form
          className="p-2"
          onSubmit={(e) => {
            e.preventDefault();
            close();
            // An empty draft clears; junk / negative input is a NO-OP (it
            // must never silently clear a real estimate - review fix).
            if (draft.trim() === "") {
              if (value !== null) void onChange(null);
              return;
            }
            const parsed = Number(draft);
            if (Number.isNaN(parsed) || parsed < 0) return;
            if (parsed !== value) void onChange(parsed);
          }}
        >
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Estimate points"
            placeholder="Points"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="submit"
              className="rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-[var(--primary-fg)] transition-opacity hover:opacity-90"
            >
              Save
            </button>
          </div>
        </form>
      )}
    </PropertyPopover>
  );
}

/** Sprint membership - pick among the team's open cycles or Backlog. */
export function CycleControl({
  value,
  cycles,
  onChange,
  disabled = false,
}: {
  value: string | null;
  /** The task's team's cycles (planned + active first; completed excluded). */
  cycles: Cycle[];
  onChange: (next: string | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = cycles.find((c) => c.id === value) ?? null;
  const open_cycles = cycles.filter((c) => c.state !== "completed");
  return (
    <PropertyPopover
      open={open}
      onOpenChange={setOpen}
      ariaLabel={
        current ? `Change sprint (now ${current.name})` : "Move into a sprint"
      }
      disabled={disabled || open_cycles.length === 0}
      trigger={
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            current ? "text-[var(--text-muted)]" : "text-[var(--text-subtle)]",
          )}
        >
          {current ? current.name : "Backlog"}
          {current?.state === "active" && (
            <span
              className="size-1.5 rounded-full bg-[var(--success)]"
              aria-hidden
            />
          )}
        </span>
      }
    >
      {(close) => (
        <div role="menu">
          <OptionRow
            selected={value === null}
            muted
            onPick={() => {
              close();
              if (value !== null) void onChange(null);
            }}
          >
            Backlog (no sprint)
          </OptionRow>
          {open_cycles.map((c) => (
            <OptionRow
              key={c.id}
              selected={c.id === value}
              onPick={() => {
                close();
                if (c.id !== value) void onChange(c.id);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="text-[10px] text-[var(--text-subtle)]">
                {c.state}
              </span>
            </OptionRow>
          ))}
        </div>
      )}
    </PropertyPopover>
  );
}

/** Labels - toggle the org's curated vocabulary on/off the task. */
export function LabelsControl({
  value,
  labels,
  onToggle,
  disabled = false,
  trigger,
}: {
  value: string[];
  labels: Label[];
  /** Attach (`next=true`) / detach one label; parent persists + refetches. */
  onToggle: (labelId: string, next: boolean) => Promise<void> | void;
  disabled?: boolean;
  /** Custom trigger (e.g. the card's chips row). Default = a quiet "Labels". */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = labels.filter((l) => !l.archived);
  return (
    <PropertyPopover
      open={open}
      onOpenChange={setOpen}
      ariaLabel="Edit labels"
      disabled={disabled || active.length === 0}
      trigger={
        trigger ?? (
          <span className="text-xs text-[var(--text-subtle)]">
            {value.length > 0 ? `${value.length} labels` : "Labels"}
          </span>
        )
      }
    >
      {(close) => (
        <div role="menu" className="max-h-64 overflow-y-auto">
          {active.map((l) => {
            const on = value.includes(l.id);
            const { prefix, value: key } = splitLabelKey(l.key);
            return (
              <OptionRow
                key={l.id}
                selected={on}
                onPick={() => void onToggle(l.id, !on)}
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                    labelColorClass(l.color),
                  )}
                >
                  {prefix && <span className="mr-0.5 opacity-60">{prefix}:</span>}
                  {key}
                </span>
              </OptionRow>
            );
          })}
          <button
            type="button"
            onClick={close}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[11px] text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)]"
          >
            Done
          </button>
        </div>
      )}
    </PropertyPopover>
  );
}
