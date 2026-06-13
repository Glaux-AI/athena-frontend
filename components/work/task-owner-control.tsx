"use client";

/**
 * TaskOwnerControl - who's on a task, in the cockpit header.
 *
 * Two facts, per the assignment model (owner = the accountable human; Athena is
 * the executor):
 *   • Owner  - a human, assignable. Click to pick a member or "Pick up" (assign
 *     yourself); clears to Unassigned. Writes `owner_user_id` via PATCH.
 *   • Worked by - the executor. `assignee === "athena"` (the default) renders the
 *     owl; a human executor renders their initials. Read-only here (Athena does
 *     the work; a human runs/authors stages via the stage actions).
 */

import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api, type Member } from "@/lib/api/client";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { cn } from "@/lib/cn";

export function TaskOwnerControl({
  taskId,
  ownerUserId,
  assignee,
  members,
  byId,
  meId,
  onChanged,
}: {
  taskId: string;
  ownerUserId: string | null;
  /** Executor - `"athena"` or a user id. */
  assignee: string;
  members: Member[];
  byId: Map<string, Member>;
  meId: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const owner = ownerUserId ? byId.get(ownerUserId) ?? null : null;
  const isAthena = assignee === "athena";
  const worker = isAthena ? null : byId.get(assignee) ?? null;

  const setOwner = async (next: string | null) => {
    setOpen(false);
    if (next === ownerUserId) return;
    setBusy(true);
    try {
      await api.tasks.patch(taskId, { owner_user_id: next });
      toast.success(
        next === null
          ? "Owner cleared."
          : next === meId
            ? "You're on it - you own this task."
            : "Owner assigned.",
      );
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the owner.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">Owner</span>
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              {owner ? (
                <>
                  <ActorAvatar name={owner.display_name} size={18} />
                  <span className="max-w-[140px] truncate">{owner.display_name}</span>
                </>
              ) : ownerUserId ? (
                // Set, but not resolvable (members still loading, or a removed
                // user) - show "Assigned", never the misleading "Assign" empty state.
                <>
                  <ActorAvatar name="Member" size={18} />
                  <span className="text-[var(--text-muted)]">Assigned</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                  <UserPlus className="size-3.5" aria-hidden />
                  Assign
                </span>
              )}
              <ChevronDown className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              className="glass animate-modal-in z-50 max-h-[320px] w-60 overflow-auto rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none"
            >
              {meId && ownerUserId !== meId && (
                <OwnerItem onClick={() => void setOwner(meId)}>
                  <UserPlus className="size-3.5 text-[var(--primary)]" aria-hidden />
                  Pick up (assign to me)
                </OwnerItem>
              )}
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Members
              </p>
              {members.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-[var(--text-muted)]">
                  No teammates to assign yet.
                </p>
              )}
              {members.map((m) => (
                <OwnerItem
                  key={m.user_id}
                  onClick={() => void setOwner(m.user_id)}
                  selected={m.user_id === ownerUserId}
                >
                  <ActorAvatar name={m.display_name} size={18} />
                  <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                  {m.user_id === ownerUserId && (
                    <Check className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
                  )}
                </OwnerItem>
              ))}
              {ownerUserId && (
                <>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <OwnerItem onClick={() => void setOwner(null)}>Unassign</OwnerItem>
                </>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">Worked by</span>
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]">
          {isAthena ? (
            <>
              <ActorAvatar name="Athena" agent size={18} />
              Athena
            </>
          ) : (
            <>
              <ActorAvatar name={worker?.display_name ?? "Teammate"} size={18} />
              {worker?.display_name ?? "A teammate"}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function OwnerItem({
  children,
  onClick,
  selected = false,
}: {
  children: ReactNode;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        selected
          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
          : "text-[var(--text)] hover:bg-[var(--surface-2)]",
      )}
    >
      {children}
    </button>
  );
}
