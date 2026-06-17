// @vitest-environment jsdom

/**
 * ArtifactCard - the working-version render + the version-history rollback.
 *
 * Pins:
 *  - the working body renders as FORMATTED markdown (heading/list elements,
 *    not raw `#` text) - the "everything shows as raw md" fix;
 *  - Version history offers View on a PAST version only, renders its body in
 *    a clearly-labeled preview, and "Make this the working version" calls the
 *    restore endpoint (append-only rollback) then re-fetches the card.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const {
  artifactMock,
  versionsMock,
  versionMock,
  restoreMock,
  authorArtifactMock,
  submitStageMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  artifactMock: vi.fn(),
  versionsMock: vi.fn(),
  versionMock: vi.fn(),
  restoreMock: vi.fn(),
  authorArtifactMock: vi.fn(),
  submitStageMock: vi.fn(),
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
        artifactVersions: versionsMock,
        artifactVersion: versionMock,
        restoreArtifactVersion: restoreMock,
        authorArtifact: authorArtifactMock,
        submitStage: submitStageMock,
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg />" })) },
}));

import { ArtifactCard } from "@/components/work/artifact-card";

const ver = (version: number) => ({
  version,
  who_kind: "agent",
  who_id: null,
  created_at: "2026-06-10T00:00:00Z",
});

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  artifactMock.mockResolvedValue({
    artifact_id: "a1",
    kind: "spec_doc",
    version: 3,
    body: "## Decisions\n\n- keep tokens\n- ship dark mode",
    who_kind: "agent",
    created_at: "2026-06-10T00:00:00Z",
  });
  versionsMock.mockResolvedValue([ver(1), ver(2), ver(3)]);
  versionMock.mockResolvedValue({
    version: 2,
    body: "## Old decisions\n\n- the earlier cut",
    who_kind: "agent",
    created_at: "2026-06-09T00:00:00Z",
  });
  restoreMock.mockResolvedValue({ stage_key: "spec", status: "ready" });
  authorArtifactMock.mockResolvedValue({ stage_key: "spec", status: "ready" });
  submitStageMock.mockResolvedValue({ stage_key: "spec", status: "in_review" });
});

function renderCard() {
  return render(
    <ArtifactCard
      taskId="t1"
      artifactId="a1"
      artifactKind="spec_doc"
      stageTitle="Spec"
    />,
  );
}

describe("ArtifactCard - body rendering", () => {
  it("renders the working body as formatted markdown, not raw text", async () => {
    const { container } = renderCard();
    const heading = await screen.findByText("Decisions");
    expect(heading.tagName).toBe("H2");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(screen.queryByText(/## Decisions/)).toBeNull();
  });
});

describe("ArtifactCard - inline manual edit", () => {
  it("has no Edit button without a stageKey (read-only card)", async () => {
    renderCard();
    await screen.findByText("Decisions");
    expect(screen.queryByRole("button", { name: /^Edit$/ })).toBeNull();
  });

  it("edits a non-approved deliverable: saves a new version, no re-submit", async () => {
    const onEdited = vi.fn();
    render(
      <ArtifactCard
        taskId="t1"
        artifactId="a1"
        artifactKind="spec_doc"
        stageTitle="Spec"
        stageKey="spec"
        onEdited={onEdited}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Edit$/ }));
    const editor = await screen.findByRole("textbox", { name: /Edit Spec/ });
    fireEvent.change(editor, { target: { value: "## Decisions\n\n- revised" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(authorArtifactMock).toHaveBeenCalledTimes(1));
    expect(authorArtifactMock).toHaveBeenCalledWith("t1", "spec", {
      body: "## Decisions\n\n- revised",
      kind: "spec_doc",
    });
    // A non-approved edit must NOT re-submit (the gate, if any, is already open).
    expect(submitStageMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onEdited).toHaveBeenCalledTimes(1));
  });

  it("edits an approved deliverable: warns about the cascade and re-submits", async () => {
    render(
      <ArtifactCard
        taskId="t1"
        artifactId="a1"
        artifactKind="spec_doc"
        stageTitle="Spec"
        stageKey="spec"
        approved
        downstreamCount={2}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Edit$/ }));
    expect(screen.getByText(/re-derives 2 downstream stages/)).toBeTruthy();
    fireEvent.change(await screen.findByRole("textbox", { name: /Edit Spec/ }), {
      target: { value: "## Decisions\n\n- changed my mind" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(authorArtifactMock).toHaveBeenCalledTimes(1));
    // An approved edit reopens the stage server-side - re-submit to re-gate it.
    await waitFor(() => expect(submitStageMock).toHaveBeenCalledWith("t1", "spec"));
  });

  it("blocks an empty edit and a malformed subtask_plan, submitting nothing", async () => {
    render(
      <ArtifactCard
        taskId="t1"
        artifactId="a1"
        artifactKind="subtask_plan"
        stageTitle="Breakdown"
        stageKey="decompose.plan"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Edit$/ }));
    const editor = await screen.findByRole("textbox", { name: /Edit Breakdown/ });
    fireEvent.change(editor, { target: { value: "not a plan" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The plan must be JSON with an items array");
    expect(authorArtifactMock).not.toHaveBeenCalled();
  });
});

describe("ArtifactCard - structured subtask_plan edit", () => {
  it("edits a valid plan with the structured editor and saves serialized JSON", async () => {
    // A valid plan body opens the structured editor (not the raw textarea).
    artifactMock.mockResolvedValue({
      artifact_id: "a1",
      kind: "subtask_plan",
      version: 1,
      body: JSON.stringify({
        items: [{ ref: "a", type: "implementation", title: "Build it", depends_on: [] }],
      }),
      who_kind: "agent",
      created_at: "2026-06-10T00:00:00Z",
    });
    render(
      <ArtifactCard
        taskId="t1"
        artifactId="a1"
        artifactKind="subtask_plan"
        stageTitle="Breakdown"
        stageKey="decompose.plan"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^Edit$/ }));
    const title = (await screen.findByLabelText("Task title")) as HTMLInputElement;
    expect(title.value).toBe("Build it");
    fireEvent.change(title, { target: { value: "Build it well" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(authorArtifactMock).toHaveBeenCalledTimes(1));
    const [taskArg, stageArg, payload] = authorArtifactMock.mock.calls[0]! as [
      string,
      string,
      { body: string; kind?: string },
    ];
    expect(taskArg).toBe("t1");
    expect(stageArg).toBe("decompose.plan");
    const parsed = JSON.parse(payload.body);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].title).toBe("Build it well");
    // A non-approved plan edit must not re-submit the stage.
    expect(submitStageMock).not.toHaveBeenCalled();
  });
});

describe("ArtifactCard - version history rollback", () => {
  it("views a past version and restores it as the working version", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /version history/i }));

    // The working version (v3) carries no View; v2 and v1 do.
    const viewButtons = await screen.findAllByRole("button", { name: "View" });
    expect(viewButtons).toHaveLength(2);
    expect(screen.getByText(/working - what Athena uses/i)).toBeTruthy();

    fireEvent.click(viewButtons[0]!); // newest old version = v2
    await waitFor(() => expect(versionMock).toHaveBeenCalledWith("t1", "a1", 2));
    const preview = await screen.findByTestId("version-preview");
    expect(preview.textContent).toContain("Viewing v2");
    expect(preview.textContent).toContain("not the working version");
    expect(screen.getByText("Old decisions").tagName).toBe("H2");

    fireEvent.click(
      screen.getByRole("button", { name: /make this the working version/i }),
    );
    await waitFor(() => expect(restoreMock).toHaveBeenCalledWith("t1", "a1", 2));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("v2 is the working version again"),
    );
    // The card re-fetches the (new) working version after the rollback.
    await waitFor(() => expect(artifactMock).toHaveBeenCalledTimes(2));
  });

  it("surfaces a restore failure as an error toast and keeps the preview", async () => {
    restoreMock.mockRejectedValue(new Error("boom"));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /version history/i }));
    fireEvent.click((await screen.findAllByRole("button", { name: "View" }))[0]!);
    await screen.findByTestId("version-preview");

    fireEvent.click(
      screen.getByRole("button", { name: /make this the working version/i }),
    );
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(screen.getByTestId("version-preview")).toBeTruthy();
  });
});
