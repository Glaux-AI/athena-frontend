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

import { ActorAvatar } from "@/components/mascot/actor-avatar";
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
  busy,
  onSetPriority,
  onReassign,
  onMarkDone,
  onRemove,
  onClear,
}: {
  count: number;
  members: Member[];
  busy: boolean;
  onSetPriority: (p: TaskPriority | null) => void;
  onReassign: (userId: string | null) => void;
  onMarkDone: () => void;
  onRemove: (reason: TaskCancelReason) => void;
  onClear: () => void;
}) {
  const disabled = busy || count === 0;
  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-3)]">
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

      <Menu
        label="Reassign"
        icon={<UserPlus className="size-3.5" aria-hidden />}
        disabled={disabled}
        wide
      >
        {members.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-[var(--text-muted)]">
            No teammates to assign yet.
          </p>
        )}
        {members.map((m) => (
          <MenuItem key={m.user_id} onClick={() => onReassign(m.user_id)}>
            <ActorAvatar name={m.display_name} size={18} />
            <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
          </MenuItem>
        ))}
        <div className="my-1 h-px bg-[var(--border)]" />
        <MenuItem onClick={() => onReassign(null)}>Unassign</MenuItem>
      </Menu>

      <BarButton onClick={onMarkDone} disabled={disabled}>
        <CheckCircle2 className="size-3.5 text-[var(--success-ink)]" aria-hidden />
        Done
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
      <BarButton onClick={onClear} disabled={busy}>
        <X className="size-3.5" aria-hidden />
        Done selecting
      </BarButton>
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
            "glass animate-modal-in z-50 max-h-[280px] overflow-auto rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none",
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
