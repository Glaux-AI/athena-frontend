/**
 * Starter-template sanity - every curated template must be a real, editable
 * design system seed: token css that parses cleanly through css-model (with a
 * dark story), plus components that reference the tokens via var(--...).
 */

import { describe, expect, it } from "vitest";

import { parseSystemCss } from "@/lib/design/css-model";
import { DESIGN_TEMPLATES, getTemplate } from "@/lib/design/templates";

describe("DESIGN_TEMPLATES", () => {
  it("ships 6 templates with unique ids", () => {
    expect(DESIGN_TEMPLATES).toHaveLength(6);
    const ids = DESIGN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(DESIGN_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s parses into a usable token set",
    (_id, t) => {
      const model = parseSystemCss(t.css);
      // The css is well-formed for the structured editor (not the malformed
      // fallback) and carries a real system's worth of tokens.
      expect(model.tokens.length).toBeGreaterThanOrEqual(8);
      expect(model.extraCss).toBe("");
      // Dark mode is first-class: at least one token has a .dark override.
      expect(model.tokens.some((tok) => tok.dark !== null)).toBe(true);
    },
  );

  it.each(DESIGN_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s ships button/card/input components that reference the tokens",
    (_id, t) => {
      expect(t.components.length).toBeGreaterThanOrEqual(3);
      expect(t.components.length).toBeLessThanOrEqual(5);
      for (const kind of ["button", "card", "input"]) {
        expect(t.components.some((c) => c.name.toLowerCase().includes(kind))).toBe(true);
      }
      for (const c of t.components) {
        expect(c.css ?? "").toContain("var(--");
        expect((c.markup ?? "").length).toBeGreaterThan(0);
      }
    },
  );

  it("getTemplate finds by id and returns undefined for unknown ids", () => {
    expect(getTemplate("editorial-ink")?.name).toBe("Editorial ink");
    expect(getTemplate("nope")).toBeUndefined();
  });
});
