// @vitest-environment jsdom

/**
 * NewTaskDialog - create a work item (Work OS rehaul W1 dialog rework). Pins:
 *  - the plain `task` type is FIRST and pre-selected; the 8 railed types sit
 *    under an "AI workflows" divider;
 *  - "Run with Athena" is hidden for type `task` (a rail-less task can never
 *    send ai_delegated) and appears for railed types;
 *  - submit sends the new TaskCreateInput planning fields (estimate_points,
 *    owning_team_id, assignee) from the collapsible Details section;
 *  - the proposalDefaults deep-link still pre-fills type/title/body.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const {
  createMock,
  domainsListMock,
  teamsListMock,
  labelsListMock,
  membersListMock,
  cyclesListMock,
  toastSuccessMock,
  toastErrorMock,
  toastInfoMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  domainsListMock: vi.fn(),
  teamsListMock: vi.fn(),
  labelsListMock: vi.fn(),
  membersListMock: vi.fn(),
  cyclesListMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: { ...actual.api.tasks, create: createMock },
      domains: { ...actual.api.domains, list: domainsListMock },
      teams: { ...actual.api.teams, list: teamsListMock },
      labels: { ...actual.api.labels, list: labelsListMock },
      members: { ...actual.api.members, list: membersListMock },
      cycles: { ...actual.api.cycles, listForTeam: cyclesListMock },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, info: toastInfoMock },
}));

vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({
    activeOrgId: "org1",
    me: { id: "me" },
  }),
}));

import { NewTaskDialog } from "@/components/work/new-task-dialog";

function renderDialog(defaults: Parameters<typeof NewTaskDialog>[0]["defaults"] = null) {
  const onCreated = vi.fn();
  render(
    <NewTaskDialog
      open
      onOpenChange={() => {}}
      onCreated={onCreated}
      defaults={defaults}
    />,
  );
  return onCreated;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  domainsListMock.mockResolvedValue([]);
  teamsListMock.mockResolvedValue([]);
  labelsListMock.mockResolvedValue([]);
  membersListMock.mockResolvedValue([]);
  cyclesListMock.mockResolvedValue([]);
  createMock.mockResolvedValue({
    id: "t-new",
    display_id: "TASK-1",
    type: "task",
  });
});

describe("NewTaskDialog", () => {
  it("pre-selects the plain task type, first, with the AI workflows divider", () => {
    renderDialog();

    const radios = screen.getAllByRole("radio");
    expect(radios[0]?.textContent).toMatch(/Task/);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    expect(radios[0]?.textContent).toMatch(/no AI workflow attached/i);
    expect(screen.queryByText("AI workflows")).not.toBeNull();
  });

  it("hides Run with Athena for type task and shows it for railed types", () => {
    renderDialog();
    expect(screen.queryByText("Run with Athena")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /feature/i }));
    expect(screen.queryByText("Run with Athena")).not.toBeNull();
  });

  it("creates a plain task with type task and never sends ai_delegated", async () => {
    const onCreated = renderDialog();

    fireEvent.change(screen.getByPlaceholderText(/self-serve order pause/i), {
      target: { value: "Book the offsite" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const payload = createMock.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ type: "task", title: "Book the offsite" });
    expect(payload).not.toHaveProperty("ai_delegated");
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("sends the new planning fields from the Details section", async () => {
    teamsListMock.mockResolvedValue([
      { id: "team1", name: "Platform" },
    ]);
    renderDialog();

    fireEvent.change(screen.getByPlaceholderText(/self-serve order pause/i), {
      target: { value: "Plan the sprint" },
    });

    // Open Details and set estimate + team.
    fireEvent.click(screen.getByRole("button", { name: /details/i }));
    fireEvent.change(await screen.findByLabelText("Estimate"), {
      target: { value: "3" },
    });
    fireEvent.change(await screen.findByLabelText("Team"), {
      target: { value: "team1" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({
      type: "task",
      title: "Plan the sprint",
      estimate_points: 3,
      owning_team_id: "team1",
    });
  });

  it("keeps the proposalDefaults deep-link pre-fill working", () => {
    renderDialog({ type: "bug", title: "Fix the flake", body: "It flakes." });

    expect(screen.getByRole("radio", { name: /bug/i }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(
      (screen.getByPlaceholderText(/self-serve order pause/i) as HTMLInputElement).value,
    ).toBe("Fix the flake");
    expect(
      (screen.getByPlaceholderText(/who is it hurting/i) as HTMLTextAreaElement).value,
    ).toBe("It flakes.");
  });
});
