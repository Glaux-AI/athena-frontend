/**
 * Task type + status presentation metadata - the shared vocabulary the kanban
 * board cards, the cockpit, and the create dialog all render from. Labels live
 * here (single source); status pill colors live in
 * `components/ui/task-status-pill.tsx` (mirrors the StatusPill convention).
 */

import {
  Bug,
  ClipboardCheck,
  Code2,
  FlaskConical,
  Lightbulb,
  PenTool,
  Siren,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type {
  TaskCancelReason,
  TaskHealth,
  TaskStatus,
  TaskType,
} from "@/lib/api/client";

export const TASK_TYPE_META: Record<
  TaskType,
  { label: string; Icon: LucideIcon; outcome: string }
> = {
  // `outcome` is the plain-language, honest description of what Athena produces
  // for this type - shown at create so the user knows the deliverable up front
  // (legible, never magic). Phrasing names the human gates ("for your review").
  feature: {
    label: "Feature",
    Icon: Lightbulb,
    outcome: "Athena researches the problem, drafts a PRD for your review, then breaks it into buildable tasks.",
  },
  implementation: {
    label: "Implementation",
    Icon: Code2,
    outcome: "Athena plans the change, writes the diff for you to review, then opens a PR.",
  },
  design: {
    label: "Design",
    Icon: PenTool,
    outcome: "Athena designs a working prototype you can refine, then writes the build spec.",
  },
  bug: {
    label: "Bug",
    Icon: Bug,
    outcome: "Athena reproduces it, finds the root cause, and proposes a fix for your approval.",
  },
  incident: {
    label: "Incident",
    Icon: Siren,
    outcome: "Athena drafts a mitigation, diagnoses the cause, fixes it, and writes the postmortem.",
  },
  spike: {
    label: "Spike",
    Icon: FlaskConical,
    outcome: "Athena investigates the open question and brings back a recommendation.",
  },
  chore: {
    label: "Chore",
    Icon: Wrench,
    outcome: "Athena does the task and verifies it's done.",
  },
  test: {
    label: "Test",
    Icon: ClipboardCheck,
    outcome: "Athena plans the checks for any finished work, verifies against them, and reports a verdict for your review.",
  },
};

/** Why a task was removed from the board (the `cancel_reason` codes). `done` is
 *  a separate real outcome (a status), not a cancel reason. */
export const CANCEL_REASON_LABEL: Record<TaskCancelReason, string> = {
  not_needed: "Not needed",
  obsolete: "Obsolete",
};

/** Delivery-risk lens labels. `on_track` isn't surfaced (it's the quiet
 *  default); `at_risk` / `blocked` show as a chip on the board card. */
export const TASK_HEALTH_LABEL: Record<TaskHealth, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};

export type DueTone = "overdue" | "soon" | "later";
export interface DueInfo {
  label: string;
  tone: DueTone;
}

/**
 * Turn a task's `target_date` (an ISO date, no time) into a board chip: overdue
 * (past), soon (today / within 3 days), or later (the date itself). Returns
 * null when there's no date or it can't be parsed - the card shows nothing.
 * Compared by local calendar day so "due today" is stable across the day.
 */
export function describeDue(targetDate: string | null): DueInfo | null {
  if (!targetDate) return null;
  const due = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) {
    return {
      label: days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`,
      tone: "overdue",
    };
  }
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  if (days <= 3) return { label: `Due in ${days} days`, tone: "soon" };
  const when = due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return { label: `Due ${when}`, tone: "later" };
}

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
