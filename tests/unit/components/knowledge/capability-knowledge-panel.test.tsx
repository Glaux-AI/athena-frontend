// @vitest-environment jsdom

/**
 * CapabilityKnowledgePanel unit tests (readiness §6.0 row 1270).
 *
 * Covers:
 *   - Renders all four sections (histogram, top_entities, overlay_terms,
 *     recent_changes) when the payload is populated.
 *   - Histogram is sorted descending by count.
 *   - Empty state renders when every section is empty.
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CapabilityKnowledgePanel } from "@/components/knowledge/capability-knowledge-panel";
import type { CapabilityKnowledge } from "@/lib/api/client";

function makeKnowledge(overrides: Partial<CapabilityKnowledge> = {}): CapabilityKnowledge {
  return {
    capability_id: "cap_test",
    nodes_total: 412,
    nodes_by_kind: { service: 3, module: 47, function: 218, config: 22 },
    edges_total: 1247,
    repos_indexed: 3,
    decision_records: 8,
    domain_concepts: 12,
    top_entities: [
      {
        id: "e1",
        name: "billing-svc",
        kind: "service",
        path: "services/billing-svc",
        importance: 0.96,
        description: "Primary billing service.",
        repo: "lumen/billing-svc",
      },
      {
        id: "e2",
        name: "InvoiceStateMachine",
        kind: "class",
        path: "billing-svc/invoice/state.ts",
        importance: 0.92,
        description: "Lifecycle.",
        repo: "lumen/billing-svc",
      },
    ],
    overlay_terms: [
      {
        term: "invoice lifecycle",
        confidence: 0.92,
        matched_node_ids: ["e2"],
        matched_node_labels: ["InvoiceStateMachine"],
        extracted_from: { resource_id: "res_b1", line_range: "L42-L84" },
      },
    ],
    recent_changes: [
      {
        when: "12m ago",
        repo: "lumen/billing-svc",
        summary: "Refactored InvoiceStateMachine.",
        nodes_affected: 6,
        change_class: "minor",
      },
    ],
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
    ...overrides,
  };
}

describe("CapabilityKnowledgePanel", () => {
  it("renders all four sections when populated", () => {
    cleanup();
    render(<CapabilityKnowledgePanel knowledge={makeKnowledge()} />);

    expect(screen.getByTestId("capability-knowledge-histogram")).toBeTruthy();
    expect(screen.getByTestId("capability-knowledge-entities")).toBeTruthy();
    expect(screen.getByTestId("capability-knowledge-overlay-terms")).toBeTruthy();
    expect(screen.getByTestId("capability-knowledge-recent-changes")).toBeTruthy();

    // Headings render.
    expect(screen.getByText(/Node kinds/i)).toBeTruthy();
    expect(screen.getByText(/Top entities/i)).toBeTruthy();
    expect(screen.getByText(/Overlay terms/i)).toBeTruthy();
    expect(screen.getByText(/Recent changes/i)).toBeTruthy();

    // Top entity name visible. `InvoiceStateMachine` appears both as a
    // top_entities row label and as a matched_node_label in the
    // overlay_terms list — assert at least one match.
    expect(screen.getByText("billing-svc")).toBeTruthy();
    expect(screen.getAllByText("InvoiceStateMachine").length).toBeGreaterThan(0);

    // Overlay term visible.
    expect(screen.getByText("invoice lifecycle")).toBeTruthy();

    // Recent change summary visible.
    expect(screen.getByText(/Refactored InvoiceStateMachine/)).toBeTruthy();
  });

  it("sorts the histogram descending by count", () => {
    cleanup();
    render(
      <CapabilityKnowledgePanel
        knowledge={makeKnowledge({
          nodes_by_kind: { config: 2, function: 100, module: 50 },
        })}
      />,
    );
    const histList = screen.getByTestId("capability-knowledge-histogram");
    const items = Array.from(histList.querySelectorAll("li"));
    // The first column is the kind label.
    const labels = items.map((li) => li.querySelector("span")?.textContent ?? "");
    expect(labels).toEqual(["function", "module", "config"]);
  });

  it("renders the empty state when every section is empty", () => {
    cleanup();
    render(
      <CapabilityKnowledgePanel
        knowledge={makeKnowledge({
          nodes_by_kind: {},
          top_entities: [],
          overlay_terms: [],
          recent_changes: [],
        })}
      />,
    );
    expect(screen.getByText(/No knowledge ingested yet/i)).toBeTruthy();
    // Empty-state replaces the section blocks entirely.
    expect(screen.queryByTestId("capability-knowledge-histogram")).toBeNull();
  });

  it("omits the entities section when only entities are empty", () => {
    cleanup();
    render(
      <CapabilityKnowledgePanel
        knowledge={makeKnowledge({ top_entities: [] })}
      />,
    );
    expect(screen.queryByTestId("capability-knowledge-entities")).toBeNull();
    // Histogram still renders.
    expect(screen.getByTestId("capability-knowledge-histogram")).toBeTruthy();
  });
});
