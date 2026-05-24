/**
 * Map the backend's IngestionStatus (5 values, defined on the wire by
 * knowledge-architecture.md §6) to the UI's FreshnessState (6 values,
 * defined by ADR-073 §7 / components/scope/freshness-pill).
 *
 * The mapping is lossy on purpose — the UI surfaces user-actionable
 * states ("stale, 5 commits behind") rather than internal pipeline
 * states ("debouncing"). Components that need the raw IngestionStatus
 * for diagnostics can still pass it via `freshnessTitle` for the
 * tooltip.
 */

import type { IngestionStatus } from "@/lib/api/client";
import type { FreshnessState } from "@/components/scope/freshness-pill";

export function ingestionToFreshness(status: IngestionStatus | null | undefined): FreshnessState {
  switch (status) {
    case "fresh":             return "fresh";
    case "ingesting":         return "indexing";
    case "debouncing":        return "indexing";
    case "stale_but_usable":  return "stale_minor";
    case "failed":            return "failed";
    case null:
    case undefined:
      return "no_data";
    default:
      return "no_data";
  }
}

/** Human-facing detail string for the pill. Returns undefined when the
 *  pill should fall back to its default label. */
export function freshnessDetail(args: {
  status: IngestionStatus | null | undefined;
  commitsBehind?: number;
  daysSinceLastSync?: number;
}): string | undefined {
  const { status, commitsBehind, daysSinceLastSync } = args;
  if (status === "stale_but_usable" && commitsBehind !== undefined && commitsBehind > 0) {
    if (daysSinceLastSync !== undefined && daysSinceLastSync > 7) {
      return `${commitsBehind} commits behind · last sync ${daysSinceLastSync}d ago`;
    }
    return `${commitsBehind} commits behind`;
  }
  return undefined;
}
