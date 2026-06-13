// @vitest-environment jsdom

/**
 * Design prototype Edit mode (DSGN-1 "edit components by asking AI").
 *
 * Pins the refine affordance wiring: the Edit tab appears only when the card is
 * given an `onRefine` (design artifacts), the refine bar prompts for a change,
 * Apply is gated on a non-empty instruction, and a whole-design refine composes
 * the expected request - instruction + the effort dial (default medium) + the
 * model pick (the picker itself only mounts with >1 enabled models, INT-4).
 * The click-to-select element pick runs inside the sandboxed iframe (a real
 * browser only) and is out of scope here.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { HtmlPreview } from "@/components/work/artifact-card";
import type { EnabledModel, StageRefineInput } from "@/lib/api/client";

// The refine bar mounts the run-config selectors; feed the enabled-models hook
// deterministic data instead of letting it hit the network.
const modelsState = vi.hoisted((): { list: EnabledModel[] } => ({ list: [] }));
vi.mock("@/hooks/use-enabled-models", () => ({
  useEnabledModels: () => ({ models: modelsState.list, isLoading: false, error: null }),
}));

const model = (id: string, display_name: string): EnabledModel => ({
  id,
  provider: "anthropic",
  display_name,
  source: "athena",
  supports_tools: true,
  supports_vision: false,
  thinking: false,
  thinking_optional: false,
  context_window: 200000,
  input_price: null,
  output_price: null,
  model_type: "chat",
  enabled: true,
});

afterEach(() => {
  cleanup();
  modelsState.list = [];
});

const CODE = "<!doctype html><html><body><button>Buy now</button></body></html>";

describe("HtmlPreview edit mode", () => {
  it("hides the Edit tab when the prototype is read-only (no onRefine)", () => {
    render(<HtmlPreview code={CODE} />);
    expect(screen.getByRole("tab", { name: /preview/i })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /edit/i })).toBeNull();
  });

  it("offers Edit + a refine bar, gates Apply on input, and composes the request", () => {
    const onRefine = vi.fn().mockResolvedValue(undefined);
    render(<HtmlPreview code={CODE} onRefine={onRefine} />);

    fireEvent.click(screen.getByRole("tab", { name: /edit/i }));
    expect(screen.getByText(/click any element/i)).toBeTruthy();

    const box = screen.getByPlaceholderText(/describe the change/i);
    const apply = screen.getByRole("button", { name: /apply with ai/i }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true); // empty → disabled

    fireEvent.change(box, { target: { value: "use a teal accent" } });
    expect(apply.disabled).toBe(false);

    fireEvent.click(apply);
    expect(onRefine).toHaveBeenCalledTimes(1);
    const req = onRefine.mock.calls[0]?.[0] as StageRefineInput;
    expect(req.instruction).toContain("Refine the design: use a teal accent");
    expect(req.effort).toBe("medium"); // the dial defaults to medium
    expect(req.model_provider).toBeUndefined(); // no enabled models → server default
  });

  it("mounts the effort dial; the model picker only with >1 enabled models (INT-4)", () => {
    modelsState.list = [model("m-1", "Fable 5")];
    const onRefine = vi.fn().mockResolvedValue(undefined);
    const first = render(<HtmlPreview code={CODE} onRefine={onRefine} />);
    fireEvent.click(screen.getByRole("tab", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /effort:/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /model/i })).toBeNull();
    first.unmount();

    modelsState.list = [model("m-1", "Fable 5"), model("m-2", "Haiku 4.5")];
    render(<HtmlPreview code={CODE} onRefine={onRefine} />);
    fireEvent.click(screen.getByRole("tab", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /^model: fable 5/i })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/describe the change/i), {
      target: { value: "bigger CTA" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply with ai/i }));
    expect(onRefine.mock.calls[0]?.[0]).toMatchObject({
      effort: "medium",
      model_provider: "anthropic",
      model_id: "m-1", // defaults to the first enabled model
    });
  });
});
