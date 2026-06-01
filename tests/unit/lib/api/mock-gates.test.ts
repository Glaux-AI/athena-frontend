/**
 * §3.6 r6 — mock-mode approval-gate handlers.
 *
 * The real client (`lib/api/gates.ts`) reads
 *   GET  /v1/runs/{id}/gates?status=open
 * and writes
 *   POST /v1/runs/{id}/gates/{gate_key}/close   { outcome, reason?, handoff_to? }
 *
 * Mock mode previously matched only the stale `/approve|/reject` path and had
 * NO gate-list handler, so the banner never appeared and every action 404'd.
 * These tests pin the fixed handlers: list pending gates, transition on close,
 * enforce the reject-reason floor, and the handoff-only-on-signoff rule.
 *
 * Tests are ordered so the two mutating closes run last (vitest isolates the
 * `db` module per file, so these mutations don't leak to other suites).
 */
import { describe, expect, it } from "vitest";

import { handleMockRequest } from "@/lib/api/mock/handlers";

function close(init: { outcome: string; reason?: string; handoff_to?: string }) {
  return { method: "POST", body: JSON.stringify(init) };
}

describe("mock approval-gate handlers (§3.6 r6)", () => {
  it("lists only pending gates for ?status=open", async () => {
    const res = await handleMockRequest("/v1/runs/tsk_001/gates?status=open");
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ gate_key: string; status: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
    expect(rows.some((r) => r.gate_key === "pr_authored")).toBe(true);
  });

  it("422s a rejection whose reason is below the 10-char floor (no mutation)", async () => {
    const res = await handleMockRequest(
      "/v1/runs/tsk_002/gates/prd_signoff_complete/close",
      close({ outcome: "rejected", reason: "too short" }),
    );
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("reason_required");
  });

  it("422s a handoff on a non-signoff gate (no mutation)", async () => {
    const res = await handleMockRequest(
      "/v1/runs/tsk_001/gates/pr_authored/close",
      close({ outcome: "approved", handoff_to: "implement" }),
    );
    expect(res.status).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe("handoff_not_allowed");
  });

  it("404s a close for a gate key with no pending row", async () => {
    const res = await handleMockRequest(
      "/v1/runs/tsk_001/gates/spec_approved/close",
      close({ outcome: "approved" }),
    );
    expect(res.status).toBe(404);
  });

  it("approves the PRD sign-off gate with a handoff", async () => {
    const res = await handleMockRequest(
      "/v1/runs/tsk_002/gates/prd_signoff_complete/close",
      close({ outcome: "approved", handoff_to: "implement" }),
    );
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("approved");
  });

  it("approves a pending gate and drops it from the open list", async () => {
    const done = await handleMockRequest(
      "/v1/runs/tsk_001/gates/pr_authored/close",
      close({ outcome: "approved" }),
    );
    expect(done.status).toBe(200);
    expect((done.body as { status: string; resolved_at: string | null }).status).toBe("approved");
    const open = await handleMockRequest("/v1/runs/tsk_001/gates?status=open");
    expect((open.body as unknown[]).length).toBe(0);
  });
});
