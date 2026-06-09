// @vitest-environment jsdom

/**
 * <AgentActivity> — THE shared activity surface (chat + tasks).
 *
 * Pins the unification contract: friendly tool vocabulary (never raw
 * snake_case, raw name one hover away), the roll-up-on-completion fold
 * (collapse on the live→settled edge, scoped by resetKey so switching stages
 * never collapses the log you're reading), and the reason/said split
 * (real chain-of-thought labeled "Reasoning", answer text "Athena said").
 * Plus the StageWorklog adapter's dedup: a live row whose step_id is already
 * in the persisted ledger renders exactly once.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  AgentActivity,
  friendlyToolLabel,
  type ActivityRow,
} from "@/components/agent/agent-activity";
import { StageWorklog } from "@/components/work/stage-worklog";
import type { LedgerStep } from "@/lib/api/client";
import type { TaskEvent } from "@/features/work/use-task-stream";

afterEach(() => cleanup());

const toolRow: ActivityRow = {
  key: "t1",
  kind: "tool",
  toolName: "lookup_symbol",
  summary: "name=chargeCustomer",
  resultSummary: "3 results",
  status: "ok",
  order: 1,
};

describe("friendlyToolLabel", () => {
  it("maps the catalog to verb phrases and humanizes unknowns", () => {
    expect(friendlyToolLabel("hybrid_retrieval")).toBe("Searching the codebase");
    expect(friendlyToolLabel("task")).toBe("Delegating an investigation");
    expect(friendlyToolLabel("acme_custom_probe")).toBe("Acme custom probe");
    expect(friendlyToolLabel(null)).toBe("Using a tool");
  });
});

describe("AgentActivity", () => {
  it("renders tool rows friendly — verb phrase + args + result, raw name on hover", () => {
    render(
      <AgentActivity headline="Athena's work" rows={[toolRow]} live defaultExpanded />,
    );
    expect(screen.getByText("Looking up a symbol")).toBeTruthy();
    expect(screen.getByText(/name=chargeCustomer/)).toBeTruthy();
    expect(screen.getByText(/3 results/)).toBeTruthy();
    expect(screen.getByTitle("lookup_symbol")).toBeTruthy();
  });

  it("labels real thinking 'Reasoning' and answer text 'Athena said'", () => {
    const rows: ActivityRow[] = [
      { key: "r", kind: "reason", toolName: null, summary: "weighing options", status: "ok", order: 1 },
      { key: "s", kind: "said", toolName: null, summary: "The fix is in jwt.py.", status: "ok", order: 2 },
    ];
    render(<AgentActivity headline="x" rows={rows} live defaultExpanded />);
    expect(screen.getByText(/Reasoning:/)).toBeTruthy();
    expect(screen.getByText(/Athena said:/)).toBeTruthy();
  });

  it("rolls up when the SAME run settles, but not on a context switch", () => {
    const { rerender } = render(
      <AgentActivity headline="x" rows={[toolRow]} live resetKey="draft" />,
    );
    // Live → expanded (body visible).
    expect(screen.getByText("Looking up a symbol")).toBeTruthy();
    // Same stage settles → rolls up; the count stays as the receipt.
    rerender(<AgentActivity headline="x" rows={[toolRow]} live={false} resetKey="draft" />);
    expect(screen.queryByText("Looking up a symbol")).toBeNull();
    expect(screen.getByText(/1 step/)).toBeTruthy();
    // The fold stays reachable by click.
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("Looking up a symbol")).toBeTruthy();
  });

  it("does NOT collapse when the user switches to a different (settled) context", () => {
    const { rerender } = render(
      <AgentActivity headline="x" rows={[toolRow]} live resetKey="draft" />,
    );
    // Switch to ANOTHER stage that is not running — the log was opened for
    // "draft"; the switch must not slam it shut mid-read.
    rerender(<AgentActivity headline="x" rows={[toolRow]} live={false} resetKey="review" />);
    expect(screen.getByText("Looking up a symbol")).toBeTruthy();
  });

  it("clamps long prose rows with a more/less toggle", () => {
    const long = "x".repeat(400);
    render(
      <AgentActivity
        headline="x"
        rows={[{ key: "p", kind: "said", toolName: null, summary: long, status: "ok", order: 1 }]}
        live
        defaultExpanded
      />,
    );
    expect(screen.getByRole("button", { name: "more" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByRole("button", { name: "less" })).toBeTruthy();
  });
});

describe("StageWorklog dedup (ledger backfill)", () => {
  const ledgerStep: LedgerStep = {
    id: "step-1",
    seq: 1,
    kind: "said",
    tool_name: null,
    summary: "I will read the PRD.",
    input_refs: [],
    output_refs: [],
    status: "ok",
    call_id: null,
  } as unknown as LedgerStep;

  const liveTwin: TaskEvent = {
    id: "ev-1",
    event: "agent_step",
    data: { kind: "said", text: "I will read the PRD.", step_id: "step-1", stage: "draft" },
    receivedAt: 1,
  };

  it("renders a persisted step and its live twin exactly once", () => {
    render(
      <StageWorklog
        stageTitle="Draft"
        ledger={[ledgerStep]}
        ledgerLoading={false}
        events={[liveTwin]}
        stageKey="draft"
        status="open"
        isRunning
      />,
    );
    expect(screen.getAllByText(/I will read the PRD\./)).toHaveLength(1);
  });
});
