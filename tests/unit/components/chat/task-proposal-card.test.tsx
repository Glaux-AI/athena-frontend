// @vitest-environment jsdom

/**
 * TaskProposalCard renders the propose_task envelope inside a chat
 * thread. Tests cover:
 *   - renders type chip, title, truncated goal, domain name, stage list
 *   - "Start task" CTA falls back to a `cta_url` link when no `onStart`
 *   - with `onStart`, the CTA is an in-place button (no navigation)
 *   - `onDismiss` renders a Dismiss action and is wired
 *   - domain chip omitted entirely for unscoped (domain_id null) proposals
 *   - once spawnedRunId is set, swaps in the "Task started" pill
 *     linking to /work/[id]
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { Domain, TaskProposalPayload } from "@/lib/api/client";

const { listDomainsMock } = vi.hoisted(() => ({
  listDomainsMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      domains: {
        ...actual.api.domains,
        list: listDomainsMock,
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
    type: "implementation",
    domain_id: CAP_ID,
    title: "Fix pagination off-by-one",
    goal: "Implement the off-by-one fix in pagination.",
    stages: ["Plan", "Execution", "Raise PR", "PR build-fix"],
    cta_text: "Start task",
    cta_url: `/work?new=1&proposal_id=${PROPOSAL_ID}&type=implementation&title=Fix+pagination+off-by-one&body=Implement+the+off-by-one+fix+in+pagination.&domain_id=${CAP_ID}`,
    ...overrides,
  };
}

function makeCap(id: string, name: string): Domain {
  return {
    id,
    name,
    slug: name.toLowerCase(),
  } as Domain;
}

describe("TaskProposalCard", () => {
  beforeEach(() => {
    cleanup();
    listDomainsMock.mockReset();
    listDomainsMock.mockResolvedValue([makeCap(CAP_ID, "Billing")]);
  });

  it("renders type label, title, goal, and a legacy CTA link to cta_url (no onStart)", async () => {
    const proposal = makeProposal();

    render(<TaskProposalCard proposal={proposal} />);

    // The card exists with the right test id.
    const card = await screen.findByTestId("task-proposal-card");
    expect(card).not.toBeNull();

    // Title + goal text are present.
    expect(card.textContent).toContain("Fix pagination off-by-one");
    expect(card.textContent).toContain("off-by-one fix");

    // Type chip (Implementation, from TASK_TYPE_META) is visible.
    expect(card.textContent).toContain("Implementation");

    // Without an onStart handler the CTA falls back to a cta_url link.
    const cta = screen.getByTestId("task-proposal-cta");
    expect(cta).not.toBeNull();
    expect(cta.getAttribute("href")).toBe(proposal.cta_url);

    // Domain name flows in after the list call resolves.
    await waitFor(() => {
      expect(card.textContent).toContain("Billing");
    });
  });

  it("calls onStart with the proposal (in-place open, no navigation) when provided", async () => {
    const proposal = makeProposal();
    const onStart = vi.fn();

    render(<TaskProposalCard proposal={proposal} onStart={onStart} />);

    const cta = await screen.findByTestId("task-proposal-cta");
    // It's an in-place button now - no href to a new page.
    expect(cta.getAttribute("href")).toBeNull();

    fireEvent.click(cta);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(proposal);
  });

  it("renders a Dismiss action wired to onDismiss, and omits it without one", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <TaskProposalCard proposal={makeProposal()} onDismiss={onDismiss} />,
    );

    const dismiss = await screen.findByTestId("task-proposal-dismiss");
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // No handler → no dismiss affordance.
    rerender(<TaskProposalCard proposal={makeProposal()} />);
    await screen.findByTestId("task-proposal-card");
    expect(screen.queryByTestId("task-proposal-dismiss")).toBeNull();
  });

  it("renders the stage sequence as a quiet inline list", async () => {
    render(<TaskProposalCard proposal={makeProposal()} />);

    const stages = await screen.findByTestId("task-proposal-stages");
    expect(stages.textContent).toBe("Plan → Execution → Raise PR → PR build-fix");
  });

  it("omits the stage list when stages is empty", async () => {
    render(<TaskProposalCard proposal={makeProposal({ stages: [] })} />);

    await screen.findByTestId("task-proposal-card");
    expect(screen.queryByTestId("task-proposal-stages")).toBeNull();
  });

  it("shows no domain chip for an unscoped (domain_id null) proposal", async () => {
    render(<TaskProposalCard proposal={makeProposal({ domain_id: null })} />);

    const card = await screen.findByTestId("task-proposal-card");
    // No lookup is made and no chip text appears.
    expect(listDomainsMock).not.toHaveBeenCalled();
    expect(card.textContent).not.toContain("Billing");
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
    expect(link.getAttribute("href")).toBe(`/work/${runId}`);

    // The Start CTA should be gone now.
    expect(screen.queryByTestId("task-proposal-cta")).toBeNull();
  });

  it("falls back to a truncated UUID when the domain list call fails", async () => {
    listDomainsMock.mockRejectedValue(new Error("network down"));

    render(<TaskProposalCard proposal={makeProposal()} />);

    const card = await screen.findByTestId("task-proposal-card");
    await waitFor(() => {
      // The first 8 chars of the dom_id should be present once the
      // failure handler runs.
      expect(card.textContent).toContain(CAP_ID.slice(0, 8));
    });
  });

  it("has an accessible name via the region landmark", async () => {
    render(<TaskProposalCard proposal={makeProposal()} />);

    // Screen-reader query - verifies role="region" + aria-label set.
    const region = await screen.findByRole("region", {
      name: /Task proposal: Implementation/i,
    });
    expect(region).not.toBeNull();
  });
});
