// @vitest-environment jsdom

/**
 * IngestTimeline unit tests — covers:
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
    // Closed by default — no history rows.
    expect(screen.queryAllByTestId("ingest-timeline-history-row").length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /view history/i }));
    const rows = screen.getAllByTestId("ingest-timeline-history-row");
    expect(rows.length).toBe(2);
    // Newest-first order (caller hands them in this order; component
    // doesn't re-sort, mirroring the BE contract).
    expect(rows[0]!.textContent).toMatch(/completed/i);
    expect(rows[1]!.textContent).toMatch(/failed/i);
  });

  it("hides the file count in a history row when files_total is 0", () => {
    // A stuck/early/empty attempt (e.g. one a worker restart interrupted
    // before the per-file blueprint pass) has files_total=0 — show the stage,
    // not a misleading "0/0 files". Matches the live pill's total>0 guard.
    const past = [
      tx({ stage: "indexing", files_total: 0, files_processed: 0 }),
      tx({ stage: "completed", files_total: 5, files_processed: 5 }),
    ];
    render(<IngestTimeline progress={progress({ history: past })} />);
    fireEvent.click(screen.getByRole("button", { name: /view history/i }));
    const rows = screen.getAllByTestId("ingest-timeline-history-row");
    expect(rows[0]!.textContent).toMatch(/indexing/i);
    expect(rows[0]!.textContent).not.toMatch(/files/);
    expect(rows[1]!.textContent).toMatch(/5\/5 files/);
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
