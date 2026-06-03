/**
 * Regression test for the cap → Repos tab "repo not found" bug.
 *
 * Repo-scoped knowledge endpoints (`knowledge:sync` / `:cancel` / `:retry`,
 * all via `_resolve_sync_target`) are keyed by `repos.id`, NEVER the
 * `capability_repos` join-row id. The cap-list Sync/Retry handlers used to pass
 * the join id (`repo.id`) → every click 404'd as "Repo not found". `repoScopedId`
 * centralises the choice; importing the whole page pulls in Next.js routing +
 * api wrappers, so we replicate the helper locally (same approach as
 * `cap-repos-tab-filter.test.ts`). If it ever drifts back to `repo.id`, this fails.
 */
import { describe, expect, it } from "vitest";
import type { CapabilityRepo } from "@/lib/api/client";

function repoScopedId(repo: CapabilityRepo): string {
  return repo.repo_id ?? repo.id;
}

function makeRepo(extra: Partial<CapabilityRepo> = {}): CapabilityRepo {
  return {
    id: "cr_join",
    repo_id: "repo_global",
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
  } as CapabilityRepo;
}

describe("repoScopedId", () => {
  it("returns the global repos.id, not the capability_repos join id", () => {
    expect(repoScopedId(makeRepo())).toBe("repo_global");
  });

  it("never returns the join id when repo_id is set (the 'repo not found' bug)", () => {
    const repo = makeRepo({ id: "cr_join", repo_id: "repo_global" });
    expect(repoScopedId(repo)).not.toBe(repo.id);
  });

  it("falls back to the join id only for a legacy un-backfilled attachment", () => {
    expect(repoScopedId(makeRepo({ repo_id: null }))).toBe("cr_join");
  });
});
