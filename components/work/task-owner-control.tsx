"use client";

/**
 * TaskOwnerControl - who's on a task, in the cockpit header.
 *
 * Two independent facts (owner = the accountable human; execution is delegated,
 * never an identity):
 *   • Owner  - a human, assignable. Click to pick a member or "Pick up" (assign
 *     yourself). Writes `owner_user_id` via PATCH. A LIVE task always keeps an
 *     owner (clearing is server-rejected), so we only offer Unassign when done.
 *   • Run with Athena - a toggle on `ai_delegated`. On = Athena's driver runs
 *     ready stages; off = a human runs them. A person still owns it either way.
 *     A human assignee (if set) shows as "Working".
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, Sparkles, Undo2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api, type Member } from "@/lib/api/client";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { MemberPicker } from "@/components/ui/member-picker";
import { cn } from "@/lib/cn";

export function TaskOwnerControl({
  taskId,
  ownerUserId,
  assignee,
  aiDelegated,
  isTerminal = false,
  members,
  membersLoading = false,
  byId,
  meId,
  onChanged,
}: {
  taskId: string;
  ownerUserId: string | null;
  /** The human doing the work, a user id, or null = unassigned. Never "athena". */
  assignee: string | null;
  /** Whether execution is delegated to Athena's driver. */
  aiDelegated: boolean;
  /** Done / cancelled - only then may the owner be cleared (live tasks keep one). */
  isTerminal?: boolean;
  members: Member[];
  /** True while the org roster is still loading - shows skeleton rows in the picker. */
  membersLoading?: boolean;
  byId: Map<string, Member>;
  meId: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const owner = ownerUserId ? byId.get(ownerUserId) ?? null : null;
  const worker = assignee ? byId.get(assignee) ?? null : null;

  const setAiDelegated = async (next: boolean) => {
    setBusy(true);
    try {
      await api.tasks.patch(taskId, { ai_delegated: next });
      toast.success(next ? "Athena will run this task." : "Handed back to a human.");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update execution.");
    } finally {
      setBusy(false);
    }
  };

  const setOwner = async (next: string | null) => {
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
        <MemberPicker
          members={members}
          value={ownerUserId}
          onSelect={(m) => void setOwner(m.user_id)}
          loading={membersLoading}
          align="start"
          listLabel="Members"
          contentClassName="w-60"
          {...(meId && ownerUserId !== meId
            ? {
                header: (close: () => void) => (
                  <OwnerItem
                    onClick={() => {
                      close();
                      void setOwner(meId);
                    }}
                  >
                    <UserPlus className="size-3.5 text-[var(--primary)]" aria-hidden />
                    Pick up (assign to me)
                  </OwnerItem>
                ),
              }
            : {})}
          {...(ownerUserId && isTerminal
            ? {
                footer: (close: () => void) => (
                  <>
                    <div className="my-1 h-px bg-[var(--border)]" />
                    <OwnerItem
                      onClick={() => {
                        close();
                        void setOwner(null);
                      }}
                    >
                      Unassign
                    </OwnerItem>
                  </>
                ),
              }
            : {})}
        >
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
        </MemberPicker>
      </div>

      {/* Worker (a human assignee, when set) */}
      {worker && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-muted)]">Working</span>
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]">
            <ActorAvatar name={worker.display_name} size={18} />
            <span className="max-w-[140px] truncate">{worker.display_name}</span>
          </span>
        </div>
      )}

      {/* Run with Athena - the delegation toggle (not an identity) */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">Execution</span>
        {aiDelegated ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary-soft)] px-2 py-1 text-sm font-medium text-[var(--primary)] shadow-[var(--glow)]">
              <ActorAvatar name="Athena" agent size={18} />
              Athena runs this
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setAiDelegated(false)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              <Undo2 className="size-3.5" aria-hidden />
              Hand back
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setAiDelegated(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            <Sparkles className="size-3.5 text-[var(--primary)]" aria-hidden />
            Run with Athena
          </button>
        )}
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
