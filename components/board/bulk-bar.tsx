"use client";

/**
 * BulkBar - the floating action bar for the board's multi-select mode. Shows
 * while select mode is on; the actions apply to every selected task at once
 * (set priority / reassign owner / mark done / remove). Triage at org scale
 * without opening tasks one at a time. The page owns the mutations + reload.
 */

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  CheckCircle2,
  ChevronDown,
  Flag,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";

import { MemberPicker } from "@/components/ui/member-picker";
import { cn } from "@/lib/cn";
import type { Member, TaskCancelReason, TaskPriority } from "@/lib/api/client";

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function BulkBar({
  count,
  members,
  membersLoading = false,
  busy,
  onSetPriority,
  onReassign,
  onMarkDone,
  onRemove,
  onClear,
}: {
  count: number;
  members: Member[];
  /** True while the org roster is still loading - shows skeleton rows in the picker. */
  membersLoading?: boolean;
  busy: boolean;
  onSetPriority: (p: TaskPriority | null) => void;
  onReassign: (userId: string | null) => void;
  onMarkDone: () => void;
  onRemove: (reason: TaskCancelReason) => void;
  onClear: () => void;
}) {
  const disabled = busy || count === 0;
  return (
    <div className="glass-panel fixed bottom-6 left-1/2 z-[var(--z-chrome)] flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 px-3 py-2">
      <span className="px-1 text-sm font-medium text-[var(--text)]">
        {count} selected
      </span>
      <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />

      <Menu
        label="Priority"
        icon={<Flag className="size-3.5" aria-hidden />}
        disabled={disabled}
      >
        {PRIORITIES.map((p) => (
          <MenuItem key={p} onClick={() => onSetPriority(p)}>
            {PRIORITY_LABEL[p]}
          </MenuItem>
        ))}
        <div className="my-1 h-px bg-[var(--border)]" />
        <MenuItem onClick={() => onSetPriority(null)}>Clear priority</MenuItem>
      </Menu>

      {/* Owner reassign only - no clear: a LIVE task always keeps an
          accountable owner (the server 409s a clear), so offering "Unassign"
          here could never succeed. */}
      <MemberPicker
        members={members}
        onSelect={(m) => onReassign(m.user_id)}
        loading={membersLoading}
        side="top"
        align="start"
        listLabel="Reassign to"
        contentClassName="w-56"
      >
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          <UserPlus className="size-3.5" aria-hidden />
          Reassign
          <ChevronDown className="size-3 text-[var(--text-subtle)]" aria-hidden />
        </button>
      </MemberPicker>

      <BarButton onClick={onMarkDone} disabled={disabled}>
        <CheckCircle2 className="size-3.5 text-[var(--success-ink)]" aria-hidden />
        Mark done
      </BarButton>

      <Menu
        label="Remove"
        icon={<XCircle className="size-3.5" aria-hidden />}
        disabled={disabled}
      >
        <MenuItem onClick={() => onRemove("not_needed")}>Not needed</MenuItem>
        <MenuItem onClick={() => onRemove("obsolete")}>Obsolete</MenuItem>
      </Menu>

      <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
      <button
        type="button"
        aria-label="Done selecting"
        title="Done selecting"
        onClick={onClear}
        disabled={busy}
        className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function BarButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Menu({
  label,
  icon,
  disabled,
  wide = false,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          {icon}
          {label}
          <ChevronDown className="size-3 text-[var(--text-subtle)]" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="top"
          sideOffset={6}
          onClick={() => setOpen(false)}
          className={cn(
            "glass-panel animate-modal-in z-[var(--z-popover)] max-h-[280px] overflow-auto p-1 focus:outline-none",
            wide ? "w-56" : "w-40",
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MenuItem({
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
