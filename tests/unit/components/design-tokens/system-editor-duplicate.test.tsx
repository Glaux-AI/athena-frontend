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

describe("SystemEditor duplicate", () => {
  it("asks before discarding a dirty draft and aborts on cancel", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor();
    makeDirty();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes to this design system?");
    expect(duplicateSystem).not.toHaveBeenCalled();
  });

  it("proceeds with the duplicate when the discard is accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    duplicateSystem.mockResolvedValue({ ...DETAIL, id: "ds_2", name: "Base system (copy)" });
    const onSaved = renderEditor();
    makeDirty();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(duplicateSystem).toHaveBeenCalledWith("ds_1");
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ id: "ds_2" });
  });

  it("never prompts when the draft is clean", async () => {
    const confirm = vi.spyOn(window, "confirm");
    duplicateSystem.mockResolvedValue({ ...DETAIL, id: "ds_2", name: "Base system (copy)" });
    const onSaved = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });
});
