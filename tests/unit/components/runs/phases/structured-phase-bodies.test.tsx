// @vitest-environment jsdom

/**
 * Spec/Plan phase-body render tests.
 *
 * Covers that the rewritten body renderers:
 *   - render the structured panels (key fields appear) when the document
 *     carries a `structured` payload, AND
 *   - still render the canonical markdown body when `structured` is null
 *     (the pre-structured degrade path).
 *
 * These render the body-only components directly (the `PhaseDocumentShell`
 * is exercised elsewhere). They mount `<DocMarkdown>` + `<SectionFeedback>`
 * transitively, matching `phase-documents-load.test.tsx`'s approach.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { SpecPhase } from "@/components/runs/phases/spec-phase";
import { PlanPhase } from "@/components/runs/phases/plan-phase";
import type {
  PlanStructured,
  RunPhaseDocument,
  SpecStructured,
} from "@/lib/api/client";

function specStructured(): SpecStructured {
  return {
    version: 1,
    document_id: "doc_spec",
    acceptance_criteria: ["ACH appears on invoices ≥ $5k."],
    open_questions: [],
    domains_detected: [
      {
        domain_id: "dom_checkout",
        name: "Billing · Checkout",
        confidence: 0.94,
        primary: true,
        why: "ACH is a new checkout method.",
        files_estimate: 9,
      },
    ],
    blast_radius: {
      repos: [{ id: "r1", name: "acme/billing-api", files: 11, kind: "modify", risk: "medium" }],
      services: [{ name: "checkout-svc", impact: "New ACH initializer.", risk: "medium" }],
      data_stores: [],
      compliance: ["PCI-DSS"],
    },
    kb_sources: [{ label: "stripe-ach.md", kind: "doc", detail: "Runbook.", ref: "kn://docs/stripe-ach.md" }],
  };
}

function planStructured(): PlanStructured {
  return {
    version: 1,
    document_id: "doc_plan",
    stages: [
      {
        stage_id: "S1",
        title: "Add ach_pending state",
        files_in_scope: ["apps/billing/state.py"],
        acceptance: "Invoice can enter ach_pending.",
        estimated_loc: 60,
        risk_level: "low",
        depends_on: [],
      },
      {
        stage_id: "S2",
        title: "Wire ACH checkout",
        files_in_scope: ["apps/billing/checkout/ach.py"],
        acceptance: "ACH initiates a Stripe source.",
        estimated_loc: 180,
        risk_level: "medium",
        depends_on: ["S1"],
      },
    ],
    consequences: {
      summary: "Adds a new payment rail.",
      severity: "medium",
      breaking_changes: [{ area: "Invoice state machine", detail: "Handle ach_pending.", risk: "medium" }],
      data_impacts: [],
      runtime_risks: [],
      mitigations: [],
    },
    max_risk_level: "medium",
    total_estimated_loc: 240,
    research_worker_count: 2,
  };
}

function doc(
  over: Partial<RunPhaseDocument> & Pick<RunPhaseDocument, "phase" | "structured">,
): RunPhaseDocument {
  return {
    id: over.id ?? "doc_1",
    run_id: "tsk_demo",
    phase: over.phase,
    title: over.title ?? `${over.phase}.md`,
    body_markdown: over.body_markdown ?? "# Canonical body\nThe markdown content.",
    body_html: null,
    gate_state: over.gate_state ?? "pending",
    sections: over.sections ?? [],
    created_at: "2026-05-23T10:00:00Z",
    structured: over.structured,
    revisions: over.revisions ?? [{ version: 1, who_kind: "agent", created_at: "2026-05-23T10:00:00Z" }],
  };
}

const noop = async () => {};

describe("SpecPhase body", () => {
  beforeEach(() => cleanup());

  it("renders the structured spec panels with key fields", () => {
    render(
      <SpecPhase
        runId="tsk_demo"
        document={doc({ phase: "spec", structured: specStructured() })}
        refetch={noop}
      />,
    );
    // Domain name + blast-radius repo + KB source label all surface.
    expect(screen.getByTestId("domains-panel")).toBeTruthy();
    expect(screen.getAllByText(/billing · checkout/i).length).toBeGreaterThan(0);
    const blast = screen.getByTestId("blast-radius-panel");
    expect(within(blast).getByText("acme/billing-api")).toBeTruthy();
    expect(within(blast).getByText(/pci-dss/i)).toBeTruthy();
    expect(within(screen.getByTestId("kb-sources-panel")).getByText("stripe-ach.md")).toBeTruthy();
    // The scope selector renders so a re-scope is possible.
    expect(screen.getByTestId("scope-selector")).toBeTruthy();
    // The canonical markdown body still renders below the panels.
    expect(screen.getByTestId("doc-markdown")).toBeTruthy();
  });

  it("renders just the markdown body when structured is null", () => {
    render(
      <SpecPhase
        runId="tsk_demo"
        document={doc({ phase: "spec", structured: null })}
        refetch={noop}
      />,
    );
    // No structured panels.
    expect(screen.queryByTestId("domains-panel")).toBeNull();
    expect(screen.queryByTestId("scope-selector")).toBeNull();
    // Markdown body still present.
    const md = screen.getByTestId("doc-markdown");
    expect(md.textContent).toMatch(/canonical body/i);
  });
});

describe("PlanPhase body", () => {
  beforeEach(() => cleanup());

  it("renders the structured plan panels with key fields", () => {
    render(
      <PlanPhase
        runId="tsk_demo"
        document={doc({ phase: "plan", structured: planStructured() })}
      />,
    );
    // Subtasks + dependency graph + consequences panels render.
    const subtasks = screen.getByTestId("subtasks-panel");
    expect(within(subtasks).getByText(/add ach_pending state/i)).toBeTruthy();
    const graph = screen.getByTestId("dependency-graph");
    expect(within(graph).getAllByText("S2").length).toBeGreaterThan(0);
    const consequences = screen.getByTestId("consequences-panel");
    expect(within(consequences).getByText(/invoice state machine/i)).toBeTruthy();
    // The canonical markdown body still renders.
    expect(screen.getByTestId("doc-markdown")).toBeTruthy();
  });

  it("renders just the markdown body when structured is null", () => {
    render(
      <PlanPhase
        runId="tsk_demo"
        document={doc({ phase: "plan", structured: null })}
      />,
    );
    expect(screen.queryByTestId("subtasks-panel")).toBeNull();
    expect(screen.queryByTestId("dependency-graph")).toBeNull();
    const md = screen.getByTestId("doc-markdown");
    expect(md.textContent).toMatch(/canonical body/i);
  });
});
