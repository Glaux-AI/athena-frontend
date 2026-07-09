/**
 * Backlog reorder math (Work OS rehaul W5): the neighbors a dropped row lands
 * between drive `api.tasks.reorder` (the `tasks.rank` writer) - a wrong pair
 * here silently scrambles a team's backlog order.
 */

import { describe, expect, it } from "vitest";

import { reorderNeighbors } from "@/components/work/backlog-list";
import { cycleDayProgress } from "@/components/work/sprint-header";

const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("reorderNeighbors", () => {
  it("drops to the head with only a successor", () => {
    expect(reorderNeighbors(rows, "c", 0)).toEqual({ before_id: "a" });
  });

  it("drops to the tail with only a predecessor", () => {
    expect(reorderNeighbors(rows, "a", 4)).toEqual({ after_id: "d" });
  });

  it("drops between two rows, excluding the dragged row itself", () => {
    // Dragging "d" above "b": remaining order a,b,c -> index 1 = between a and b.
    expect(reorderNeighbors(rows, "d", 1)).toEqual({
      after_id: "a",
      before_id: "b",
    });
  });

  it("adjusts for the removed row on a downward drag (the off-by-one)", () => {
    // Dragging "b" to sit just above "d" (full-list insertion index 3): the
    // remaining order is a,c,d, and the drop must land BETWEEN c and d - the
    // unadjusted index put it after d, one slot below the drop indicator.
    expect(reorderNeighbors(rows, "b", 3)).toEqual({
      after_id: "c",
      before_id: "d",
    });
    // Move-down by one (insertion index from+2 = 2 for "a") is the same math.
    expect(reorderNeighbors(rows, "a", 2)).toEqual({
      after_id: "b",
      before_id: "c",
    });
  });

  it("clamps an out-of-range index", () => {
    expect(reorderNeighbors(rows, "b", 99)).toEqual({ after_id: "d" });
    expect(reorderNeighbors(rows, "b", -5)).toEqual({ before_id: "a" });
  });
});

describe("cycleDayProgress", () => {
  it("computes day X of Y inside the window", () => {
    const p = cycleDayProgress(
      { starts_on: "2026-07-06", ends_on: "2026-07-19" },
      new Date("2026-07-08T12:00:00"),
    );
    expect(p).toEqual({ day: 3, total: 14 });
  });

  it("clamps before the start and after the end", () => {
    const window = { starts_on: "2026-07-06", ends_on: "2026-07-19" };
    expect(cycleDayProgress(window, new Date("2026-07-01T00:00:00"))?.day).toBe(1);
    expect(cycleDayProgress(window, new Date("2026-08-01T00:00:00"))?.day).toBe(14);
  });

  it("is null for an undated cycle", () => {
    expect(cycleDayProgress({ starts_on: null, ends_on: null })).toBeNull();
  });
});
