// @vitest-environment jsdom

/**
 * StageComposer - the unified chat-style stage action surface. Pins:
 *  - the subtask_plan approve CTA says what approval DOES ("Approve - create
 *    these N tasks"; the countless fallback otherwise); every other stage keeps
 *    "Approve & advance", and the toast stays consequence-explicit;
 *  - approve keeps the reviewer moving (onApproved); request-changes does not;
 *  - the manual editor refuses a malformed subtask_plan body client-side and
 *    submits a valid one; other kinds accept free-form markdown;
 *  - reopen an approved stage only after an explicit confirm;
 *  - the duplication fix: a stage sent back shows the reviewer's note read-only
 *    (NOT pre-filled into the steer box) and a re-run sends NO steer (the
 *    backend already folds the note in via the gate-feedback channel).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { TaskStage } from "@/lib/api/client";

const {
  artifactMock,
  gateStageMock,
  authorArtifactMock,
  submitStageMock,
  reopenStageMock,
  runStageMock,
  contextPreviewMock,
  modelsEnabledMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  artifactMock: vi.fn(),
  gateStageMock: vi.fn(),
  authorArtifactMock: vi.fn(),
  submitStageMock: vi.fn(),
  reopenStageMock: vi.fn(),
  runStageMock: vi.fn(),
  contextPreviewMock: vi.fn(),
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
        reopenStage: reopenStageMock,
        runStage: runStageMock,
        contextPreview: contextPreviewMock,
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

import { StageComposer } from "@/components/work/stage-composer";
import { newRepoFromDiffBody, subtaskPlanItemCount } from "@/lib/work/subtask-plan";

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

function renderComposer(stage: TaskStage) {
  return render(
    <StageComposer taskId="task-1" stage={stage} downstreamCount={0} onChanged={() => {}} />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  modelsEnabledMock.mockResolvedValue([]);
  contextPreviewMock.mockResolvedValue([]);
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
  runStageMock.mockResolvedValue(makeStage({ status: "running" }));
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

describe("StageComposer - subtask_plan approve gate", () => {
  it("labels approve with the parsed task count and keeps the toast consequence-explicit", async () => {
    renderComposer(makeStage());

    const approve = await screen.findByRole("button", {
      name: /Approve - create these 3 tasks/,
    });
    expect(artifactMock).toHaveBeenCalledWith("task-1", "art-1");

    fireEvent.click(approve);
    await waitFor(() => expect(gateStageMock).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Approved - the subtasks are created and on the board.",
    );
  });

  it("falls back to the countless label when the plan body can't be read", async () => {
    artifactMock.mockRejectedValue(new Error("boom"));
    renderComposer(makeStage());

    expect(
      await screen.findByRole("button", { name: /Approve - create the subtasks/ }),
    ).toBeTruthy();
  });

  it("keeps 'Approve & advance' for every other artifact kind", async () => {
    renderComposer(makeStage({ artifact_kind: "spec_doc" }));

    expect(
      await screen.findByRole("button", { name: /Approve & advance/ }),
    ).toBeTruthy();
    expect(artifactMock).not.toHaveBeenCalled();
  });
});

describe("StageComposer - approve keeps the reviewer moving (onApproved)", () => {
  it("approving a mid-task gate says the next stage unlocks and fires onApproved", async () => {
    const onApproved = vi.fn();
    render(
      <StageComposer
        taskId="task-1"
        stage={makeStage({ artifact_kind: "prd" })}
        downstreamCount={2}
        onChanged={() => {}}
        onApproved={onApproved}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Approve & advance/ }));
    await waitFor(() => expect(gateStageMock).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith("Approved - the next stage unlocks.");
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
  });

  it("approving the last phase reports completion and still fires onApproved", async () => {
    const onApproved = vi.fn();
    render(
      <StageComposer
        taskId="task-1"
        stage={makeStage({ artifact_kind: "prd" })}
        downstreamCount={0}
        onChanged={() => {}}
        onApproved={onApproved}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Approve & advance/ }));
    await waitFor(() => expect(gateStageMock).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith("Approved - task complete.");
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
  });

  it("does not fire onApproved when changes are requested", async () => {
    const onApproved = vi.fn();
    render(
      <StageComposer
        taskId="task-1"
        stage={makeStage({ artifact_kind: "prd" })}
        downstreamCount={0}
        onChanged={() => {}}
        onApproved={onApproved}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Request changes/ }));
    await waitFor(() => expect(gateStageMock).toHaveBeenCalledTimes(1));
    expect(onApproved).not.toHaveBeenCalled();
  });
});

describe("StageComposer - sent-back stage (the duplication fix)", () => {
  it("shows the prior request read-only, leaves the steer box empty, and re-runs with no steer", async () => {
    render(
      <StageComposer
        taskId="task-1"
        stage={makeStage({ status: "ready", artifact_kind: "prd", artifact_id: null })}
        downstreamCount={0}
        onChanged={() => {}}
        priorRequest="cap the window at one cycle"
      />,
    );

    // The note is surfaced read-only, never pre-filled into the steer box.
    expect(screen.getByText(/cap the window at one cycle/)).toBeTruthy();
    const steer = (await screen.findByPlaceholderText(/Add anything new/)) as HTMLTextAreaElement;
    expect(steer.value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /Re-run with Athena/ }));
    await waitFor(() => expect(runStageMock).toHaveBeenCalledTimes(1));
    // No steer is re-sent - the backend folds the gate feedback in itself.
    expect(runStageMock.mock.calls[0]?.[2]).not.toHaveProperty("steer");
  });
});

describe("StageComposer - manual subtask_plan validation", () => {
  it("refuses a malformed plan inline and submits nothing", async () => {
    renderComposer(makeStage({ status: "ready", artifact_id: null }));

    fireEvent.click(screen.getByRole("button", { name: /Do it manually/ }));
    fireEvent.change(screen.getByPlaceholderText(/Write the artifact/), {
      target: { value: "not a plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save & submit/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "The plan must be JSON with an items array - each item needs a title.",
    );
    expect(authorArtifactMock).not.toHaveBeenCalled();
    expect(submitStageMock).not.toHaveBeenCalled();
  });

  it("clears the error on edit and submits a valid plan", async () => {
    renderComposer(makeStage({ status: "ready", artifact_id: null }));

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
    renderComposer(
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

describe("StageComposer - reopen an approved stage", () => {
  it("reopens only after an explicit confirm and reports the cascade", async () => {
    reopenStageMock.mockResolvedValue(makeStage({ status: "ready" }));
    render(
      <StageComposer
        taskId="task-1"
        stage={makeStage({ status: "approved", artifact_kind: "spec_doc" })}
        downstreamCount={2}
        onChanged={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Reopen stage/ }));
    expect(
      screen.getByText(/Reopen this stage\? 2 downstream stages re-derive too\./),
    ).toBeTruthy();
    expect(reopenStageMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /Reopen stage/ }).at(-1)!);
    await waitFor(() =>
      expect(reopenStageMock).toHaveBeenCalledWith("task-1", "decompose.plan"),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("Stage reopened"),
    );
  });

  it("cancel closes the confirm without calling the API", () => {
    render(
      <StageComposer
        taskId="task-1"
        stage={makeStage({ status: "approved", artifact_kind: "spec_doc" })}
        downstreamCount={0}
        onChanged={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reopen stage/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(screen.queryByText(/Reopen this stage\?/)).toBeNull();
    expect(reopenStageMock).not.toHaveBeenCalled();
  });
});

describe("newRepoFromDiffBody", () => {
  it("extracts owner/name from the backend's repo-creation banner", () => {
    expect(
      newRepoFromDiffBody(
        "Approving this gate CREATES the private repository acme/new-svc " +
          "on GitHub and opens the PR there.\n\n--- /dev/null\n+++ b/README.md\n",
      ),
    ).toBe("acme/new-svc");
    expect(
      newRepoFromDiffBody(
        "Approving this gate CREATES the PUBLIC repository acme/site on " +
          "GitHub and opens the PR there.",
      ),
    ).toBe("acme/site");
  });

  it("returns null for a plain diff", () => {
    expect(
      newRepoFromDiffBody("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-x\n+y\n"),
    ).toBeNull();
  });
});
