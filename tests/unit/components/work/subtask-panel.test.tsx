// @vitest-environment jsdom

/**
 * SubtaskPanel - manual breakdown (Work OS rehaul W8). Pins:
 *  - the "Add subtask" quick-row creates a child via `parent_id`, defaulting
 *    to the plain `task` type, then refreshes;
 *  - the "Blocked by" picker searches org tasks and adds a dependency edge;
 *  - a blocker row's remove calls the deps DELETE;
 *  - read-only callers (no taskId) get none of the affordances.
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
  listMock,
  getMock,
  addDependencyMock,
  removeDependencyMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  getMock: vi.fn(),
  addDependencyMock: vi.fn(),
  removeDependencyMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: {
        ...actual.api.tasks,
        create: createMock,
        list: listMock,
        get: getMock,
        addDependency: addDependencyMock,
        removeDependency: removeDependencyMock,
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { SubtaskPanel } from "@/components/work/subtask-panel";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  createMock.mockResolvedValue({ id: "child1" });
  listMock.mockResolvedValue([]);
  getMock.mockResolvedValue({ id: "dep1", display_id: "IMPL-9", title: "Land the API" });
  addDependencyMock.mockResolvedValue({ depends_on: ["t9"], blocks: [] });
  removeDependencyMock.mockResolvedValue({ depends_on: [], blocks: [] });
});

describe("SubtaskPanel manual breakdown", () => {
  it("renders no affordances for read-only callers", () => {
    render(<SubtaskPanel subtasks={[]} loading={false} />);
    expect(screen.queryByLabelText("New subtask title")).toBeNull();
    expect(screen.queryByText("Blocked by")).toBeNull();
  });

  it("adds a subtask (default type task) via parent_id and refreshes", async () => {
    const onChanged = vi.fn();
    render(
      <SubtaskPanel
        subtasks={[]}
        loading={false}
        taskId="t1"
        dependsOn={[]}
        onChanged={onChanged}
      />,
    );

    fireEvent.change(screen.getByLabelText("New subtask title"), {
      target: { value: "Draft the pricing email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add subtask/i }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        type: "task",
        title: "Draft the pricing email",
        parent_id: "t1",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((screen.getByLabelText("New subtask title") as HTMLInputElement).value).toBe("");
  });

  it("creates with the picked type from the quick-row select", async () => {
    render(
      <SubtaskPanel
        subtasks={[]}
        loading={false}
        taskId="t1"
        dependsOn={[]}
        onChanged={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Subtask type"), {
      target: { value: "bug" },
    });
    fireEvent.change(screen.getByLabelText("New subtask title"), {
      target: { value: "Fix the flake" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add subtask/i }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        type: "bug",
        title: "Fix the flake",
        parent_id: "t1",
      }),
    );
  });

  it("adds a blocker through the search picker", async () => {
    listMock.mockResolvedValue([
      { id: "t9", display_id: "IMPL-9", title: "Land the API" },
      { id: "t1", display_id: "FEAT-1", title: "Myself (excluded)" },
    ]);
    const onChanged = vi.fn();
    render(
      <SubtaskPanel
        subtasks={[]}
        loading={false}
        taskId="t1"
        dependsOn={[]}
        onChanged={onChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add a blocker/i }));
    fireEvent.change(
      await screen.findByLabelText("Search tasks to block on"),
      { target: { value: "api" } },
    );

    // The picker excludes the task itself from the results.
    const row = await screen.findByText("Land the API", undefined, { timeout: 2000 });
    expect(screen.queryByText("Myself (excluded)")).toBeNull();
    fireEvent.click(row);

    await waitFor(() =>
      expect(addDependencyMock).toHaveBeenCalledWith("t1", {
        depends_on_task_id: "t9",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("resolves blocker rows and removes one via the deps endpoint", async () => {
    const onChanged = vi.fn();
    render(
      <SubtaskPanel
        subtasks={[]}
        loading={false}
        taskId="t1"
        dependsOn={["dep1"]}
        onChanged={onChanged}
      />,
    );

    await screen.findByText(/Land the API/);
    fireEvent.click(screen.getByRole("button", { name: /remove blocker/i }));

    await waitFor(() =>
      expect(removeDependencyMock).toHaveBeenCalledWith("t1", {
        depends_on_task_id: "dep1",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
