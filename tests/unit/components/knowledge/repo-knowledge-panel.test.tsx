// @vitest-environment jsdom

/**
 * RepoKnowledgePanel unit tests (readiness §6.0 row 1270).
 *
 * Covers:
 *   - Renders snapshot + top_symbols + call_edges + configs when populated.
 *   - Pending PRs appear in the snapshot card when present.
 *   - Empty state renders when symbols/edges/configs are all empty.
 *   - Edge kind label maps to the short labels (e.g. `references` -> `refs`).
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { RepoKnowledgePanel } from "@/components/knowledge/repo-knowledge-panel";
import type { RepoKnowledge } from "@/lib/api/client";

function makeKnowledge(overrides: Partial<RepoKnowledge> = {}): RepoKnowledge {
  return {
    repo_id: "repo_t1",
    repo_full_name: "lumen/billing-svc",
    primary_language: "TypeScript",
    files_indexed: 312,
    loc: 24180,
    last_commit: { sha: "a12c4f9", when: "12m ago", author: "Jordan", message: "Tighten guards" },
    services: [],
    modules: [],
    top_symbols: [
      {
        id: "sym1",
        kind: "class",
        name: "InvoiceStateMachine",
        path: "billing-svc/invoice/state.ts:22:218",
        signature: "class InvoiceStateMachine { transitionTo(target: InvoiceState): Invoice }",
        docstring: "Canonical lifecycle for invoices.",
        visibility: "public",
        language: "TypeScript",
        callers_count: 38,
        callees_count: 12,
        importance: 0.94,
        adrs_referenced: ["ADR-014"],
        has_tests: true,
      },
      {
        id: "sym2",
        kind: "function",
        name: "createCheckoutSession",
        path: "billing-svc/checkout.ts:42:142",
        signature: "function createCheckoutSession(req): Promise<CheckoutSession>",
        docstring: null,
        visibility: "public",
        language: "TypeScript",
        callers_count: 18,
        callees_count: 9,
        importance: 0.88,
        adrs_referenced: [],
        has_tests: true,
      },
    ],
    call_edges: [
      {
        kind: "calls",
        from: { id: "sym2", name: "createCheckoutSession", path: "billing-svc/checkout.ts" },
        to: { id: "sym1", name: "InvoiceStateMachine", path: "billing-svc/invoice/state.ts" },
        occurrences: 2,
      },
      {
        kind: "references",
        from: { id: "sym1", name: "InvoiceStateMachine", path: "billing-svc/invoice/state.ts" },
        to: { id: "sym3", name: "InvoiceState", path: "billing-svc/invoice/types.ts" },
        occurrences: 22,
      },
    ],
    configs: [
      {
        id: "cfg1",
        path: "billing-svc/config/stripe.yaml",
        format: "yaml",
        summary: "Stripe webhook allowlist + signing-key rotations.",
        key_excerpts: ["webhook.endpoints", "signing_keys"],
        adrs_referenced: ["ADR-014"],
      },
    ],
    adrs_referenced: [],
    snapshot: {
      indexed_sha: "a12c4f99999",
      indexed_branch: "main",
      last_full_sync: "12m ago",
      pending_prs: [{ pr_number: 412, sha: "a3f12abdead", changed_files: 8 }],
    },
    exports: 72,
    decision_records_referenced: 5,
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
    recent_commits: [],
    ...overrides,
  };
}

describe("RepoKnowledgePanel", () => {
  it("renders snapshot, top symbols, call edges, and configs", () => {
    cleanup();
    render(<RepoKnowledgePanel knowledge={makeKnowledge()} />);

    expect(screen.getByTestId("repo-knowledge-panel")).toBeTruthy();
    expect(screen.getByTestId("repo-knowledge-snapshot")).toBeTruthy();
    expect(screen.getByTestId("repo-knowledge-top-symbols")).toBeTruthy();
    expect(screen.getByTestId("repo-knowledge-call-edges")).toBeTruthy();
    expect(screen.getByTestId("repo-knowledge-configs")).toBeTruthy();

    // Symbol details visible. `InvoiceStateMachine` and
    // `createCheckoutSession` each appear in the top_symbols list AND in
    // call_edges (as from/to names) — assert at least one match.
    expect(screen.getAllByText("InvoiceStateMachine").length).toBeGreaterThan(0);
    expect(screen.getAllByText("createCheckoutSession").length).toBeGreaterThan(0);

    // Edge kind labels mapped: references -> refs.
    expect(screen.getByText(/^refs$/i)).toBeTruthy();
    expect(screen.getByText(/^calls$/i)).toBeTruthy();

    // Config path visible.
    expect(screen.getByText("billing-svc/config/stripe.yaml")).toBeTruthy();

    // Pending PR chip visible (short SHA + PR number).
    expect(screen.getByText(/#412/)).toBeTruthy();
  });

  it("truncates indexed SHA to 7 chars in the snapshot", () => {
    cleanup();
    render(<RepoKnowledgePanel knowledge={makeKnowledge()} />);
    // a12c4f99999 -> a12c4f9
    expect(screen.getByText("a12c4f9")).toBeTruthy();
  });

  it("renders empty state when top_symbols, call_edges, and configs are all empty", () => {
    cleanup();
    render(
      <RepoKnowledgePanel
        knowledge={makeKnowledge({ top_symbols: [], call_edges: [], configs: [] })}
      />,
    );
    expect(screen.getByText(/No KG data yet for this repo/i)).toBeTruthy();
    expect(screen.queryByTestId("repo-knowledge-panel")).toBeNull();
  });

  it("omits the call-edges section when only edges are empty", () => {
    cleanup();
    render(<RepoKnowledgePanel knowledge={makeKnowledge({ call_edges: [] })} />);
    expect(screen.queryByTestId("repo-knowledge-call-edges")).toBeNull();
    // Top symbols still render.
    expect(screen.getByTestId("repo-knowledge-top-symbols")).toBeTruthy();
  });

  it("renders 'No pending PRs' inline hint when snapshot.pending_prs is empty", () => {
    cleanup();
    render(
      <RepoKnowledgePanel
        knowledge={makeKnowledge({
          snapshot: {
            indexed_sha: "deadbeefcafe",
            indexed_branch: "main",
            last_full_sync: "1h ago",
            pending_prs: [],
          },
        })}
      />,
    );
    expect(screen.getByText(/no pending prs/i)).toBeTruthy();
  });
});
