/**
 * TaskStatusPill - stable colors per task status (the recursive-Task spine).
 *
 * A token-class `Record` + the shared label map. Amber marks the two
 * human-attention states (triage / in_review);
 * violet + a pulse marks the one active state (in_progress = Athena working).
 */

import { cn } from "@/lib/cn";
import type { TaskStatus } from "@/lib/api/client";
import { TASK_STATUS_LABEL } from "@/lib/work/task-meta";

const STYLES: Record<TaskStatus, string> = {
  backlog: "bg-[var(--surface-3)] text-[var(--text-muted)]",
  triage: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  todo: "bg-[var(--info-soft)] text-[var(--info-ink)]",
  in_progress: "bg-[var(--primary-soft)] text-[var(--primary)]",
  in_review: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  blocked: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  done: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  cancelled: "bg-[var(--surface-3)] text-[var(--text-subtle)] italic",
};

export function TaskStatusPill({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      {status === "in_progress" && (
        <span className="mr-1.5 inline-flex size-1.5 animate-pulse rounded-full bg-[var(--primary)]" />
      )}
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}
