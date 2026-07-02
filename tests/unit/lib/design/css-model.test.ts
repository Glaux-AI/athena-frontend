/**
 * css-model - the structured token view over a design system's css. Pins the
 * safety contract: round-trip stability for well-formed css, the malformed
 * fallback that never destroys user css, verbatim extraCss preservation, and
 * the classification ladder (shadow before color, border-width before space).
 */

import { describe, expect, it } from "vitest";

import {
  classifyToken,
  parseSystemCss,
  serializeSystemCss,
  type EditableToken,
} from "@/lib/design/css-model";

const WELL_FORMED = `:root {
  --color-primary: #31628F;
  --space-4: 1rem;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.dark {
  --color-primary: #9EC5E8;
  --glow-ring: 0 0 12px rgba(158, 197, 232, 0.4);
}

/* component chrome */
.btn { color: var(--color-primary); }

@media (max-width: 600px) {
  .btn { display: none; }
}`;

describe("parseSystemCss", () => {
  it("lifts :root and .dark declarations into tokens and keeps the rest verbatim", () => {
    const model = parseSystemCss(WELL_FORMED);
    expect(model.tokens.map((t) => t.name)).toEqual([
      "--color-primary",
      "--space-4",
      "--shadow-1",
      "--glow-ring",
    ]);
    const primary = model.tokens[0]!;
    expect(primary.light).toBe("#31628F");
    expect(primary.dark).toBe("#9EC5E8");
    expect(primary.group).toBe("color");
    // Dark-only override: empty light, value in dark.
    const glow = model.tokens[3]!;
    expect(glow.light).toBe("");
    expect(glow.dark).toBe("0 0 12px rgba(158, 197, 232, 0.4)");
    // Comments + component rules + media queries survive verbatim.
    expect(model.extraCss).toContain("/* component chrome */");
    expect(model.extraCss).toContain(".btn { color: var(--color-primary); }");
    expect(model.extraCss).toContain("@media (max-width: 600px)");
    expect(model.extraCss).not.toContain(":root");
  });

  it("round-trips: parse(serialize(model)) deep-equals the model", () => {
    const model = parseSystemCss(WELL_FORMED);
    const reparsed = parseSystemCss(serializeSystemCss(model));
    expect(reparsed).toEqual(model);
    // And it is stable on a second pass too.
    expect(parseSystemCss(serializeSystemCss(reparsed))).toEqual(model);
  });

  it("returns { tokens: [], extraCss: css } for unbalanced braces - nothing destroyed", () => {
    const broken = ":root { --a: 1px;";
    expect(parseSystemCss(broken)).toEqual({ tokens: [], extraCss: broken });
  });

  it("treats non-token declarations inside :root as malformed instead of dropping them", () => {
    const mixed = ":root { color: red; --a: 1px; }";
    expect(parseSystemCss(mixed)).toEqual({ tokens: [], extraCss: mixed });
  });

  it("treats duplicate :root blocks as malformed (a merge would change the cascade)", () => {
    const doubled = ":root { --a: 1px; }\n:root { --b: 2px; }";
    expect(parseSystemCss(doubled)).toEqual({ tokens: [], extraCss: doubled });
  });

  it("keeps the LAST duplicate declaration, matching the css cascade", () => {
    const css = ":root { --x: red; --y: 1px; --x: blue; }\n.dark { --x: #111111; --x: #222222; }";
    const model = parseSystemCss(css);
    const x = model.tokens.find((t) => t.name === "--x")!;
    expect(x.light).toBe("blue");
    expect(x.dark).toBe("#222222");
    // Serialize emits ONE declaration per scope, carrying the winning value.
    const out = serializeSystemCss(model);
    expect(out.match(/--x:/g)).toHaveLength(2);
    expect(out).toContain("--x: blue;");
    expect(out).toContain("--x: #222222;");
  });

  it("recognizes :root behind a leading comment and keeps the comment in extraCss", () => {
    const css = "/* Theme */\n:root {\n  --a: 1px;\n}";
    const model = parseSystemCss(css);
    expect(model.tokens).toEqual([{ name: "--a", light: "1px", dark: null, group: "space" }]);
    expect(model.extraCss).toBe("/* Theme */");
    // The comment survives a full round-trip (it re-parses into extraCss).
    expect(parseSystemCss(serializeSystemCss(model))).toEqual(model);
  });

  it("recognizes a comment between :root and .dark and preserves it", () => {
    const css = ":root { --a: 1px; }\n/* mid */\n.dark { --a: 2px; }";
    const model = parseSystemCss(css);
    expect(model.tokens[0]).toMatchObject({ name: "--a", light: "1px", dark: "2px" });
    expect(model.extraCss).toBe("/* mid */");
  });

  it("falls back to the raw css when :root carries a comment - the annotation is never deleted", () => {
    const css = ":root {\n  /* brand */\n  --a: 1px;\n}";
    expect(parseSystemCss(css)).toEqual({ tokens: [], extraCss: css });
    const darkCommented = ":root { --a: 1px; }\n.dark { /* night */ --a: 2px; }";
    expect(parseSystemCss(darkCommented)).toEqual({ tokens: [], extraCss: darkCommented });
  });

  it("handles css with no token blocks at all", () => {
    const componentOnly = ".btn { color: red; }";
    expect(parseSystemCss(componentOnly)).toEqual({ tokens: [], extraCss: componentOnly });
    expect(parseSystemCss("")).toEqual({ tokens: [], extraCss: "" });
  });

  it("does not steal a .dark block nested inside a media query", () => {
    const css = "@media (prefers-color-scheme: dark) {\n  .dark { --x: 1px; }\n}";
    const model = parseSystemCss(css);
    expect(model.tokens).toEqual([]);
    expect(model.extraCss).toBe(css);
  });
});

