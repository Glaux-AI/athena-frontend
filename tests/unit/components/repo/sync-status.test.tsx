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
  deriveFreshness,
  type SyncSignals,
} from "@/components/repo/sync-status";
import type {
  CapabilityRepo,
  RepoIngestProgress,
  RepoKnowledge,
  RepoSyncStatus,
} from "@/lib/api/client";

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

  it("returns paused for paused stage (even with optimistic syncing)", () => {
    expect(deriveSyncState(makeSignals({ stage: "paused" }))).toBe("paused");
    expect(deriveSyncState(makeSignals({ stage: "paused" }), true)).toBe("paused");
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

describe("deriveFreshness", () => {
  it("labels a cancelled sync 'Sync cancelled' in the header, not 'Sync failed'", () => {
    // The header pill collapses cancelled into the danger-toned `failed`
    // FreshnessState, but the label must read honestly so it matches the panel.
    expect(deriveFreshness(makeSignals({ stage: "cancelled" }))).toEqual({
      state: "failed",
      detail: "Sync cancelled",
    });
  });

  it("leaves a real failure as the bare 'Sync failed' label", () => {
    expect(deriveFreshness(makeSignals({ stage: "failed" }))).toEqual({ state: "failed" });
  });

  it("maps an in-flight stage to the indexing freshness state", () => {
    expect(deriveFreshness(makeSignals({ stage: "indexing" }))).toEqual({ state: "indexing" });
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

describe("SyncStatusPanel — paused (skip / cancel, item 1)", () => {
  function pausedProgress(): RepoIngestProgress {
    const current = {
      stage: "paused" as const,
      entered_at: "2026-06-03T00:00:00Z",
      duration_ms: 1000,
      attempt_duration_ms: 1000,
      files_total: 120,
      files_processed: 42,
      last_processed_path: "src/example/module.py",
      error: null,
      paused_path: "src/giant-generated.ts",
      paused_error:
        "LLM call failed after 3 attempts (src/giant-generated.ts) — RateLimitError: 429 quota exceeded",
    };
    return {
      repo_id: "r1",
      current,
      history: [current],
      job_id: "j",
      branch_sha: "sha",
      last_heartbeat_at: null,
      files_total: 120,
      files_processed: 42,
      last_processed_path: "src/example/module.py",
    };
  }

  it("renders the paused banner with the failed file + error and fires onSkipFile", () => {
    cleanup();
    const onSkipFile = vi.fn();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={onSkipFile}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByTestId("sync-status-paused")).toBeTruthy();
    // The path line carries the file as a title attr (the error text also
    // mentions it, so disambiguate via the title rather than text).
    expect(screen.getByTitle("src/giant-generated.ts")).toBeTruthy();
    expect(screen.getByText(/failed after 3 attempts/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("sync-status-skip-file"));
    expect(onSkipFile).toHaveBeenCalledOnce();
  });

  it("Cancel in the paused banner fires onStop (aborts the sync)", () => {
    cleanup();
    const onStop = vi.fn();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
        onStop={onStop}
      />,
    );
    fireEvent.click(screen.getByTestId("sync-status-paused-cancel"));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("hides the Skip button when no onSkipFile handler is provided", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("sync-status-skip-file")).toBeNull();
  });

  it("disables Skip when canManage is false", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
        canManage={false}
      />,
    );
    expect((screen.getByTestId("sync-status-skip-file") as HTMLButtonElement).disabled).toBe(true);
  });

  it("flips Skip to 'Skipping…' and disables while skipping", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
        skipping
      />,
    );
    expect(screen.getByText(/skipping…/i)).toBeTruthy();
    expect((screen.getByTestId("sync-status-skip-file") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders 'Skip all failing files' and fires onSkipAll", () => {
    cleanup();
    const onSkipAll = vi.fn();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
        onSkipAll={onSkipAll}
        onStop={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("sync-status-skip-all"));
    expect(onSkipAll).toHaveBeenCalledOnce();
  });

  it("hides 'Skip all' when no onSkipAll handler is provided", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("sync-status-skip-all")).toBeNull();
  });

  it("flips 'Skip all' to 'Skipping all…' and disables while skippingAll", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipAll={vi.fn()}
        skippingAll
      />,
    );
    expect(screen.getByText(/skipping all…/i)).toBeTruthy();
    expect((screen.getByTestId("sync-status-skip-all") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the pause REASON (the underlying LLM error)", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
      />,
    );
    expect(screen.getByText(/reason:/i)).toBeTruthy();
    expect(screen.getByText(/429 quota exceeded/i)).toBeTruthy();
  });

  it("renders 'Retry' and fires onRetryPaused", () => {
    cleanup();
    const onRetryPaused = vi.fn();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
        onRetryPaused={onRetryPaused}
      />,
    );
    fireEvent.click(screen.getByTestId("sync-status-retry-paused"));
    expect(onRetryPaused).toHaveBeenCalledOnce();
  });

  it("hides Retry when no onRetryPaused handler is provided", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onSkipFile={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("sync-status-retry-paused")).toBeNull();
  });

  it("flips Retry to 'Retrying…' and disables while retryingPaused", () => {
    cleanup();
    render(
      <SyncStatusPanel
        signals={makeSignals({ stage: "paused" })}
        progress={pausedProgress()}
        onRetryPaused={vi.fn()}
        retryingPaused
      />,
    );
    expect(screen.getByText(/retrying…/i)).toBeTruthy();
    expect((screen.getByTestId("sync-status-retry-paused") as HTMLButtonElement).disabled).toBe(true);
  });
});
