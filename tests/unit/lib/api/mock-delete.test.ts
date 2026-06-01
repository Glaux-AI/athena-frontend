/**
 * Mock-mode run-delete handler.
 *
 * The real client (`api.runs.delete`) issues DELETE /v1/runs/{id}. Mock mode
 * mirrors the BE: 404 on a missing run, 409 while the run is still active
 * (cancel first), else remove it from the list (a subsequent detail GET 404s)
 * and return 204. File-isolated db, so mutations stay within this suite.
 */
import { describe, expect, it } from "vitest";

import { handleMockRequest } from "@/lib/api/mock/handlers";

describe("mock run-delete handler", () => {
  it("404s a delete for an unknown run", async () => {
    const res = await handleMockRequest("/v1/runs/tsk_missing", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("409s a delete while the run is still active", async () => {
    // tsk_001 is seeded 'running' — not deletable until cancelled/finished.
    const res = await handleMockRequest("/v1/runs/tsk_001", { method: "DELETE" });
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe("run_active");
  });

  it("deletes a terminal run; the detail GET then 404s", async () => {
    // Cancel tsk_002 first (running → cancelled = terminal), then delete it.
    const cancelled = await handleMockRequest(
      "/v1/runs/tsk_002/cancel",
      { method: "POST", body: "{}" },
    );
    expect(cancelled.status).toBe(200);

    const del = await handleMockRequest("/v1/runs/tsk_002", { method: "DELETE" });
    expect(del.status).toBe(204);

    const get = await handleMockRequest("/v1/runs/tsk_002");
    expect(get.status).toBe(404);
  });
});
