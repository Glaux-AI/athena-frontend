"use client";

/**
 * BoardToolbar - the `/work` scope bar + filter chip bar (Work OS rehaul W6).
 *
 * Row 1 is the SCOPE bar - whose work you're looking at: My work / My teams /
 * a specific team / Everyone / Needs review. Row 2 narrows WHAT you see: a
 * search box, a "+ Filter" menu that adds one removable chip per active filter
 * (domain / team / label / type / priority / health / sprint), and the
 * inline sort (list only) / group / view controls. Controlled by the page,
 * which keeps every value in the URL (deep-linkable, Back-safe).
 *
 * This file also owns the /work URL filter vocabulary: the `BoardFilters`
 * shape, the scope grammar (`me | myteams | team:<id> | all | review`) and
 * its pure URL <-> server-param mapping (`parseScope` / `scopeToParams` /
 * `resolveDefaultScope`), so the page and the tests read one source.
 */

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, ChevronRight, ListFilter, Search, X } from "lucide-react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { focusRing, inputFocus } from "@/components/ui/focus";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type {
  Cycle,
  Domain,
  Label,
  MyTeam,
  TaskHealth,
  TaskPriority,
  TaskSort,
  TaskStatus,
  TaskType,
  Team,
} from "@/lib/api/client";
import { TASK_HEALTH_LABEL, TASK_TYPE_META } from "@/lib/work/task-meta";
import { GROUP_BY_LABEL, GROUP_BY_ORDER, type GroupBy } from "@/lib/work/board-group";

// --- The /work URL vocabulary --------------------------------------------- //

/** Whose work: mine / my teams' union / one team / everyone / awaiting review. */
export type BoardScope = "me" | "myteams" | "all" | "review" | `team:${string}`;

/** `sprint` / `backlog` are TEAM planning surfaces - offered only while a
 *  single team is in scope (the scope bar's team pick or a team chip). */
export type BoardView = "list" | "active" | "sprint" | "backlog" | "tree" | "history";

/** List-view grouping: the board dimensions plus an explicit flat "none". */
export type ListGroupBy = GroupBy | "none";

export interface BoardFilters {
  q: string;
  /** "" = auto - resolved from the caller's teams after they load (one team ->
   *  that team; several -> "myteams"; none -> "me"). An explicit pick sticks. */
  scope: BoardScope | "";
  domainId: string;
  /** Narrow to one squad ("__none" = teamless). "" = all teams. */
  teamId: string;
  /** Narrow to one label ("__none" = unlabeled). "" = all. */
  labelId: string;
  /** Narrow to one sprint ("__none" = no sprint / backlog lens). "" = all. */
  cycleId: string;
  type: TaskType | "";
  priority: TaskPriority | "";
  /** Delivery-risk lens (board endpoint filters on it server-side). */
  health: TaskHealth | "";
  /** Board: lane dimension ("status" = plain columns). List: section headers
   *  ("status" = status sections, "none" = flat rows). */
  groupBy: ListGroupBy;
  /** List-view server sort. */
  sort: TaskSort;
  view: BoardView;
}

export const DEFAULT_FILTERS: BoardFilters = {
  q: "",
  scope: "",
  domainId: "",
  teamId: "",
  labelId: "",
  cycleId: "",
  type: "",
  priority: "",
  health: "",
  groupBy: "status",
  sort: "-updated",
  view: "list",
};

/** Every /work URL param a saved view may capture (the SavedViewBar strips
 *  empties and snapshots exactly these). */
export const WORK_PARAM_KEYS = [
  "view",
  "scope",
  "domain",
  "team",
  "label",
  "cycle",
  "type",
  "priority",
  "health",
  "groupBy",
  "sort",
  "q",
] as const;

/** The sort keys the List view offers (a subset of the wire's `TaskSort`). */
export const SORT_VALUES: TaskSort[] = ["-updated", "-created", "due", "priority"];

const SORT_LABEL: Partial<Record<TaskSort, string>> = {
  "-updated": "Latest activity",
  "-created": "Newest created",
  due: "Due date",
  priority: "Priority",
};

/** Parse a `?scope=` value, mapping the legacy `mine` and rejecting garbage
 *  ("" = fall back to the auto default). */
export function parseScope(raw: string | null): BoardScope | "" {
  if (!raw) return "";
  if (raw === "mine") return "me"; // pre-rehaul vocabulary
  if (raw === "me" || raw === "myteams" || raw === "all" || raw === "review") return raw;
  if (raw.startsWith("team:") && raw.length > "team:".length) return raw as BoardScope;
  return "";
}

/** The default scope once the caller's teams are known (design §W6): a member
 *  of exactly one team lands on that team; several -> the "My teams" union;
 *  none -> their own work. */
export function resolveDefaultScope(myTeams: MyTeam[]): BoardScope {
  const first = myTeams[0];
  if (myTeams.length === 1 && first) return `team:${first.id}`;
  if (myTeams.length > 1) return "myteams";
  return "me";
}

