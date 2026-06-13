/**
 * Related-artifacts grouping for the cockpit's "Related & subtasks" card.
 *
 * The `/related-artifacts` endpoint returns one pointer PER DOCUMENT of each
 * related task - a sibling with a spec + diff + PR description would render
 * as three identical same-title rows all linking to the same task page
 * (the "duplicate subtasks" the card showed). Collapse to one row per TASK,
 * keeping the artifact kinds as a summary line.
 */

import type { RelatedArtifact } from "@/lib/api/client";

export interface RelatedTaskGroup {
  taskId: string;
  relation: string;
  title: string | null;
  kinds: string[];
}

export function groupRelatedByTask(related: RelatedArtifact[]): RelatedTaskGroup[] {
  const byTask = new Map<string, RelatedTaskGroup>();
  for (const r of related) {
    const g = byTask.get(r.task_id) ?? {
      taskId: r.task_id,
      relation: r.relation,
      title: r.title,
      kinds: [],
    };
    if (!g.kinds.includes(r.kind)) g.kinds.push(r.kind);
    byTask.set(r.task_id, g);
  }
  return [...byTask.values()];
}
