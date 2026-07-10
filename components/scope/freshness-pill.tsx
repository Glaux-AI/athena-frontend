/**
 * FreshnessPill - single canonical home for "how current is the ingestion?"
 *
 * Per ADR-073 §4 (canonical-home rule): this pill is rendered ONLY inside
 * <ScopeHeader>. No card, KPI tile, table cell, or row treatment may render
 * a freshness indicator outside the header. Six states, mapped to <Pill>
 * tones; the text label is the only thing that varies between states. The
 * `indexing` state twinkles its star-dot (the one live treatment).
 *
 * State derivation (caller's responsibility):
 *   - `fresh`        last_indexed_sha === branch_head_sha
 *   - `indexing`     a sync is currently running
 *   - `stale_minor`  1–10 commits behind, < 7 days since last sync
 *   - `stale_major`  > 10 commits behind OR > 7 days since last sync
 *   - `failed`       last sync ended in error
 *   - `no_data`      this scope was never synced
 */

import { Pill, type PillTone } from "@/components/ui/pill";

export type FreshnessState =
  | "fresh"
  | "indexing"
  | "stale_minor"
  | "stale_major"
  | "failed"
  | "no_data";

const STATE_STYLE: Record<FreshnessState, { tone: PillTone; label: string }> = {
  fresh:        { tone: "success", label: "Up to date" },
  indexing:     { tone: "info",    label: "Indexing…" },
  stale_minor:  { tone: "warning", label: "Behind" },
  stale_major:  { tone: "warning", label: "Behind" },
  failed:       { tone: "danger",  label: "Sync failed" },
  no_data:      { tone: "neutral", label: "Never synced" },
};

interface FreshnessPillProps {
  state: FreshnessState;
  /** Optional detail like "5 commits behind" or "last sync 12d ago". Replaces
   * the default label when present. */
  detail?: string;
  /** Optional tooltip shown on hover (e.g. last sync ISO). */
  title?: string;
  className?: string;
}

export function FreshnessPill({ state, detail, title, className }: FreshnessPillProps) {
  const { tone, label } = STATE_STYLE[state];
  return (
    <Pill
      tone={tone}
      size="sm"
      dot
      live={state === "indexing"}
      title={title}
      data-freshness={state}
      className={className}
    >
      {detail ?? label}
    </Pill>
  );
}
