// @vitest-environment jsdom

/**
 * <TaskProperties> - the detail page's one home for every work-item fact
 * (Work OS rehaul W8). Pins:
 *  - `isRailedTask` - the one predicate the page keys its AI chrome off
 *    (plain `task` = no rail, everything else railed);
 *  - a representative inline edit (Priority) PATCHes and notifies the parent;
 *  - the "Athena runs this" delegation row exists only on railed tasks;
 *  - the Team/Cycle rows hide when the org has no teams;
 *  - a live task's owner picker offers no Unassign (server 409s a clear);
 *    a terminal task's does.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { Member, Task } from "@/lib/api/client";

const {
  patchMock,
  teamsListMock,
  labelsListMock,
  cyclesListMock,
  labelAttachMock,
  labelDetachMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  patchMock: vi.fn(),
  teamsListMock: vi.fn(),
  labelsListMock: vi.fn(),
  cyclesListMock: vi.fn(),
  labelAttachMock: vi.fn(),
  labelDetachMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: { ...actual.api.tasks, patch: patchMock },
      teams: { ...actual.api.teams, list: teamsListMock },
      labels: {
        ...actual.api.labels,
        list: labelsListMock,
        attach: labelAttachMock,
        detach: labelDetachMock,
      },
      cycles: { ...actual.api.cycles, listForTeam: cyclesListMock },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { TaskProperties, isRailedTask } from "@/components/work/task-properties";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    display_id: "FEAT-1",
    org_id: "org1",
    domain_id: null,
    domain_ids: [],
    type: "feature",
    parent_id: null,
    depends_on: [],
    blocks: [],
    owning_team_id: null,
    owner_user_id: "u-owner",
    assignee: null,
    reviewer_user_id: null,
    ai_delegated: false,
    label_ids: [],
    cycle_id: null,
    estimate_points: null,
    design_token_set_ids: [],
    auto_approve: false,
    auto_approve_descendants: false,
    title: "Build the thing",
    body: "",
    status: "todo",
    priority: null,
    target_date: null,
    health: null,
    cancel_reason: null,
    spent_usd: null,
    budget_usd: null,
    stream_url: "/v1/tasks/t1/events",
    artifact_ids: [],
    run_ids: [],
    child_ids: [],
    children_total: 0,
    children_done: 0,
    children_blocked: 0,
    created_by_user_id: null,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function member(extra: Partial<Member> = {}): Member {
  return {
    user_id: "u-owner",
    membership_id: "m1",
    email: "owner@acme.com",
    display_name: "Olive Owner",
    avatar_url: null,
    role: "engineer",
    is_owner: false,
    joined_at: "2026-01-01T00:00:00Z",
    deactivated_at: null,
    ...extra,
  };
}

const MEMBERS = [member(), member({ user_id: "me", membership_id: "m2", display_name: "Me", email: "me@acme.com" })];

function renderProps(task: Task, onChanged = vi.fn()) {
  render(
    <TaskProperties
      task={task}
      members={MEMBERS}
      memberById={new Map(MEMBERS.map((m) => [m.user_id, m]))}
      meId="me"
      domainById={new Map()}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  teamsListMock.mockResolvedValue([]);
  labelsListMock.mockResolvedValue([]);
  cyclesListMock.mockResolvedValue([]);
  patchMock.mockResolvedValue({});
});

describe("isRailedTask", () => {
  it("is false only for the plain task type", () => {
    expect(isRailedTask("task")).toBe(false);
    for (const t of [
      "feature",
      "implementation",
      "design",
      "bug",
      "incident",
      "spike",
      "chore",
      "test",
    ] as const) {
      expect(isRailedTask(t)).toBe(true);
    }
  });
});

describe("TaskProperties", () => {
  it("patches priority from the inline control and notifies the parent", async () => {
    const onChanged = renderProps(makeTask());

    fireEvent.click(screen.getByRole("button", { name: /change priority/i }));
    fireEvent.click(await screen.findByRole("button", { name: /high/i }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { priority: "high" }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("shows the delegation row on railed tasks and patches ai_delegated", async () => {
    renderProps(makeTask({ type: "feature" }));

    const toggle = screen.getByRole("switch", { name: /athena runs this/i });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { ai_delegated: true }),
    );
  });

  it("hides the delegation row on a plain task", () => {
    renderProps(makeTask({ type: "task" }));
    expect(screen.queryByRole("switch", { name: /athena runs this/i })).toBeNull();
  });

  it("hides the Team and Cycle rows when the org has no teams", async () => {
    renderProps(makeTask());
    await waitFor(() => expect(teamsListMock).toHaveBeenCalled());
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.queryByText("Cycle")).toBeNull();
  });

  it("shows the Team row (and patches) when the org has teams", async () => {
    teamsListMock.mockResolvedValue([
      { id: "team1", name: "Platform" },
      { id: "team2", name: "Growth" },
    ]);
    renderProps(makeTask());

    const trigger = await screen.findByRole("button", { name: /set a team/i });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: /platform/i }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { owning_team_id: "team1" }),
    );
  });

  it("offers Unassign on the owner picker only once the task is terminal", async () => {
    // Live task: no Unassign in the owner picker.
    renderProps(makeTask({ status: "in_progress" }));
    fireEvent.click(screen.getByRole("button", { name: /reassign owner/i }));
    expect(screen.queryByText("Unassign")).toBeNull();
    cleanup();

    // Terminal task: Unassign appears and clears the owner.
    renderProps(makeTask({ status: "done" }));
    fireEvent.click(screen.getByRole("button", { name: /reassign owner/i }));
    fireEvent.click(await screen.findByText("Unassign"));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { owner_user_id: null }),
    );
  });

  it("surfaces a failed patch as a toast", async () => {
    patchMock.mockRejectedValue(new Error("boom"));
    renderProps(makeTask());

    fireEvent.click(screen.getByRole("button", { name: /change priority/i }));
    fireEvent.click(await screen.findByRole("button", { name: /urgent/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });
});
