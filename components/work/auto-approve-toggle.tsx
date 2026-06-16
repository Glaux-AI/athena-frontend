"use client";

/**
 * AutoApproveToggle - the cockpit header's "let Athena run straight through"
 * control. The chip opens a popover with two scopes:
 *
 *   • Auto-approve this task - when ON, Athena auto-clears every INTERMEDIATE
 *     hard gate and chains the next stage on its own; the FINAL hard gate of
 *     the rail still parks for a human. Also unlocks the elevated MCP gate-
 *     control tools (approve / request-changes / reopen) for this task.
 *   • Auto-approve all children (incl. future) - the parent-level cascade.
 *     Turning it ON propagates `auto_approve=true` + `auto_approve_descendants
 *     =true` onto every existing descendant in one server transaction, AND
 *     every new child created under this task (directly or transitively)
 *     inherits both flags at birth. Turning it OFF stops future inheritance
 *     but leaves existing descendants alone (a descendant that should drop
 *     auto-approve is edited directly on that task).
 *
 * Both default off - the human-gate invariant (ADR-027 #19) holds until a
 * person opts in. Controlled by the parent's task values; toggles optimistically
 * and reverts on failure.
 */

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ShieldCheck, ShieldHalf } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export function AutoApproveToggle({
  taskId,
  enabled,
  cascadeEnabled,
  onChanged,
}: {
  taskId: string;
  enabled: boolean;
  cascadeEnabled: boolean;
  onChanged?: () => void;
}) {
  const [on, setOn] = useState(enabled);
  const [cascadeOn, setCascadeOn] = useState(cascadeEnabled);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // Re-sync if the task refetches with a different value (another surface, or
  // our own refresh after a successful toggle).
  useEffect(() => setOn(enabled), [enabled]);
  useEffect(() => setCascadeOn(cascadeEnabled), [cascadeEnabled]);

  const patch = async (
    field: "auto_approve" | "auto_approve_descendants",
    next: boolean,
  ) => {
    if (busy) return;
    setBusy(true);
    const prevOn = on;
    const prevCascade = cascadeOn;
    if (field === "auto_approve") setOn(next);
    else setCascadeOn(next);
    try {
      await api.tasks.patch(taskId, { [field]: next });
      toast.success(
        field === "auto_approve"
          ? next
            ? "Auto-approve on - Athena runs through to the final gate."
            : "Auto-approve off - every gate needs your sign-off."
          : next
            ? "Auto-approve cascading to all children, current and future."
            : "Cascade off - new children won't inherit auto-approve.",
      );
      onChanged?.();
    } catch (e) {
      setOn(prevOn);
      setCascadeOn(prevCascade);
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't update auto-approve.",
      );
    } finally {
      setBusy(false);
    }
  };

  const summary = cascadeOn
    ? "Auto-approve + children"
    : on
      ? "Auto-approve on"
      : "Auto-approve";
  const active = on || cascadeOn;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-pressed={active}
          aria-label="Auto-approve settings"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            active
              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          )}
        >
          {active ? (
            <ShieldCheck className="size-3.5" aria-hidden />
          ) : (
            <ShieldHalf className="size-3.5" aria-hidden />
          )}
          {summary}
          <ChevronDown className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="glass animate-modal-in z-50 w-72 rounded-lg border border-[var(--border)] p-2 shadow-[var(--shadow-3)] focus:outline-none"
        >
          <ScopeRow
            checked={on}
            disabled={busy}
            onChange={(v) => void patch("auto_approve", v)}
            title="Auto-approve this task"
            detail="Athena auto-clears every intermediate hard gate and runs the next stage; the final gate still needs your sign-off."
          />
          <ScopeRow
            checked={cascadeOn}
            disabled={busy}
            onChange={(v) => void patch("auto_approve_descendants", v)}
            title="Auto-approve all children"
            detail="Every existing AND future child task (and their children, recursively) gets auto-approve on. Turning this off only stops future inheritance."
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ScopeRow({
  checked,
  disabled,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        "hover:bg-[var(--surface-2)]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded border",
          checked
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
            : "border-[var(--border)] bg-[var(--surface)]",
        )}
        aria-hidden
      >
        {checked && <Check className="size-3" />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--text)]">{title}</span>
        <span className="text-xs leading-snug text-[var(--text-muted)]">
          {detail}
        </span>
      </span>
    </button>
  );
}
