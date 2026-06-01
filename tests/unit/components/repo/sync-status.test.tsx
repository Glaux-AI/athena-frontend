// @vitest-environment jsdom

/**
 * SyncStatus unit tests — the ONE unified sync surface (Phase D).
 *
 * Covers the chip's derivation branches (in-flight / syncing / failed /
 * degraded / never / behind / up-to-date) plus the new live-staleness-gate
 * branches (is_stale / checked_live) and the panel's gated Sync action.
 */

import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import {
  SyncStatusChip,
  SyncStatusPanel,
  signalsFromRepo,
  signalsFromKnowledge,
  deriveSyncState,
  type SyncSignals,
} from "@/components/repo/sync-status";
import type { CapabilityRepo, RepoKnowledge, RepoSyncStatus } from "@/lib/api/client";

function makeSignals(overrides: Partial<SyncSignals> = {}): SyncSignals {
  return {
    stage: null,
    indexedSha: "abc1234",
    headSha: "abc1234",
    commitsBehind: 0,
    lastSyncAttemptAt: null,
    isStale: null,
    checkedLive: null,
    ...overrides,
  };
}

describe("deriveSyncState", () => {
  it("returns in_flight for any in-flight stage", () => {
    expect(deriveSyncState(makeSignals({ stage: "parsing" }))).toBe("in_flight");
    expect(deriveSyncState(makeSignals({ stage: "queued" }))).toBe("in_flight");
  });

  it("returns syncing when caller is optimistically syncing and stage idle", () => {
    expect(deriveSyncState(makeSignals(), true)).toBe("syncing");
  });

  it("returns failed for failed/cancelled stages", () => {
    expect(deriveSyncState(makeSignals({ stage: "failed" }))).toBe("failed");
    expect(deriveSyncState(makeSignals({ stage: "cancelled" }))).toBe("failed");
  });

  it("returns degraded for degraded stage", () => {
    expect(deriveSyncState(makeSignals({ stage: "degraded" }))).toBe("degraded");
  });

  it("returns never when no indexed sha", () => {
    expect(deriveSyncState(makeSignals({ indexedSha: null }))).toBe("never");
  });

  it("returns behind when live gate says stale (overrides sha equality)", () => {
    expect(
      deriveSyncState(makeSignals({ isStale: true, checkedLive: true, headSha: "abc1234", indexedSha: "abc1234" })),
    ).toBe("behind");
  });

  it("returns up_to_date when live gate says fresh (overrides sha mismatch)", () => {
    expect(
      deriveSyncState(makeSignals({ isStale: false, checkedLive: true, headSha: "new", indexedSha: "old" })),
    ).toBe("up_to_date");
  });

  it("returns unverifiable when live check couldn't run", () => {
    expect(
      deriveSyncState(makeSignals({ isStale: null, checkedLive: false, indexedSha: "old" })),
    ).toBe("unverifiable");
  });

  it("falls back to sha comparison when no live check ran", () => {
    expect(deriveSyncState(makeSignals({ headSha: "new", indexedSha: "old" }))).toBe("behind");
    expect(deriveSyncState(makeSignals({ headSha: "same", indexedSha: "same" }))).toBe("up_to_date");
  });
});

