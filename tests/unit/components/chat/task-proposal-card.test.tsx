// @vitest-environment jsdom

/**
 * TaskProposalCard renders the propose_task envelope inside the chat
 * drawer. Tests cover:
 *   - renders kind chip, capability name, budget chip, truncated goal
 *   - "Start task" CTA links to `cta_url`
 *   - once spawnedRunId is set, swaps in the "Task started" pill
 *     linking to /runs/[id]
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import type { Capability, TaskProposalPayload } from "@/lib/api/client";

const { listCapabilitiesMock } = vi.hoisted(() => ({
  listCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      capabilities: {
        ...actual.api.capabilities,
        list: listCapabilitiesMock,
      },
    },
  };
});

import { TaskProposalCard } from "@/components/chat/task-proposal-card";

const CAP_ID = "00000000-0000-0000-0000-00000000cccc";
const PROPOSAL_ID = "00000000-0000-0000-0000-000000000099";

function makeProposal(overrides: Partial<TaskProposalPayload> = {}): TaskProposalPayload {
  return {
    proposal_id: PROPOSAL_ID,
    kind: "implement",
    capability_id: CAP_ID,
    goal: "Implement the off-by-one fix in pagination.",
    budget_usd: 2.0,
    cta_url: `/runs/new?proposal_id=${PROPOSAL_ID}&capability_id=${CAP_ID}&kind=implement`,
    cta_text: "Start task",
    estimated_phases: ["impl.spec", "impl.plan"],
    ...overrides,
  };
}

function makeCap(id: string, name: string): Capability {
  return {
    id,
    name,
    slug: name.toLowerCase(),
  } as Capability;
}

describe("TaskProposalCard", () => {
  beforeEach(() => {
    cleanup();
    listCapabilitiesMock.mockReset();
    listCapabilitiesMock.mockResolvedValue([makeCap(CAP_ID, "Billing")]);
  });

  it("renders kind label, goal, and CTA pointing at cta_url", async () => {
    const proposal = makeProposal();

    render(<TaskProposalCard proposal={proposal} />);

    // The card exists with the right test id.
    const card = await screen.findByTestId("task-proposal-card");
    expect(card).not.toBeNull();

    // Goal text is present.
    expect(card.textContent).toContain("off-by-one fix");

    // Kind chip (Implement) is visible.
    expect(card.textContent).toContain("Implement");

    // CTA link uses cta_url.
    const cta = screen.getByTestId("task-proposal-cta");
    expect(cta).not.toBeNull();
    expect(cta.getAttribute("href")).toBe(proposal.cta_url);

    // Capability name flows in after the list call resolves.
    await waitFor(() => {
      expect(card.textContent).toContain("Billing");
    });
  });

  it("truncates very long goals to keep the card readable", async () => {
    const longGoal = "a".repeat(500);
    render(<TaskProposalCard proposal={makeProposal({ goal: longGoal })} />);

    const card = await screen.findByTestId("task-proposal-card");
    expect(card.textContent).toContain("…");
  });

  it("renders 'Task started' link when spawnedRunId is set", async () => {
    const proposal = makeProposal();
    const runId = "00000000-0000-0000-0000-000000000aaa";

    render(<TaskProposalCard proposal={proposal} spawnedRunId={runId} />);

    const link = await screen.findByTestId("task-proposal-spawned-link");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe(`/runs/${runId}`);

    // The Start CTA should be gone now.
    expect(screen.queryByTestId("task-proposal-cta")).toBeNull();
  });

  it("renders budget chip with the right amount", async () => {
    render(<TaskProposalCard proposal={makeProposal({ budget_usd: 2.5 })} />);

    const card = await screen.findByTestId("task-proposal-card");
    expect(card.textContent).toContain("Budget");
    expect(card.textContent).toContain("$2.50");
  });

  it("falls back to a truncated UUID when the capability list call fails", async () => {
    listCapabilitiesMock.mockRejectedValue(new Error("network down"));

    render(<TaskProposalCard proposal={makeProposal()} />);

    const card = await screen.findByTestId("task-proposal-card");
    await waitFor(() => {
      // The first 8 chars of the cap_id should be present once the
      // failure handler runs.
      expect(card.textContent).toContain(CAP_ID.slice(0, 8));
    });
  });

  it("has an accessible name via the region landmark", async () => {
    render(<TaskProposalCard proposal={makeProposal()} />);

    // Screen-reader query — verifies role="region" + aria-label set.
    const region = await screen.findByRole("region", {
      name: /Task proposal: Implement/i,
    });
    expect(region).not.toBeNull();
  });
});
