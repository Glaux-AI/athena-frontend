"use client";

/**
 * /work - everything the org is building, people and Athena together (Work OS
 * rehaul W3/W6/W7). Four lenses over the one recursive-Task spine: the List
 * (default - dense, inline-editable, server-sorted), the kanban Board, the
 * parent→child Tree, and History. A scope bar answers "whose work" (my work /
 * my teams / one team / everyone / needs review); a filter chip bar narrows
 * what you see; a SavedViewBar names filter bundles for one-click return.
 *
 * The List + Board read server-side lens params (team / label / cycle / mine /
 * sort); only the "my teams" union and "needs review" (board) narrow
 * client-side, since the endpoints take a single team / bucket by status.
 * Shipped + removed tasks age into History (`api.tasks.history`). Only the
 * active view fetches.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, BarChart3, CheckSquare, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type Cycle,
  type Domain,
  type Label,
  type MyTeam,
  type Task,
  type TaskBoardParams,
  type TaskCancelReason,
  type TaskHealth,
  type TaskHistoryParams,
  type TaskPriority,
  type TaskSort,
  type TaskStatus,
  type TaskType,
  type Team,
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
  SORT_VALUES,
  parseScope,
  resolveDefaultScope,
  scopeToParams,
  type BoardFilters,
  type BoardScope,
  type BoardView,
  type ListGroupBy,
} from "@/components/board/board-toolbar";
import { TaskList, TaskListSkeleton } from "@/components/work-list/task-list";
import { SavedViewBar } from "@/components/work/saved-view-bar";
import { SprintHeader } from "@/components/work/sprint-header";
import { BacklogList } from "@/components/work/backlog-list";
import { NewTaskDialog, type NewTaskDefaults } from "@/components/work/new-task-dialog";
import { TASK_STATUS_LABEL, TASK_TYPE_META } from "@/lib/work/task-meta";
import { groupIntoLanes, GROUP_BY_ORDER, type GroupBy } from "@/lib/work/board-group";
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

// The whole filter set is URL-backed (`?view`/`?scope`/`?domain`/`?team`/
// `?label`/`?cycle`/`?type`/`?priority`/`?health`/`?groupBy`/`?sort`/`?q`) so
// every lens is deep-linkable AND survives navigation: open a task, press
// Back, and your filters are still applied. The search box is the one
// exception - it keeps a local input and debounces into the URL (a history
// write per keystroke would be wasteful). Saved views snapshot exactly these
// params (see SavedViewBar).
const BOARD_VIEWS: BoardView[] = ["list", "active", "sprint", "backlog", "tree", "history"];
const PRIORITY_VALUES: TaskPriority[] = ["urgent", "high", "medium", "low"];
const HEALTH_VALUES: TaskHealth[] = ["at_risk", "blocked", "on_track"];

/** Every status except `cancelled` - the List view's default server filter
 *  (removed work lives in History, mirroring the board). */
const LIVE_STATUSES: TaskStatus[] = [
  "backlog",
  "triage",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
];

function isListGroupBy(v: string | null): v is ListGroupBy {
  return v !== null && (v === "none" || GROUP_BY_ORDER.includes(v as GroupBy));
}

/** Build the BoardFilters from the URL, falling back to defaults so a hand-edited
 *  or stale param degrades gracefully instead of wedging the page. */
function readFilters(sp: URLSearchParams): BoardFilters {
  const priority = sp.get("priority");
  const health = sp.get("health");
  const type = sp.get("type");
  const groupBy = sp.get("groupBy");
  const view = sp.get("view");
  const sort = sp.get("sort");
  return {
    q: sp.get("q") ?? "",
    scope: parseScope(sp.get("scope")),
    domainId: sp.get("domain") ?? "",
    teamId: sp.get("team") ?? "",
    labelId: sp.get("label") ?? "",
    cycleId: sp.get("cycle") ?? "",
    type: isTaskType(type) ? type : "",
    priority: PRIORITY_VALUES.includes(priority as TaskPriority) ? (priority as TaskPriority) : "",
    health: HEALTH_VALUES.includes(health as TaskHealth) ? (health as TaskHealth) : "",
    groupBy: isListGroupBy(groupBy) ? groupBy : DEFAULT_FILTERS.groupBy,
    sort: SORT_VALUES.includes(sort as TaskSort) ? (sort as TaskSort) : DEFAULT_FILTERS.sort,
    view: BOARD_VIEWS.includes(view as BoardView) ? (view as BoardView) : DEFAULT_FILTERS.view,
  };
}

