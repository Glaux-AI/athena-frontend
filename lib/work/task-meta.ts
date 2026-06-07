/**
 * Task type + status presentation metadata — the shared vocabulary the kanban
 * board cards, the cockpit, and the create dialog all render from. Labels live
 * here (single source); status pill colors live in
 * `components/ui/task-status-pill.tsx` (mirrors the StatusPill convention).
 */

import {
  Bug,
  Code2,
  FlaskConical,
  Lightbulb,
  PenTool,
  Siren,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { TaskStatus, TaskType } from "@/lib/api/client";

export const TASK_TYPE_META: Record<
  TaskType,
  { label: string; Icon: LucideIcon }
> = {
  feature: { label: "Feature", Icon: Lightbulb },
  implementation: { label: "Implementation", Icon: Code2 },
  design: { label: "Design", Icon: PenTool },
  bug: { label: "Bug", Icon: Bug },
  incident: { label: "Incident", Icon: Siren },
  spike: { label: "Spike", Icon: FlaskConical },
  chore: { label: "Chore", Icon: Wrench },
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  triage: "Triage",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

/**
 * Canonical kanban column order + the set shown by default. The board endpoint
 * (`api.tasks.board`) drives the actual columns it returns; this is the order
 * the FE lays them out in and the default visible set (`cancelled` is hidden
 * unless explicitly filtered to).
 */
export const BOARD_COLUMN_ORDER: TaskStatus[] = [
  "backlog",
  "triage",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
];
