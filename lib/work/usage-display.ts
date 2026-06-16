/**
 * Exact-vs-estimate decision for a task's token usage (ADR-089).
 *
 * External-agent work is only partially observable to Athena. It's EXACT when
 * a coding-agent usage hook reported real transcript counts (`client_measured`);
 * otherwise only the server-metered floor (`measured_mcp_io`) and the agent's
 * own estimate (`self_reported`) exist, so the displayed total is a lower
 * bound. The cockpit keys its honest "exact" vs "estimated (>=)" label on this.
 */

import type { TaskUsage } from "@/lib/api/client";

export interface UsageExactness {
  /** Any non-Athena (external coding-agent) usage is present. */
  hasExternal: boolean;
  /** A coding-agent hook reported EXACT transcript-measured counts. */
  hasExact: boolean;
  /** External usage exists but none of it is exact - the total is a floor. */
  onlyEstimated: boolean;
  /** List-price equivalent of the exact external work (display only, $0 to org). */
  equivalentUsd: number;
}

export function usageExactness(usage: TaskUsage | null): UsageExactness {
  const buckets = usage?.by_source ?? [];
  const hasExternal = buckets.some((b) => b.source !== "internal");
  const hasExact = buckets.some((b) => b.source === "client_measured");
  return {
    hasExternal,
    hasExact,
    onlyEstimated: hasExternal && !hasExact,
    equivalentUsd: usage?.equivalent_usd ?? 0,
  };
}

/**
 * The token count the cockpit shows as the headline. When exact data exists we
 * show ONLY the exact-grade total (`exact_total_tokens`), never the all-bucket
 * `total_tokens` - the floor (`measured_mcp_io`) and estimate (`self_reported`)
 * overlap the exact transcript count, so summing them in would double-count and
 * inflate a number labelled "exact". Without exact data, the all-bucket total
 * is shown as a `>=` lower bound.
 */
export function headlineTokens(usage: TaskUsage | null): number {
  if (!usage) return 0;
  return usageExactness(usage).hasExact
    ? usage.exact_total_tokens
    : usage.total_tokens;
}
