/**
 * Categorical chart palette for /cost breakdowns.
 *
 * Uses the design system's *accent* tokens (§3 tokens.css) — NOT the semantic
 * tokens (success/warning/danger). Categories like "Claude Opus" or the
 * "Billing" domain carry no inherent good/bad meaning, so colouring them
 * green/red (as the old page did, cycling success/warning) was misleading. The
 * accent ramp is perceptually spaced and theme-aware (light + dark).
 */
const CATEGORICAL = [
  "var(--acc-indigo)",
  "var(--acc-cyan)",
  "var(--acc-amber)",
  "var(--acc-mint)",
  "var(--acc-rose)",
  "var(--acc-violet)",
] as const;

export const seriesColor = (i: number): string => CATEGORICAL[i % CATEGORICAL.length]!;
