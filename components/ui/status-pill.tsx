/**
 * StatusPill — stable colors per run status.
 * Used everywhere a run / gate / job status is shown.
 */

import { cn } from "@/lib/cn";

export type Status =
  | "queued"
  | "running"
  | "awaiting_gate"
  | "completed"
  | "failed"
  | "cancelled"
  | "gate_rejected";

const STYLES: Record<Status, string> = {
  queued:        "bg-[var(--surface-3)] text-[var(--text-muted)]",
  running:       "bg-[var(--primary-soft)] text-[var(--primary)]",
  awaiting_gate: "bg-[var(--warning-soft)] text-[var(--warning)]",
  completed:     "bg-[var(--success-soft)] text-[var(--success)]",
  failed:        "bg-[var(--danger-soft)] text-[var(--danger)]",
  cancelled:     "bg-[var(--surface-3)] text-[var(--text-subtle)] italic",
  gate_rejected: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

const LABELS: Record<Status, string> = {
  queued:        "Queued",
  running:       "Running",
  awaiting_gate: "Awaiting approval",
  completed:     "Completed",
  failed:        "Failed",
  cancelled:     "Cancelled",
  gate_rejected: "Gate rejected",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status],
        className
      )}
    >
      {status === "running" && (
        <span className="mr-1.5 inline-flex size-1.5 animate-pulse rounded-full bg-[var(--primary)]" />
      )}
      {LABELS[status]}
    </span>
  );
}
