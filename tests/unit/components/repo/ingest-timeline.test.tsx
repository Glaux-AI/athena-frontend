// @vitest-environment jsdom

/**
 * IngestTimeline unit tests - covers:
 *   - Renders all 5 stages with completed / current / pending states
 *     based on `current.stage`.
 *   - Failed state renders red border + error text.
 *   - "View history" expands to show the past attempts.
 *   - prefers-reduced-motion disables the pulse animation class on
 *     the `current` step (we assert the `motion-safe:` prefix is the
 *     ONLY trigger so reduced-motion users see no animation).
 *   - Empty-data state ("Never synced") renders without throwing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { IngestTimeline } from "@/components/repo/ingest-timeline";
import type { IngestStageTransition, RepoIngestProgress } from "@/lib/api/client";

function tx(overrides: Partial<IngestStageTransition> = {}): IngestStageTransition {
  return {
    stage: "indexing",
    entered_at: "2026-05-28T11:30:00Z",
    duration_ms: 5_000,
    attempt_duration_ms: 5_000,
    files_total: 100,
    files_processed: 80,
    last_processed_path: "src/module/file.py",
    error: null,
    ...overrides,
  };
}

function progress(overrides: Partial<RepoIngestProgress> = {}): RepoIngestProgress {
  return {
    repo_id: "r_1",
    current: tx(),
    history: [tx()],
    job_id: "job_1",
    branch_sha: "abc1234567890",
    last_heartbeat_at: "2026-05-28T11:30:30Z",
    files_total: 100,
    files_processed: 80,
    last_processed_path: "src/module/file.py",
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
});

describe("IngestTimeline", () => {
  it("renders all 5 stages with completed / current / pending states", () => {
    render(<IngestTimeline progress={progress({ current: tx({ stage: "embedding", files_processed: 50 }) })} />);
    // Five step nodes with data-stage labels.
    const stages = ["cloning", "parsing", "embedding", "indexing", "completed"];
    for (const s of stages) {
      const node = document.querySelector(`[data-stage="${s}"]`);
      expect(node, `step node missing for stage=${s}`).toBeTruthy();
    }
    // current_sync_stage === "embedding" → cloning + parsing are completed,
    // embedding is current, indexing + completed are pending.
    expect(document.querySelector('[data-stage="cloning"]')?.getAttribute("data-state")).toBe("completed");
    expect(document.querySelector('[data-stage="parsing"]')?.getAttribute("data-state")).toBe("completed");
    expect(document.querySelector('[data-stage="embedding"]')?.getAttribute("data-state")).toBe("current");
    expect(document.querySelector('[data-stage="indexing"]')?.getAttribute("data-state")).toBe("pending");
    expect(document.querySelector('[data-stage="completed"]')?.getAttribute("data-state")).toBe("pending");
  });

  it("surfaces phase_detail in the narration during the indexing finalize tail", () => {
    // After the per-file pass (N=N), the indexing tail has no file counter and
    // can run minutes; the live sub-phase label must show so it never looks
    // stuck.
    render(
      <IngestTimeline
        progress={progress({
          current: tx({
            stage: "indexing",
            files_total: 100,
            files_processed: 100,
            phase_detail: "Synthesizing repo & capability blueprints",
          }),
        })}
      />,
    );
    const narration = screen.getByTestId("ingest-narration");
    expect(narration.textContent).toContain("Synthesizing repo & capability blueprints");
  });

  it("shows the stalled hint when the worker heartbeat goes silent in flight", () => {
    // The worker ticks the heartbeat at least once a minute while alive, so
    // minutes of silence on an in-flight stage means a real stall - the
    // timeline must say so instead of pulsing a live-looking spinner.
    render(
      <IngestTimeline
        progress={progress({ heartbeat_age_ms: 300_000, current: tx({ stage: "indexing" }) })}
      />,
    );
    expect(screen.getByTestId("ingest-timeline-stalled").textContent).toContain("stalled");
  });

  it("hides the stalled hint while the heartbeat is fresh or the row settled", () => {
    render(
      <IngestTimeline
        progress={progress({ heartbeat_age_ms: 30_000, current: tx({ stage: "indexing" }) })}
      />,
    );
    expect(screen.queryByTestId("ingest-timeline-stalled")).toBeNull();
    cleanup();
    // A settled row's heartbeat age grows forever - never flag it.
    render(
      <IngestTimeline
        progress={progress({ heartbeat_age_ms: 900_000, current: tx({ stage: "completed" }) })}
      />,
    );
    expect(screen.queryByTestId("ingest-timeline-stalled")).toBeNull();
  });

  it("renders ALL completed when current.stage is 'completed'", () => {
    render(<IngestTimeline progress={progress({ current: tx({ stage: "completed", files_processed: 100 }) })} />);
    expect(document.querySelector('[data-stage="completed"]')?.getAttribute("data-state")).toBe("completed");
    // The narration row is hidden when the row is at terminal `completed`.
    expect(screen.queryByTestId("ingest-narration")).toBeNull();
  });

  it("renders red-bordered failed alert with the error text", () => {
    render(
      <IngestTimeline
        progress={progress({
          current: tx({ stage: "failed", error: "git: clone failed (HTTP 503)" }),
        })}
      />,
    );
    const alert = screen.getByTestId("ingest-timeline-failed");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toMatch(/Sync failed/i);
    expect(alert.textContent).toMatch(/503/);
  });

  it("renders Retry sync CTA only when canManage + onRetrySync are set", () => {
    const onRetry = vi.fn();
    render(
      <IngestTimeline
        progress={progress({ current: tx({ stage: "failed", error: "boom" }) })}
        canManage
        onRetrySync={onRetry}
      />,
    );
    const retry = screen.getByRole("button", { name: /retry sync/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides Retry sync when canManage is false", () => {
    render(
      <IngestTimeline
        progress={progress({ current: tx({ stage: "failed", error: "boom" }) })}
        canManage={false}
        onRetrySync={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /retry sync/i })).toBeNull();
  });

  it("expands history disclosure when 'View history' is clicked", () => {
    const past = [
      tx({ stage: "completed", entered_at: "2026-05-27T10:00:00Z", duration_ms: 12_000, files_processed: 100 }),
      tx({ stage: "failed", entered_at: "2026-05-26T09:00:00Z", duration_ms: 5_000, error: "timeout" }),
    ];
    render(<IngestTimeline progress={progress({ history: past })} />);
    // Closed by default - no history rows.
    expect(screen.queryAllByTestId("ingest-timeline-history-row").length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /view history/i }));
    const rows = screen.getAllByTestId("ingest-timeline-history-row");
    expect(rows.length).toBe(2);
    // Newest-first order (caller hands them in this order; component
    // doesn't re-sort, mirroring the BE contract).
    expect(rows[0]!.textContent).toMatch(/completed/i);
    expect(rows[1]!.textContent).toMatch(/failed/i);
  });

  it("renders the server 'what happened' summary + each row's OWN sha", () => {
    // History is a recap, not just the terminal stage word - the server-built
    // summary carries files / skipped / failure reason, and each row shows its
    // OWN sha (the old code mislabelled every row with the latest attempt's).
    const past = [
      tx({ stage: "completed", branch_sha: "newsha111222", summary: "Indexed - 1,240 files · 2 skipped" }),
      tx({ stage: "failed", branch_sha: "oldsha999000", summary: "Failed: clone timed out", error: "clone timed out" }),
    ];
    render(<IngestTimeline progress={progress({ branch_sha: "newsha111222", history: past })} />);
    fireEvent.click(screen.getByRole("button", { name: /view history/i }));
    const rows = screen.getAllByTestId("ingest-timeline-history-row");
    expect(rows[0]!.textContent).toMatch(/Indexed - 1,240 files · 2 skipped/);
    expect(rows[0]!.textContent).toMatch(/newsha1/); // 7-char prefix of its own sha
    expect(rows[1]!.textContent).toMatch(/oldsha9/); // NOT the latest attempt's sha
    expect(rows[1]!.textContent).toMatch(/Failed: clone timed out/);
  });

  it("renders the live sharded-ingest wave breakdown when shards.active", () => {
    // A heavy-repo ingest fans out into parallel shards and the coordinator
    // returns - the single stepper can't show that, so the wave breakdown is
    // what tells the user what's actually happening.
    render(
      <IngestTimeline
        progress={progress({
          current: tx({ stage: "embedding" }),
          shards: {
            active: true,
            phase: "scanning",
            waves: [
              { wave: 1, label: "Scanning files", shards_done: 3, shards_total: 8, shards_failed: 0, units_done: 1500, units_total: 4000 },
            ],
          },
        })}
      />,
    );
    const panel = screen.getByTestId("ingest-shards");
    expect(panel.textContent).toMatch(/Scanning files/);
    expect(panel.textContent).toMatch(/3\/8 shards/);
    expect(panel.textContent).toMatch(/1,500\/4,000/);
  });

  it("hides the sharded breakdown on a failed row", () => {
    render(
      <IngestTimeline
        progress={progress({
          current: tx({ stage: "failed", error: "boom" }),
          shards: { active: true, phase: "scanning", waves: [] },
        })}
      />,
    );
    expect(screen.queryByTestId("ingest-shards")).toBeNull();
  });

  it("renders 'Never synced' empty state when progress is null", () => {
    render(<IngestTimeline progress={null} />);
    expect(screen.getByText(/never synced/i)).toBeTruthy();
  });

  it("uses motion-safe:animate-pulse so prefers-reduced-motion disables the pulse", () => {
    // The Tailwind `motion-safe:` prefix means the animate-pulse class
    // is GATED on the user NOT having `prefers-reduced-motion: reduce`
    // set. Asserting the prefix is present (and the bare
    // `animate-pulse` is not) is the surest static-check that
    // reduced-motion users see no animation.
    render(<IngestTimeline progress={progress({ current: tx({ stage: "parsing" }) })} />);
    const current = document.querySelector('[data-state="current"]') as HTMLElement | null;
    expect(current).toBeTruthy();
    const cls = current!.className;
    expect(cls).toMatch(/motion-safe:animate-pulse/);
    // Belt-and-braces: there is no unconditional `animate-pulse`.
    expect(cls).not.toMatch(/(^|\s)animate-pulse(\s|$)/);
  });

  it("renders progressbar role with proper aria-valuenow + valuemax", () => {
    render(<IngestTimeline progress={progress({ current: tx({ stage: "indexing" }) })} />);
    const bar = document.querySelector('[role="progressbar"]') as HTMLElement | null;
    expect(bar).toBeTruthy();
    expect(bar!.getAttribute("aria-valuemax")).toBe("5");
    // "indexing" is index 3 in the TIMELINE_STAGES array.
    expect(bar!.getAttribute("aria-valuenow")).toBe("3");
  });

  it("threads files_processed / files_total into the narration badge", () => {
    render(<IngestTimeline progress={progress({ current: tx({ stage: "indexing", files_processed: 42, files_total: 200 }) })} />);
    expect(screen.getByText(/42\/200/)).toBeTruthy();
  });

  it("describes the CURRENT stage + truncates the per-file path (embedding)", () => {
    const long = "services/inbox-service/very/deep/path/to/handlers/conversations/inbound_message_dispatcher.py";
    render(<IngestTimeline progress={progress({ current: tx({ stage: "embedding", last_processed_path: long }) })} />);
    const narration = screen.getByTestId("ingest-narration");
    // Describes what the stage actually does, and shows the file only for the
    // per-file embedding pass (truncated when long).
    expect(narration.textContent).toMatch(/^Reading & embedding files/);
    expect(narration.textContent).toContain("…");
    expect(narration.textContent!.length).toBeLessThan(long.length + 40);
  });

  it("describes non-per-file stages without a filename (indexing)", () => {
    render(<IngestTimeline progress={progress({ current: tx({ stage: "indexing", last_processed_path: "tsconfig.json" }) })} />);
    const narration = screen.getByTestId("ingest-narration").textContent ?? "";
    expect(narration).toMatch(/^Wiring the graph & blueprints/);
    expect(narration).not.toContain("tsconfig.json"); // indexing isn't per-file
  });

  it("shows per-attempt elapsed (not the cumulative) with the total on hover", () => {
    // Retried sync: cumulative since the first attempt is 348m, but THIS run
    // started 44m ago. The timer shows the current run; the cumulative stays
    // available as a hover title.
    render(
      <IngestTimeline
        progress={progress({
          current: tx({ stage: "indexing", duration_ms: 348 * 60_000, attempt_duration_ms: 44 * 60_000 }),
        })}
      />,
    );
    const dur = screen.getByText(/running for/i);
    expect(dur.textContent).toMatch(/44m/);
    expect(dur.textContent).not.toMatch(/348m/);
    expect(dur.getAttribute("title")).toMatch(/348m.*total across retries/i);
  });
});
