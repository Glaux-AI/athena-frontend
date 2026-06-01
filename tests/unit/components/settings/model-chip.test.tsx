// @vitest-environment jsdom

/**
 * ModelChip test — the model pill that reveals a rich hover/focus tooltip.
 * Pins: the chip always renders the model name + an accessible label carrying
 * the description; the tooltip body (description + pricing + rate limit) is
 * hidden until hover and appears on mouse-enter. Native assertions.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ModelChip } from "@/components/settings/models/model-chip";
import { priceLabel, rateLabel } from "@/lib/models/format";
import type { CatalogModel } from "@/lib/api/client";

const MODEL: CatalogModel = {
  id: "llama-3.3-70b-versatile",
  display_name: "Llama 3.3 70B Versatile",
  description: "Strong general open model on fast Groq hardware.",
  context_window: 131072,
  max_input_tokens: 131072,
  max_output_tokens: 32768,
  input_price: 0.59,
  output_price: 0.79,
  supports_tools: true,
  supports_embeddings: false,
  supports_vision: false,
  rate_limit: { rpm: 1000, tpm: 300000, tokens_per_day: null },
  model_type: "chat",
  thinking_mode: "none",
  thinking: false,
  thinking_optional: false,
  non_thinking_variant: null,
};

afterEach(() => cleanup());

describe("ModelChip", () => {
  it("renders the display name and an aria-label with the description", () => {
    render(<ModelChip model={MODEL} currency="USD" />);
    const chip = screen.getByTestId("model-chip");
    expect(chip.textContent).toContain("Llama 3.3 70B Versatile");
    expect(chip.getAttribute("aria-label")).toContain(MODEL.description);
  });

  it("hides the tooltip body until hover, then shows description + pricing + rate limit", () => {
    render(<ModelChip model={MODEL} currency="USD" />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    // The wrapping span owns the hover handlers.
    fireEvent.mouseEnter(screen.getByTestId("model-chip").parentElement!);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain(MODEL.description);
    expect(tip.textContent).toContain("$0.59/1M in");
    expect(tip.textContent).toContain("1,000 RPM");
  });

  it("shows a Vision badge + image-input aria hint for a multimodal model", () => {
    render(<ModelChip model={{ ...MODEL, supports_vision: true }} currency="USD" />);
    const chip = screen.getByTestId("model-chip");
    expect(chip.getAttribute("aria-label")).toContain("Accepts image input.");
    fireEvent.mouseEnter(chip.parentElement!);
    expect(screen.getByRole("tooltip").textContent?.toLowerCase()).toContain("vision");
  });

  it("omits the Vision badge for a text-only model", () => {
    render(<ModelChip model={MODEL} currency="USD" />);
    const chip = screen.getByTestId("model-chip");
    expect(chip.getAttribute("aria-label")).not.toContain("image input");
    fireEvent.mouseEnter(chip.parentElement!);
    expect(screen.getByRole("tooltip").textContent?.toLowerCase()).not.toContain("vision");
  });
});

describe("model price/rate formatters", () => {
  it("labels prices: null → dash, 0 → Free, else currency rate", () => {
    expect(priceLabel(null)).toBe("—");
    expect(priceLabel(0)).toBe("Free");
    expect(priceLabel(2.5, "USD")).toBe("$2.5/1M");
  });

  it("formats a published rate limit and returns null when none", () => {
    // Grouping is locale-dependent (toLocaleString) — build the expectation
    // the same way so the assertion holds on any test machine's locale.
    const n = (v: number) => v.toLocaleString();
    expect(rateLabel(null)).toBeNull();
    expect(rateLabel({ rpm: 1000, tpm: 300000, tokens_per_day: null })).toBe(
      `${n(1000)} RPM · ${n(300000)} TPM`,
    );
    expect(rateLabel({ rpm: 30, tpm: 60000, tokens_per_day: 1000000 })).toBe(
      `${n(30)} RPM · ${n(60000)} TPM · ${n(1000000)}/day`,
    );
  });
});
