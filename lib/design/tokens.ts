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

/** Reverse-lookup: the token whose value matches a concrete style string, so the
 *  Inspector can show the token name instead of a raw color. */
export function matchToken(value: string, colors: DesignToken[]): DesignToken | null {
  const v = (value || "").trim();
  if (!v) return null;
  return colors.find((c) => c.value.trim() === v) ?? null;
}
