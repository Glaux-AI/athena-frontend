"use client";

/**
 * Shared presentational atoms for the rehauled /cost surface. Tokens only for
 * colour (no literals). Categorical colours come from the accent palette.
 *
 * Provenance is a first-class idea here: `Hint` lets every figure declare which
 * real ledger column / derivation it comes from, so the dashboard never reads as
 * fabricated.
 */

import { ArrowDownRight, ArrowUpRight, Info, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { seriesColor } from "@/components/cost/palette";
import { formatUsdCompact, formatUsdPrecise } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]", className)}>{children}</span>;
}

/** Provenance hint - what real column / derivation a figure comes from. */
export function Hint({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} className="inline-flex cursor-help items-center text-[var(--text-subtle)]">
      <Info className="size-3" />
    </span>
  );
}

/** Direction-aware delta. For cost, down = good (success), up = watch (warning). */
export function DeltaPill({ delta, costTone = true }: { delta: number; costTone?: boolean }) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) {
    return <span className="text-xs font-medium tabular-nums text-[var(--text-subtle)]">±0%</span>;
  }
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const color = !costTone ? "text-[var(--text-muted)]" : up ? "text-[var(--warning)]" : "text-[var(--success)]";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", color)}>
      <Icon className="size-3.5" aria-hidden />
      {Math.abs(Math.round(delta * 100))}%
    </span>
  );
}

/** Tiny area sparkline behind a KPI. */
export function Sparkline({ data, color = "var(--primary)", className }: { data: number[]; color?: string | undefined; className?: string }) {
  if (data.length < 2) return <div className={cn("h-8", className)} aria-hidden />;
  const max = Math.max(1, ...data);
  const W = 100, H = 28;
  const pts = data.map((v, i): [number, number] => [(i / (data.length - 1)) * W, H - (v / max) * (H - 3) - 1.5]);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const id = `sp-${color.replace(/[^a-z]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Radial gauge (budget utilization). */
export function Ring({ pct, label, value, tone = "primary", size = 96 }: { pct: number; label?: string; value?: string; tone?: "primary" | "warning" | "danger" | "success"; size?: number }) {
  const r = 40, circ = 2 * Math.PI * r, p = Math.min(1, Math.max(0, pct)), color = `var(--${tone})`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={9} />
        <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} style={{ transition: "stroke-dashoffset 400ms ease-out" }} />
      </svg>
      {(value || label) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {value && <span className="text-base font-semibold tabular-nums text-[var(--text)]">{value}</span>}
          {label && <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>}
        </div>
      )}
    </div>
  );
}

/** Horizontal stacked proportion bar (build vs run, byo vs athena, trust split). */
export function SplitBar({ segments, height = 10 }: { segments: { key: string; label: string; value: number; color: string }[]; height?: number }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  return (
    <Stack gap="2">
      <div className="flex w-full overflow-hidden rounded-full" style={{ height }}>
        {segments.map((s) => (
          <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }} title={`${s.label}: ${formatUsdCompact(s.value)}`} />
        ))}
      </div>
      <Cluster gap="4" className="gap-y-1">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}<span className="font-medium tabular-nums text-[var(--text)]">{Math.round((s.value / total) * 100)}%</span>
          </span>
        ))}
      </Cluster>
    </Stack>
  );
}

/** A ranked, bar-backed list of categorical rows. */
export function RankedList({ rows }: { rows: { key: string; name: string; sub?: string | undefined; usd: number; pct: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.usd));
  return (
    <Stack gap="1" as="ul">
      {rows.map((r, i) => (
        <li key={r.key} className="rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]">
          <Cluster justify="between" align="center" className="gap-2">
            <Cluster gap="2" align="center" className="min-w-0 flex-1">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seriesColor(i) }} aria-hidden />
              <span className="truncate text-sm font-medium text-[var(--text)]">{r.name}</span>
            </Cluster>
            <Cluster gap="2" align="baseline" className="shrink-0">
              <span className="text-sm font-medium tabular-nums text-[var(--text)]">{formatUsdPrecise(r.usd)}</span>
              <span className="w-9 text-right text-xs tabular-nums text-[var(--text-subtle)]">{Math.round(r.pct * 100)}%</span>
            </Cluster>
          </Cluster>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full" style={{ width: `${(r.usd / max) * 100}%`, backgroundColor: seriesColor(i) }} />
          </div>
          {r.sub && <span className="mt-1 block truncate text-xs text-[var(--text-subtle)]">{r.sub}</span>}
        </li>
      ))}
    </Stack>
  );
}

/** Donut whose slices follow the categorical palette; tail folds into "Other". */
export function Donut({ rows, total, size = 168 }: { rows: { key: string; usd: number }[]; total: number; size?: number }) {
  const slices = rows.length <= 7
    ? rows.map((r, i) => ({ ...r, color: seriesColor(i) }))
    : [...rows.slice(0, 6).map((r, i) => ({ ...r, color: seriesColor(i) })), { key: "__other__", usd: rows.slice(6).reduce((s, r) => s + r.usd, 0), color: "var(--text-subtle)" }];
  const cx = 50, cy = 50, r = 38, rInner = 24;
  let acc = 0;
  const arcs = slices.map((s) => {
    const a0 = total > 0 ? (acc / total) * 2 * Math.PI : 0;
    acc += s.usd;
    const a1 = total > 0 ? (acc / total) * 2 * Math.PI : 0;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${(cx + rad * Math.sin(ang)).toFixed(2)} ${(cy - rad * Math.cos(ang)).toFixed(2)}`;
    return { key: s.key, color: s.color, d: `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, rInner)} A ${rInner} ${rInner} 0 ${large} 0 ${p(a0, rInner)} Z` };
  });
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} role="img" aria-label="Spend breakdown donut">
      {arcs.map((a) => <path key={a.key} d={a.d} fill={a.color} stroke="var(--surface)" strokeWidth={0.75} />)}
      <text x={cx} y={cy - 1} textAnchor="middle" className="fill-[var(--text)]" fontSize={11} fontWeight={600}>{formatUsdCompact(total)}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="fill-[var(--text-subtle)]" fontSize={5.5} style={{ letterSpacing: "0.08em" }}>TOTAL</text>
    </svg>
  );
}

