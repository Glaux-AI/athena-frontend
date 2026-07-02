/**
 * Grouping + fallbacks for the Design Studio's Tier-1 knobs.
 *
 * The knobs offer the ORG's OWN design tokens - derived from their ingested code
 * by the backend (`api.design.tokens`) and passed in as a `DesignTokenSet`. This
 * module does NOT hardcode any brand: it only buckets the fetched tokens into
 * color/space/radius/type and, when a group is missing (or the org has no tokens
 * in code yet), falls back to a NEUTRAL, non-branded scale - never Athena's
 * Observatory palette. Values are concrete literals the sandboxed iframe applies
 * directly; the chosen token name rides along as `data-athena-token-*` provenance.
 */

import type { DesignToken, DesignTokenSet } from "@/lib/api/client";

export interface RampStop {
  label: string;
  /** A direct CSS length the iframe applies as-is (rem/px/0). */
  value: string;
}

/** Neutral, non-branded fallbacks. Generic scales (4px spacing, a plain type
 *  ramp, common radii, grayscale) used ONLY when the org's code yields no token
 *  for that group - so the studio is usable on day one without imposing anyone's
 *  brand. The user can derive from a repo or add their own to replace these. */
export const NEUTRAL_SPACING: RampStop[] = [
  { label: "0", value: "0" },
  { label: "4", value: "0.25rem" },
  { label: "8", value: "0.5rem" },
  { label: "12", value: "0.75rem" },
  { label: "16", value: "1rem" },
  { label: "24", value: "1.5rem" },
  { label: "32", value: "2rem" },
];

export const NEUTRAL_TYPE: RampStop[] = [
  { label: "XS", value: "0.75rem" },
  { label: "S", value: "0.875rem" },
  { label: "Base", value: "1rem" },
  { label: "L", value: "1.25rem" },
  { label: "XL", value: "1.5rem" },
];

export const NEUTRAL_RADII: RampStop[] = [
  { label: "None", value: "0" },
  { label: "SM", value: "0.25rem" },
  { label: "MD", value: "0.5rem" },
  { label: "LG", value: "0.75rem" },
  { label: "Full", value: "9999px" },
];

/** A neutral grayscale starter - deliberately NOT a brand. Shown only when the
 *  org has no color tokens in code, so the knob still works while signaling
 *  "bring your own". */
export const NEUTRAL_STARTER_COLORS: DesignToken[] = [
  { name: "ink", value: "#111827", group: "color", source: "starter" },
  { name: "slate", value: "#475569", group: "color", source: "starter" },
  { name: "muted", value: "#94a3b8", group: "color", source: "starter" },
  { name: "line", value: "#e2e8f0", group: "color", source: "starter" },
  { name: "paper", value: "#ffffff", group: "color", source: "starter" },
  { name: "black", value: "#000000", group: "color", source: "starter" },
];

export interface GroupedTokens {
  colors: DesignToken[];
  spaceStops: RampStop[];
  radiusStops: RampStop[];
  typeStops: RampStop[];
  /** True when colors fell back to the neutral starter (no brand in code). */
  usingStarterColors: boolean;
}

function shortLabel(name: string): string {
  const clean = name.replace(/^--/, "").replace(/[-_]/g, " ").trim();
  return clean.length > 12 ? clean.slice(0, 12) : clean || "token";
}

function stopsFromTokens(tokens: DesignToken[]): RampStop[] {
  return tokens.slice(0, 8).map((t) => ({ label: shortLabel(t.name), value: t.value }));
}

/** Bucket the org's fetched token set for the knobs, with neutral fallbacks. */
export function groupTokens(set: DesignTokenSet | null): GroupedTokens {
  const tokens = set?.tokens ?? [];
  const colors = tokens.filter((t) => t.group === "color");
  const space = stopsFromTokens(tokens.filter((t) => t.group === "space"));
  const radius = stopsFromTokens(tokens.filter((t) => t.group === "radius"));
  const type = stopsFromTokens(tokens.filter((t) => t.group === "font-size"));
  return {
    colors: colors.length > 0 ? colors : NEUTRAL_STARTER_COLORS,
    spaceStops: space.length > 0 ? space : NEUTRAL_SPACING,
    radiusStops: radius.length > 0 ? radius : NEUTRAL_RADII,
    typeStops: type.length > 0 ? type : NEUTRAL_TYPE,
    usingStarterColors: colors.length === 0,
  };
}

/** Serialize an alpha channel the way computed styles do: the shortest decimal
 *  that round-trips to the same 8-bit alpha byte, trailing zeros trimmed (so
 *  authored "0.50", "50%", and hex "80" all land on "0.5"). */
function formatAlpha(alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const byte = Math.round(a * 255);
  for (let digits = 1; digits <= 5; digits++) {
    const candidate = parseFloat((byte / 255).toFixed(digits));
    if (Math.round(candidate * 255) === byte) return String(candidate);
  }
  return String(byte / 255);
}

/** The comma-separated form computed styles serialize to: "rgb(r, g, b)" when
 *  fully opaque, "rgba(r, g, b, a)" (decimal alpha) otherwise. */
function formatRgb(r: number, g: number, b: number, alpha: number): string {
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${formatAlpha(alpha)})`;
}

/** A color-function channel: plain number or percentage (of 255). */
function channelTo255(part: string): number {
  return part.endsWith("%")
    ? Math.round((parseFloat(part) / 100) * 255)
    : Math.round(parseFloat(part));
}

/** Normalize a CSS color for comparison. Computed styles come back as
 *  "rgb(r, g, b)" / "rgba(r, g, b, a)" while tokens are authored as
 *  hex/oklch/keywords, so raw string equality never matches. Hex
 *  (#rgb/#rrggbb) becomes "rgb(r, g, b)"; 4/8-digit hex alpha becomes
 *  "rgba(r, g, b, a)" with a trimmed decimal alpha; "transparent" becomes
 *  "rgba(0, 0, 0, 0)"; rgb()/rgba() - comma, space, and slash syntax alike,
 *  %-alpha included - land on the same comma form; everything lowercases;
 *  oklch (and other functions/keywords) pass through as-is (no color-space
 *  conversion). */
export function normalizeColor(value: string): string {
  const v = (value || "").trim().toLowerCase();
  if (v === "transparent") return "rgba(0, 0, 0, 0)";
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    const h = hex[1] ?? "";
    const full = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return formatRgb(r, g, b, alpha);
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(v);
  if (fn) {
    const parts = (fn[1] ?? "").split(/[\s,/]+/).filter(Boolean);
    const [rp, gp, bp, ap] = parts;
    if (rp === undefined || gp === undefined || bp === undefined || parts.length > 4) return v;
    const r = channelTo255(rp);
    const g = channelTo255(gp);
    const b = channelTo255(bp);
    const alpha = ap === undefined ? 1 : ap.endsWith("%") ? parseFloat(ap) / 100 : parseFloat(ap);
    if ([r, g, b, alpha].some((n) => Number.isNaN(n))) return v;
    return formatRgb(r, g, b, alpha);
  }
  return v;
}

/** Reverse-lookup: the token whose value matches a concrete style string, so the
 *  Inspector can show the token name instead of a raw color. Comparison runs on
 *  normalized forms (computed "rgb()" vs authored hex would never match raw). */
export function matchToken(value: string, colors: DesignToken[]): DesignToken | null {
  const v = normalizeColor(value);
  if (!v) return null;
  return colors.find((c) => normalizeColor(c.value) === v) ?? null;
}
