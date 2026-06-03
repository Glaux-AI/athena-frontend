/** Formatting helpers. Tiny, dependency-free. */

/**
 * Format a USD amount.
 *
 * Default shows *up to* 3 decimal places (minimum 2), so ordinary prices
 * still read like money ($50.00) while small per-call/per-message costs keep
 * their precision ($0.002) instead of collapsing to a misleading $0.00.
 * Pass an explicit `fractionDigits` to pin an exact precision (e.g. 4 for a
 * screen-reader label).
 */
export function formatUsd(n: number, fractionDigits?: number): string {
  const opts: Intl.NumberFormatOptions =
    fractionDigits === undefined
      ? { minimumFractionDigits: 2, maximumFractionDigits: 3 }
      : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
  return `$${n.toLocaleString("en-US", opts)}`;
}

/**
 * Exact USD figure for tables / tooltips — up to 3 decimals, no forced
 * minimum (so large aggregates read `$1,250` not `$1,250.00`, while small
 * spend keeps its precision `$0.002`). The single source for the cost
 * surfaces' precise figures.
 */
export function formatUsdPrecise(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}`;
}

/**
 * Compact USD for ≥ $1k headlines (`$2.5k`, `$12.3k`); below $1k it falls
 * back to the precise figure so small spend isn't flattened to a misleading
 * `$0`. Used by the cost dashboard's per-breakdown rows.
 */
export function formatUsdCompact(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n < 10000 ? 2 : 1)}k`;
  return formatUsdPrecise(n);
}

/** Format an integer token count with thousands separators (e.g. 1,234). */
export function formatTokens(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Compact count: 178379 → "178.4k", 2_400_000 → "2.4M", 950 → "950". Used for
 *  token / call headlines and chart axes where exact digits would be noise. */
export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function formatRelativeTime(iso: string | number | Date): string {
  const then = new Date(iso).getTime();
  // Defensive: a non-ISO string (e.g. an already-relative "12m ago" fixture
  // value) parses to NaN — return it verbatim instead of rendering "NaNd ago".
  if (Number.isNaN(then)) return typeof iso === "string" ? iso : "—";
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function formatHmsAgo(receivedMs: number): string {
  const diff = Math.max(0, Date.now() - receivedMs);
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
