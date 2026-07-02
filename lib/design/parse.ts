/**
 * Client-side CSS-custom-property parser - mirrors the backend's derivation so
 * the Design tokens editor can render a LIVE preview while the user edits the
 * CSS (before saving, when the server's parsed tokens aren't available yet). The
 * server re-parses on save and stays authoritative.
 */

import type { DesignToken } from "@/lib/api/client";

const VAR_RE = /--([\w-]+)\s*:\s*([^;{}]+?)\s*(?:;|$)/gm;
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb|color)\(/i;
const COLOR_NAME_RE = /colou?r|background|\bbg\b|foreground|\bfg\b|text|border|brand|primary|secondary|accent|surface|ink|fill|stroke|shadow|ring/i;
const LEN_RE = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|pt|ch)$/;

function isLength(value: string): boolean {
  return LEN_RE.test(value.trim());
}

/** Shadow-ish: named shadow, or a multi-length value carrying a color part
 *  (e.g. `0 1px 2px rgba(0,0,0,.4)`). Checked BEFORE color so a shadow's
 *  embedded rgba() never renders as a color swatch. */
function isShadowish(name: string, value: string): boolean {
  const lengths = value.match(/-?\d*\.?\d+(px|rem|em)\b/g) ?? [];
  return name.includes("shadow") || (lengths.length >= 2 && COLOR_RE.test(value));
}

function classify(name: string, value: string): DesignToken["group"] {
  const n = name.toLowerCase();
  // Shadows and border widths have no group of their own in the wire enum -
  // they land in "other" instead of masquerading as color / space.
  if (isShadowish(n, value)) return "other";
  if (n.includes("radius") || n.includes("rounded")) return "radius";
  if ((n.includes("font") && n.includes("size")) || (n.startsWith("--text-") && isLength(value)))
    return "font-size";
  if (/border(-[a-z]+)*-width/.test(n)) return "other";
  if (COLOR_RE.test(value) || (COLOR_NAME_RE.test(n) && !isLength(value))) return "color";
  if (isLength(value)) return "space";
  return "other";
}

export function parseCssTokens(css: string): DesignToken[] {
  const seen = new Map<string, DesignToken>();
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(css)) !== null) {
    const name = `--${m[1]}`;
    const value = (m[2] ?? "").trim();
    if (!value || seen.has(name)) continue;
    seen.set(name, { name, value, group: classify(name, value), source: "draft" });
  }
  return [...seen.values()];
}