describe("SyncStatusChip", () => {
  it("renders the in-flight stage label", () => {
    cleanup();
    render(<SyncStatusChip signals={makeSignals({ stage: "parsing" })} />);
    const chip = screen.getByText(/parsing/i);
    expect(chip.getAttribute("data-sync-state")).toBe("in_flight");
  });

  it("renders 'N commits behind' and pluralizes", () => {
    cleanup();
    render(<SyncStatusChip signals={makeSignals({ headSha: "new", indexedSha: "old", commitsBehind: 5 })} />);
    expect(screen.getByText(/5 commits behind/i)).toBeTruthy();
    cleanup();
    render(<SyncStatusChip signals={makeSignals({ headSha: "new", indexedSha: "old", commitsBehind: 1 })} />);
    expect(screen.getByText(/1 commit behind/i)).toBeTruthy();
  });

  it("renders the couldn't-verify state", () => {
    cleanup();
    render(<SyncStatusChip signals={makeSignals({ checkedLive: false, indexedSha: "old" })} />);
    expect(screen.getByText(/couldn't verify/i)).toBeTruthy();
  });

  it("renders 'Up to date'", () => {
    cleanup();
    render(<SyncStatusChip signals={makeSignals({ headSha: "same", indexedSha: "same" })} />);
    expect(screen.getByText(/up to date/i)).toBeTruthy();
  });
});

describe("signal normalisers", () => {
  it("signalsFromRepo maps a CapabilityRepo row", () => {
    const repo = {
      current_sync_stage: "indexing",
      last_indexed_sha: "old",
      branch_head_sha: "new",
      commits_behind: 3,
      last_sync_attempt_at: "2026-05-01T00:00:00Z",
    } as unknown as CapabilityRepo;
    const s = signalsFromRepo(repo);
    expect(s.stage).toBe("indexing");
    expect(s.commitsBehind).toBe(3);
    expect(s.isStale).toBeNull();
  });

  it("signalsFromKnowledge prefers live status for staleness", () => {
    const knowledge = { current_sync_stage: null, last_indexed_sha: "old", branch_head_sha: "old" } as unknown as RepoKnowledge;
    const status: RepoSyncStatus = {
      repo_id: "r1",
      is_stale: true,
      commits_behind: 2,
      last_indexed_sha: "old",
      current_head_sha: "new",
      checked_live: true,
    };
    const s = signalsFromKnowledge(knowledge, status);
    expect(s.isStale).toBe(true);
    expect(s.headSha).toBe("new");
    expect(s.commitsBehind).toBe(2);
  });
});

describe("SyncStatusPanel — live-gated Sync action", () => {
  it("shows Sync when stale and fires onSync", () => {
    cleanup();
    const onSync = vi.fn();
    render(
      <SyncStatusPanel
        signals={makeSignals({ isStale: true, checkedLive: true, headSha: "new", indexedSha: "old" })}
        onSync={onSync}
      />,
    );
    const btn = screen.getByTestId("sync-status-sync");
    fireEvent.click(btn);
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("HIDES Sync when confirmed fresh by the live gate", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ isStale: false, checkedLive: true })}
        onSync={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("sync-status-sync")).toBeNull();
  });

  it("still shows Sync when the live check couldn't run", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ checkedLive: false, indexedSha: "old" })}
        onSync={vi.fn()}
      />,
    );
    expect(screen.getByTestId("sync-status-sync")).toBeTruthy();
  });

  it("shows Retry enrichments only when degraded", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "degraded" })}
        onSync={vi.fn()}
        onRetryEnrichments={vi.fn()}
      />,
    );
    expect(screen.getByTestId("sync-status-retry-enrichments")).toBeTruthy();
  });

  it("disables the action buttons when canManage is false", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ isStale: true, checkedLive: true })}
        onSync={vi.fn()}
        canManage={false}
      />,
    );
    expect((screen.getByTestId("sync-status-sync") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SyncStatusPanel — Stop ingestion (in-flight) action", () => {
  it("shows Stop while ingestion is in flight and fires onStop", () => {
    cleanup();
    const onStop = vi.fn();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "embedding" })}
        onStop={onStop}
        onSync={vi.fn()}
      />,
    );
    const btn = screen.getByTestId("sync-status-stop");
    fireEvent.click(btn);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("shows Stop for every in-flight stage (queued → indexing)", () => {
    for (const stage of ["queued", "cloning", "parsing", "embedding", "indexing"] as const) {
      cleanup();
      render(<SyncStatusPanel signals={makeSignals({ stage })} onStop={vi.fn()} />);
      expect(screen.queryByTestId("sync-status-stop")).toBeTruthy();
    }
  });

  it("HIDES Stop when NOT in flight (terminal / idle states)", () => {
    for (const overrides of [
      { stage: "completed" } as const,
      { stage: "failed" } as const,
      { stage: "cancelled" } as const,
      { stage: "degraded" } as const,
      { isStale: true, checkedLive: true, headSha: "new", indexedSha: "old" } as const, // behind
      { indexedSha: null } as const, // never synced
      {} as const, // up to date
    ]) {
      cleanup();
      render(<SyncStatusPanel signals={makeSignals(overrides)} onStop={vi.fn()} onSync={vi.fn()} />);
      expect(screen.queryByTestId("sync-status-stop")).toBeNull();
    }
  });

  it("does NOT show Stop for the optimistic 'syncing' state (nothing to cancel yet)", () => {
    cleanup();
    // syncing=true with an idle stage → derived state "syncing", not "in_flight".
    render(<SyncStatusPanel signals={makeSignals()} syncing onStop={vi.fn()} onSync={vi.fn()} />);
    expect(screen.queryByTestId("sync-status-stop")).toBeNull();
  });

  it("flips to 'Cancelling…' and disables while cancelling", () => {
    cleanup();
    render(
      <SyncStatusPanel signals={makeSignals({ stage: "indexing" })} onStop={vi.fn()} cancelling />,
    );
    const btn = screen.getByTestId("sync-status-stop") as HTMLButtonElement;
    expect(screen.getByText(/cancelling…/i)).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  it("disables Stop when canManage is false", () => {
    cleanup();
    render(
      <SyncStatusPanel signals={makeSignals({ stage: "cloning" })} onStop={vi.fn()} canManage={false} />,
    );
    expect((screen.getByTestId("sync-status-stop") as HTMLButtonElement).disabled).toBe(true);
  });

  it("hides Stop when no onStop handler is provided", () => {
    cleanup();
    render(<SyncStatusPanel signals={makeSignals({ stage: "parsing" })} />);
    expect(screen.queryByTestId("sync-status-stop")).toBeNull();
  });
});
