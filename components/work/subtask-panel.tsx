"use client";

/**
 * SubtaskPanel (SUB-4) — a task's subtasks in execution (topological) order,
 * each row marked **Ready** (every prerequisite is done) or **Waiting on** the
 * specific tasks it needs first. The order + readiness come from the
 * dependency-aware `/subtree` read; the user sees a sequence and a plain-language
 * reason, never a bare dim row (legible, never magic).
 */

import Link from "next/link";

import type { SubtaskNode, TaskType } from "@/lib/api/client";
import { Stack } from "@/components/layout/primitives";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { TASK_TYPE_META } from "@/lib/work/task-meta";

export function SubtaskPanel({
  subtasks,
  loading,
}: {
  subtasks: SubtaskNode[];
  loading: boolean;
}) {
  if (loading && subtasks.length === 0) {
    return (
      <div className="flex flex-col gap-1.5" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-md bg-[var(--surface-2)]" />
        ))}
      </div>
    );
  }
  if (subtasks.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        None yet — when Athena breaks this down, the pieces appear here in the
        order they can be worked, each marked Ready or waiting on what comes first.
      </p>
    );
  }
  return (
    <Stack gap="1.5" as="ul">
      {subtasks.map((node) => (
        <SubtaskRow key={node.id} node={node} />
      ))}
    </Stack>
  );
}

function SubtaskRow({ node }: { node: SubtaskNode }) {
  const Icon = TASK_TYPE_META[node.type as TaskType]?.Icon ?? TASK_TYPE_META.chore.Icon;
  const state = readiness(node);
  // The blockers line renders its own links, so it sits OUTSIDE the row's Link
  // (anchors must not nest) — both share the li's border/hover treatment.
  return (
    <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] transition-colors hover:border-[var(--border-strong)]">
      <Link href={`/work/${node.id}`} className="flex flex-col gap-1 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{node.title}</span>
          <TaskStatusPill status={node.status} />
        </div>
        {state === "ready" && (
          <span className="ml-5 inline-flex w-fit items-center rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--success-ink)]">
            Ready
          </span>
        )}
      </Link>
      {state === "waiting" && (
        <div className="ml-5 flex items-center gap-1.5 px-2.5 pb-1.5 text-[11px] text-[var(--text-muted)]">
          <span className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--warning-ink)]">
            Waiting
          </span>
          <span className="min-w-0 truncate">
            on{" "}
            {node.blocked_by.map((blocker, i) => (
              <span key={blocker.id}>
                {i > 0 ? ", " : null}
                <Link href={`/work/${blocker.id}`} className="hover:underline">
                  {blocker.title}
                </Link>
              </span>
            ))}
          </span>
        </div>
      )}
    </li>
  );
}

/** Ready / Waiting / nothing — suppressed once a subtask is terminal or already
 *  moving (readiness is only meaningful for not-yet-started work). */
function readiness(node: SubtaskNode): "ready" | "waiting" | null {
  if (node.status === "done" || node.status === "cancelled") return null;
  if (!node.ready) return "waiting";
  if (node.status === "backlog" || node.status === "triage" || node.status === "todo") {
    return "ready";
  }
  return null;
}
