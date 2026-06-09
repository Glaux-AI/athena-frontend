// @vitest-environment jsdom

/**
 * StageActions — consequence-explicit decompose gate + plan-edit validation.
 *
 * Pins:
 *  - the subtask_plan approve CTA says what approval DOES — it creates the
 *    subtasks ("Approve — create these N tasks" once the working plan body
 *    parsed; the countless fallback otherwise) — while every other stage keeps
 *    "Approve & advance";
 *  - the subtask_plan approve toast says the tasks were created and are on the
 *    board;
 *  - the manual editor refuses a malformed subtask_plan body client-side (the
 *    inline error, nothing submitted) and submits a valid one; other kinds
 *    accept free-form markdown unchanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { TaskStage } from "@/lib/api/client";

const {
  artifactMock,
  gateStageMock,
  authorArtifactMock,
  submitStageMock,
  modelsEnabledMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  artifactMock: vi.fn(),
  gateStageMock: vi.fn(),
  authorArtifactMock: vi.fn(),
  submitStageMock: vi.fn(),
  modelsEnabledMock: vi.fn(),
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
      tasks: {
        ...actual.api.tasks,
        artifact: artifactMock,
        gateStage: gateStageMock,
        authorArtifact: authorArtifactMock,
        submitStage: submitStageMock,
      },
      models: {
        ...actual.api.models,
        enabled: modelsEnabledMock,
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import {
  StageActions,
  subtaskPlanItemCount,
} from "@/components/work/stage-actions";

const PLAN = JSON.stringify({
  items: [
    { ref: "t1", type: "feature", title: "Build the API" },
    { ref: "t2", type: "chore", title: "Wire the UI", depends_on: ["t1"] },
    { ref: "t3", type: "bug", title: "Fix the flake" },
  ],
});

function makeStage(overrides: Partial<TaskStage> = {}): TaskStage {
  return {
    stage_key: "decompose.plan",
    title: "Breakdown plan",
    ordinal: 1,
    action: "decompose",
    artifact_kind: "subtask_plan",
    gate: "hard",
    status: "in_review",
    artifact_id: "art-1",
    gate_input_id: null,
    ...overrides,
  };
}

function renderActions(stage: TaskStage) {
  return render(
    <StageActions
      taskId="task-1"
      stage={stage}
      downstreamCount={0}
      onChanged={() => {}}
    />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  modelsEnabledMock.mockResolvedValue([]);
  artifactMock.mockResolvedValue({
    artifact_id: "art-1",
    kind: "subtask_plan",
    version: 1,
    body: PLAN,
    who_kind: "agent",
    created_at: "2026-06-10T00:00:00Z",
  });
  gateStageMock.mockResolvedValue(makeStage({ status: "approved" }));
  authorArtifactMock.mockResolvedValue(makeStage());
  submitStageMock.mockResolvedValue(makeStage());
});

describe("subtaskPlanItemCount", () => {
  it("counts a valid plan's items", () => {
    expect(subtaskPlanItemCount(PLAN)).toBe(3);
  });

  it("rejects non-JSON, missing/empty items, and items without a title", () => {
    expect(subtaskPlanItemCount("not json")).toBeNull();
    expect(subtaskPlanItemCount('{"steps": []}')).toBeNull();
    expect(subtaskPlanItemCount('{"items": []}')).toBeNull();
    expect(subtaskPlanItemCount('{"items": [{"ref": "a", "title": "  "}]}')).toBeNull();
    expect(subtaskPlanItemCount('{"items": ["just a string"]}')).toBeNull();
  });
});

describe("StageActions — subtask_plan approve gate", () => {
  it("labels approve with the parsed task count and keeps the toast consequence-explicit", async () => {
    renderActions(makeStage());

    const approve = await screen.findByRole("button", {
      name: /Approve — create these 3 tasks/,
    });
    expect(artifactMock).toHaveBeenCalledWith("task-1", "art-1");

    fireEvent.click(approve);
    await waitFor(() => expect(gateStageMock).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Approved — the subtasks are created and on the board.",
    );
  });

  it("falls back to the countless label when the plan body can't be read", async () => {
    artifactMock.mockRejectedValue(new Error("boom"));
    renderActions(makeStage());

    expect(
      await screen.findByRole("button", { name: /Approve — create the subtasks/ }),
    ).toBeTruthy();
  });

  it("keeps 'Approve & advance' for every other artifact kind", async () => {
    renderActions(makeStage({ artifact_kind: "spec_doc" }));

    expect(
      await screen.findByRole("button", { name: /Approve & advance/ }),
    ).toBeTruthy();
    expect(artifactMock).not.toHaveBeenCalled();
  });
});

describe("StageActions — manual subtask_plan validation", () => {
  it("refuses a malformed plan inline and submits nothing", async () => {
    renderActions(makeStage({ status: "ready", artifact_id: null }));

    fireEvent.click(screen.getByRole("button", { name: /Do it manually/ }));
    fireEvent.change(screen.getByPlaceholderText(/Write the artifact/), {
      target: { value: "not a plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save & submit/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "The plan must be JSON with an items array — each item needs a title.",
    );
    expect(authorArtifactMock).not.toHaveBeenCalled();
    expect(submitStageMock).not.toHaveBeenCalled();
  });

  it("clears the error on edit and submits a valid plan", async () => {
    renderActions(makeStage({ status: "ready", artifact_id: null }));

    fireEvent.click(screen.getByRole("button", { name: /Do it manually/ }));
    const editor = screen.getByPlaceholderText(/Write the artifact/);
    fireEvent.change(editor, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /Save & submit/ }));
    await screen.findByRole("alert");

    fireEvent.change(editor, { target: { value: PLAN } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Save & submit/ }));
    await waitFor(() => expect(submitStageMock).toHaveBeenCalledTimes(1));
    expect(authorArtifactMock).toHaveBeenCalledWith("task-1", "decompose.plan", {
      body: PLAN,
    });
  });

  it("leaves other kinds' free-form markdown untouched", async () => {
    renderActions(
      makeStage({ status: "ready", artifact_kind: "spec_doc", artifact_id: null }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Do it manually/ }));
    fireEvent.change(screen.getByPlaceholderText(/Write the artifact/), {
      target: { value: "## just markdown, not JSON" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save & submit/ }));

    await waitFor(() => expect(submitStageMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
