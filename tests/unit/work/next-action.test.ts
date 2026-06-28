import { describe, expect, it } from "vitest";

import { nextActionUserId, type Task } from "@/lib/api/client";

const OWNER = "u-owner";
const REVIEWER = "u-reviewer";
const ASSIGNEE = "u-assignee";

function task(p: Partial<Task>): Task {
  return {
    status: "in_progress",
    owner_user_id: OWNER,
    reviewer_user_id: null,
    assignee: null,
    ai_delegated: false,
    ...p,
  } as Task;
}

describe("nextActionUserId", () => {
  it("in_review routes to the reviewer, falling back to the owner", () => {
    expect(nextActionUserId(task({ status: "in_review", reviewer_user_id: REVIEWER })))
      .toBe(REVIEWER);
    expect(nextActionUserId(task({ status: "in_review", reviewer_user_id: null })))
      .toBe(OWNER);
  });

  it("blocked is the owner's to unblock", () => {
    expect(nextActionUserId(task({ status: "blocked" }))).toBe(OWNER);
  });

  it("an AI-delegated live task is on nobody (Athena ready, not 'on you')", () => {
    expect(nextActionUserId(task({ ai_delegated: true }))).toBeNull();
  });

  it("a human live task is on the assignee, falling back to the owner", () => {
    expect(nextActionUserId(task({ assignee: ASSIGNEE }))).toBe(ASSIGNEE);
    expect(nextActionUserId(task({ assignee: null }))).toBe(OWNER);
  });

  it("terminal tasks are on nobody", () => {
    expect(nextActionUserId(task({ status: "done" }))).toBeNull();
    expect(nextActionUserId(task({ status: "cancelled" }))).toBeNull();
  });
});
