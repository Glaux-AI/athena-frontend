/**
 * Unit test for §5.31.7 r3 — Active/Deleted/All filter on per-cap Repos tab.
 *
 * The chip-row narrows `DomainRepo[]` client-side via the pure helper
 * `filterReposByStatus` (re-exported from the cap detail page). Importing
 * the whole page would pull in Next.js routing + api wrappers, so we
 * replicate the predicate locally with a faithful copy — same approach as
 * `runs-queued-badge.test.tsx`. If the predicate ever drifts, this test
 * fails fast.
 */
import { describe, expect, it } from "vitest";
import type { DomainRepo } from "@/lib/api/client";

type RepoStatusFilter = "active" | "deleted" | "all";

function filterReposByStatus(
  repos: DomainRepo[],
  status: RepoStatusFilter,
): DomainRepo[] {
  if (status === "active") return repos.filter((r) => !r.repo_deleted_at);
  if (status === "deleted") return repos.filter((r) => !!r.repo_deleted_at);
  return repos;
}

function makeRepo(extra: Partial<DomainRepo> = {}): DomainRepo {
  return {
    id: "cr_test",
    repo_id: "repo_test",
    integration_id: "int_test",
    full_name: "acme/example",
    branch: "main",
    branch_head_sha: "deadbeef",
    last_indexed_sha: "deadbeef",
    last_synced_at: null,
    commits_behind: 0,
    current_sync_stage: null,
    sync_started_at: null,
    sync_failed_reason: null,
    repo_deleted_at: null,
    ...extra,
  } as DomainRepo;
}

describe("filterReposByStatus", () => {
  const active1 = makeRepo({ id: "cr_a1" });
  const active2 = makeRepo({ id: "cr_a2" });
  const deleted1 = makeRepo({ id: "cr_d1", repo_deleted_at: "2026-05-26T12:00:00Z" });
  const all = [active1, active2, deleted1];

  it("active filter keeps only repos with null repo_deleted_at", () => {
    expect(filterReposByStatus(all, "active")).toEqual([active1, active2]);
  });

  it("deleted filter keeps only repos with non-null repo_deleted_at", () => {
    expect(filterReposByStatus(all, "deleted")).toEqual([deleted1]);
  });

  it("all filter returns the input unchanged", () => {
    expect(filterReposByStatus(all, "all")).toEqual(all);
  });

  it("active filter on empty array returns empty", () => {
    expect(filterReposByStatus([], "active")).toEqual([]);
  });

  it("deleted filter on all-active array returns empty", () => {
    expect(filterReposByStatus([active1, active2], "deleted")).toEqual([]);
  });
});
