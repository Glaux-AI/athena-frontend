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
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  artifactMock: vi.fn(),
  versionsMock: vi.fn(),
  versionMock: vi.fn(),
  restoreMock: vi.fn(),
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
