/**
 * Batch 12k — ``api.capabilities.retryRepoEnrichments`` wiring.
 *
 * End-to-end through the in-process mock layer (``NEXT_PUBLIC_API_MODE=mock``
 * is the default in ``tests/unit/setup.ts``). Locks the canonical path
 * shape, the POST verb, and the response shape so a BE rename surfaces
 * here at PR time rather than in the user's browser. Uses a seeded
 * ``(cap_inbox, repo_n1)`` pair so the mock handler resolves the repo
 * via its in-memory ``capabilityRepos`` registry.
 */
import { describe, expect, it } from "vitest";

import { api } from "@/lib/api/client";
import { capabilityRepos } from "@/lib/api/mock/db";

describe("api.capabilities.retryRepoEnrichments", () => {
  it("returns the parsed response shape with per-kind breakdown", async () => {
    // Seed the chip into the degraded state so the mock handler
    // mirrors the real-world entry condition for the button.
    const repo = capabilityRepos.cap_inbox?.[0];
    if (!repo) throw new Error("seed missing");
    repo.current_sync_stage = "degraded";

    const out = await api.capabilities.retryRepoEnrichments(
      "cap_inbox", repo.id,
    );
    expect(out.retried).toBe(3);
    expect(out.succeeded).toBe(3);
    expect(out.still_failed).toBe(0);
    expect(out.by_kind.embedding).toEqual({
      retried: 3, succeeded: 3, still_failed: 0,
    });
    // The mock handler also flips the chip back from degraded →
    // completed so the FE's optimistic refetch path is honest.
    expect(repo.current_sync_stage).toBe("completed");
  });

  it("accepts an explicit kinds[] subset", async () => {
    const repo = capabilityRepos.cap_inbox?.[1];
    if (!repo) throw new Error("seed missing");
    repo.current_sync_stage = "degraded";

    const out = await api.capabilities.retryRepoEnrichments(
      "cap_inbox", repo.id, { kinds: ["embedding", "tag"] },
    );
    // Mock handler returns the same canned shape regardless of kinds;
    // the contract this test locks is that the call accepts the body.
    expect(out.retried).toBeGreaterThanOrEqual(0);
  });
});
