// @vitest-environment jsdom

/**
 * Structured phase-panel unit tests.
 *
 * Covers the leaf panels that back the spec + plan phase bodies:
 *   - RiskPill maps low/medium/high to the success/warning/danger tokens.
 *   - DependencyGraph renders every stage id and an explicit incoming-edge
 *     label for a dependent stage.
 *   - BlastRadiusPanel renders a repo name with its risk pill, and degrades
 *     to a muted line when the blast radius is null.
 *   - ConsequencesPanel renders a breaking change row, and degrades to a
 *     muted line when consequences are null.
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { RiskPill } from "@/components/runs/phases/structured/risk-pill";
import {
  ConsequencesPanel,
  DependencyGraph,
} from "@/components/runs/phases/structured/plan-panels";
import { BlastRadiusPanel } from "@/components/runs/phases/structured/spec-panels";
import type {
  BlastRadius,
  PlanConsequences,
  PlanStage,
} from "@/lib/api/client";

function stage(over: Partial<PlanStage> & Pick<PlanStage, "stage_id">): PlanStage {
  return {
    stage_id: over.stage_id,
    title: over.title ?? `Stage ${over.stage_id}`,
    files_in_scope: over.files_in_scope ?? [],
    acceptance: over.acceptance ?? "",
    estimated_loc: over.estimated_loc ?? 10,
    risk_level: over.risk_level ?? "low",
    depends_on: over.depends_on ?? [],
  };
}

describe("RiskPill", () => {
  it("maps each level to its token pair", () => {
    cleanup();
    const { rerender } = render(<RiskPill level="low" />);
    expect(screen.getByTestId("risk-pill").className).toContain("var(--success-ink)");

    rerender(<RiskPill level="medium" />);
    expect(screen.getByTestId("risk-pill").className).toContain("var(--warning-ink)");

    rerender(<RiskPill level="high" />);
    expect(screen.getByTestId("risk-pill").className).toContain("var(--danger-ink)");
    expect(screen.getByTestId("risk-pill").textContent).toMatch(/high/i);
  });
});

describe("DependencyGraph", () => {
  it("renders every stage id and an explicit dependency edge label", () => {
    cleanup();
    const stages: PlanStage[] = [
      stage({ stage_id: "S1" }),
      stage({ stage_id: "S2", depends_on: ["S1"] }),
      stage({ stage_id: "S3", depends_on: ["S1", "S2"] }),
    ];
    render(<DependencyGraph stages={stages} />);

    const graph = screen.getByTestId("dependency-graph");
    // All three stage ids appear (layered nodes + edges).
    expect(within(graph).getAllByText("S1").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("S2").length).toBeGreaterThan(0);
    expect(within(graph).getAllByText("S3").length).toBeGreaterThan(0);
    // The Edges section heading renders because there are real dependencies.
    expect(within(graph).getByText(/edges/i)).toBeTruthy();
    // An incoming-edge marker (the ← glyph) is shown for dependents.
    expect(within(graph).getAllByText("←").length).toBeGreaterThan(0);
  });

  it("handles the no-dependencies case gracefully", () => {
    cleanup();
    render(<DependencyGraph stages={[stage({ stage_id: "S1" }), stage({ stage_id: "S2" })]} />);
    const graph = screen.getByTestId("dependency-graph");
    expect(within(graph).getByText(/independent/i)).toBeTruthy();
  });
});

describe("BlastRadiusPanel", () => {
  it("renders a repo with its risk pill", () => {
    cleanup();
    const blast: BlastRadius = {
      repos: [{ id: "r1", name: "acme/billing-api", files: 11, kind: "modify", risk: "medium" }],
      services: [],
      data_stores: [],
      compliance: [],
    };
    render(<BlastRadiusPanel blastRadius={blast} />);
    const panel = screen.getByTestId("blast-radius-panel");
    expect(within(panel).getByText("acme/billing-api")).toBeTruthy();
    const pill = within(panel).getByTestId("risk-pill");
    expect(pill.getAttribute("data-level")).toBe("medium");
  });

  it("shows a muted line when the blast radius is null", () => {
    cleanup();
    render(<BlastRadiusPanel blastRadius={null} />);
    expect(screen.getByText(/blast radius not computed/i)).toBeTruthy();
  });
});

describe("ConsequencesPanel", () => {
  it("renders a breaking change row", () => {
    cleanup();
    const consequences: PlanConsequences = {
      summary: "Adds a new payment rail.",
      severity: "medium",
      breaking_changes: [
        { area: "Invoice state machine", detail: "Consumers must handle ach_pending.", risk: "high" },
      ],
      data_impacts: [],
      runtime_risks: [],
      mitigations: [],
    };
    render(<ConsequencesPanel consequences={consequences} />);
    const panel = screen.getByTestId("consequences-panel");
    expect(within(panel).getByText(/invoice state machine/i)).toBeTruthy();
    expect(within(panel).getByText(/consumers must handle ach_pending/i)).toBeTruthy();
    // Severity banner + the breaking-change row both carry a risk level.
    expect(within(panel).getAllByText(/medium|high/i).length).toBeGreaterThan(0);
  });

  it("shows a muted line when consequences are null", () => {
    cleanup();
    render(<ConsequencesPanel consequences={null} />);
    expect(screen.getByText(/no consequences recorded/i)).toBeTruthy();
  });
});
