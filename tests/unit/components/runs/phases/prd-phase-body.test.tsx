// @vitest-environment jsdom

/**
 * PrdPhase render tests.
 *
 * Covers that the per-phase dispatch renderer:
 *   - renders the matching structured panel for each PRD tab
 *     (frame / research / draft / signoff) when the document carries the
 *     phase-appropriate `structured` payload, AND
 *   - still renders the canonical markdown body when `structured` is null
 *     (the pre-structured degrade path) without crashing.
 *
 * Mounts the body-only component directly (the `PhaseDocumentShell` is
 * exercised elsewhere); it pulls in `<DocMarkdown>` + `<SectionFeedback>`
 * transitively, matching `structured-phase-bodies.test.tsx`'s approach.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PrdPhase } from "@/components/runs/phases/prd-phase";
import type {
  PrdDraftStructured,
  PrdFrameStructured,
  PrdResearchStructured,
  PrdSignoffStructured,
  RunPhaseDocument,
} from "@/lib/api/client";

function frameStructured(): PrdFrameStructured {
  return {
    version: 1,
    problem_statement: "Seasonal customers want to pause their workspace.",
    goals: ["Self-serve a time-boxed snooze."],
    non_goals: [],
    stakeholders: ["Priya Shah (PM)"],
    risks: [],
    frame_summary: null,
    confidence: "high",
    gaps: [],
  };
}

function researchStructured(): PrdResearchStructured {
  return {
    version: 1,
    findings: [
      { finding: "Demand is concentrated in seasonal accounts.", evidence: ["res_n4"], gaps: [], confidence: "high" },
    ],
    citations: ["res_n4"],
    findings_summary: "Strong demand.",
    confidence: "high",
    outstanding_gaps: [],
  };
}

function draftStructured(): PrdDraftStructured {
  return {
    version: 1,
    document_id: "doc_prd",
    conli_flags_remaining: 0,
    sections: ["problem", "users", "proposed_solution"],
    goals: [{ goal: "Self-serve a time-boxed snooze.", metric: null }],
    success_metrics: [{ metric: "Snooze adoption", target: null, signal: null }],
    alternatives: [{ option: "Self-serve snooze", why_not: null, chosen: true }],
    scope: { in_scope: ["Owner-initiated snooze"], out_of_scope: [] },
  };
}

function signoffStructured(): PrdSignoffStructured {
  return {
    version: 1,
    stakeholders: ["u_priya", "u_avi", "u_jordan"],
    approvals: [{ stakeholder_id: "u_priya", decision: "approve", note: null, at: null }],
    rejections: [
      { stakeholder_id: "u_jordan", reason_text: "Needs a calendar picker.", summarised_reason: null },
    ],
    status: "blocked",
    approved_count: 2,
    total_count: 3,
    handoff_target: null,
    handoff_run_id: null,
    approver_user_id: null,
    note: null,
  };
}

function doc(
  over: Partial<RunPhaseDocument> & Pick<RunPhaseDocument, "phase" | "structured">,
): RunPhaseDocument {
  return {
    id: over.id ?? "doc_prd",
    run_id: "tsk_prd",
    phase: over.phase,
    title: over.title ?? "PRD · Workspace snooze",
    body_markdown: over.body_markdown ?? "# Canonical PRD body\nThe evolving PRD content.",
    body_html: null,
    gate_state: over.gate_state ?? "pending",
    sections: over.sections ?? [],
    created_at: "2026-05-21T22:30:00Z",
    structured: over.structured,
    revisions: over.revisions ?? [{ version: 1, who_kind: "agent", created_at: "2026-05-21T22:30:00Z" }],
  };
}

describe("PrdPhase dispatch", () => {
  beforeEach(() => cleanup());

  it("renders the FramePanel on the frame tab", () => {
    render(<PrdPhase runId="tsk_prd" activePhase="frame" document={doc({ phase: "frame", structured: frameStructured() })} />);
    expect(screen.getByTestId("frame-panel")).toBeTruthy();
    expect(screen.queryByTestId("research-panel")).toBeNull();
    // Canonical markdown body still renders below the panel.
    expect(screen.getByTestId("doc-markdown")).toBeTruthy();
  });

  it("renders the ResearchPanel on the research tab", () => {
    render(<PrdPhase runId="tsk_prd" activePhase="research" document={doc({ phase: "research", structured: researchStructured() })} />);
    expect(screen.getByTestId("research-panel")).toBeTruthy();
    expect(screen.queryByTestId("frame-panel")).toBeNull();
  });

  it("renders the DraftPanel on the draft tab", () => {
    render(<PrdPhase runId="tsk_prd" activePhase="draft" document={doc({ phase: "draft", structured: draftStructured() })} />);
    const panel = screen.getByTestId("draft-panel");
    expect(panel).toBeTruthy();
    expect(screen.getByText("3/10 sections")).toBeTruthy();
  });

  it("renders the SignoffPanel on the signoff tab", () => {
    render(<PrdPhase runId="tsk_prd" activePhase="signoff" document={doc({ phase: "signoff", structured: signoffStructured() })} />);
    expect(screen.getByTestId("signoff-panel")).toBeTruthy();
    expect(screen.getByText("2/3 approved")).toBeTruthy();
  });

  it("renders just the markdown body when structured is null", () => {
    render(<PrdPhase runId="tsk_prd" activePhase="frame" document={doc({ phase: "frame", structured: null })} />);
    // No structured panels.
    expect(screen.queryByTestId("frame-panel")).toBeNull();
    expect(screen.queryByTestId("research-panel")).toBeNull();
    expect(screen.queryByTestId("draft-panel")).toBeNull();
    expect(screen.queryByTestId("signoff-panel")).toBeNull();
    // Markdown body still present.
    const md = screen.getByTestId("doc-markdown");
    expect(md.textContent).toMatch(/canonical prd body/i);
  });

  it("does not render a mismatched panel when structured shape disagrees with the tab", () => {
    // A frame payload on the research tab → no research panel, but the body
    // still renders (defensive: structured shape never crashes the renderer).
    render(<PrdPhase runId="tsk_prd" activePhase="research" document={doc({ phase: "research", structured: frameStructured() })} />);
    expect(screen.queryByTestId("research-panel")).toBeNull();
    expect(screen.getByTestId("doc-markdown")).toBeTruthy();
  });
});
