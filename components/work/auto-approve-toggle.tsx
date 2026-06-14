"use client";

/**
 * AutoApproveToggle - the cockpit header's "let Athena run straight through"
 * control. When ON, Athena auto-clears every INTERMEDIATE hard gate and chains
 * the next stage on its own; the FINAL hard gate of the rail still parks for a
 * human. It also unlocks the elevated MCP gate-control tools (approve /
 * request-changes / reopen) so a coding agent can drive gates from its own tool
 * instead of switching to this UI. Default off - the human-gate invariant holds
 * until someone opts a task in. Controlled by the parent's task value; toggles
 * optimistically and reverts on failure.
 */

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldHalf } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export function AutoApproveToggle({
  taskId,
  enabled,
  onChanged,
}: {
  taskId: string;
  enabled: boolean;
  onChanged?: () => void;
}) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  // Re-sync if the task refetches with a different value (another surface, or
  // our own refresh after a successful toggle).
  useEffect(() => setOn(enabled), [enabled]);

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setBusy(true);
    setOn(next); // optimistic
    try {
      await api.tasks.patch(taskId, { auto_approve: next });
      toast.success(
        next
          ? "Auto-approve on - Athena runs through to the final gate."
          : "Auto-approve off - every gate needs your sign-off.",
      );
      onChanged?.();
    } catch (e) {
      setOn(!next); // revert
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't update auto-approve.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title={
        on
          ? "On - Athena auto-clears intermediate gates and runs the next stage itself; the final gate still needs your sign-off. Coding agents can also drive gates over MCP."
          : "Off - every hard gate needs your sign-off. Turn on to let Athena clear intermediate gates and run straight through to the final review."
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        on
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      {on ? (
        <ShieldCheck className="size-3.5" aria-hidden />
      ) : (
        <ShieldHalf className="size-3.5" aria-hidden />
      )}
      {on ? "Auto-approve on" : "Auto-approve"}
    </button>
  );
}
