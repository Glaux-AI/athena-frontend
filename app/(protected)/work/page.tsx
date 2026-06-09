"use client";

/**
 * /work — the kanban board: every task Athena is working, narrowable and
 * navigable. Cards open the cockpit (`/work/[id]`); the toolbar filters by
 * search / scope (mine) / domain / type and switches between the live board and
 * the Removed view. Each card's overflow menu removes a task from the board
 * (done / not-needed / obsolete / delete) or restores a removed one — so a task
 * always has a clear destination, and a busy org stays usable.
 *
 * Org-wide view (reads `api.tasks.list`, buckets client-side). Replaces the old
 * `/runs` surface.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type Domain,
  type Task,
  type TaskCancelReason,
  type TaskStatus,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Cluster, Grid, Stack } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { KanbanBoard } from "@/components/board/kanban-board";
import { TaskTree } from "@/components/board/task-tree";
import { TaskCard, type TaskCardActions } from "@/components/board/task-card";
import {
  BoardToolbar,
  DEFAULT_FILTERS,
  type BoardFilters,
} from "@/components/board/board-toolbar";
import { NewTaskDialog } from "@/components/work/new-task-dialog";
import { bucketTasksByStatus } from "@/lib/work/board";
import { useTasks, type TaskListParams } from "@/hooks/use-tasks";
import { useMembers } from "@/hooks/use-members";
import { useSession } from "@/lib/session/SessionProvider";

export default function WorkPage() {
  const router = useRouter();
  const { me } = useSession();
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_FILTERS);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [openNew, setOpenNew] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  // Debounce the search term so a busy org isn't re-fetched on every keystroke.
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(filters.q.trim()), 300);
    return () => clearTimeout(id);
  }, [filters.q]);

  useEffect(() => {
    void api.domains.list().then(setDomains).catch(() => setDomains([]));
  }, []);

  const params = useMemo<TaskListParams>(() => {
    const p: TaskListParams = {};
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (filters.scope === "mine" && me) p.mine = me.id;
    if (qDebounced) p.q = qDebounced;
    if (filters.view === "cancelled") p.status = "cancelled" as TaskStatus;
    return p;
  }, [filters.domainId, filters.type, filters.scope, filters.view, qDebounced, me]);

  const { tasks, isLoading, error, reload } = useTasks(params);
  // Org members — resolves a task's owner id to a person (the tree view's owner
  // avatars; the cockpit owns the assign dropdown). Soft-fails.
  const { byId: membersById } = useMembers();

  const onCreated = (task: Task) => {
    setOpenNew(false);
    router.push(`/work/${task.id}`);
  };

  const mutate = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (task: Task): TaskCardActions =>
    filters.view === "cancelled"
      ? {
          onRestore: () =>
            void mutate(
              task.id,
              () => api.tasks.patch(task.id, { status: "backlog" }),
              "Restored to the board.",
            ),
          onDelete: () => setConfirmDelete(task),
        }
      : {
          onMarkDone: () =>
            void mutate(
              task.id,
              () => api.tasks.patch(task.id, { status: "done" }),
              "Marked done.",
            ),
          onArchive: (reason: TaskCancelReason) =>
            void mutate(
              task.id,
              () => api.tasks.cancel(task.id, reason),
              "Removed from the board — find it under Removed.",
            ),
          onDelete: () => setConfirmDelete(task),
        };

  const cancelledTasks =
    filters.view === "cancelled"
      ? tasks.filter((t) => t.status === "cancelled")
      : [];
  const allColumns = bucketTasksByStatus(
    tasks.filter((t) => t.status !== "cancelled"),
  );
  // "Needs review" narrows the board to the stages waiting on a human sign-off
  // (a hard gate parks the task in_review) — the cross-task "what's on me" view.
  const boardColumns =
    filters.scope === "review"
      ? allColumns.filter((c) => c.status === "in_review")
      : allColumns;

  // Tree view roots: a task is top-level here if its parent isn't in the fetched
  // set (a real root, or a task I own whose parent is outside my scope). Children
  // load lazily per node, so the flat list's descendants aren't rendered twice.
  // "Needs review" narrows the tree to the in-review tasks (same as the board).
  const liveTasks = tasks.filter((t) => t.status !== "cancelled");
  const treeScoped =
    filters.scope === "review"
      ? liveTasks.filter((t) => t.status === "in_review")
      : liveTasks;
  const treeScopedIds = new Set(treeScoped.map((t) => t.id));
  const treeRoots = treeScoped.filter(
    (t) => t.parent_id === null || !treeScopedIds.has(t.parent_id),
  );

  // "My tasks" needs the signed-in user id to filter; until `me` resolves, hold
  // the skeleton rather than flash the whole org's tasks as if they were yours.
  const waitingForMe = filters.scope === "mine" && !me;

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

        <BoardToolbar
          filters={filters}
          onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
          domains={domains}
          hasMe={Boolean(me)}
        />

        {isLoading || waitingForMe ? (
          <BoardSkeleton />
        ) : error ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-ink)]"
          >
            {error}
          </p>
        ) : filters.view === "cancelled" ? (
          <CancelledView
            tasks={cancelledTasks}
            onOpen={(t) => router.push(`/work/${t.id}`)}
            actionsFor={actionsFor}
            busyId={busyId}
          />
        ) : filters.view === "tree" ? (
          <TaskTree
            roots={treeRoots}
            byId={membersById}
            onTaskOpen={(id) => router.push(`/work/${id}`)}
            emptyAction={
              <Button size="sm" onClick={() => setOpenNew(true)}>
                <Plus className="mr-1.5 size-4" aria-hidden />
                New task
              </Button>
            }
          />
        ) : (
          <KanbanBoard
            columns={boardColumns}
            onTaskOpen={(t) => router.push(`/work/${t.id}`)}
            taskActions={actionsFor}
            busyId={busyId}
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

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this task?"
        description="This permanently removes it and its history. To just take it off the board, use “Not needed” or “Obsolete” instead."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                const t = confirmDelete;
                setConfirmDelete(null);
                if (t) {
                  void mutate(t.id, () => api.tasks.delete(t.id), "Task deleted.");
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <p className="text-sm text-[var(--text)]">{confirmDelete.title}</p>
        )}
      </Modal>
    </div>
  );
}

/** The Removed (cancelled) view — a flat grid of removed tasks with their
 *  reason, each restorable or deletable. Not a board (no status meaning). */
function CancelledView({
  tasks,
  onOpen,
  actionsFor,
  busyId,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  actionsFor: (t: Task) => TaskCardActions;
  busyId: string | null;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<Archive className="size-5" />}
        title="Nothing removed"
        description="Tasks you remove from the board (not needed / obsolete) land here, so nothing is lost — you can restore or delete them."
      />
    );
  }
  return (
    <Grid cols="auto-fit-260" gap="3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onOpen={() => onOpen(task)}
          actions={actionsFor(task)}
          busy={busyId === task.id}
        />
      ))}
    </Grid>
  );
}

/** Column-shaped skeleton (page-level loading uses skeletons, not spinners). */
function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden>
      {[0, 1, 2, 3, 4].map((col) => (
        <div
          key={col}
          className="flex min-w-[176px] flex-1 basis-0 flex-col gap-2.5 rounded-xl bg-[var(--surface-2)] p-2.5"
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
