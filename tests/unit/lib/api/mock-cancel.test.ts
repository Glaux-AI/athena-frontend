/**
 * Mock-mode run-cancel handler.
 *
 * The real client (`api.runs.cancel`) writes
 *   POST /v1/runs/{id}/cancel
 * Mock mode now mirrors the BE: 404 on a missing run, 409 once terminal, else
 * flip `status` to 'cancelled' so a subsequent detail GET reflects the stop.
 *
 * Tests are ordered so the cancelling mutation runs before the re-cancel 409
 * (vitest isolates the `db` module per file, so these mutations don't leak to
 * other suites but DO persist within this one — mirrors mock-gates).
 */
import { describe, expect, it } from "vitest";

import { handleMockRequest } from "@/lib/api/mock/handlers";

const post = (body: unknown = {}) => ({ method: "POST", body: JSON.stringify(body) });

describe("mock run-cancel handler", () => {
  it("404s a cancel for an unknown run", async () => {
    const res = await handleMockRequest("/v1/runs/tsk_does_not_exist/cancel", post());
    expect(res.status).toBe(404);
  });

  it("cancels a running run and the detail GET reflects 'cancelled'", async () => {
    const res = await handleMockRequest("/v1/runs/tsk_002/cancel", post({ reason: "superseded" }));
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("cancelled");

    const detail = await handleMockRequest("/v1/runs/tsk_002");
    expect((detail.body as { status: string }).status).toBe("cancelled");
  });

  it("409s a second cancel once the run is terminal", async () => {
    // tsk_002 was cancelled by the previous test (in-file db persists).
    const res = await handleMockRequest("/v1/runs/tsk_002/cancel", post());
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe("run_terminal");
  });
});
