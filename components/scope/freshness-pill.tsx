/**
 * FreshnessPill - single canonical home for "how current is the ingestion?"
 *
 * Per ADR-073 §4 (canonical-home rule): this pill is rendered ONLY inside
 * <ScopeHeader>. No card, KPI tile, table cell, or row treatment may render
 * a freshness indicator outside the header. Six states, mapped to colour
 * tokens; the text label is the only thing that varies between states.
 *
 * State derivation (caller's responsibility):
 *   - `fresh`        last_indexed_sha === branch_head_sha
 *   - `indexing`     a sync is currently running
 *   - `stale_minor`  1–10 commits behind, < 7 days since last sync
 *   - `stale_major`  > 10 commits behind OR > 7 days since last sync
 *   - `failed`       last sync ended in error
 *   - `no_data`      this scope was never synced
 */

import { Sparkles, AlertTriangle, XCircle, CircleDashed } from "lucide-react";

import { cn } from "@/lib/cn";

export type FreshnessState =
  | "fresh"
  | "indexing"
  | "stale_minor"
  | "stale_major"
  | "failed"
  | "no_data";

const STATE_STYLE: Record<FreshnessState, { tone: string; label: string; Icon: typeof Sparkles }> = {
  fresh:        { tone: "bg-[var(--success-soft)] text-[var(--success-ink)]", label: "Up to date",   Icon: Sparkles },
  indexing:     { tone: "bg-[var(--info-soft)] text-[var(--info-ink)]",        label: "Indexing…",     Icon: CircleDashed },
  stale_minor:  { tone: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",  label: "Behind",        Icon: AlertTriangle },
  stale_major:  { tone: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",  label: "Behind",        Icon: AlertTriangle },
  failed:       { tone: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",    label: "Sync failed",   Icon: XCircle },
  no_data:      { tone: "bg-[var(--surface-2)] text-[var(--text-subtle)]", label: "Never synced",  Icon: CircleDashed },
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
  const { tone, label, Icon } = STATE_STYLE[state];
  const isAnimated = state === "indexing";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone,
        className,
      )}
      title={title}
      data-freshness={state}
    >
      <Icon className={cn("size-2.5", isAnimated && "animate-spin")} aria-hidden />
      {detail ?? label}
    </span>
  );
}
