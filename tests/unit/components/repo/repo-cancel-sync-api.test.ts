/**
 * Stop ingestion — `api.capabilities.repoCancelSync` round-trips.
 *
 * Pins the contract the SyncStatusPanel Stop button depends on, mirroring
 * the BE `POST .../repos/{cap_repo_id}/knowledge:cancel` cooperative cancel:
 *   - cancelling an in-flight ingest reports `cancelled:true` and flips the
 *     repo's `current_sync_stage` to `cancelled` (instant FE feedback)
 *   - a second cancel (nothing running) is an idempotent no-op
 *     (`cancelled:false`)
 *   - the response carries `repo_id` + `branch_sha`
 *
 * Round-trips through the mock handler stack so the Stop button can't ship a
 * call shape the live BE rejects.
 */

import { describe, expect, it } from "vitest";

import { api } from "@/lib/api/client";

const CAP = "cap_inbox";
const REPO = "repo_n1";

describe("api.capabilities.repoCancelSync — Stop ingestion", () => {
  it("cancels an in-flight ingest (cancelled:true) and reports the repo + sha", async () => {
    // Kick off a sync so the repo enters an in-flight stage.
    await api.capabilities.syncRepoKnowledge(CAP, REPO);

    const res = await api.capabilities.repoCancelSync(CAP, REPO);
    expect(res.repo_id).toBe(REPO);
    expect(res.cancelled).toBe(true);
    expect(typeof res.branch_sha === "string" || res.branch_sha === null).toBe(true);

    // The mock flipped the stage to `cancelled` for instant FE feedback — a
    // subsequent listRepos reflects it (what refreshSync re-reads).
    const repos = await api.capabilities.listRepos(CAP);
    const repo = repos.find((r) => r.id === REPO);
    expect(repo?.current_sync_stage).toBe("cancelled");
  });

  it("is an idempotent no-op (cancelled:false) when nothing is running", async () => {
    // The repo is now in a terminal `cancelled` stage from the test above —
    // a fresh cancel has nothing to stop.
    const res = await api.capabilities.repoCancelSync(CAP, REPO);
    expect(res.cancelled).toBe(false);
    expect(res.repo_id).toBe(REPO);
  });
});
