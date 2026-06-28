import { describe, expect, it } from "vitest";

import { groupIntoLanes } from "@/lib/work/board-group";
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

const team = (id: string, name: string): Team =>
  ({ id, name, slug: name.toLowerCase() }) as Team;

function ctx(teams: Team[]) {
  return {
    membersById: new Map<string, Member>(),
    domainsById: new Map<string, Domain>(),
    teamsById: new Map(teams.map((t) => [t.id, t])),
    labelsById: new Map<string, Label>(),
  };
}

describe("groupIntoLanes - team swimlanes", () => {
  it("buckets tasks by owning_team_id, resolving team names", () => {
    const platform = team("t1", "Platform");
    const growth = team("t2", "Growth");
    const lanes = groupIntoLanes(
      [
        task({ owning_team_id: "t1" }),
        task({ owning_team_id: "t2" }),
        task({ owning_team_id: "t1" }),
        task({ owning_team_id: null }), // teamless -> its own "No team" lane
      ],
      "team",
      ctx([platform, growth]),
    );

    // One lane per distinct team + a teamless lane (label/key resolution is
    // what this branch adds; lane ordering matches the existing domain/owner
    // "none"-lane mechanism and isn't asserted here).
    const byKey = new Map(lanes.map((l) => [l.key, l]));
    expect(byKey.get("t1")?.label).toBe("Platform");
    expect(byKey.get("t1")?.total).toBe(2);
    expect(byKey.get("t2")?.label).toBe("Growth");
    expect(byKey.get("t2")?.total).toBe(1);
    expect(byKey.get("__none")?.label).toBe("No team");
    expect(byKey.get("__none")?.total).toBe(1);
  });

  it("falls back to a generic label when the team is not in the map", () => {
    const lanes = groupIntoLanes(
      [task({ owning_team_id: "ghost" })],
      "team",
      ctx([]),
    );
    expect(lanes[0]?.label).toBe("Team");
  });
});
