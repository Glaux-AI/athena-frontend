// @vitest-environment jsdom

/**
 * PRD-track structured panel unit tests.
 *
 * Covers the four leaf panels backing the PRD phase body:
 *   - FramePanel renders the problem statement, a goal, and a stakeholder.
 *   - ResearchPanel renders a finding and a citation.
 *   - DraftPanel shows present-vs-missing across the 10-key catalogue and the
 *     `{present}/10 sections` meter.
 *   - SignoffPanel renders the readiness count, a status chip, and a blocking
 *     rejection (preferring the summarised reason).
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import {
  DraftPanel,
  FramePanel,
  ResearchPanel,
  SignoffPanel,
} from "@/components/runs/phases/structured/prd-panels";
import type {
  PrdDraftStructured,
  PrdFrameStructured,
  PrdResearchStructured,
  PrdSignoffStructured,
} from "@/lib/api/client";

function frame(over: Partial<PrdFrameStructured> = {}): PrdFrameStructured {
  return {
    version: 1,
    problem_statement:
      over.problem_statement ?? "Seasonal customers want to pause their workspace.",
    goals: over.goals ?? ["Self-serve a time-boxed snooze.", "Pause billing for the window."],
    non_goals: over.non_goals ?? ["Per-seat partial snoozing."],
    stakeholders: over.stakeholders ?? ["Priya Shah (PM)", "Avi Patel (Eng)"],
    risks: over.risks ?? ["A snoozed workspace must not be re-billed."],
    frame_summary: over.frame_summary ?? "A bounded, reversible workspace pause.",
    confidence: over.confidence ?? "high",
    gaps: over.gaps ?? ["Maximum snooze duration not yet decided."],
  };
}

function research(over: Partial<PrdResearchStructured> = {}): PrdResearchStructured {
  return {
    version: 1,
    findings: over.findings ?? [
      {
        finding: "Demand is concentrated in seasonal hospitality accounts.",
        evidence: ["res_n4"],
        gaps: ["No data on average off-season length."],
        confidence: "high",
      },
    ],
    citations: over.citations ?? ["res_n4", "res_p3"],
    findings_summary: over.findings_summary ?? "Strong, well-evidenced demand.",
    confidence: over.confidence ?? "high",
    outstanding_gaps: over.outstanding_gaps ?? ["Typical off-season length."],
  };
}

function draft(over: Partial<PrdDraftStructured> = {}): PrdDraftStructured {
  return {
    version: 1,
    document_id: over.document_id ?? "doc_prd",
    conli_flags_remaining: over.conli_flags_remaining ?? 0,
    sections:
      over.sections ?? [
        "problem",
        "users",
        "success_metrics",
        "non_goals",
        "proposed_solution",
        "risks_and_mitigations",
      ],
    goals:
      over.goals ?? [
        { goal: "Let owners pause a workspace without losing data.", metric: "snooze adoption" },
      ],
    success_metrics:
      over.success_metrics ?? [
        { metric: "Returned accounts using snooze", target: "≥ 30%", signal: "cohort analytics" },
      ],
    alternatives:
      over.alternatives ?? [
        { option: "Manual ops-driven pause", why_not: "Doesn't scale past ~12/week.", chosen: false },
        { option: "Self-serve time-boxed snooze", why_not: null, chosen: true },
      ],
    // `!== undefined` (not `??`) so a test can override with an explicit
    // `null` to exercise the no-scope degrade path.
    scope:
      over.scope !== undefined
        ? over.scope
        : {
            in_scope: ["Owner-initiated snooze", "Auto-resume on the end date"],
            out_of_scope: ["Per-seat partial snoozing"],
          },
  };
}

function signoff(over: Partial<PrdSignoffStructured> = {}): PrdSignoffStructured {
  return {
    version: 1,
    stakeholders: over.stakeholders ?? ["u_priya", "u_avi", "u_jordan"],
    approvals:
      over.approvals ?? [
        { stakeholder_id: "u_priya", decision: "approve", note: null, at: "2026-05-21T22:10:00Z" },
        { stakeholder_id: "u_avi", decision: "approve", note: null, at: "2026-05-21T22:18:00Z" },
      ],
    rejections:
      over.rejections ?? [
        {
          stakeholder_id: "u_jordan",
          reason_text: "The end-date control is a bare dropdown of preset windows.",
          summarised_reason: "Needs a calendar date-picker for the resume date.",
        },
      ],
    status: over.status ?? "blocked",
    approved_count: over.approved_count ?? 2,
    total_count: over.total_count ?? 3,
    handoff_target: over.handoff_target ?? null,
    handoff_run_id: over.handoff_run_id ?? null,
    approver_user_id: over.approver_user_id ?? null,
    note: over.note ?? null,
  };
}

describe("FramePanel", () => {
  it("renders the problem statement, goals, and a stakeholder", () => {
    cleanup();
    render(<FramePanel frame={frame()} />);
    const panel = screen.getByTestId("frame-panel");
    expect(within(panel).getByText(/seasonal customers want to pause/i)).toBeTruthy();
    expect(within(panel).getByText(/self-serve a time-boxed snooze/i)).toBeTruthy();
    expect(within(panel).getByText("Priya Shah (PM)")).toBeTruthy();
    // Confidence chip surfaces.
    expect(within(panel).getByText(/high confidence/i)).toBeTruthy();
    // Open gaps render.
    expect(within(panel).getByText(/maximum snooze duration/i)).toBeTruthy();
  });

  it("shows muted fallbacks for empty lists", () => {
    cleanup();
    render(
      <FramePanel
        frame={frame({ goals: [], stakeholders: [], non_goals: [], risks: [], gaps: [] })}
      />,
    );
    const panel = screen.getByTestId("frame-panel");
    expect(within(panel).getByText(/no goals captured/i)).toBeTruthy();
    expect(within(panel).getByText(/no stakeholders listed/i)).toBeTruthy();
  });
});

describe("ResearchPanel", () => {
  it("renders a finding and a citation", () => {
    cleanup();
    render(<ResearchPanel research={research()} />);
    const panel = screen.getByTestId("research-panel");
    expect(within(panel).getByText(/demand is concentrated in seasonal/i)).toBeTruthy();
    // The evidence id appears in the finding row AND the citation id appears
    // in the Citations chip-wrap.
    expect(within(panel).getAllByText("res_n4").length).toBeGreaterThan(0);
    expect(within(panel).getByText("res_p3")).toBeTruthy();
    // The summary prose surfaces.
    expect(within(panel).getByText(/strong, well-evidenced demand/i)).toBeTruthy();
  });

  it("shows a muted line when there are no findings", () => {
    cleanup();
    render(<ResearchPanel research={research({ findings: [] })} />);
    expect(screen.getByText(/no findings recorded/i)).toBeTruthy();
  });
});

describe("DraftPanel", () => {
  it("shows present-vs-missing section coverage and the count", () => {
    cleanup();
    render(<DraftPanel draft={draft()} />);
    const panel = screen.getByTestId("draft-panel");
    // 6 of the 10 catalogue keys are present.
    expect(within(panel).getByText("6/10 sections")).toBeTruthy();
    // A present section is tagged present; a missing one is tagged not-present.
    expect(within(panel).getByText("Problem").getAttribute("data-present")).toBe("true");
    expect(within(panel).getByText("Appendix").getAttribute("data-present")).toBe("false");
    // No unresolved hallucination flags → the ok chip.
    expect(within(panel).getByText(/0 unresolved hallucination flags/i)).toBeTruthy();
  });

  it("shows a warning chip when CONLI flags remain", () => {
    cleanup();
    render(<DraftPanel draft={draft({ conli_flags_remaining: 2 })} />);
    expect(screen.getByText(/2 unresolved hallucination flags/i)).toBeTruthy();
  });

  it("renders the agent-generated goals, metrics, scope, and chosen alternative", () => {
    cleanup();
    render(<DraftPanel draft={draft()} />);
    const panel = screen.getByTestId("draft-panel");
    // Goal + its mapped metric chip.
    expect(within(panel).getByText(/let owners pause a workspace/i)).toBeTruthy();
    // Success-metric target.
    expect(within(panel).getByText("≥ 30%")).toBeTruthy();
    // Scope ladder — both sides.
    expect(within(panel).getByText(/owner-initiated snooze/i)).toBeTruthy();
    expect(within(panel).getByText(/per-seat partial snoozing/i)).toBeTruthy();
    // Exactly one alternative is marked chosen.
    const chosen = within(panel).getAllByTestId("alternative-chosen");
    expect(chosen.length).toBe(1);
    expect(within(panel).getByText(/self-serve time-boxed snooze/i)).toBeTruthy();
  });

  it("degrades to coverage + CoNLI only when no components are grounded", () => {
    cleanup();
    render(
      <DraftPanel
        draft={draft({ goals: [], success_metrics: [], alternatives: [], scope: null })}
      />,
    );
    const panel = screen.getByTestId("draft-panel");
    // No component CONTENT renders (assert on values, not labels — the
    // `success_metrics` coverage chip shares the "Success metrics" label).
    expect(within(panel).queryByText(/let owners pause a workspace/i)).toBeNull();
    expect(within(panel).queryByText("≥ 30%")).toBeNull();
    expect(within(panel).queryByTestId("alternative-chosen")).toBeNull();
    expect(within(panel).queryByText(/owner-initiated snooze/i)).toBeNull();
    // …but coverage + the CoNLI chip still render.
    expect(within(panel).getByText("6/10 sections")).toBeTruthy();
    expect(within(panel).getByText(/0 unresolved hallucination flags/i)).toBeTruthy();
  });
});

describe("SignoffPanel", () => {
  it("renders the readiness count, status chip, and a blocking rejection", () => {
    cleanup();
    render(<SignoffPanel signoff={signoff()} />);
    const panel = screen.getByTestId("signoff-panel");
    // Readiness header.
    expect(within(panel).getByText("2/3 approved")).toBeTruthy();
    // Status chip reflects the blocked status.
    expect(within(panel).getByTestId("signoff-status").getAttribute("data-status")).toBe("blocked");
    // Blocking rejection prefers the summarised reason over the raw text.
    expect(within(panel).getByText(/needs a calendar date-picker/i)).toBeTruthy();
    expect(within(panel).queryByText(/bare dropdown of preset windows/i)).toBeNull();
    // The un-decided third stakeholder shows pending.
    const pills = within(panel).getAllByTestId("decision-pill");
    expect(pills.some((p) => p.getAttribute("data-decision") === "none")).toBe(true);
  });

  it("shows a handoff line when handed off", () => {
    cleanup();
    render(
      <SignoffPanel
        signoff={signoff({ status: "handed_off", handoff_target: "tsk_003" })}
      />,
    );
    const panel = screen.getByTestId("signoff-panel");
    expect(within(panel).getByText("tsk_003")).toBeTruthy();
    expect(within(panel).getByText(/handed off to/i)).toBeTruthy();
  });
});
