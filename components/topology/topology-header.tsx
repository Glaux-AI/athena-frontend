/**
 * TopologyHeader — the SINGLE canonical home for all KG counts.
 *
 * Per ADR-073 §4, counts (nodes, edges, files, LOC, decisions, etc.) live
 * here and nowhere else. No KPI tile at the top of a page, no per-card
 * stat duplication, no header strip echoing the same numbers. If a number
 * needs to appear in the UI, it appears here once.
 *
 * Layout: title row ("Topology · last sync …") + a horizontal metric strip.
 * Each metric is a small `{value} {label}` pair; values are tabular-nums so
 * a long list of counts aligns visually.
 */

import { Network } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

export interface TopologyMetric {
  label: string;
  value: string | number;
  /** Optional tooltip. */
  title?: string | undefined;
  /** Optional emphasis — renders the value in the primary tone. */
  emphasis?: boolean | undefined;
}

export interface TopologyHeaderProps {
  /** Relative timestamp string, e.g. "12m ago" or "Never". */
  lastSync?: string | undefined;
  /** Metric strip. Render order = caller-supplied order. */
  metrics: TopologyMetric[];
  className?: string | undefined;
}

export function TopologyHeader({ lastSync, metrics, className }: TopologyHeaderProps) {
  return (
    <Stack gap="2" className={cn("border-b border-[var(--border)] pb-3", className)}>
      <Cluster gap="2" align="center">
        <Network className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Topology</span>
        {lastSync && (
          <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
            last sync {lastSync}
          </span>
        )}
      </Cluster>
      <Cluster gap="4" align="center" className="text-xs">
        {metrics.map((m) => (
          <span
            key={m.label}
            className="inline-flex items-center gap-1.5"
            title={m.title}
          >
            <span
              className={cn(
                "tabular-nums font-semibold",
                m.emphasis ? "text-[var(--primary)]" : "text-[var(--text)]",
              )}
            >
              {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
            </span>
            <span className="uppercase tracking-wider text-[10px] text-[var(--text-subtle)]">
              {m.label}
            </span>
          </span>
        ))}
      </Cluster>
    </Stack>
  );
}
