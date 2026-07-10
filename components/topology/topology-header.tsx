/**
 * TopologyHeader - the SINGLE canonical home for all KG counts.
 *
 * Per ADR-073 §4, counts (nodes, edges, files, LOC, decisions, etc.) live
 * here and nowhere else. No KPI tile at the top of a page, no per-card
 * stat duplication, no header strip echoing the same numbers. If a number
 * needs to appear in the UI, it appears here once.
 *
 * Nightglass: a glass instrument strip - `.glass-chrome` closed by a
 * `.hr-horizon` edge. Stats are separated by star-dots; values stay
 * font-mono tabular-nums so a long list of counts aligns visually.
 */

import { type CSSProperties } from "react";
import { Network } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

interface TopologyMetric {
  label: string;
  value: string | number;
  /** Optional tooltip. */
  title?: string | undefined;
  /** Optional emphasis - renders the value in the primary tone. */
  emphasis?: boolean | undefined;
}

interface TopologyHeaderProps {
  /** Relative timestamp string, e.g. "12m ago" or "Never". */
  lastSync?: string | undefined;
  /** Metric strip. Render order = caller-supplied order. */
  metrics: TopologyMetric[];
  className?: string | undefined;
}

export function TopologyHeader({ lastSync, metrics, className }: TopologyHeaderProps) {
  return (
    <div className={cn("glass-chrome rounded-lg", className)}>
      <Stack gap="2" className="px-3 pt-2.5">
        <Cluster gap="2" align="center">
          <Network className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Topology</span>
          {lastSync && (
            <span className="ml-auto text-micro text-[var(--text-subtle)]">
              last sync {lastSync}
            </span>
          )}
        </Cluster>
        <Cluster gap="3" align="center" className="pb-2.5 text-xs">
          {metrics.map((m, i) => (
            <Cluster key={m.label} gap="3" align="center">
              {i > 0 && (
                <span
                  className="star-dot"
                  style={{ "--dot-color": "var(--constellation)" } as CSSProperties}
                  aria-hidden="true"
                />
              )}
              <span className="inline-flex items-center gap-1.5" title={m.title}>
                <span
                  className={cn(
                    "font-mono tabular-nums font-semibold",
                    m.emphasis ? "text-[var(--primary)]" : "text-[var(--text)]",
                  )}
                >
                  {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
                </span>
                <span className="text-micro uppercase tracking-wider text-[var(--text-subtle)]">
                  {m.label}
                </span>
              </span>
            </Cluster>
          ))}
        </Cluster>
      </Stack>
      <hr className="hr-horizon" aria-hidden="true" />
    </div>
  );
}