/**
 * Server params contributed by the scope. `myteams` and `all` return nothing -
 * "myteams" is a client union over `owning_team_id` (the endpoints take one
 * team) and "review" narrows to the in_review status (a server param on the
 * list; a column pick on the already-bucketed board).
 */
export function scopeToParams(
  scope: BoardScope,
  opts: { meId: string | null; surface: "list" | "board" },
): { mine?: string; team_id?: string; status?: TaskStatus } {
  if (scope === "me") return opts.meId ? { mine: opts.meId } : {};
  if (scope.startsWith("team:")) return { team_id: scope.slice("team:".length) };
  if (scope === "review" && opts.surface === "list") return { status: "in_review" };
  return {};
}

// --- Presentation --------------------------------------------------------- //

const HEALTH_ORDER: TaskHealth[] = ["at_risk", "blocked", "on_track"];

const TYPE_ORDER: TaskType[] = [
  "task",
  "feature",
  "implementation",
  "design",
  "bug",
  "incident",
  "spike",
  "chore",
  "test",
];

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** The chip-bar filter dimensions (one chip per active dimension). */
type ChipKey =
  | "domainId"
  | "teamId"
  | "labelId"
  | "type"
  | "priority"
  | "health"
  | "cycleId";

interface FilterCategory {
  key: ChipKey;
  label: string;
  options: { value: string; label: string }[];
}

