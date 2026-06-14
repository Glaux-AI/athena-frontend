/**
 * Board grouping - turn a flat task set into swimlanes (one lane per owner /
 * priority / domain / type), each lane bucketed into status columns. The board
 * data already carries every grouping field, so this is pure client-side work
 * over the fetched columns - no extra fetch. `status` is the default (no lanes,
 * just the plain column board).
 */

import type {
  Domain,
  KanbanColumn,
  Member,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/api/client";
import { BOARD_COLUMN_ORDER, TASK_TYPE_META } from "./task-meta";

export type GroupBy = "status" | "owner" | "priority" | "domain" | "type";

export const GROUP_BY_ORDER: GroupBy[] = [
  "status",
  "owner",
  "priority",
  "domain",
  "type",
];

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  status: "Status",
  owner: "Owner",
  priority: "Priority",
  domain: "Domain",
  type: "Type",
};

export interface Swimlane {
  key: string;
  label: string;
  total: number;
  columns: KanbanColumn[];
}

/** Bucket a flat task list into status columns (BOARD_COLUMN_ORDER first, then
 *  any extra status), dropping empties - the column row inside one swimlane. */
export function tasksToColumns(tasks: Task[]): KanbanColumn[] {
  const byStatus = new Map<TaskStatus, Task[]>();
  for (const t of tasks) {
    const arr = byStatus.get(t.status);
    if (arr) arr.push(t);
    else byStatus.set(t.status, [t]);
  }
  const ordered: KanbanColumn[] = [];
  for (const status of BOARD_COLUMN_ORDER) {
    const ts = byStatus.get(status);
    if (ts && ts.length > 0) {
      ordered.push({ status, tasks: ts, total: ts.length });
      byStatus.delete(status);
    }
  }
  for (const [status, ts] of byStatus) {
    ordered.push({ status, tasks: ts, total: ts.length });
  }
  return ordered;
}

const PRIORITY_LANE_ORDER: (TaskPriority | "none")[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];
const PRIORITY_LANE_LABEL: Record<TaskPriority | "none", string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

const TYPE_ORDER = Object.keys(TASK_TYPE_META);

interface LaneSeed {
  label: string;
  sort: number | string;
  tasks: Task[];
}

/** Group a flat task set into ordered swimlanes by the chosen dimension. */
export function groupIntoLanes(
  tasks: Task[],
  groupBy: Exclude<GroupBy, "status">,
  ctx: { membersById: Map<string, Member>; domainsById: Map<string, Domain> },
): Swimlane[] {
  const lanes = new Map<string, LaneSeed>();
  const push = (key: string, label: string, sort: number | string, t: Task) => {
    const lane = lanes.get(key);
    if (lane) lane.tasks.push(t);
    else lanes.set(key, { label, sort, tasks: [t] });
  };

  for (const t of tasks) {
    if (groupBy === "owner") {
      const key = t.owner_user_id ?? "__none";
      const label = t.owner_user_id
        ? (ctx.membersById.get(t.owner_user_id)?.display_name ?? "Assigned")
        : "Unassigned";
      // Unassigned sorts last ("~" is the highest printable ASCII, after z).
      push(key, label, t.owner_user_id ? label.toLowerCase() : "~~~", t);
    } else if (groupBy === "priority") {
      const p = t.priority ?? "none";
      push(p, PRIORITY_LANE_LABEL[p], PRIORITY_LANE_ORDER.indexOf(p), t);
    } else if (groupBy === "domain") {
      const key = t.domain_id ?? "__none";
      const label = t.domain_id
        ? (ctx.domainsById.get(t.domain_id)?.name ?? "Domain")
        : "No domain";
      push(key, label, t.domain_id ? label.toLowerCase() : "~~~", t);
    } else {
      push(t.type, TASK_TYPE_META[t.type].label, TYPE_ORDER.indexOf(t.type), t);
    }
  }

  const seeds = [...lanes.entries()].map(([key, seed]) => ({
    sort: seed.sort,
    lane: {
      key,
      label: seed.label,
      total: seed.tasks.length,
      columns: tasksToColumns(seed.tasks),
    } satisfies Swimlane,
  }));
  seeds.sort((a, b) =>
    typeof a.sort === "number" && typeof b.sort === "number"
      ? a.sort - b.sort
      : String(a.sort).localeCompare(String(b.sort)),
  );
  return seeds.map((s) => s.lane);
}
