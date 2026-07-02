// @vitest-environment jsdom

/**
 * TemplateGallery - picking a template (or Blank) seeds a new editor draft via
 * onPick; every curated template renders a card with its live mini preview.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TemplateGallery } from "@/components/design-tokens/template-gallery";
import { DESIGN_TEMPLATES } from "@/lib/design/templates";

afterEach(cleanup);

describe("TemplateGallery", () => {
  it("renders a card per template plus the Blank card", () => {
    render(<TemplateGallery onPick={() => {}} />);
    for (const t of DESIGN_TEMPLATES) {
      expect(screen.getByText(t.name)).toBeTruthy();
      expect(screen.getByTitle(`${t.name} preview`)).toBeTruthy();
    }
    expect(screen.getByText("Blank")).toBeTruthy();
  });

  it("picking a template hands the full template to onPick (seeds the draft)", () => {
    const onPick = vi.fn();
    render(<TemplateGallery onPick={onPick} />);
    const [first] = screen.getAllByRole("button", { name: "Use this template" });
    fireEvent.click(first!);
    expect(onPick).toHaveBeenCalledTimes(1);
    const picked = onPick.mock.calls[0]?.[0] as (typeof DESIGN_TEMPLATES)[number];
    expect(picked).toBe(DESIGN_TEMPLATES[0]);
    expect(picked.css).toContain(":root");
    expect(picked.components.length).toBeGreaterThan(0);
  });

  it("the Blank card picks null", () => {
    const onPick = vi.fn();
    render(<TemplateGallery onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
