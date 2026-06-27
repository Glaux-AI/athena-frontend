// @vitest-environment jsdom

/**
 * PR options + "Review & fix PR" actions.
 *
 * Pins:
 *  - the "Review & fix PR" button calls api.tasks.fixPr (the user-driven
 *    iterative PR-fix round) and toasts;
 *  - the PR-options form prefills the default branch as a placeholder and saves
 *    cleaned (blank→null) overrides via setPrOptions;
 *  - once the PR is open the branch input is locked (disabled) with a note,
 *    while title/description stay editable.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { fixPrMock, getPrOptionsMock, setPrOptionsMock, toastSuccessMock, toastErrorMock } =
  vi.hoisted(() => ({
    fixPrMock: vi.fn(),
    getPrOptionsMock: vi.fn(),
    setPrOptionsMock: vi.fn(),
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
        fixPr: fixPrMock,
        getPrOptions: getPrOptionsMock,
        setPrOptions: setPrOptionsMock,
      },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { PrOptionsDisclosure, ReviewFixPrButton } from "@/components/work/pr-options";

const OPEN_OPTS = {
  branch_name: null,
  pr_title: null,
  pr_body: null,
  branch_locked: false,
  opened_branch: null,
  default_branch_name: "athena/task-abc123",
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  getPrOptionsMock.mockResolvedValue(OPEN_OPTS);
  setPrOptionsMock.mockResolvedValue(OPEN_OPTS);
  fixPrMock.mockResolvedValue({ stage_key: "pr_heal", status: "running" });
});

describe("ReviewFixPrButton", () => {
  it("calls fixPr and notifies onStarted", async () => {
    const onStarted = vi.fn();
    render(<ReviewFixPrButton taskId="t1" onStarted={onStarted} />);
    fireEvent.click(screen.getByRole("button", { name: /Review & fix PR/i }));
    await waitFor(() => expect(fixPrMock).toHaveBeenCalledWith("t1", {}));
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});

describe("PrOptionsDisclosure", () => {
  it("opens, prefills the default branch placeholder, and saves cleaned overrides", async () => {
    render(<PrOptionsDisclosure taskId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /Pull request options/i }));

    const branch = (await screen.findByPlaceholderText(
      "athena/task-abc123",
    )) as HTMLInputElement;
    expect(branch.disabled).toBe(false);

    const title = screen.getByPlaceholderText(/composes a title/i);
    fireEvent.change(title, { target: { value: "  My PR  " } });
    fireEvent.click(screen.getByRole("button", { name: /Save PR options/i }));

    await waitFor(() =>
      expect(setPrOptionsMock).toHaveBeenCalledWith("t1", {
        branch_name: null, // left blank → null (use default)
        pr_title: "My PR", // trimmed
        pr_body: null,
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("locks the branch once the PR is open and shows the note", async () => {
    getPrOptionsMock.mockResolvedValue({
      ...OPEN_OPTS,
      branch_locked: true,
      opened_branch: "athena/task-abc123",
    });
    render(<PrOptionsDisclosure taskId="t1" />);
    fireEvent.click(screen.getByRole("button", { name: /Pull request options/i }));

    const branch = (await screen.findByPlaceholderText(
      "athena/task-abc123",
    )) as HTMLInputElement;
    expect(branch.disabled).toBe(true);
    expect(screen.getByText(/the branch\s+is locked/i)).toBeTruthy();
  });
});