/** Column chart of daily spend. */
export function DailyBars({ data, height = 120 }: { data: { day: string; usd: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.usd));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={`${d.day}-${i}`} className="group relative flex-1" title={`${d.day}: ${formatUsdPrecise(d.usd)}`}>
          <div className="w-full rounded-sm transition-opacity hover:opacity-80" style={{ height: `${(d.usd / max) * height}px`, backgroundColor: i >= data.length - 3 ? "var(--acc-amber)" : "var(--primary)" }} />
        </div>
      ))}
    </div>
  );
}

/** KPI tile with optional delta, footnote, and provenance hint. */
export function KpiTile({
  label, value, sub, delta, costTone = true, footnote, source, tone = "neutral", spark, sparkColor,
}: {
  label: string; value: string; sub?: string; delta?: number | undefined; costTone?: boolean;
  footnote?: string; source?: string; tone?: "neutral" | "success" | "warning" | "danger";
  spark?: number[]; sparkColor?: string | undefined;
}) {
  const valueColor = tone === "success" ? "text-[var(--success-ink)]" : tone === "warning" ? "text-[var(--warning-ink)]" : tone === "danger" ? "text-[var(--danger-ink)]" : "text-[var(--text)]";
  return (
    <Card variant="elevated" className="p-4">
      <Stack gap="1.5">
        <Cluster justify="between" align="center">
          <Cluster gap="1" align="center"><Eyebrow>{label}</Eyebrow>{source && <Hint text={source} />}</Cluster>
          {delta != null && <DeltaPill delta={delta} costTone={costTone} />}
        </Cluster>
        <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", valueColor)}>{value}</span>
        {sub && <span className="text-xs text-[var(--text-muted)]">{sub}</span>}
        {spark && <Sparkline data={spark} color={sparkColor} />}
        {footnote && <span className="text-[11px] text-[var(--text-subtle)]">{footnote}</span>}
      </Stack>
    </Card>
  );
}

