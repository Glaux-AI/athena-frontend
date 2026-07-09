import { describe, expect, it } from "vitest";

import {
  boardColumns,
  canDropTo,
  dropHint,
  isRailed,
} from "@/lib/work/board-dnd";
import { BOARD_COLUMN_ORDER } from "@/lib/work/task-meta";
import type { KanbanColumn, Task, TaskStatus, TaskType } from "@/lib/api/client";

/** Minimal Task with only the fields the drag rules read. */
function task(partial: Partial<Task> = {}): Task {
  return {
    id: "t1",
    type: "feature",
    status: "todo",
    ...partial,
  } as Task;
}

const column = (status: TaskStatus, n: number): KanbanColumn => ({
  status,
  tasks: Array.from({ length: n }, (_, i) => task({ id: `${status}-${i}`, status })),
  total: n,
});

describe("isRailed", () => {
  it("is false only for the plain `task` type (no AI workflow attached)", () => {
    expect(isRailed(task({ type: "task" }))).toBe(false);
    const railed: TaskType[] = [
      "feature",
      "implementation",
      "design",
      "bug",
      "incident",
      "spike",
      "chore",
      "test",
    ];
    for (const type of railed) expect(isRailed(task({ type }))).toBe(true);
  });
});

describe("canDropTo", () => {
  it("refuses a same-status drop (a no-op, not a move)", () => {
    for (const status of BOARD_COLUMN_ORDER) {
      expect(canDropTo(task({ status }), status, false)).toBe(false);
      expect(canDropTo(task({ status }), status, true)).toBe(false);
    }
  });

  it("blocks in_review for railed tasks (the stage gate owns that state)", () => {
    expect(canDropTo(task({ status: "todo" }), "in_review", true)).toBe(false);
  });

  it("allows in_review for unrailed tasks", () => {
    expect(canDropTo(task({ type: "task", status: "todo" }), "in_review", false)).toBe(true);
  });

  it("allows every other column, including done, railed or not", () => {
    const targets = BOARD_COLUMN_ORDER.filter((s) => s !== "in_review");
    for (const next of targets) {
      const from = task({ status: next === "todo" ? "backlog" : "todo" });
      expect(canDropTo(from, next, true)).toBe(true);
      expect(canDropTo(from, next, false)).toBe(true);
    }
  });
});

describe("dropHint", () => {
  it("explains the gate on a railed in_review drop", () => {
    expect(dropHint(task({ status: "todo" }), "in_review")).toBe(
      "In review is set by the stage gate.",
    );
  });

  it("is silent for an unrailed task, an allowed drop, and a same-status no-op", () => {
    expect(dropHint(task({ type: "task", status: "todo" }), "in_review")).toBeNull();
    expect(dropHint(task({ status: "todo" }), "done")).toBeNull();
    // Same-status is a quiet no-op, not a gate refusal.
    expect(dropHint(task({ status: "in_review" }), "in_review")).toBeNull();
  });
});

describe("boardColumns", () => {
  const sparse = [column("in_progress", 2), column("backlog", 1)];

  it("static board: drops empty columns and orders by BOARD_COLUMN_ORDER", () => {
    const cols = boardColumns([column("done", 0), ...sparse], false);
    expect(cols.map((c) => c.status)).toEqual(["backlog", "in_progress"]);
  });

  it("draggable board: renders the full column set so empties are drop targets", () => {
    const cols = boardColumns(sparse, true);
    expect(cols.map((c) => c.status)).toEqual(BOARD_COLUMN_ORDER);
    // The fabricated empties carry no tasks; the real ones keep theirs.
    expect(cols.find((c) => c.status === "todo")?.total).toBe(0);
    expect(cols.find((c) => c.status === "in_progress")?.total).toBe(2);
  });

  it("never fabricates a cancelled column, but keeps a server-sent one", () => {
    expect(
      boardColumns(sparse, true).some((c) => c.status === "cancelled"),
    ).toBe(false);
    const withCancelled = boardColumns([...sparse, column("cancelled", 3)], true);
    expect(withCancelled.at(-1)?.status).toBe("cancelled");
  });
});
