import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Token-pair WCAG AA guard — the "Color contrast AA on every token pair · CI
 * script" the UX standard promises (§3.2 / §14). Parses `styles/tokens.css`
 * and asserts every solid semantic fill has a foreground token that clears AA
 * (4.5:1 for small text) ON that fill, in BOTH themes. Complements the
 * axe-core `color-contrast` audit that runs on rendered pages in Lighthouse CI.
 *
 * Contrast is computed the way a browser + axe-core resolve it: oklch() →
 * sRGB (rounded to 8-bit) → WCAG relative luminance → (L1+0.05)/(L2+0.05).
 *
 * Guards TWO pair families, both in BOTH themes:
 *   1. solid↔foreground — text/icons on the solid `--X` fill (`text-[--X-fg]`).
 *   2. soft↔ink — text/icons on the `--X-soft` TINT (`text-[--X-ink]`), the
 *      StatusPill / FreshnessPill / status-badge pattern. The mid-saturation
 *      solid `--X` used to be the tint's text and silently failed AA in light
 *      (--warning on --warning-soft was 2.18:1); `--X-ink` replaces it.
 */

const AA_NORMAL = 4.5;

type Oklch = { L: number; C: number; h: number };

function oklchToLinearSrgb({ L, C, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** linear-light sRGB channel → gamma-encoded sRGB in [0, 1]. */
const encode = (c: number): number => {
  const v = clamp01(c);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

function relativeLuminance(color: Oklch): number {
  const rgb = oklchToLinearSrgb(color);
  const toLin = (c: number): number => {
    const e = Math.round(encode(c) * 255) / 255; // resolve to 8-bit, as a browser does
    return e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLin(rgb[0]) + 0.7152 * toLin(rgb[1]) + 0.0722 * toLin(rgb[2]);
}

function contrast(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a) + 0.05;
  const lb = relativeLuminance(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}

/** Parses a single solid `oklch(L% C H)` value; returns null for anything else
 *  (alpha colors, `var(...)`, gradients, shadows). */
function parseOklch(value: string): Oklch | null {
  const m = value.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  return { L: Number(m[1]) / 100, C: Number(m[2]), h: Number(m[3]) };
}

function parseBlock(css: string, selector: RegExp): Record<string, Oklch> {
  const block = css.match(selector);
  if (!block || block[1] === undefined) throw new Error(`tokens.css: ${selector} block not found`);
  const out: Record<string, Oklch> = {};
  for (const decl of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const key = decl[1];
    const value = decl[2];
    if (key === undefined || value === undefined) continue;
    const color = parseOklch(value);
    if (color) out[key] = color;
  }
  return out;
}

const css = readFileSync(fileURLToPath(new URL("../../styles/tokens.css", import.meta.url)), "utf8");

const THEMES: Record<"light" | "dark", Record<string, Oklch>> = {
  light: parseBlock(css, /:root\s*\{([\s\S]*?)\}/),
  dark: parseBlock(css, /\.dark\s*\{([\s\S]*?)\}/),
};

// Solid fill → its required foreground token. Text/icons sit on `bg-[--<name>]`
// with `text-[--<name>-fg]`; every pair must clear AA in both themes.
const FILL_PAIRS = ["primary", "danger", "warning", "success", "info"] as const;

describe("tokens.css — solid-fill foreground pairs pass WCAG AA", () => {
  for (const theme of ["light", "dark"] as const) {
    const tokens = THEMES[theme];
    for (const name of FILL_PAIRS) {
      it(`${theme}: --${name}-fg on --${name} is AA (>= ${AA_NORMAL}:1)`, () => {
        const fill = tokens[name];
        const fg = tokens[`${name}-fg`];
        expect(fill, `--${name} missing in ${theme}`).toBeDefined();
        expect(fg, `--${name}-fg missing in ${theme}`).toBeDefined();
        if (!fill || !fg) return;
        expect(contrast(fill, fg)).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});

// Tinted-fill ink pairs. Badges/pills/alert-cards render small text + icons on
// `bg-[--X-soft]` with `text-[--X-ink]`. `--primary` is intentionally excluded:
// it's tenant-overridable at runtime, so a static on-tint ink can't be
// guaranteed, and primary-soft chips are out of this guard's scope.
const SOFT_INK_PAIRS = ["danger", "warning", "success", "info"] as const;

describe("tokens.css — soft-tint ink pairs pass WCAG AA", () => {
  for (const theme of ["light", "dark"] as const) {
    const tokens = THEMES[theme];
    for (const name of SOFT_INK_PAIRS) {
      it(`${theme}: --${name}-ink on --${name}-soft is AA (>= ${AA_NORMAL}:1)`, () => {
        const soft = tokens[`${name}-soft`];
        const ink = tokens[`${name}-ink`];
        expect(soft, `--${name}-soft missing in ${theme}`).toBeDefined();
        expect(ink, `--${name}-ink missing in ${theme}`).toBeDefined();
        if (!soft || !ink) return;
        expect(contrast(soft, ink)).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});
