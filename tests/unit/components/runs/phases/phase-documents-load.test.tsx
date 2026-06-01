// @vitest-environment jsdom

/**
 * Phase-documents load unit tests (readiness §4 row 9 + §3.6 r5 + §4.x r2).
 *
 * Covers the live integration that lights up `<PhaseContent>` once the BE
 * `GET /v1/runs/{id}/documents?phase=…` endpoint is shipped:
 *
 *   - On initial mount the active phase tab fetches its document via
 *     `api.runs.runDocuments.latest(runId, phase)` and renders the body
 *     once the promise resolves.
 *   - When the parent flips `activePhase` to a different phase, the
 *     hook re-fetches with the new phase key and the rendered body
 *     swaps to the new document.
 *   - When the BE returns `null` (no artifact for the phase yet), the
 *     "No artifact yet" empty state renders.
 *
 * The component owns the loading / error / empty branches inside
 * `phase-content.tsx`; this test exercises the happy + empty paths
 * end-to-end through the spy on the API client.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { PhaseContent } from "@/components/runs/phases/phase-content";
import * as client from "@/lib/api/client";

const latestSpy = vi.spyOn(client.api.runs.runDocuments, "latest");

function specDoc(): client.RunPhaseDocument {
  return {
    id: "doc_spec_1",
    run_id: "tsk_demo",
    phase: "spec",
    title: "spec.md",
    body_markdown: "# Spec body\nMid-market ACH support overview.",
    body_html: null,
    gate_state: "approved",
    sections: [{ id: "sec.why", label: "1 · Why" }],
    created_at: "2026-05-23T10:00:00Z",
    structured: null,
    revisions: [],
  };
}

function planDoc(): client.RunPhaseDocument {
  return {
    id: "doc_plan_1",
    run_id: "tsk_demo",
    phase: "plan",
    title: "Plan stages",
    body_markdown: "# Plan body\nStage one details.",
    body_html: null,
    gate_state: "pending",
    sections: [{ id: "stage.schema", label: "Stage 1 — Schema" }],
    created_at: "2026-05-23T11:30:00Z",
    structured: null,
    revisions: [],
  };
}

describe("PhaseContent live document load", () => {
  beforeEach(() => {
    cleanup();
    latestSpy.mockReset();
  });

  it("fetches and renders the document for the active phase tab", async () => {
    latestSpy.mockResolvedValueOnce(specDoc());

    render(<PhaseContent runId="tsk_demo" activePhase="spec" />);

    // Skeleton renders before the promise resolves.
    expect(
      screen.queryByLabelText(/loading spec phase/i),
    ).not.toBeNull();

    // After the fetch resolves, the body lights up.
    await waitFor(() => {
      expect(screen.getAllByText(/spec\.md/i).length).toBeGreaterThan(0);
    });
    expect(latestSpy).toHaveBeenCalledWith("tsk_demo", "spec");
  });

  it("refetches when the active phase prop changes", async () => {
    latestSpy.mockResolvedValueOnce(specDoc());
    const { rerender } = render(
      <PhaseContent runId="tsk_demo" activePhase="spec" />,
    );
    await waitFor(() => {
      expect(latestSpy).toHaveBeenCalledWith("tsk_demo", "spec");
    });

    // Flip to the Plan tab — the hook keys on `phase`, so a fresh fetch
    // must fire and the rendered title must swap.
    latestSpy.mockResolvedValueOnce(planDoc());
    rerender(<PhaseContent runId="tsk_demo" activePhase="plan" />);

    await waitFor(() => {
      expect(latestSpy).toHaveBeenCalledWith("tsk_demo", "plan");
    });
    await waitFor(() => {
      expect(screen.getAllByText(/plan stages/i).length).toBeGreaterThan(0);
    });
    // Two distinct calls — one per phase key.
    const calls = latestSpy.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c[1] === "spec")).toBe(true);
    expect(calls.some((c) => c[1] === "plan")).toBe(true);
  });

  it("renders the empty state when the BE returns null", async () => {
    latestSpy.mockResolvedValueOnce(null);

    render(<PhaseContent runId="tsk_demo" activePhase="review" />);

    await waitFor(() => {
      expect(screen.queryByText(/no artifact yet/i)).not.toBeNull();
    });
    expect(latestSpy).toHaveBeenCalledWith("tsk_demo", "review");
  });
});