/** Apply a partial filter change onto a query string, deleting params that are
 *  empty or at their default so the URL stays clean (and deep-links are tidy). */
function writeFilters(sp: URLSearchParams, next: Partial<BoardFilters>) {
  const put = (key: string, value: string, isDefault: boolean) => {
    if (!value || isDefault) sp.delete(key);
    else sp.set(key, value);
  };
  if ("q" in next) put("q", (next.q ?? "").trim(), false);
  // Scope's default is DYNAMIC (derived from your teams), so an explicit pick
  // always writes - only "" (back to auto) clears the param.
  if ("scope" in next) put("scope", next.scope ?? "", false);
  if ("domainId" in next) put("domain", next.domainId ?? "", false);
  if ("teamId" in next) put("team", next.teamId ?? "", false);
  if ("labelId" in next) put("label", next.labelId ?? "", false);
  if ("cycleId" in next) put("cycle", next.cycleId ?? "", false);
  if ("type" in next) put("type", next.type ?? "", false);
  if ("priority" in next) put("priority", next.priority ?? "", false);
  if ("health" in next) put("health", next.health ?? "", false);
  // groupBy always writes when set: the "my teams" scope auto-groups by team
  // only while the param is ABSENT, so an explicit "Status" pick must stick.
  if ("groupBy" in next) put("groupBy", next.groupBy ?? "", false);
  if ("sort" in next) put("sort", next.sort ?? "", next.sort === DEFAULT_FILTERS.sort);
  if ("view" in next) put("view", next.view ?? "", next.view === DEFAULT_FILTERS.view);
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { me } = useSession();
  // Every filter lives in the URL so Back/deep-links restore them. `view`
  // switches push a history entry (a tab-like switch is Back-able); the rest
  // `replace` (refining a filter persists in place, it isn't a navigation step
  // to step back through one at a time).
  const filters = useMemo<BoardFilters>(() => readFilters(searchParams), [searchParams]);
  const patchFilters = useCallback(
    (next: Partial<BoardFilters>, opts?: { replace?: boolean }) => {
      const sp = new URLSearchParams(window.location.search);
      writeFilters(sp, next);
      const qs = sp.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname],
  );
  const [domains, setDomains] = useState<Domain[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  // The caller's own teams - null while loading (the default scope waits on
  // them: one team -> that team; several -> "my teams"; none -> "my work").
  const [myTeams, setMyTeams] = useState<MyTeam[] | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
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
  // the New-task dialog pre-filled, then strip only the proposal params so
  // refresh / back doesn't re-open it (any active filters are preserved).
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
    const sp = new URLSearchParams(window.location.search);
    for (const k of ["new", "proposal_id", "type", "title", "body", "domain_id"]) sp.delete(k);
    const qs = sp.toString();
    router.replace(qs ? `/work?${qs}` : "/work");
  }, [searchParams, router]);

  const openBlankNew = () => {
    setProposalDefaults(null);
    setOpenNew(true);
  };

  // The search box keeps a local input for instant typing; the trimmed value is
  // debounced into the URL (`?q=`, replace) which then drives the fetch. The URL
  // is the source of truth, so a deep-link / Back updates the input too.
  const [qInput, setQInput] = useState<string>(() => searchParams.get("q") ?? "");
  const urlQ = filters.q;
  useEffect(() => {
    setQInput((prev) => (prev.trim() === urlQ ? prev : urlQ));
  }, [urlQ]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (qInput.trim() !== filters.q) patchFilters({ q: qInput }, { replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [qInput, filters.q, patchFilters]);

  useEffect(() => {
    void api.domains.list().then(setDomains).catch(() => setDomains([]));
    // Teams is the optional people-layer - an org that never adopts it gets an
    // empty list and no team UI shows anywhere. Soft-fails.
    void api.teams.list().then(setTeams).catch(() => setTeams([]));
    void api.labels.list().then(setLabels).catch(() => setLabels([]));
    // My teams drive the default scope; a failure degrades to "my work".
    void api.teams.mine().then(setMyTeams).catch(() => setMyTeams([]));
  }, []);

  // The scope in force: the URL's explicit pick, or (once my teams are known)
  // the derived default. Null = still resolving - hold the skeleton rather
  // than flash the wrong scope's tasks.
  const effectiveScope: BoardScope | null =
    filters.scope !== "" ? filters.scope : myTeams === null ? null : resolveDefaultScope(myTeams);
  const meId = me?.id ?? null;
  const waitingForScope =
    filters.view !== "history" &&
    (effectiveScope === null ||
      (effectiveScope === "me" && !me) ||
      (effectiveScope === "myteams" && myTeams === null));

  const myTeamIds = useMemo(
    () => new Set((myTeams ?? []).map((t) => t.id)),
    [myTeams],
  );

  // "My teams" auto-lanes/sections by team while ?groupBy is absent; an
  // explicit pick (always written to the URL) overrides it.
  const groupByExplicit = searchParams.get("groupBy") !== null;
  const effectiveGroupBy: ListGroupBy =
    !groupByExplicit && effectiveScope === "myteams" ? "team" : filters.groupBy;

  // Sprint options for the filter menu + name resolution: the in-scope team's
  // cycles (an explicit team chip beats the scope's team). Soft-fails.
  const cycleTeamId =
    filters.teamId && filters.teamId !== "__none"
      ? filters.teamId
      : effectiveScope?.startsWith("team:")
        ? effectiveScope.slice("team:".length)
        : "";
  // `cyclesVersion` bumps after a sprint lifecycle change (Start / Complete)
  // so the header + filter options reflect the new state without a reload.
  // `cyclesLoading` holds the Sprint/Backlog surfaces on the skeleton while
  // the team's cycles are in flight - a deep-link must never flash the
  // "No sprint yet" teaching state before the fetch answers.
  const [cyclesVersion, setCyclesVersion] = useState(0);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  useEffect(() => {
    if (!cycleTeamId) {
      setCycles([]);
      setCyclesLoading(false);
      return;
    }
    let cancelled = false;
    setCyclesLoading(true);
    void api.cycles
      .listForTeam(cycleTeamId)
      .then((cs) => {
        if (!cancelled) setCycles(cs);
      })
      .catch(() => {
        if (!cancelled) setCycles([]);
      })
      .finally(() => {
        if (!cancelled) setCyclesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cycleTeamId, cyclesVersion]);

  // The server-side lens every task fetch shares: scope (mine / one team) +
  // the team / label / sprint chips, each with its explicit "none" form. An
  // explicit team chip overrides the scope's team (the more specific pick).
  const lens = useMemo(() => {
    const p: {
      mine?: string;
      team_id?: string;
      teamless?: boolean;
      label_id?: string;
      unlabeled?: boolean;
      cycle_id?: string;
      no_cycle?: boolean;
    } = {};
    if (effectiveScope) {
      const sp = scopeToParams(effectiveScope, { meId, surface: "board" });
      if (sp.mine) p.mine = sp.mine;
      if (sp.team_id) p.team_id = sp.team_id;
    }
    if (filters.teamId === "__none") {
      delete p.team_id;
      p.teamless = true;
    } else if (filters.teamId) {
      p.team_id = filters.teamId;
    }
    if (filters.labelId === "__none") p.unlabeled = true;
    else if (filters.labelId) p.label_id = filters.labelId;
    if (filters.cycleId === "__none") p.no_cycle = true;
    else if (filters.cycleId) p.cycle_id = filters.cycleId;
    return p;
  }, [effectiveScope, meId, filters.teamId, filters.labelId, filters.cycleId]);

  // Board params: scope `review` is "what's awaiting a human across everyone",
  // so it adds no server narrowing - the full board fetches and the in_review
  // column is picked out client-side below.
  const boardParams = useMemo<TaskBoardParams>(() => {
    const p: TaskBoardParams = { ...lens };
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (filters.priority) p.priority = filters.priority;
    if (filters.health) p.health = filters.health;
    if (filters.q) p.q = filters.q;
    return p;
  }, [lens, filters.domainId, filters.type, filters.priority, filters.health, filters.q]);

  // List view: fully server-driven (statuses, lens, priority/health, sort,
  // capped page). "My teams" is a server union too (`team_ids`), so the cap
  // applies AFTER it - a client union over a capped page dropped team tasks.
  const listViewParams = useMemo<TaskListParams>(() => {
    const p: TaskListParams = { ...lens, sort: filters.sort, limit: 200 };
    p.status = effectiveScope === "review" ? "in_review" : LIVE_STATUSES;
    if (effectiveScope === "myteams" && !p.team_id && myTeams?.length) {
      p.team_ids = myTeams.map((t) => t.id);
    }
    if (filters.priority) p.priority = filters.priority;
    if (filters.health) p.health = filters.health;
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (filters.q) p.q = filters.q;
    return p;
  }, [
    lens, filters.sort, filters.priority, filters.health, filters.domainId,
    filters.type, filters.q, effectiveScope, myTeams,
  ]);

  // The Tree view reads the flat list (it needs the parent→child relations);
  // priority/health stay board/list lenses there, as before.
  const treeParams = useMemo<TaskListParams>(() => {
    const p: TaskListParams = { ...lens };
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (filters.q) p.q = filters.q;
    return p;
  }, [lens, filters.domainId, filters.type, filters.q]);

  const historyParams = useMemo<TaskHistoryParams>(() => {
    const p: TaskHistoryParams = {};
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    if (filters.q) p.q = filters.q;
    return p;
  }, [filters.domainId, filters.type, filters.q]);

  // Sprint / Backlog: the team-planning surfaces (only when a single team is
  // in scope). Sprint shows the active cycle (else the next planned one, so
  // Start is one click); Backlog is the ranked uncommitted list.
  const sprintCycle =
    cycles.find((c) => c.state === "active") ??
    cycles.find((c) => c.state === "planned") ??
    null;
  const plannedCycles = useMemo(
    () => cycles.filter((c) => c.state === "planned"),
    [cycles],
  );
  const canManageCycles = Boolean(
    cycleTeamId &&
      (myTeams ?? []).some((t) => t.id === cycleTeamId && t.role === "lead"),
  );
  const sprintParams = useMemo<TaskBoardParams>(() => {
    // The sprint tab IS a cycle lens - any sprint chip from another view
    // ("No sprint" especially) would contradict the overlay, so both chip
    // forms are stripped before the active cycle pins the board.
    const rest: TaskBoardParams = { ...boardParams };
    delete rest.cycle_id;
    delete rest.no_cycle;
    return {
      ...rest,
      ...(sprintCycle ? { cycle_id: sprintCycle.id } : {}),
    };
  }, [boardParams, sprintCycle]);
  const backlogParams = useMemo<TaskListParams>(() => {
    const p: TaskListParams = {
      no_cycle: true,
      status: ["backlog", "triage", "todo"],
      limit: 200,
    };
    if (cycleTeamId) p.team_id = cycleTeamId;
    if (filters.domainId) p.domain_id = filters.domainId;
    if (filters.type) p.type = filters.type;
    // The label / priority / health chips narrow the backlog too - the
    // toolbar shows them as applied, so ignoring them here lied.
    if (filters.labelId === "__none") p.unlabeled = true;
    else if (filters.labelId) p.label_id = filters.labelId;
    if (filters.priority) p.priority = filters.priority;
    if (filters.health) p.health = filters.health;
    if (filters.q) p.q = filters.q;
    return p; // no `sort` - the server's default IS the rank order
  }, [
    cycleTeamId, filters.domainId, filters.type, filters.labelId,
    filters.priority, filters.health, filters.q,
  ]);

  const board = useBoard(
    filters.view === "sprint" ? sprintParams : boardParams,
    (filters.view === "active" ||
      (filters.view === "sprint" && sprintCycle !== null)) &&
      !waitingForScope,
  );
  const listView = useTasks(listViewParams, filters.view === "list" && !waitingForScope);
  const backlog = useTasks(
    backlogParams,
    filters.view === "backlog" && Boolean(cycleTeamId) && !waitingForScope,
  );
  const treeList = useTasks(treeParams, filters.view === "tree" && !waitingForScope);
  const history = useHistory(historyParams, filters.view === "history");
  // Org members - resolves a task's owner/assignee id to a person (list cells,
  // tree avatars, assign pickers). Soft-fails.
  const { members, byId: membersById, isLoading: membersLoading } = useMembers();

  const reloadActive = () => {
    if (filters.view === "active" || filters.view === "sprint") board.reload();
    else if (filters.view === "list") listView.reload();
    else if (filters.view === "backlog") backlog.reload();
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
  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams],
  );
  const labelsById = useMemo(
    () => new Map(labels.map((l) => [l.id, l])),
    [labels],
  );
  const cyclesById = useMemo(
    () => new Map(cycles.map((c) => [c.id, c])),
    [cycles],
  );
  const groupCtx = useMemo(
    () => ({ membersById, domainsById, teamsById, labelsById }),
    [membersById, domainsById, teamsById, labelsById],
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

  // Drag a card between columns = a status move (the board guards railed
  // tasks out of in_review; a dependency start-gate 409 reverts via reload).
  // The "Needs review" scope is a single-column read: dragging OUT of it
  // would side-step the gate flow AND force every empty column to render as
  // a drop target, un-narrowing the lens - so DnD stays off there.
  const dragEnabled = effectiveScope !== "review";
  const onTaskMove = (task: Task, next: TaskStatus) =>
    void mutate(
      task.id,
      () => api.tasks.patch(task.id, { status: next }),
      `Moved to ${TASK_STATUS_LABEL[next]}.`,
    );

  // Active-board card actions: move / prioritize / mark done / remove / delete.
  const actionsFor = (task: Task): TaskCardActions => ({
    onMove: (next: TaskStatus) => onTaskMove(task, next),
    onSetPriority: (p: TaskPriority | null) =>
      void mutate(
        task.id,
        () => api.tasks.patch(task.id, { priority: p }),
        p ? "Priority updated." : "Priority cleared.",
      ),
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
  // (a hard gate parks the task in_review); "my teams" is the client union
  // over the caller's squads (the endpoint takes one team). Every other lens
  // (team / label / cycle chips, scope team, mine) is a server param now.
  const boardColumns = useMemo(() => {
    let cols =
      effectiveScope === "review"
        ? board.columns.filter((c) => c.status === "in_review")
        : board.columns;
    if (effectiveScope === "myteams") {
      cols = cols
        .map((c) => ({
          ...c,
          tasks: c.tasks.filter(
            (t) => t.owning_team_id !== null && myTeamIds.has(t.owning_team_id),
          ),
        }))
        .map((c) => ({ ...c, total: c.tasks.length }))
        .filter((c) => c.tasks.length > 0);
    }
    return cols;
  }, [board.columns, effectiveScope, myTeamIds]);

  // List rows are FULLY server-narrowed now (scope, teams union, chips) -
  // no client filtering, so the 200-row cap can never hide matching rows
  // behind a lens applied after the fetch.
  const listRows = listView.tasks;

  // Swimlanes: regroup the (already-fetched) board tasks into lanes by the
  // chosen dimension. "status" = no lanes, just the plain column board.
  const boardGroupBy: GroupBy = effectiveGroupBy === "none" ? "status" : effectiveGroupBy;
  const groupingActive = filters.view === "active" && boardGroupBy !== "status";
  const lanes = useMemo(
    () =>
      groupingActive
        ? groupIntoLanes(
            boardColumns.flatMap((c) => c.tasks),
            boardGroupBy as Exclude<GroupBy, "status">,
            groupCtx,
          )
        : [],
    [groupingActive, boardColumns, boardGroupBy, groupCtx],
  );

  // Tree view roots: a task is top-level here if its parent isn't in the fetched
  // set (a real root, or a task I own whose parent is outside my scope). Children
  // load lazily per node, so the flat list's descendants aren't rendered twice.
  // "Needs review" / "my teams" narrow the tree the same way as the board.
  const liveTasks = treeList.tasks.filter((t) => t.status !== "cancelled");
  let treeScoped =
    effectiveScope === "review"
      ? liveTasks.filter((t) => t.status === "in_review")
      : liveTasks;
  if (effectiveScope === "myteams") {
    treeScoped = treeScoped.filter(
      (t) => t.owning_team_id !== null && myTeamIds.has(t.owning_team_id),
    );
  }
  const treeScopedIds = new Set(treeScoped.map((t) => t.id));
  const treeRoots = treeScoped.filter(
    (t) => t.parent_id === null || !treeScopedIds.has(t.parent_id),
  );

  // The active view's loading / error state. Sprint/Backlog also wait on the
  // team's cycles fetch so a deep-link never flashes the empty teaching state.
  const isLoading =
    filters.view === "active"
      ? board.isLoading
      : filters.view === "sprint"
        ? cyclesLoading || board.isLoading
        : filters.view === "list"
          ? listView.isLoading
          : filters.view === "backlog"
            ? cyclesLoading || backlog.isLoading
            : filters.view === "tree"
              ? treeList.isLoading
              : history.isLoading;
  const error =
    filters.view === "active" || filters.view === "sprint"
      ? board.error
      : filters.view === "list"
        ? listView.error
        : filters.view === "backlog"
          ? backlog.error
          : filters.view === "tree"
            ? treeList.error
            : history.error;

  const newTaskButton = (
    <Button size="sm" onClick={openBlankNew}>
      <Plus className="mr-1.5 size-4" aria-hidden />
      New task
    </Button>
  );

  return (
    <div className="p-6">
      <Stack gap="5">
        <Cluster justify="between" align="center">
          <Stack gap="0.5">
            <h1 className="text-xl font-semibold text-[var(--text)]">Work</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Everything your org is building - people and Athena together.
            </p>
          </Stack>
          <Cluster gap="2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/work/analytics")}
            >
              <BarChart3 className="mr-1.5 size-4" aria-hidden />
              Delivery
            </Button>
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
            {newTaskButton}
          </Cluster>
        </Cluster>

        <BoardToolbar
          filters={{ ...filters, q: qInput, groupBy: effectiveGroupBy }}
          effectiveScope={effectiveScope}
          onChange={(next) => {
            // Search typing is local + debounced into the URL; everything else
            // writes the URL now. `view` pushes a history entry (Back-able);
            // the other filters replace (persist in place).
            if ("q" in next) setQInput(next.q ?? "");
            const keys = Object.keys(next);
            if (keys.length === 1 && keys[0] === "q") return;
            const { view: nextView, ...rest } = next;
            if (nextView !== undefined && nextView !== filters.view) patchFilters({ view: nextView });
            if (Object.keys(rest).length > 0) patchFilters(rest, { replace: true });
          }}
          domains={domains}
          teams={teams}
          labels={labels}
          cycles={cycles}
          myTeams={myTeams}
          hasMe={Boolean(me)}
        />

        <SavedViewBar
          myTeams={myTeams}
          meId={meId}
          effectiveScope={effectiveScope}
        />

        {isLoading || waitingForScope ? (
          filters.view === "list" ? (
            <TaskListSkeleton />
          ) : (
            <BoardSkeleton />
          )
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
        ) : filters.view === "sprint" ? (
          !cycleTeamId ? (
            <EmptyState
              title="Sprints are a team surface"
              description="Pick a team in the scope bar to see its sprint - planning is per squad."
            />
          ) : !sprintCycle ? (
            <EmptyState
              title="No sprint yet"
              description={
                canManageCycles
                  ? "Plan this team's first sprint from Settings → Teams, then start it here."
                  : "This team hasn't planned a sprint. A team lead can create one under Settings → Teams."
              }
            />
          ) : (
            <Stack gap="4">
              <SprintHeader
                cycle={sprintCycle}
                nextPlanned={plannedCycles.filter((c) => c.id !== sprintCycle.id)}
                canManage={canManageCycles}
                onChanged={() => {
                  setCyclesVersion((v) => v + 1);
                  board.reload();
                }}
              />
              <KanbanBoard
                columns={boardColumns}
                onTaskOpen={(t) => router.push(`/work/${t.id}`)}
                onTaskMove={onTaskMove}
                membersById={membersById}
                labelsById={labelsById}
                taskActions={actionsFor}
                busyId={busyId}
                emptyAction={newTaskButton}
              />
            </Stack>
          )
        ) : filters.view === "backlog" ? (
          !cycleTeamId ? (
            <EmptyState
              title="The backlog is a team surface"
              description="Pick a team in the scope bar to groom its backlog - ordering is per squad."
            />
          ) : (
            <BacklogList
              tasks={backlog.tasks}
              targetCycle={sprintCycle}
              onOpen={(id) => router.push(`/work/${id}`)}
              onChanged={backlog.reload}
            />
          )
        ) : filters.view === "tree" ? (
          <TaskTree
            roots={treeRoots}
            byId={membersById}
            onTaskOpen={(id) => router.push(`/work/${id}`)}
            emptyAction={newTaskButton}
          />
        ) : filters.view === "list" ? (
          <Stack gap="2">
          <TaskList
            tasks={listRows}
            groupBy={effectiveGroupBy}
            groupCtx={groupCtx}
            members={members}
            membersLoading={membersLoading}
            labels={labels}
            cyclesById={cyclesById}
            meId={meId}
            onOpen={(id) => router.push(`/work/${id}`)}
            onReload={listView.reload}
            emptyAction={newTaskButton}
          />
          {listRows.length >= 200 && (
            <p className="text-xs text-[var(--text-subtle)]">
              Showing the first 200 tasks - narrow the scope or filters to see
              the rest.
            </p>
          )}
          </Stack>
        ) : (
          <SelectionProvider value={selection}>
            {groupingActive ? (
              <SwimlaneBoard
                lanes={lanes}
                onTaskOpen={(t) => router.push(`/work/${t.id}`)}
                membersById={membersById}
                labelsById={labelsById}
                {...(selectMode ? {} : { taskActions: actionsFor })}
                {...(selectMode || !dragEnabled ? {} : { onTaskMove })}
                busyId={busyId}
                emptyAction={newTaskButton}
              />
            ) : (
              <KanbanBoard
                columns={boardColumns}
                onTaskOpen={(t) => router.push(`/work/${t.id}`)}
                membersById={membersById}
                labelsById={labelsById}
                {...(selectMode ? {} : { taskActions: actionsFor })}
                {...(selectMode || !dragEnabled ? {} : { onTaskMove })}
                busyId={busyId}
                emptyAction={newTaskButton}
              />
            )}
          </SelectionProvider>
        )}
      </Stack>

      {selectMode && (
        <BulkBar
          count={selectedIds.size}
          members={members}
          membersLoading={membersLoading}
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
