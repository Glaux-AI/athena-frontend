// @vitest-environment jsdom

/**
 * AutoApproveToggle - the cockpit's "run straight through" popover.
 *
 * Pins:
 *  - the trigger reflects active state (this-task OR cascade);
 *  - opening the popover and clicking the per-task checkbox PATCHes
 *    `auto_approve` and notifies the parent;
 *  - clicking the cascade checkbox PATCHes `auto_approve_descendants` (the
 *    server propagates onto existing descendants in the same transaction);
 *  - a failed PATCH reverts the optimistic state.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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

  it("reflects off state on the trigger and turns this-task on via the popover", async () => {
    patchMock.mockResolvedValue({});
    const onChanged = vi.fn();
    render(
      <AutoApproveToggle
        taskId="t1"
        enabled={false}
        cascadeEnabled={false}
        onChanged={onChanged}
      />,
    );

    const trigger = screen.getByRole("button", { name: /auto-approve settings/i });
    expect(trigger.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(trigger);

    const selfRow = await screen.findByRole("checkbox", {
      name: /auto-approve this task/i,
    });
    expect(selfRow.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(selfRow);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { auto_approve: true }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("turns the cascade on via the popover", async () => {
    patchMock.mockResolvedValue({});
    render(
      <AutoApproveToggle taskId="t1" enabled={false} cascadeEnabled={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /auto-approve settings/i }));
    const cascadeRow = await screen.findByRole("checkbox", {
      name: /auto-approve all children/i,
    });
    expect(cascadeRow.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(cascadeRow);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", {
        auto_approve_descendants: true,
      }),
    );
  });

  it("turns this-task off when it is already on", async () => {
    patchMock.mockResolvedValue({});
    render(<AutoApproveToggle taskId="t1" enabled cascadeEnabled={false} />);

    const trigger = screen.getByRole("button", { name: /auto-approve settings/i });
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(trigger);

    const selfRow = await screen.findByRole("checkbox", {
      name: /auto-approve this task/i,
    });
    expect(selfRow.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(selfRow);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith("t1", { auto_approve: false }),
    );
  });

  it("reverts the optimistic state when the PATCH fails", async () => {
    patchMock.mockRejectedValue(new Error("boom"));
    render(
      <AutoApproveToggle taskId="t1" enabled={false} cascadeEnabled={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /auto-approve settings/i }));
    const selfRow = await screen.findByRole("checkbox", {
      name: /auto-approve this task/i,
    });
    fireEvent.click(selfRow);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(selfRow.getAttribute("aria-checked")).toBe("false");
  });
});