export function BoardToolbar({
  filters,
  effectiveScope,
  onChange,
  domains,
  teams,
  labels,
  cycles,
  myTeams,
  hasMe,
}: {
  filters: BoardFilters;
  /** The resolved scope (URL value, or the teams-derived default). Null while
   *  the caller's teams are still loading - nothing highlights yet. */
  effectiveScope: BoardScope | null;
  onChange: (next: Partial<BoardFilters>) => void;
  domains: Domain[];
  /** Live teams in the org - empty array hides every team affordance so an
   *  org that never adopts teams sees no team UI. */
  teams: Team[];
  /** Live labels - empty array hides the label filter. */
  labels: Label[];
  /** Cycles of the in-scope team (page-fetched; empty = only "No sprint"). */
  cycles: Cycle[];
  /** The caller's teams (null while loading) - drives the "My teams" segment. */
  myTeams: MyTeam[] | null;
  /** Whether a signed-in user id is available for the "My work" scope. */
  hasMe: boolean;
}) {
  const categories: FilterCategory[] = [
    ...(domains.length > 0
      ? [
          {
            key: "domainId" as const,
            label: "Domain",
            options: domains.map((d) => ({ value: d.id, label: d.name })),
          },
        ]
      : []),
    ...(teams.length > 0
      ? [
          {
            key: "teamId" as const,
            label: "Team",
            options: [
              ...teams.map((t) => ({ value: t.id, label: t.name })),
              { value: "__none", label: "No team" },
            ],
          },
        ]
      : []),
    ...(labels.length > 0
      ? [
          {
            key: "labelId" as const,
            label: "Label",
            options: [
              ...labels.filter((l) => !l.archived).map((l) => ({ value: l.id, label: l.key })),
              { value: "__none", label: "No label" },
            ],
          },
        ]
      : []),
    {
      key: "type",
      label: "Type",
      options: TYPE_ORDER.map((t) => ({ value: t, label: TASK_TYPE_META[t].label })),
    },
    {
      key: "priority",
      label: "Priority",
      options: PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
    },
    {
      key: "health",
      label: "Health",
      options: HEALTH_ORDER.map((h) => ({ value: h, label: TASK_HEALTH_LABEL[h] })),
    },
    {
      key: "cycleId",
      label: "Sprint",
      options: [
        { value: "__none", label: "No sprint" },
        ...cycles.map((c) => ({ value: c.id, label: c.name })),
      ],
    },
  ];

  const chipValue = (key: ChipKey): string => filters[key];
  const activeChips = categories.filter((c) => chipValue(c.key) !== "");
  const chipLabel = (cat: FilterCategory): string => {
    const value = chipValue(cat.key);
    const opt = cat.options.find((o) => o.value === value);
    // An id that no longer resolves (stale deep-link, soft-failed lookup) still
    // shows as a removable chip rather than vanishing silently.
    return opt?.label ?? "Selected";
  };

  const filtersActive =
    filters.q.trim() !== "" || activeChips.length > 0 ||
    // A stale id whose category hid (e.g. teams soft-failed) still counts.
    filters.domainId !== "" || filters.teamId !== "" || filters.labelId !== "" ||
    filters.cycleId !== "" || filters.type !== "" || filters.priority !== "" ||
    filters.health !== "";

  const scopedTeamId = effectiveScope?.startsWith("team:")
    ? effectiveScope.slice("team:".length)
    : "";
  const groupValue: ListGroupBy =
    filters.view === "active" && filters.groupBy === "none" ? "status" : filters.groupBy;

  return (
    <Stack gap="2.5">
      {/* Scope bar - whose work (design §W6). */}
      <Cluster gap="2" align="center">
        <Segmented<string>
          ariaLabel="Whose work to show"
          options={[
            // Without a signed-in id "My work" could only show an empty lie -
            // the segment is omitted rather than rendered disabled.
            ...(hasMe ? [{ value: "me", label: "My work" }] : []),
            ...(myTeams && myTeams.length > 0
              ? [{ value: "myteams", label: "My teams" }]
              : []),
            { value: "all", label: "Everyone" },
            { value: "review", label: "Needs review" },
          ]}
          value={effectiveScope ?? ""}
          onChange={(v) => onChange({ scope: v as BoardScope })}
        />
        {teams.length > 0 && (
          <Select
            size="sm"
            value={scopedTeamId}
            onChange={(e) => {
              const id = e.target.value;
              if (id) onChange({ scope: `team:${id}` });
            }}
            aria-label="Scope to one team's work"
          >
            <option value="" disabled>
              Team…
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </Cluster>

      {/* Filter chip bar - what you see. */}
      <Cluster gap="2" align="center" className="flex-wrap">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-subtle)]"
            aria-hidden
          />
          <input
            type="text"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search tasks or ids…"
            aria-label="Search tasks by title or id"
            className={cn(
              "w-48 rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-[border-color,box-shadow] duration-150",
              inputFocus,
            )}
          />
        </div>

        {activeChips.map((cat) => (
          <span
            key={cat.key}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] py-1 pl-2 pr-1 text-xs text-[var(--text)]"
          >
            <span className="text-[var(--text-muted)]">{cat.label}:</span>
            <span className="max-w-[10rem] truncate">{chipLabel(cat)}</span>
            <button
              type="button"
              aria-label={`Remove the ${cat.label.toLowerCase()} filter`}
              onClick={() => onChange({ [cat.key]: "" } as Partial<BoardFilters>)}
              className="rounded p-0.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}

        <AddFilterMenu
          categories={categories}
          onPick={(key, value) => onChange({ [key]: value } as Partial<BoardFilters>)}
        />

        {filtersActive && (
          <button
            type="button"
            onClick={() =>
              onChange({
                q: "",
                domainId: "",
                teamId: "",
                labelId: "",
                cycleId: "",
                type: "",
                priority: "",
                health: "",
              })
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              focusRing,
            )}
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </button>
        )}

        {/* Right side: sort (list) + group-by (list/board) + the view switch. */}
        <div className="ml-auto flex items-center gap-2">
          {filters.view === "list" && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              Sort
              <Select
                size="sm"
                value={SORT_VALUES.includes(filters.sort) ? filters.sort : DEFAULT_FILTERS.sort}
                onChange={(e) => onChange({ sort: e.target.value as TaskSort })}
                aria-label="Sort the list by"
              >
                {SORT_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {(filters.view === "active" || filters.view === "list") && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              Group
              <Select
                size="sm"
                value={groupValue}
                onChange={(e) => onChange({ groupBy: e.target.value as ListGroupBy })}
                aria-label={filters.view === "list" ? "Group the list by" : "Group the board by"}
              >
                {filters.view === "list" && <option value="none">None</option>}
                {GROUP_BY_ORDER.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_BY_LABEL[g]}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <Segmented<string>
            ariaLabel="Which view of the work"
            options={[
              { value: "list", label: "List" },
              { value: "active", label: "Board" },
              // Sprint planning is a TEAM motion - the tabs appear once a
              // single team is in scope, so a solo org never sees them.
              ...(scopedTeamId !== ""
                ? [
                    { value: "sprint", label: "Sprint" },
                    { value: "backlog", label: "Backlog" },
                  ]
                : []),
              { value: "tree", label: "Tree" },
              { value: "history", label: "History" },
            ]}
            value={filters.view}
            onChange={(v) => onChange({ view: v as BoardView })}
          />
        </div>
      </Cluster>
    </Stack>
  );
}

/** "+ Filter" - a two-step popover: pick a dimension, then a value. Adds one
 *  chip per dimension (single-value filters, matching the server lenses). */
function AddFilterMenu({
  categories,
  onPick,
}: {
  categories: FilterCategory[];
  onPick: (key: ChipKey, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<ChipKey | null>(null);
  const active = categories.find((c) => c.key === activeKey) ?? null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setActiveKey(null);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border-strong)] px-2 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ListFilter className="size-3.5" aria-hidden />
          Filter
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="glass-panel animate-modal-in z-[var(--z-popover)] w-56 p-1 focus:outline-none"
        >
          {active === null ? (
            <div role="menu" aria-label="Add a filter">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  role="menuitem"
                  onClick={() => setActiveKey(cat.key)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {cat.label}
                  <ChevronRight className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
                </button>
              ))}
            </div>
          ) : (
            <div role="menu" aria-label={`Filter by ${active.label.toLowerCase()}`}>
              <button
                type="button"
                onClick={() => setActiveKey(null)}
                className="mb-1 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <ChevronLeft className="size-3.5" aria-hidden />
                {active.label}
              </button>
              <div className="max-h-64 overflow-y-auto">
                {active.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onPick(active.key, opt.value);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
