// @vitest-environment jsdom

/**
 * SystemEditor - Duplicate guards a dirty draft. The server copies the
 * last-SAVED row and opening the copy remounts the editor, so an unguarded
 * Duplicate would silently discard unsaved edits. Pins: dirty + cancel
 * aborts, dirty + accept proceeds, clean never prompts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/use-enabled-models", () => ({
  useEnabledModels: () => ({ models: [], isLoading: false, error: null }),
}));

const duplicateSystem = vi.fn();

vi.mock("@/lib/api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      design: {
        ...mod.api.design,
        duplicateSystem: (id: string) => duplicateSystem(id) as Promise<DesignSystemDetail>,
      },
    },
  };
});

import type { DesignSystemDetail } from "@/lib/api/client";
import { SystemEditor } from "@/components/design-tokens/system-editor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  duplicateSystem.mockReset();
});

const DETAIL: DesignSystemDetail = {
  id: "ds_1",
  name: "Base system",
  description: null,
  css: ":root { --a: 1px; }",
  origin: "manual",
  updated_at: "2026-07-01T00:00:00Z",
  domain_ids: [],
  tokens: [],
  components: [],
};

function renderEditor(onSaved = vi.fn()) {
  render(
    <SystemEditor detail={DETAIL} domains={[]} repos={[]} onSaved={onSaved} onDeleted={vi.fn()} />,
  );
  return onSaved;
}

function makeDirty() {
  fireEvent.change(screen.getByLabelText("Design system name"), {
    target: { value: "Base system edited" },
  });
}

// The dirty-draft guard is the shared <ConfirmDialog> (Nightglass replaced
// every window.confirm). The dialog's title + action labels are the contract.
const DISCARD_TITLE = "Discard unsaved changes to this design system?";

describe("SystemEditor duplicate", () => {
  it("asks before discarding a dirty draft and aborts on cancel", async () => {
    renderEditor();
    makeDirty();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    // The ConfirmDialog opens instead of duplicating.
    expect(await screen.findByText(DISCARD_TITLE)).toBeTruthy();
    expect(duplicateSystem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByText(DISCARD_TITLE)).toBeNull());
    expect(duplicateSystem).not.toHaveBeenCalled();
  });

  it("proceeds with the duplicate when the discard is accepted", async () => {
    duplicateSystem.mockResolvedValue({ ...DETAIL, id: "ds_2", name: "Base system (copy)" });
    const onSaved = renderEditor();
    makeDirty();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard and duplicate" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(duplicateSystem).toHaveBeenCalledWith("ds_1");
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ id: "ds_2" });
  });

  it("never prompts when the draft is clean", async () => {
    duplicateSystem.mockResolvedValue({ ...DETAIL, id: "ds_2", name: "Base system (copy)" });
    const onSaved = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    // No dialog ever opened - a clean draft duplicates immediately.
    expect(screen.queryByText(DISCARD_TITLE)).toBeNull();
  });
});
