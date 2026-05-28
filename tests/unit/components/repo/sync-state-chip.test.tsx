// @vitest-environment jsdom

/**
 * SyncStateChip unit tests — covers all 5 derivation branches that the
 * chip surfaces on the dedicated Repo route:
 *   - in-flight (queued/cloning/parsing/embedding/indexing)
 *   - failed
 *   - never synced (no last_indexed_sha)
 *   - behind (HEAD ahead of indexed)
 *   - up-to-date (HEAD === indexed)
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SyncStateChip } from "@/components/repo/sync-state-chip";
import type { CapabilityRepo } from "@/lib/api/client";

function makeRepo(overrides: Partial<CapabilityRepo> = {}): CapabilityRepo {
  return {
    id: "cr_1",
    capability_id: "cap_1",
    integration_id: "int_1",
    repo_full_name: "acme/api-svc",
    default_branch: "main",
    attached_by_user_id: null,
    created_at: "2026-05-01T00:00:00Z",
    last_indexed_sha: "abc1234",
    branch_head_sha: "abc1234",
    last_sync_attempt_at: null,
    current_sync_stage: null,
    commits_behind: 0,
    repo_id: "r_1",
    repo_deleted_at: null,
    ...overrides,
  };
}

describe("SyncStateChip", () => {
  it("shows in-flight stage label when current_sync_stage is parsing", () => {
    cleanup();
    render(<SyncStateChip repo={makeRepo({ current_sync_stage: "parsing" })} />);
    expect(screen.getByText(/parsing/i)).toBeTruthy();
    expect(screen.getByText(/parsing/i).getAttribute("data-sync-state")).toBe("in-flight");
  });

  it("falls back to 'Syncing' when caller passes syncing=true and stage is idle", () => {
    cleanup();
    render(<SyncStateChip repo={makeRepo()} syncing />);
    expect(screen.getByText(/syncing/i)).toBeTruthy();
  });

  it("renders danger 'Sync failed' chip when current_sync_stage is failed", () => {
    cleanup();
    render(<SyncStateChip repo={makeRepo({ current_sync_stage: "failed" })} />);
    expect(screen.getByText(/sync failed/i)).toBeTruthy();
  });

  it("renders 'Never synced' when last_indexed_sha is null", () => {
    cleanup();
    render(<SyncStateChip repo={makeRepo({ last_indexed_sha: null, branch_head_sha: "head1234" })} />);
    expect(screen.getByText(/never synced/i)).toBeTruthy();
  });

  it("renders 'N commits behind' when HEAD is ahead and commits_behind > 0", () => {
    cleanup();
    render(
      <SyncStateChip
        repo={makeRepo({
          last_indexed_sha: "old11111",
          branch_head_sha: "new22222",
          commits_behind: 5,
        })}
      />,
    );
    expect(screen.getByText(/5 commits behind/i)).toBeTruthy();
  });

  it("renders 'Update available' when HEAD is ahead but commits_behind is unknown", () => {
    cleanup();
    render(
      <SyncStateChip
        repo={makeRepo({
          last_indexed_sha: "old11111",
          branch_head_sha: "new22222",
          commits_behind: null,
        })}
      />,
    );
    expect(screen.getByText(/update available/i)).toBeTruthy();
  });

  it("renders 'Up to date' when HEAD === indexed_sha", () => {
    cleanup();
    render(
      <SyncStateChip
        repo={makeRepo({
          last_indexed_sha: "samesha",
          branch_head_sha: "samesha",
        })}
      />,
    );
    expect(screen.getByText(/up to date/i)).toBeTruthy();
  });

  it("pluralizes singular commit when commits_behind === 1", () => {
    cleanup();
    render(
      <SyncStateChip
        repo={makeRepo({
          last_indexed_sha: "old11111",
          branch_head_sha: "new22222",
          commits_behind: 1,
        })}
      />,
    );
    expect(screen.getByText(/1 commit behind/i)).toBeTruthy();
  });
});
