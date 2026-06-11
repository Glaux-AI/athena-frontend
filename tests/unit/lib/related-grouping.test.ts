/**
 * groupRelatedByTask — the "Related & subtasks" dedup. The endpoint returns
 * one pointer PER DOCUMENT, so a sibling task with several artifacts rendered
 * as duplicate same-title rows; the card now collapses to one row per task.
 */

import { describe, expect, it } from "vitest";

import type { RelatedArtifact } from "@/lib/api/client";
import { groupRelatedByTask } from "@/lib/work/related-grouping";

const ptr = (
  taskId: string,
  kind: string,
  relation = "sibling",
  title: string | null = "AppearanceSetting component",
): RelatedArtifact => ({
  artifact_id: `${taskId}-${kind}`,
  kind,
  task_id: taskId,
  title,
  relation,
});

describe("groupRelatedByTask", () => {
  it("collapses a task's many artifacts into ONE row, kinds deduped", () => {
    const groups = groupRelatedByTask([
      ptr("t1", "spec_doc"),
      ptr("t1", "diff_set"),
      ptr("t1", "pull_request"),
      ptr("t1", "pull_request"), // same kind twice → still listed once
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      taskId: "t1",
      relation: "sibling",
      title: "AppearanceSetting component",
      kinds: ["spec_doc", "diff_set", "pull_request"],
    });
  });

  it("keeps distinct tasks as distinct rows in arrival order", () => {
    const groups = groupRelatedByTask([
      ptr("parent", "prd", "parent", "Personalisation page"),
      ptr("t1", "spec_doc"),
      ptr("parent", "subtask_plan", "parent", "Personalisation page"),
    ]);
    expect(groups.map((g) => g.taskId)).toEqual(["parent", "t1"]);
    expect(groups[0]!.kinds).toEqual(["prd", "subtask_plan"]);
  });

  it("returns nothing for no pointers", () => {
    expect(groupRelatedByTask([])).toEqual([]);
  });
});