describe("serializeSystemCss", () => {
  it("emits stable formatting - 2-space indent, one declaration per line", () => {
    const tokens: EditableToken[] = [
      { name: "--a", light: "1px", dark: null, group: "space" },
      { name: "--b", light: "#fff", dark: "#000", group: "color" },
    ];
    expect(serializeSystemCss({ tokens, extraCss: "" })).toBe(
      ":root {\n  --a: 1px;\n  --b: #fff;\n}\n\n.dark {\n  --b: #000;\n}\n",
    );
  });

  it("omits the .dark block when no token has a dark value", () => {
    const tokens: EditableToken[] = [{ name: "--a", light: "1px", dark: null, group: "space" }];
    expect(serializeSystemCss({ tokens, extraCss: "" })).toBe(":root {\n  --a: 1px;\n}\n");
  });

  it("skips tokens whose name or value would break the css", () => {
    const tokens: EditableToken[] = [
      { name: "--", light: "red", dark: null, group: "other" },
      { name: "--ok", light: "", dark: null, group: "other" },
    ];
    expect(serializeSystemCss({ tokens, extraCss: "" })).toBe(":root {\n}\n");
  });

  it("appends extraCss after the token blocks", () => {
    const out = serializeSystemCss({
      tokens: [{ name: "--a", light: "1px", dark: null, group: "space" }],
      extraCss: ".btn { color: red; }",
    });
    expect(out).toBe(":root {\n  --a: 1px;\n}\n\n.btn { color: red; }\n");
  });
});

describe("classifyToken", () => {
  const cases: [string, string, EditableToken["group"]][] = [
    // Shadows win over color - an rgba() inside a multi-part value is a shadow.
    ["--shadow-sm", "0 1px 2px rgba(0, 0, 0, 0.4)", "shadow"],
    ["--elevation-2", "0 2px 8px #00000022", "shadow"],
    // Border widths are border-ish, not space.
    ["--border-width", "1px", "border"],
    ["--border-top-width", "2px", "border"],
    ["--radius-md", "10px", "radius"],
    ["--font-size-lg", "1.25rem", "type"],
    ["--text-base", "1rem", "type"],
    ["--tracking-wide", "0.05em", "type"],
    ["--font-family", "Inter, sans-serif", "type"],
    ["--color-primary", "#31628F", "color"],
    ["--surface", "oklch(96% 0.01 90)", "color"],
    // A color-valued token named "text" is still a color, not typography.
    ["--text", "#262420", "color"],
    ["--space-4", "1rem", "space"],
    ["--gap-x", "12px", "space"],
    ["--z-index", "10", "other"],
  ];
  it.each(cases)("%s: %s -> %s", (name, value, group) => {
    expect(classifyToken(name, value)).toBe(group);
  });
});
