"use client";

/**
 * /work — the kanban board: every task Athena is working, bucketed by status.
 * Org-wide view (reads `api.tasks.list`, buckets client-side). Type swimlanes /
 * tree / dep-graph toggles and per-task drag land next.
 *
 * Replaces the old `/runs` surface (kept side-by-side until the run-flow is
 * removed in the backend Phase-1d cutover; sidebar nav rewires then).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import type { Task } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { KanbanBoard } from "@/components/board/kanban-board";
import { NewTaskDialog } from "@/components/work/new-task-dialog";
import { bucketTasksByStatus } from "@/lib/work/board";
import { useTasks } from "@/hooks/use-tasks";

export default function WorkPage() {
  const { tasks, isLoading, error } = useTasks();
  const router = useRouter();
  const [openNew, setOpenNew] = useState(false);

  const onCreated = (task: Task) => {
    setOpenNew(false);
    router.push(`/work/${task.id}`);
  };

  return (
    <div className="p-6">
      <Stack gap="5">
        <Cluster justify="between" align="center">
          <Stack gap="0.5">
            <h1 className="text-xl font-semibold text-[var(--text)]">Work</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Every task Athena is working, by status.
            </p>
          </Stack>
          <Button size="sm" onClick={() => setOpenNew(true)}>
            <Plus className="mr-1.5 size-4" aria-hidden />
            New task
          </Button>
        </Cluster>

        {isLoading ? (
          <BoardSkeleton />
        ) : error ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-ink)]"
          >
            {error}
          </p>
        ) : (
          <KanbanBoard
            columns={bucketTasksByStatus(tasks)}
            emptyAction={
              <Button size="sm" onClick={() => setOpenNew(true)}>
                <Plus className="mr-1.5 size-4" aria-hidden />
                New task
              </Button>
            }
          />
        )}
      </Stack>

      <NewTaskDialog open={openNew} onOpenChange={setOpenNew} onCreated={onCreated} />
    </div>
  );
}

/** Column-shaped skeleton (page-level loading uses skeletons, not spinners). */
function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden>
      {[0, 1, 2, 3].map((col) => (
        <div
          key={col}
          className="flex w-72 shrink-0 flex-col gap-2.5 rounded-xl bg-[var(--surface-2)] p-2.5"
        >
          <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--surface-3)]" />
          {[0, 1].map((row) => (
            <div
              key={row}
              className="h-20 animate-pulse rounded-lg bg-[var(--surface-3)]"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