/** Credit + allowance meter - real credit_ledger fields (BYO excluded from burn). */
export function CreditMeter({
  remaining, allowance, mtdSpend, daysToDepletion, overageEnabled, overageCapUsd, hardCapUsd, tier,
}: {
  remaining: number; allowance: number; mtdSpend: number; daysToDepletion: number | null;
  overageEnabled: boolean; overageCapUsd: number | null; hardCapUsd: number | null; tier: string;
}) {
  const used = Math.min(1, mtdSpend / Math.max(1, allowance));
  const low = daysToDepletion != null && daysToDepletion <= 7;
  return (
    <Card variant="elevated" className="p-5">
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <Cluster gap="2" align="center">
            <h2 className="text-base font-semibold">Credit & allowance</h2>
            <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{tier}</span>
            <Hint text="From credit_ledger. BYO spend is excluded - it never debits Athena credit." />
          </Cluster>
          {daysToDepletion != null && (
            <span className={cn("text-xs font-medium tabular-nums", low ? "text-[var(--warning-ink)]" : "text-[var(--text-muted)]")}>~{daysToDepletion}d to depletion</span>
          )}
        </Cluster>
        <Cluster gap="2" align="end">
          <span className="text-3xl font-semibold tabular-nums text-[var(--text)]">{formatUsdPrecise(remaining)}</span>
          <span className="mb-1 text-xs text-[var(--text-muted)]">credit remaining</span>
        </Cluster>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className={cn("h-full rounded-full", low ? "bg-[var(--warning)]" : "bg-[var(--primary)]")} style={{ width: `${used * 100}%` }} />
        </div>
        <Cluster gap="4" className="gap-y-1 text-xs text-[var(--text-muted)]">
          <span>MTD platform spend <span className="font-medium tabular-nums text-[var(--text)]">{formatUsdPrecise(mtdSpend)}</span></span>
          <span>Monthly allowance <span className="font-medium tabular-nums text-[var(--text)]">${allowance}</span></span>
          <span>Overage <span className="font-medium text-[var(--text)]">{overageEnabled ? `on${overageCapUsd != null ? ` · cap $${overageCapUsd}` : ""}` : "off"}</span></span>
          {hardCapUsd != null && <span>Spend cap <span className="font-medium tabular-nums text-[var(--text)]">{formatUsdCompact(hardCapUsd)}</span></span>}
        </Cluster>
      </Stack>
    </Card>
  );
}

export type Cell = React.ReactNode;
/** Dense data table - the comprehensive list view. */
export function DenseTable({ head, rows, align, empty }: { head: string[]; rows: Cell[][]; align?: ("left" | "right")[]; empty?: string }) {
  const al = (i: number) => (align && align[i] === "right" ? "text-right" : "text-left");
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-[var(--text-muted)]">{empty ?? "Nothing to show in this window."}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-strong)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {head.map((h, i) => <th key={i} className={cn("py-2 pr-3", al(i))}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]">
              {r.map((c, ci) => <td key={ci} className={cn("py-1.5 pr-3 tabular-nums", al(ci), ci === 0 ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dashed note used for permission gates + provenance callouts. */
export function GateNote({ text, icon = "lock" }: { text: string; icon?: "lock" | "info" }) {
  return (
    <Cluster gap="2" align="center" className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2">
      {icon === "lock" ? <Lock className="size-3.5 shrink-0 text-[var(--text-subtle)]" /> : <Info className="size-3.5 shrink-0 text-[var(--text-subtle)]" />}
      <span className="text-xs text-[var(--text-muted)]">{text}</span>
    </Cluster>
  );
}

export function UsedPill({ pct }: { pct: number }) {
  const over = pct >= 0.95, warn = pct >= 0.8;
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", over ? "bg-[var(--danger-soft)] text-[var(--danger-ink)]" : warn ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-[var(--success-soft)] text-[var(--success-ink)]")}>{Math.round(pct * 100)}%</span>;
}
