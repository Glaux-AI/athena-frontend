/**
 * Integration-flavoured tests for the F-04.7 decision-list CRUD via the
 * mock handler. Exercises the same code path the page uses (`api.runs.
 * decisionList.*`) so a regression in the typed surface or the mock handler
 * fails here.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { api } from "@/lib/api/client";
import { runDecisions } from "@/lib/api/mock/db";

describe("decisionList CRUD via mock handler", () => {
  // The runDecisions table is module-level mutable state; snapshot + restore
  // around each test so the per-test mutations stay isolated.
  let originalTsk001: typeof runDecisions["tsk_001"];

  beforeEach(() => {
    originalTsk001 = JSON.parse(JSON.stringify(runDecisions["tsk_001"] ?? []));
    runDecisions["tsk_001"] = JSON.parse(JSON.stringify(originalTsk001));
  });

  it("lists rows with the extended RunDecisionRow shape", async () => {
    const rows = await api.runs.decisionList.list("tsk_001");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("scope_kind");
    expect(rows[0]).toHaveProperty("status");
    expect(rows[0]).toHaveProperty("impact");
    expect(rows[0]).toHaveProperty("user_editable");
  });

  it("filters by status", async () => {
    const onlyReverted = await api.runs.decisionList.list("tsk_001", { status: "reverted" });
    expect(onlyReverted.every((r) => r.status === "reverted")).toBe(true);
    const onlyActive = await api.runs.decisionList.list("tsk_001", { status: "active" });
    expect(onlyActive.every((r) => r.status === "active")).toBe(true);
  });

  it("filters by scope_kind", async () => {
    const global = await api.runs.decisionList.list("tsk_001", { scope_kind: "global" });
    expect(global.every((r) => r.scope_kind === "global")).toBe(true);
  });

  it("creates a user_decision and surfaces it on subsequent list", async () => {
    const before = await api.runs.decisionList.list("tsk_001");
    const beforeCount = before.length;
    const created = await api.runs.decisionList.create("tsk_001", {
      title: "Test decision",
      body: "Body of the test decision.",
      scope_kind: "global",
      impact: "low",
    });
    expect(created.title).toBe("Test decision");
    expect(created.status).toBe("active");
    expect(created.user_editable).toBe(true);
    const after = await api.runs.decisionList.list("tsk_001");
    expect(after.length).toBe(beforeCount + 1);
    expect(after[0]!.id).toBe(created.id);
  });

  it("patches a user-editable row and supersedes the original", async () => {
    // rd_005 is a user-editable feature flag decision in the seed data.
    const before = await api.runs.decisionList.list("tsk_001");
    const original = before.find((r) => r.id === "rd_005");
    expect(original).toBeDefined();
    expect(original?.user_editable).toBe(true);
    const patched = await api.runs.decisionList.patch("tsk_001", "rd_005", {
      title: "Roll out behind a feature flag (test edit)",
    });
    expect(patched.supersedes_decision_id).toBe("rd_005");
    expect(patched.title).toBe("Roll out behind a feature flag (test edit)");
    expect(patched.status).toBe("active");
    // The original is now superseded.
    const after = await api.runs.decisionList.list("tsk_001", { status: "superseded" });
    expect(after.some((r) => r.id === "rd_005")).toBe(true);
  });

  it("rejects PATCH on non-editable rows with 403", async () => {
    // rd_002 is a Choice — not user-editable.
    await expect(
      api.runs.decisionList.patch("tsk_001", "rd_002", { title: "Won't work" }),
    ).rejects.toMatchObject({ status: 403, code: "not_editable" });
  });

  it("reverts a decision (status -> reverted)", async () => {
    const reverted = await api.runs.decisionList.revert("tsk_001", "rd_005");
    expect(reverted.status).toBe("reverted");
  });

  it("escalates impact to high", async () => {
    const escalated = await api.runs.decisionList.escalate("tsk_001", "rd_005");
    expect(escalated.impact).toBe("high");
  });
});
