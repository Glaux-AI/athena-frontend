// @vitest-environment jsdom

/**
 * ActionProposalCard renders a chat mutation proposal as a confirm card and,
 * on Confirm, calls the EXISTING RBAC-gated /v1/tasks endpoint. Tests cover:
 *   - confirming a task update calls api.tasks.patch with the changes, then
 *     shows the done state + an "Open in Work" link
 *   - the action is blocked (no Confirm button) when the user lacks the
 *     permission the proposal declares
 *   - a stage-run proposal confirms via api.tasks.runStage
 *   - a failed endpoint call surfaces the error and offers Retry
 *   - the card exposes an accessible region landmark
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { TaskActionProposal } from "@/lib/api/client";

const { canMock, patchMock, runStageMock } = vi.hoisted(() => ({
  canMock: vi.fn(),
  patchMock: vi.fn(),
  runStageMock: vi.fn(),
}));

vi.mock("@/lib/session/use-permissions", () => ({
  usePermissions: () => ({ can: canMock, permissions: new Set<string>(), loading: false }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: { ...actual.api.tasks, patch: patchMock, runStage: runStageMock },
    },
  };
});

import { ActionProposalCard } from "@/components/chat/action-proposal-card";

const TASK_ID = "00000000-0000-0000-0000-0000000000aa";

function updateProposal(): TaskActionProposal {
  return {
    proposal_id: "p1",
    kind: "action_proposal",
    action: "task_update",
    task_id: TASK_ID,
    task_display_id: "FEAT-1",
    task_title: "Fix login",
    summary: "Update FEAT-1: priority=high",
    permission: "task:update",
    changes: { priority: "high" },
  };
}

function runProposal(): TaskActionProposal {
  return {
    proposal_id: "p2",
    kind: "action_proposal",
    action: "stage_run",
    task_id: TASK_ID,
    task_display_id: "FEAT-1",
    task_title: "Fix login",
    summary: "Run the 'plan' stage of FEAT-1",
    permission: "task:update",
    stage: "plan",
    stage_status: "ready",
    steer: null,
  };
}

describe("ActionProposalCard", () => {
  beforeEach(() => {
    cleanup();
    canMock.mockReset();
    patchMock.mockReset();
    runStageMock.mockReset();
  });

  it("confirms a task update by calling the patch endpoint, then shows done", async () => {
    canMock.mockReturnValue(true);
    patchMock.mockResolvedValue({});

    render(<ActionProposalCard proposal={updateProposal()} />);
    const card = await screen.findByTestId("action-proposal-card");
    expect(card.textContent).toContain("FEAT-1");
    expect(card.textContent).toContain("priority=high");

    fireEvent.click(screen.getByTestId("action-proposal-confirm"));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(TASK_ID, { priority: "high" }),
    );
    const open = await screen.findByTestId("action-proposal-open");
    expect(open.getAttribute("href")).toBe(`/work/${TASK_ID}`);
  });

  it("blocks the action when the user lacks the declared permission", async () => {
    canMock.mockReturnValue(false);

    render(<ActionProposalCard proposal={updateProposal()} />);
    const card = await screen.findByTestId("action-proposal-card");
    expect(screen.queryByTestId("action-proposal-confirm")).toBeNull();
    expect(card.textContent).toContain("do not have permission");
  });

  it("runs a stage via runStage on confirm", async () => {
    canMock.mockReturnValue(true);
    runStageMock.mockResolvedValue({});

    render(<ActionProposalCard proposal={runProposal()} />);
    fireEvent.click(await screen.findByTestId("action-proposal-confirm"));
    await waitFor(() =>
      expect(runStageMock).toHaveBeenCalledWith(TASK_ID, "plan", undefined),
    );
  });

  it("surfaces an error and offers Retry when the endpoint fails", async () => {
    canMock.mockReturnValue(true);
    patchMock.mockRejectedValue(new Error("server said no"));

    render(<ActionProposalCard proposal={updateProposal()} />);
    fireEvent.click(await screen.findByTestId("action-proposal-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("action-proposal-confirm").textContent).toContain(
        "Retry",
      ),
    );
    expect(screen.getByTestId("action-proposal-card").textContent).toContain(
      "server said no",
    );
  });

  it("has an accessible region name", async () => {
    canMock.mockReturnValue(true);
    render(<ActionProposalCard proposal={updateProposal()} />);
    const region = await screen.findByRole("region", {
      name: /Action proposal: Apply change/i,
    });
    expect(region).not.toBeNull();
  });
});
