/**
 * List-view grouping (`groupIntoSections`, Work OS rehaul W3) - flat sections
 * over an already server-sorted list.
 *
 * Pins:
 *  - `status` IS a grouping here (one section per status in board order),
 *    unlike the board where status is the column axis;
 *  - input (server-sort) order is preserved within a section;
 *  - non-status dimensions reuse the swimlane bucketing (labels resolved,
 *    "none" bucket last) but yield flat rows.
 */

import { describe, expect, it } from "vitest";

import { groupIntoSections, type GroupContext } from "@/lib/work/board-group";
import type { Domain, Label, Member, Task, Team } from "@/lib/api/client";

/** Minimal Task with only the fields the grouper reads. */
function task(partial: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    status: "todo",
    type: "feature",
    priority: null,
    domain_id: null,
    owning_team_id: null,
    owner_user_id: null,
    ...partial,
  } as Task;
}

function ctx(overrides: Partial<GroupContext> = {}): GroupContext {
  return {
    membersById: new Map<string, Member>(),
    domainsById: new Map<string, Domain>(),
    teamsById: new Map<string, Team>(),
    labelsById: new Map<string, Label>(),
    ...overrides,
  };
}

describe("groupIntoSections - status", () => {
  it("sections by status in board order, preserving input order within", () => {
    const a = task({ id: "a", status: "in_progress" });
    const b = task({ id: "b", status: "todo" });
    const c = task({ id: "c", status: "in_progress" });
    const sections = groupIntoSections([a, b, c], "status", ctx());

    // Board order puts todo before in_progress; empties are dropped.
    expect(sections.map((s) => s.key)).toEqual(["todo", "in_progress"]);
    expect(sections[0]?.label).toBe("To do");
    expect(sections[0]?.total).toBe(1);
    // The server sort (input order) survives inside the section.
    expect(sections[1]?.tasks.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("returns no sections for an empty list", () => {
    expect(groupIntoSections([], "status", ctx())).toEqual([]);
  });
});

describe("groupIntoSections - non-status dimensions", () => {
  it("buckets by owner with resolved names and an Unassigned bucket", () => {
    const members = new Map<string, Member>([
      ["u1", { user_id: "u1", display_name: "Ada" } as Member],
    ]);
    const sections = groupIntoSections(
      [
        task({ id: "x", owner_user_id: null }),
        task({ id: "y", owner_user_id: "u1" }),
        task({ id: "z", owner_user_id: "u1" }),
      ],
      "owner",
      ctx({ membersById: members }),
    );

    // Section ordering for name-sorted lanes is locale-dependent (matches the
    // swimlane mechanism) and isn't asserted - bucketing + row order are.
    const byKey = new Map(sections.map((s) => [s.key, s]));
    expect(byKey.get("u1")?.label).toBe("Ada");
    expect(byKey.get("u1")?.total).toBe(2);
    expect(byKey.get("u1")?.tasks.map((t) => t.id)).toEqual(["y", "z"]);
    expect(byKey.get("__none")?.label).toBe("Unassigned");
    expect(byKey.get("__none")?.total).toBe(1);
  });

  it("orders priority sections urgent -> none", () => {
    const sections = groupIntoSections(
      [
        task({ priority: null }),
        task({ priority: "low" }),
        task({ priority: "urgent" }),
      ],
      "priority",
      ctx(),
    );
    expect(sections.map((s) => s.label)).toEqual(["Urgent", "Low", "No priority"]);
  });
});
