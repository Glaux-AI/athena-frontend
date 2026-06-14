// @vitest-environment jsdom

/**
 * AutoApproveToggle - the cockpit's per-task "run straight through" switch.
 *
 * Pins:
 *  - reflects the task's current value (label + aria-pressed);
 *  - clicking it PATCHes the task with the flipped auto_approve and notifies
 *    the parent so it can refetch;
 *  - a failed PATCH reverts the optimistic state (the gate stays manual).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { patchMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  patchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: { ...actual.api, tasks: { ...actual.api.tasks, patch: patchMock } },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { AutoApproveToggle } from "@/components/work/auto-approve-toggle";

describe("AutoApproveToggle", () => {
  beforeEach(() => {
    cleanup();
    patchMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("reflects the off state and turns it on with a PATCH", async () => {
    patchMock.mockResolvedValue({});
    const onChanged = vi.fn();
    render(
      <AutoApproveToggle taskId="t1" enabled={false} onChanged={onChanged} />,
    );

    const btn = screen.getByRole("button", { name: /auto-approve/i });
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(btn);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { auto_approve: true }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects the on state and turns it off", async () => {
    patchMock.mockResolvedValue({});
    render(<AutoApproveToggle taskId="t1" enabled />);

    const btn = screen.getByRole("button", { name: /auto-approve on/i });
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(btn);
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { auto_approve: false }),
    );
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("reverts the optimistic state when the PATCH fails", async () => {
    patchMock.mockRejectedValue(new Error("boom"));
    render(<AutoApproveToggle taskId="t1" enabled={false} />);

    const btn = screen.getByRole("button", { name: /auto-approve/i });
    fireEvent.click(btn);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });
});
