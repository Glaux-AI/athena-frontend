// @vitest-environment jsdom

/**
 * EditModelsSheet unit tests - Task B (per-card "Edit models" editor on
 * /settings/models).
 *
 * Validates:
 *   - prefilled with the provider's current enabled_models (those boxes
 *     are checked, the rest unchecked)
 *   - Save is disabled until the selection changes (no-op guard) and when
 *     the selection is emptied (empty-selection guard)
 *   - toggling a model + Save calls api.modelProviders.patch with the new
 *     enabled_models set, then fires onSaved + onClose
 *   - a patch rejection surfaces a toast.error and leaves the sheet open
 *   - a legacy provider with no catalog entry shows the can't-edit notice
 *
 * Pattern follows the billing suite: spy the api client, mock sonner +
 * the providers catalog import, render the sheet, assert plain DOM.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { EditModelsSheet } from "@/components/settings/models/edit-models-sheet";
import * as client from "@/lib/api/client";
import type { CatalogProvider, ModelProvider } from "@/lib/api/client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";

const patchSpy = vi.spyOn(client.api.modelProviders, "patch");

function model(id: string, display: string): client.CatalogModel {
  return {
    id,
    display_name: display,
    description: `${display} description.`,
    context_window: 131072,
    max_input_tokens: 131072,
    max_output_tokens: 32768,
    input_price: 1,
    output_price: 2,
    supports_tools: true,
    supports_embeddings: false,
    supports_vision: false,
    rate_limit: null,
    model_type: "chat",
    thinking_mode: "none",
    thinking: false,
    thinking_optional: false,
    non_thinking_variant: null,
  };
}

const CATALOG: CatalogProvider = {
  id: "groq",
  display_name: "Groq",
  tier_hint: "free",
  platform_hosted: false,
  requires_openai_compat: false,
  subscription: false,
  pricing_currency: "USD",
  pricing_unit: "per_1m_tokens",
  pricing_notes: "",
  rate_limit_notes: "",
  models: [
    model("llama-3.3-70b-versatile", "Llama 3.3 70B"),
    model("llama-3.1-8b-instant", "Llama 3.1 8B Instant"),
    model("openai/gpt-oss-120b", "GPT-OSS 120B"),
  ],
};

const PROVIDER: ModelProvider = {
  id: "mp_groq_free",
  provider: "groq",
  via: "direct",
  region: "us-east-1",
  status: "enabled",
  enabled_models: ["llama-3.3-70b-versatile"],
  request_count: 0,
  cost_mtd: 0,
  residency_note: "",
  has_api_key: true,
  api_key_last4: "XXXX",
};

afterEach(() => {
  cleanup();
  patchSpy.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
});

function renderSheet(overrides: Partial<React.ComponentProps<typeof EditModelsSheet>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <EditModelsSheet
      open
      orgId="org_test"
      provider={PROVIDER}
      catalogEntry={CATALOG}
      providerDisplayName="Groq"
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return { onClose, onSaved };
}

function checkboxes() {
  return screen.getAllByRole("checkbox") as HTMLInputElement[];
}

describe("EditModelsSheet", () => {
  it("prefills the checkboxes from the provider's enabled_models", async () => {
    renderSheet();
    await screen.findByTestId("edit-models-sheet");
    const boxes = checkboxes();
    expect(boxes).toHaveLength(3);
    // First catalog model is the one currently enabled.
    expect(boxes[0]!.checked).toBe(true);
    expect(boxes[1]!.checked).toBe(false);
    expect(boxes[2]!.checked).toBe(false);
  });

  it("disables Save until the selection changes", async () => {
    renderSheet();
    await screen.findByTestId("edit-models-sheet");
    const save = screen.getByRole("button", { name: /save models/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(checkboxes()[1]!);
    expect(save.disabled).toBe(false);
  });

  it("disables Save + shows a warning when no model is selected", async () => {
    renderSheet();
    await screen.findByTestId("edit-models-sheet");
    // Uncheck the only enabled model → empty selection.
    fireEvent.click(checkboxes()[0]!);
    const save = screen.getByRole("button", { name: /save models/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/select at least one model/i)).not.toBeNull();
  });

  it("patches enabled_models then calls onSaved + onClose on success", async () => {
    patchSpy.mockResolvedValueOnce({ ...PROVIDER, enabled_models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] });
    const { onClose, onSaved } = renderSheet();
    await screen.findByTestId("edit-models-sheet");
    fireEvent.click(checkboxes()[1]!); // add the 8B model
    fireEvent.click(screen.getByRole("button", { name: /save models/i }));
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith("org_test", "mp_groq_free", {
        enabled_models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      });
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("surfaces a toast error and stays open when patch rejects", async () => {
    patchSpy.mockRejectedValueOnce(new client.ApiError(403, "forbidden", "Not allowed."));
    const { onClose } = renderSheet();
    await screen.findByTestId("edit-models-sheet");
    fireEvent.click(checkboxes()[2]!);
    fireEvent.click(screen.getByRole("button", { name: /save models/i }));
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Not allowed.");
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a can't-edit notice for a provider missing from the catalog", async () => {
    renderSheet({ catalogEntry: null });
    await screen.findByTestId("edit-models-sheet");
    expect(screen.getByText(/isn't in the current catalog/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /save models/i })).toBeNull();
  });
});
