// @vitest-environment jsdom

/**
 * DeleteRunModal — confirm-before-permanent-delete behavior.
 *
 * Delete is irreversible, so the modal confirms then calls `api.runs.delete`
 * (DELETE /v1/runs/{id}). These tests pin the confirm path, the API-error
 * surface, and the dismissal contract. `api.runs.delete` is spied (not
 * module-mocked) so the real `ApiError` class is preserved for the
 * `instanceof` branch. Plain DOM assertions (no jest-dom), like the siblings.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DeleteRunModal } from "@/components/runs/delete-run-modal";
import { api, ApiError } from "@/lib/api/client";

const RUN_ID = "tsk_delete_test";

function renderModal(overrides: { onClose?: () => void; onDeleted?: () => void } = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onDeleted = overrides.onDeleted ?? vi.fn();
  render(<DeleteRunModal runId={RUN_ID} onClose={onClose} onDeleted={onDeleted} />);
  return { onClose, onDeleted };
}

const confirmBtn = () => screen.getByRole("button", { name: /delete task/i }) as HTMLButtonElement;
const dismissBtn = () => screen.getByRole("button", { name: /keep task/i });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DeleteRunModal", () => {
  it("renders the irreversible-delete prompt", () => {
    renderModal();
    expect(screen.queryByText(/delete this task\?/i)).not.toBeNull();
    expect(screen.queryByText(/can.t be undone/i)).not.toBeNull();
  });

  it("deletes and fires onDeleted", async () => {
    const deleteSpy = vi.spyOn(api.runs, "delete").mockResolvedValue(undefined);
    const { onDeleted } = renderModal();

    fireEvent.click(confirmBtn());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith(RUN_ID);
  });

  it("surfaces an API error inline and does NOT fire onDeleted", async () => {
    vi.spyOn(api.runs, "delete").mockRejectedValue(
      new ApiError(409, "run_active", "Cancel the run before deleting it."),
    );
    const { onDeleted } = renderModal();

    fireEvent.click(confirmBtn());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("Cancel the run before deleting it.");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(confirmBtn().disabled).toBe(false);
  });

  it("dismisses via Keep task without calling the API", () => {
    const deleteSpy = vi.spyOn(api.runs, "delete");
    const { onClose } = renderModal();

    fireEvent.click(dismissBtn());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
