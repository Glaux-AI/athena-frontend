"use client";

/**
 * BoardToolbar - the `/work` filter bar. Narrows the board so it stays usable
 * at hundreds of tasks: free-text search, a scope toggle (everyone / mine), a
 * domain filter, a type filter, and an Active⇄Cancelled view switch. Controlled
 * by the page (which feeds the values into `useTasks`). Tokens-only; native
 * select/input matching the repo's form convention.
 */

import { Search, X } from "lucide-react";

import { Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { Domain, TaskHealth, TaskPriority, TaskType } from "@/lib/api/client";
import { TASK_HEALTH_LABEL, TASK_TYPE_META } from "@/lib/work/task-meta";
import { GROUP_BY_LABEL, GROUP_BY_ORDER, type GroupBy } from "@/lib/work/board-group";

type BoardScope = "all" | "mine" | "review";
type BoardView = "active" | "tree" | "history";

export interface BoardFilters {
  q: string;
  scope: BoardScope;
  domainId: string;
  type: TaskType | "";
  priority: TaskPriority | "";
  /** Delivery-risk lens (board endpoint filters on it server-side). */
  health: TaskHealth | "";
  /** Board-only: lane the active board by this dimension ("status" = no lanes). */
  groupBy: GroupBy;
  view: BoardView;
}

// "My tasks" is the default landing scope - you see your own work first, then
// widen to "All" on demand (the scope toggle). Empty is handled gracefully.
export const DEFAULT_FILTERS: BoardFilters = {
  q: "",
  scope: "mine",
  domainId: "",
  type: "",
  priority: "",
  health: "",
  groupBy: "status",
  view: "active",
};

const HEALTH_ORDER: TaskHealth[] = ["at_risk", "blocked", "on_track"];

const TYPE_ORDER: TaskType[] = [
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

const SELECT_CLASS =
  "rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function BoardToolbar({
  filters,
  onChange,
  domains,
  hasMe,
}: {
  filters: BoardFilters;
  onChange: (next: Partial<BoardFilters>) => void;
  domains: Domain[];
  /** Whether a signed-in user id is available for the "My tasks" filter. */
  hasMe: boolean;
}) {
  // "Clear" resets to the default view (My tasks, no other filters); it shows
  // when the filters deviate from that default.
  const filtersActive =
    filters.q.trim() !== "" ||
    filters.scope !== "mine" ||
    filters.domainId !== "" ||
    filters.type !== "" ||
    filters.priority !== "" ||
    filters.health !== "";

  return (
    <Cluster gap="2" align="center" className="flex-wrap">
      {/* Search */}
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
          className="w-48 rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>

      {/* Scope: everyone / mine / awaiting a human review */}
      <Segmented
        options={[
          { value: "all", label: "All" },
          { value: "mine", label: "My tasks" },
          { value: "review", label: "Needs review", title: "Tasks waiting on a human sign-off" },
        ]}
        value={filters.scope}
        onChange={(v) => onChange({ scope: v as BoardScope })}
        {...(hasMe ? {} : { disabledValue: "mine", disabledTitle: "Sign in to filter your tasks" })}
      />

      {/* Domain */}
      <select
        value={filters.domainId}
        onChange={(e) => onChange({ domainId: e.target.value })}
        aria-label="Filter by domain"
        className={SELECT_CLASS}
      >
        <option value="">All domains</option>
        {domains.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      {/* Type */}
      <select
        value={filters.type}
        onChange={(e) => onChange({ type: e.target.value as TaskType | "" })}
        aria-label="Filter by type"
        className={SELECT_CLASS}
      >
        <option value="">All types</option>
        {TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {TASK_TYPE_META[t].label}
          </option>
        ))}
      </select>

      {/* Priority */}
      <select
        value={filters.priority}
        onChange={(e) =>
          onChange({ priority: e.target.value as TaskPriority | "" })
        }
        aria-label="Filter by priority"
        className={SELECT_CLASS}
      >
        <option value="">Any priority</option>
        {PRIORITY_ORDER.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>

      {/* Health (delivery-risk lens) */}
      <select
        value={filters.health}
        onChange={(e) =>
          onChange({ health: e.target.value as TaskHealth | "" })
        }
        aria-label="Filter by health"
        className={SELECT_CLASS}
      >
        <option value="">Any health</option>
        {HEALTH_ORDER.map((h) => (
          <option key={h} value={h}>
            {TASK_HEALTH_LABEL[h]}
          </option>
        ))}
      </select>

      {filtersActive && (
        <button
          type="button"
          onClick={() =>
            onChange({ q: "", scope: "mine", domainId: "", type: "", priority: "", health: "" })
          }
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </button>
      )}

      {/* Right side: group-by (board view only) + the board/tree/history switch */}
      <div className="ml-auto flex items-center gap-2">
        {filters.view === "active" && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            Group
            <select
              value={filters.groupBy}
              onChange={(e) => onChange({ groupBy: e.target.value as GroupBy })}
              aria-label="Group the board by"
              className={SELECT_CLASS}
            >
              {GROUP_BY_ORDER.map((g) => (
                <option key={g} value={g}>
                  {GROUP_BY_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
        )}
        <Segmented
          options={[
            { value: "active", label: "Board" },
            { value: "tree", label: "Tree", title: "Tasks and their subtasks as an expandable tree" },
            { value: "history", label: "History", title: "Shipped and removed tasks that have left the board" },
          ]}
          value={filters.view}
          onChange={(v) => onChange({ view: v as BoardView })}
        />
      </div>
    </Cluster>
  );
}

function Segmented({
  options,
  value,
  onChange,
  disabledValue,
  disabledTitle,
}: {
  options: { value: string; label: string; title?: string }[];
  value: string;
  onChange: (v: string) => void;
  disabledValue?: string;
  /** Tooltip explaining WHY a disabled segment is unavailable (a11y). */
  disabledTitle?: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        const disabled = o.value === disabledValue;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            title={disabled ? disabledTitle : o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              selected
                ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
              disabled && "cursor-not-allowed opacity-40 hover:text-[var(--text-muted)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
