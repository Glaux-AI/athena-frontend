/**
 * Label presentation + the `sev:` priority-override rule.
 *
 * Label colors map to the existing semantic soft/ink token pairs (no color
 * literals - the UX standard forbids them and AA is guaranteed by the -soft/-ink
 * pairing). A `key` may carry a single `:` group prefix, rendered as a faint
 * chip. `sev:1`/`sev:2` override priority in the My-Work / backlog sort so an
 * incident surfaces to the top regardless of its `priority` value.
 */

import type { Label, Task, TaskPriority } from "@/lib/api/client";

/** chip className per label color (bg + text via tokens, AA by construction). */
export const LABEL_COLOR_CLASS: Record<string, string> = {
  slate: "bg-[var(--surface-3)] text-[var(--text-muted)]",
  red: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  orange: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  amber: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  mint: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  violet: "bg-[var(--primary-soft)] text-[var(--primary)]",
  cyan: "bg-[var(--info-soft)] text-[var(--info-ink)]",
  indigo: "bg-[var(--info-soft)] text-[var(--info-ink)]",
  rose: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
};

export function labelColorClass(color: string): string {
  return (
    LABEL_COLOR_CLASS[color] ??
    "bg-[var(--surface-3)] text-[var(--text-muted)]"
  );
}

/** Split a label key into an optional group prefix + the value. */
export function splitLabelKey(key: string): { prefix: string | null; value: string } {
  const i = key.indexOf(":");
  return i === -1
    ? { prefix: null, value: key }
    : { prefix: key.slice(0, i), value: key.slice(i + 1) };
}

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Effective scheduling rank for a task, lower = more urgent. `priority` is the
 * dial, BUT a `sev:1`/`sev:2` label overrides it to the very top so an incident
 * never sorts as "medium". Returns a number you can sort ascending.
 */
export function effectivePriorityRank(
  task: Pick<Task, "priority" | "label_ids">,
  labelsById: Map<string, Label>,
): number {
  for (const id of task.label_ids) {
    const key = labelsById.get(id)?.key;
    if (key === "sev:1") return -2;
    if (key === "sev:2") return -1;
  }
  return PRIORITY_RANK[(task.priority as TaskPriority) ?? ""] ?? 4;
}
