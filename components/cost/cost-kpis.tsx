"use client";

/**
 * KPI hero row for /cost — four deliberate stat cards (was an awkward 5-card
 * `auto-fit` wrap). Each headline carries a *direction-aware* period-over-period
 * delta: for spend, a drop is GOOD (success/green) and a rise is a watch-item
 * (warning/amber) — the old page always drew an orange up-arrow regardless,
 * which read as "always getting worse". Sparklines + a budget ring give shape
 * at a glance.
 */

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { formatCompactNumber, formatUsdPrecise } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

export function CostKpis({
  spendUsd,
  compareSpendUsd,
  compareLabel,
  forecastUsd,
  budgetUsd,
  budgetUtil,
  isCurrentPeriod,
  totalTokens,
  compareTokens,
  totalCalls,
  modelCount,
  dailySpend,
  dailyTokens,
}: {
  spendUsd: number;
  compareSpendUsd: number;
  compareLabel: string;
  forecastUsd: number;
  budgetUsd: number;
  budgetUtil: number;
  isCurrentPeriod: boolean;
  totalTokens: number;
  compareTokens: number;
  totalCalls: number;
  modelCount: number;
  dailySpend: number[];
  dailyTokens: number[];
}) {
  const spendDelta = compareSpendUsd > 0 ? (spendUsd - compareSpendUsd) / compareSpendUsd : 0;
  const tokenDelta = compareTokens > 0 ? (totalTokens - compareTokens) / compareTokens : 0;
  const hasBudget = budgetUsd > 0;
  const forecastOver = hasBudget && forecastUsd > budgetUsd;
  const budgetLeft = Math.max(0, budgetUsd - spendUsd);

  return (
    <Grid4>
      {/* 1 · Total spend */}
      <Card variant="elevated" className="p-4 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5">
        <Stack gap="2">
          <Cluster justify="between" align="center">
            <Eyebrow>Total spend</Eyebrow>
            <DeltaChip delta={spendDelta} tone="cost" />
          </Cluster>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--text)]">{formatUsdPrecise(spendUsd)}</span>
          <span className="text-xs text-[var(--text-muted)]">{compareLabel} {formatUsdPrecise(compareSpendUsd)}</span>
          <Sparkline data={dailySpend} color="var(--primary)" />
        </Stack>
      </Card>

      {/* 2 · Forecast / period total */}
      <Card variant="elevated" className="p-4 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5">
        <Stack gap="2">
          <Cluster justify="between" align="center">
            <Eyebrow>{isCurrentPeriod ? "Forecast end of period" : "Period total"}</Eyebrow>
            {hasBudget && (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", forecastOver ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-[var(--success-soft)] text-[var(--success-ink)]")}>
                {forecastOver ? "Over budget" : "On track"}
              </span>
            )}
          </Cluster>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--text)]">{formatUsdPrecise(forecastUsd)}</span>
          <span className="text-xs text-[var(--text-muted)]">{hasBudget ? `vs ${formatUsdPrecise(budgetUsd)} budget` : "No budget set"}</span>
          {hasBudget && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className={cn("h-full rounded-full", forecastOver ? "bg-[var(--warning)]" : "bg-[var(--success)]")} style={{ width: `${Math.min(100, (forecastUsd / budgetUsd) * 100)}%` }} />
            </div>
          )}
        </Stack>
      </Card>

      {/* 3 · Budget used */}
      <Card variant="elevated" className="p-4 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5">
        <Cluster justify="between" align="center" className="h-full gap-3">
          <Stack gap="2" className="min-w-0">
            <Eyebrow>Budget used</Eyebrow>
            <span className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--text)]">
              {hasBudget ? `${Math.round(budgetUtil * 100)}%` : "—"}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {hasBudget ? `${formatUsdPrecise(budgetLeft)} left of ${formatUsdPrecise(budgetUsd)}` : "Set in Settings → Organization"}
            </span>
          </Stack>
          <BudgetRing util={hasBudget ? budgetUtil : 0} active={hasBudget} />
        </Cluster>
      </Card>

      {/* 4 · Usage */}
      <Card variant="elevated" className="p-4 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5">
        <Stack gap="2">
          <Cluster justify="between" align="center">
            <Eyebrow>Usage</Eyebrow>
            <DeltaChip delta={tokenDelta} tone="neutral" />
          </Cluster>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--text)]">{formatCompactNumber(totalTokens)}</span>
          <span className="text-xs text-[var(--text-muted)]">tokens · {totalCalls.toLocaleString()} calls · {modelCount} model{modelCount === 1 ? "" : "s"}</span>
          <Sparkline data={dailyTokens} color="var(--info)" />
        </Stack>
      </Card>
    </Grid4>
  );
}

function Grid4({ children }: { children: React.ReactNode }) {
  // 1-up mobile → 2-up tablet → 4-up desktop. Explicit breakpoints (on the Grid
  // primitive) avoid the lonely 3+1 wrap an `auto-fit` grid produces with
  // exactly four cards.
  return (
    <Grid cols="1" gap="4" className="sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </Grid>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{children}</span>;
}

function DeltaChip({ delta, tone }: { delta: number; tone: "cost" | "neutral" }) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) {
    return <span className="text-xs font-medium text-[var(--text-subtle)]">±0%</span>;
  }
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const color = tone === "neutral" ? "text-[var(--text-muted)]" : up ? "text-[var(--warning)]" : "text-[var(--success)]";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", color)}>
      <Icon className="size-3.5" aria-hidden />
      {Math.abs(Math.round(delta * 100))}%
    </span>
  );
}

/** Tiny area sparkline — no axes, decorative trend shape behind a KPI. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-8" aria-hidden />;
  const max = Math.max(1, ...data);
  const W = 100;
  const Hh = 28;
  const pts = data.map((v, i): [number, number] => [(i / (data.length - 1)) * W, Hh - (v / max) * (Hh - 3) - 1.5]);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `0,${Hh} ${line} ${W},${Hh}`;
  const id = `spark-${color.replace(/[^a-z]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Radial budget gauge — stroke-dasharray progress arc. */
function BudgetRing({ util, active }: { util: number; active: boolean }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, util));
  const over = pct > 0.9;
  const color = !active ? "var(--border-strong)" : over ? "var(--warning)" : "var(--primary)";
  return (
    <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" aria-hidden>
      <circle cx={28} cy={28} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
      {active && (
        <circle
          cx={28}
          cy={28}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset 300ms ease-out" }}
        />
      )}
    </svg>
  );
}
