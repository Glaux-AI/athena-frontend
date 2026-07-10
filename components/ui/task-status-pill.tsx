/**
 * TaskStatusPill - stable colors per task status (the recursive-Task spine),
 * expressed through the one <Pill> primitive (Nightglass §5.1).
 *
 * Amber marks the two human-attention states (triage / in_review); violet +
 * a twinkling star-dot marks the one active state (in_progress = Athena
 * working - status as starlight).
 */

import { cn } from "@/lib/cn";
import type { TaskStatus } from "@/lib/api/client";
import { TASK_STATUS_LABEL } from "@/lib/work/task-meta";
import { Pill, type PillTone } from "./pill";

const TONE: Record<TaskStatus, PillTone> = {
  backlog: "neutral",
  triage: "warning",
  todo: "info",
  in_progress: "primary",
  in_review: "warning",
  blocked: "danger",
  done: "success",
  cancelled: "neutral",
};

export function TaskStatusPill({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <Pill
      tone={TONE[status]}
      live={status === "in_progress"}
      className={cn(status === "cancelled" && "italic text-[var(--text-subtle)]", className)}
    >
      {TASK_STATUS_LABEL[status]}
    </Pill>
  );
}
