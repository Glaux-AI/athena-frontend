"use client";

/**
 * /work - the kanban board: every task Athena is working, narrowable and
 * navigable. Cards open the cockpit (`/work/[id]`); the toolbar filters by
 * search / scope (mine) / domain / type / priority and switches between the
 * live board, the parent→child tree, and History. Each card's overflow menu
 * removes a task from the board (done / not-needed / obsolete / delete),
 * reopens a shipped one, or restores a removed one - so a task always has a
 * clear destination, and a busy org stays usable.
 *
 * The board reads the server-bucketed `api.tasks.board` (the Done column is
 * windowed server-side, so it never grows without bound); shipped + removed
 * tasks age into History (`api.tasks.history`). The Tree view reads the flat
 * list (`useTasks`). Only the active view fetches.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, CheckSquare, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type Domain,
  type Task,
  type TaskBoardParams,
  type TaskCancelReason,
  type TaskHistoryParams,
  type TaskPriority,
  type TaskType,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Cluster, Grid, Stack } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { KanbanBoard } from "@/components/board/kanban-board";
import { SwimlaneBoard } from "@/components/board/swimlane-board";
import { BulkBar } from "@/components/board/bulk-bar";
import { TaskTree } from "@/components/board/task-tree";
import { TaskCard, type TaskCardActions } from "@/components/board/task-card";
import {
  BoardToolbar,
  DEFAULT_FILTERS,
  type BoardFilters,
} from "@/components/board/board-toolbar";
import { NewTaskDialog, type NewTaskDefaults } from "@/components/work/new-task-dialog";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { groupIntoLanes, type GroupBy } from "@/lib/work/board-group";
import {
  SelectionProvider,
  type SelectionState,
} from "@/lib/work/selection-context";
import { useBoard, useHistory } from "@/hooks/use-board";
import { useTasks, type TaskListParams } from "@/hooks/use-tasks";
import { useMembers } from "@/hooks/use-members";
import { useSession } from "@/lib/session/SessionProvider";

function isTaskType(v: string | null): v is TaskType {
  return v !== null && v in TASK_TYPE_META;
}

export default function WorkPage() {
  // useSearchParams must sit inside a Suspense boundary for Next 15's
  // static prerender.
  return (
    <Suspense fallback={null}>
      <WorkPageContent />
    </Suspense>
  );
}

function WorkPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me } = useSession();
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_FILTERS);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [openNew, setOpenNew] = useState(false);
  // Pre-fill carried by a chat propose_task CTA; null = blank form.
  const [proposalDefaults, setProposalDefaults] = useState<NewTaskDefaults | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);
  // Multi-select (bulk triage). Only the active board is selectable.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // A chat propose_task CTA lands here as
  // `/work?new=1&proposal_id=…&type=…&title=…&body=…[&domain_id=…]` - open
  // the New-task dialog pre-filled, then clean the URL so refresh / back
  // doesn't re-open it.
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const type = searchParams.get("type");
    const title = searchParams.get("title");
    const body = searchParams.get("body");
    const domainId = searchParams.get("domain_id");
    setProposalDefaults({
      ...(isTaskType(type) ? { type } : {}),
      ...(title ? { title } : {}),
      ...(body ? { body } : {}),
      ...(domainId ? { domain_id: domainId } : {}),
    });
    setOpenNew(true);
    router.replace("/work");
  }, [searchParams, router]);

  const openBlankNew = () => {
    setProposalDefaults(null);
    setOpenNew(true);
  };

  // Debounce the search term so a busy org isn't re-fetched on every keystroke.
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(filters.q.trim()), 300);
    return () => clearTimeout(id);
  }, [filters.q]);

  useEffect(() => {
    void api.domains.list().then(setDomains).catch(() => setDomains([]));
  }, []);

  // Board params: scope `review` is "what's awaiting a human across everyone",
  // so it doesn't set `mine` - it fetches the full board and narrows to the
  // in_review column client-side below.
  const boardParams = useMemo<TaskBoardParams>(() => {
    const p: TaskBoardParams = {};
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (filters.priority) p.priority = filters.priority;
    if (filters.scope === "mine" && me) p.mine = me.id;
    if (qDebounced) p.q = qDebounced;
    return p;
  }, [filters.domainId, filters.type, filters.priority, filters.scope, qDebounced, me]);

  // The Tree view reads the flat list (it needs the parent→child relations);
  // the list endpoint doesn't filter by priority, so that lens is board-only.
  const listParams = useMemo<TaskListParams>(() => {
    const p: TaskListParams = {};
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (filters.scope === "mine" && me) p.mine = me.id;
    if (qDebounced) p.q = qDebounced;
    return p;
  }, [filters.domainId, filters.type, filters.scope, qDebounced, me]);

  const historyParams = useMemo<TaskHistoryParams>(() => {
    const p: TaskHistoryParams = {};
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (qDebounced) p.q = qDebounced;
    return p;
  }, [filters.domainId, filters.type, qDebounced]);

  const board = useBoard(boardParams, filters.view === "active");
  const treeList = useTasks(listParams, filters.view === "tree");
  const history = useHistory(historyParams, filters.view === "history");
  // Org members - resolves a task's owner id to a person (the tree view's owner
  // avatars; the cockpit owns the assign dropdown). Soft-fails.
  const { members, byId: membersById } = useMembers();

  const reloadActive = () => {
    if (filters.view === "active") board.reload();
    else if (filters.view === "tree") treeList.reload();
    else history.reload();
  };

  // Selection only lives on the active board - drop it when leaving that view.
  useEffect(() => {
    if (filters.view !== "active") {
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [filters.view]);

  const domainsById = useMemo(
    () => new Map(domains.map((d) => [d.id, d])),
    [domains],
  );

  const selection = useMemo<SelectionState>(
    () => ({
      selectable: selectMode,
      isSelected: (id) => selectedIds.has(id),
      toggle: (id) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [selectMode, selectedIds],
  );

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  // Apply one mutation to every selected task, then reload + exit select mode.
  const bulkMutate = async (
    fn: (id: string) => Promise<unknown>,
    ok: string,
  ) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => fn(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) toast.success(ok);
    else toast.error(`${ids.length - failed} updated, ${failed} couldn't be.`);
    setSelectedIds(new Set());
    setSelectMode(false);
    board.reload();
    setBulkBusy(false);
  };

  const onCreated = (task: Task) => {
    setOpenNew(false);
    router.push(`/work/${task.id}`);
  };

  const mutate = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      reloadActive();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work - try again.");
    } finally {
      setBusyId(null);
    }
  };

  // Active-board card actions: mark done / remove / delete.
  const actionsFor = (task: Task): TaskCardActions => ({
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
        "Removed from the board - find it under History.",
      ),
    onDelete: () => setConfirmDelete(task),
  });

  // History card actions: reopen a shipped task (→ todo) / restore a removed
  // one (→ backlog), or delete it for good. `onRestore` drives both (the card
  // menu labels it "Reopen" for done, "Restore to board" for cancelled).
  const historyActionsFor = (task: Task): TaskCardActions => ({
    onRestore: () =>
      void mutate(
        task.id,
        () =>
          api.tasks.patch(task.id, {
            status: task.status === "done" ? "todo" : "backlog",
          }),
        task.status === "done" ? "Reopened." : "Restored to the board.",
      ),
    onDelete: () => setConfirmDelete(task),
  });

  // "Needs review" narrows the board to the stages waiting on a human sign-off
  // (a hard gate parks the task in_review) - the cross-task "what's on me" view.
  const boardColumns =
    filters.scope === "review"
      ? board.columns.filter((c) => c.status === "in_review")
      : board.columns;

  // Swimlanes: regroup the (already-fetched) board tasks into lanes by the
  // chosen dimension. "status" = no lanes, just the plain column board.
  const groupingActive =
    filters.view === "active" && filters.groupBy !== "status";
  const lanes = useMemo(
    () =>
      groupingActive
        ? groupIntoLanes(
            boardColumns.flatMap((c) => c.tasks),
            filters.groupBy as Exclude<GroupBy, "status">,
            { membersById, domainsById },
          )
        : [],
    [groupingActive, boardColumns, filters.groupBy, membersById, domainsById],
  );

  // Tree view roots: a task is top-level here if its parent isn't in the fetched
  // set (a real root, or a task I own whose parent is outside my scope). Children
  // load lazily per node, so the flat list's descendants aren't rendered twice.
  // "Needs review" narrows the tree to the in-review tasks (same as the board).
  const liveTasks = treeList.tasks.filter((t) => t.status !== "cancelled");
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

  // The active view's loading / error state.
  const isLoading =
    filters.view === "active"
      ? board.isLoading
      : filters.view === "tree"
        ? treeList.isLoading
        : history.isLoading;
  const error =
    filters.view === "active"
      ? board.error
      : filters.view === "tree"
        ? treeList.error
        : history.error;

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
          <Cluster gap="2">
            {filters.view === "active" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
              >
                <CheckSquare className="mr-1.5 size-4" aria-hidden />
                {selectMode ? "Cancel select" : "Select"}
              </Button>
            )}
            <Button size="sm" onClick={openBlankNew}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              New task
            </Button>
          </Cluster>
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
        ) : filters.view === "history" ? (
          <HistoryView
            tasks={history.tasks}
            onOpen={(t) => router.push(`/work/${t.id}`)}
            actionsFor={historyActionsFor}
            busyId={busyId}
          />
        ) : filters.view === "tree" ? (
          <TaskTree
            roots={treeRoots}
            byId={membersById}
            onTaskOpen={(id) => router.push(`/work/${id}`)}
            emptyAction={
              <Button size="sm" onClick={openBlankNew}>
                <Plus className="mr-1.5 size-4" aria-hidden />
                New task
              </Button>
            }
          />
        ) : (
          <SelectionProvider value={selection}>
            {groupingActive ? (
              <SwimlaneBoard
                lanes={lanes}
                onTaskOpen={(t) => router.push(`/work/${t.id}`)}
                {...(selectMode ? {} : { taskActions: actionsFor })}
                busyId={busyId}
                emptyAction={
                  <Button size="sm" onClick={openBlankNew}>
                    <Plus className="mr-1.5 size-4" aria-hidden />
                    New task
                  </Button>
                }
              />
            ) : (
              <KanbanBoard
                columns={boardColumns}
                onTaskOpen={(t) => router.push(`/work/${t.id}`)}
                {...(selectMode ? {} : { taskActions: actionsFor })}
                busyId={busyId}
                emptyAction={
                  <Button size="sm" onClick={openBlankNew}>
                    <Plus className="mr-1.5 size-4" aria-hidden />
                    New task
                  </Button>
                }
              />
            )}
          </SelectionProvider>
        )}
      </Stack>

      {selectMode && (
        <BulkBar
          count={selectedIds.size}
          members={members}
          busy={bulkBusy}
          onSetPriority={(p: TaskPriority | null) =>
            void bulkMutate(
              (id) => api.tasks.patch(id, { priority: p }),
              p ? "Priority updated." : "Priority cleared.",
            )
          }
          onReassign={(userId: string | null) =>
            void bulkMutate(
              (id) => api.tasks.patch(id, { owner_user_id: userId }),
              userId ? "Owner reassigned." : "Owner cleared.",
            )
          }
          onMarkDone={() =>
            void bulkMutate(
              (id) => api.tasks.patch(id, { status: "done" }),
              "Marked done.",
            )
          }
          onRemove={(reason) =>
            void bulkMutate(
              (id) => api.tasks.cancel(id, reason),
              "Removed from the board.",
            )
          }
          onClear={clearSelection}
        />
      )}

      <NewTaskDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={onCreated}
        defaults={proposalDefaults}
      />

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

/** History - the completed-work record split into Shipped (status `done`) and
 *  Removed (`cancelled`). Not a board (no live status meaning); each card is
 *  reopenable / restorable or deletable. The board's Done column ages into the
 *  Shipped grid here once a task is older than the board's recency window. */
function HistoryView({
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
  const shipped = tasks.filter((t) => t.status === "done");
  const removed = tasks.filter((t) => t.status === "cancelled");

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<Archive className="size-5" />}
        title="Nothing in history yet"
        description="Tasks that ship (done) or that you remove (not needed / obsolete) land here, so nothing is lost - you can reopen, restore, or delete them."
      />
    );
  }
  return (
    <Stack gap="5">
      <HistorySection
        label="Shipped"
        count={shipped.length}
        tasks={shipped}
        onOpen={onOpen}
        actionsFor={actionsFor}
        busyId={busyId}
      />
      <HistorySection
        label="Removed"
        count={removed.length}
        tasks={removed}
        onOpen={onOpen}
        actionsFor={actionsFor}
        busyId={busyId}
      />
    </Stack>
  );
}

function HistorySection({
  label,
  count,
  tasks,
  onOpen,
  actionsFor,
  busyId,
}: {
  label: string;
  count: number;
  tasks: Task[];
  onOpen: (t: Task) => void;
  actionsFor: (t: Task) => TaskCardActions;
  busyId: string | null;
}) {
  if (count === 0) return null;
  return (
    <Stack gap="2.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label} · {count}
      </span>
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
    </Stack>
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
