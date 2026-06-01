// @vitest-environment jsdom

/**
 * CancelRunModal — confirm-before-stop behavior.
 *
 * The modal is the FE half of "properly cancel the task and stop the agent":
 * it confirms intent, then POSTs `api.runs.cancel` (which flips the durable
 * status the worker polls). These tests pin the confirm path (with + without
 * a reason), the API-error surface, and the dismissal contract.
 *
 * The repo does NOT depend on `@testing-library/jest-dom`, so assertions use
 * plain DOM properties (`.disabled`, `.getAttribute`) like the sibling modal
 * tests. `api.runs.cancel` is spied (not module-mocked) so the real `ApiError`
 * class is preserved for the `instanceof` branch.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CancelRunModal } from "@/components/runs/cancel-run-modal";
import { api, ApiError } from "@/lib/api/client";

const RUN_ID = "tsk_cancel_test";

function renderModal(overrides: { onClose?: () => void; onCancelled?: () => void } = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onCancelled = overrides.onCancelled ?? vi.fn();
  render(<CancelRunModal runId={RUN_ID} onClose={onClose} onCancelled={onCancelled} />);
  return { onClose, onCancelled };
}

const confirmBtn = () => screen.getByRole("button", { name: /cancel task/i }) as HTMLButtonElement;
const dismissBtn = () => screen.getByRole("button", { name: /keep running/i });
const reasonBox = () => screen.getByLabelText(/reason/i) as HTMLTextAreaElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CancelRunModal", () => {
  it("renders the confirm prompt and an optional reason field", () => {
    renderModal();
    expect(screen.queryByText(/cancel this task\?/i)).not.toBeNull();
    expect(screen.queryByText(/\(optional\)/i)).not.toBeNull();
    expect(confirmBtn()).not.toBeNull();
    expect(dismissBtn()).not.toBeNull();
  });

  it("cancels with no reason (undefined) and fires onCancelled", async () => {
    const cancelSpy = vi.spyOn(api.runs, "cancel").mockResolvedValue({
      id: RUN_ID, status: "cancelled", cancelled_at: "2026-06-01T00:00:00Z",
    });
    const { onCancelled } = renderModal();

    fireEvent.click(confirmBtn());

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(cancelSpy).toHaveBeenCalledWith(RUN_ID, undefined);
  });

  it("passes a trimmed reason through to the API", async () => {
    const cancelSpy = vi.spyOn(api.runs, "cancel").mockResolvedValue({
      id: RUN_ID, status: "cancelled", cancelled_at: "2026-06-01T00:00:00Z",
    });
    renderModal();

    fireEvent.change(reasonBox(), { target: { value: "  no longer needed  " } });
    fireEvent.click(confirmBtn());

    await waitFor(() => expect(cancelSpy).toHaveBeenCalledTimes(1));
    expect(cancelSpy).toHaveBeenCalledWith(RUN_ID, "no longer needed");
  });

  it("surfaces an API error inline and does NOT fire onCancelled", async () => {
    vi.spyOn(api.runs, "cancel").mockRejectedValue(
      new ApiError(409, "run_terminal", "Run is already terminal."),
    );
    const { onCancelled } = renderModal();

    fireEvent.click(confirmBtn());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("Run is already terminal.");
    expect(onCancelled).not.toHaveBeenCalled();
    // Confirm re-enables so the user can retry.
    expect(confirmBtn().disabled).toBe(false);
  });

  it("dismisses via Keep running without calling the API", () => {
    const cancelSpy = vi.spyOn(api.runs, "cancel");
    const { onClose } = renderModal();

    fireEvent.click(dismissBtn());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables confirm when the reason exceeds the 500-char cap", () => {
    renderModal();
    fireEvent.change(reasonBox(), { target: { value: "x".repeat(501) } });
    expect(confirmBtn().disabled).toBe(true);
    expect(reasonBox().getAttribute("aria-invalid")).toBe("true");
  });
});
