"use client";

/**
 * "Spend over time" — the /cost primary chart. Replaces the old page's two
 * separate crude bar charts (daily burn + tokens-per-day) with one unified,
 * mode-switchable chart:
 *
 *   - Spend mode: daily-spend bars + a cumulative running-total line overlay.
 *   - Tokens mode: per-day input/output stacked bars.
 *
 * Pure SVG (no chart dep — UX standard §15), but drawn in real pixel coords via
 * `useMeasure` so the axes, gridlines and labels are crisp and undistorted. A
 * custom hover crosshair + tooltip replaces the old native `title=""` tooltips.
 */

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatCompactNumber, formatUsdCompact, formatUsdPrecise } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

import { Segmented } from "./segmented";
import { useMeasure } from "./use-measure";
import { niceMax } from "./chart-math";

export type SpendChartMode = "spend" | "tokens";

export interface DailyPoint {
  day: string;
  usd: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

const H = 248;
const M = { top: 16, right: 18, bottom: 26, left: 52 };

export function SpendChart({
  daily,
  mode,
  onModeChange,
  windowLabel,
}: {
  daily: DailyPoint[];
  mode: SpendChartMode;
  onModeChange: (m: SpendChartMode) => void;
  windowLabel?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(
    () =>
      daily.map((d) => ({
        day: d.day,
        usd: d.usd,
        input: d.prompt_tokens ?? 0,
        output: d.completion_tokens ?? 0,
        tokens: (d.prompt_tokens ?? 0) + (d.completion_tokens ?? 0),
      })),
    [daily],
  );

  const cumulative = useMemo(() => {
    let run = 0;
    return series.map((d) => (run += d.usd));
  }, [series]);

  const totalSpend = cumulative.length ? cumulative[cumulative.length - 1]! : 0;
  const totalTokens = series.reduce((s, d) => s + d.tokens, 0);
  const tokensEmpty = mode === "tokens" && totalTokens === 0;

  const n = series.length;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = H - M.top - M.bottom;
  const step = n > 0 ? innerW / n : 0;
  const barW = Math.max(2, Math.min(26, step * 0.6));
  const cx = (i: number) => M.left + step * (i + 0.5);

  const valueOf = (i: number) => (mode === "spend" ? series[i]!.usd : series[i]!.tokens);
  const yMax = niceMax(Math.max(1, ...series.map((_, i) => valueOf(i))));
  const y = (v: number) => M.top + innerH - (v / yMax) * innerH;
  const cMax = Math.max(1, totalSpend);
  const yc = (v: number) => M.top + innerH - (v / cMax) * innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax);
  const fmtY = (v: number) => (mode === "spend" ? formatUsdCompact(v) : formatCompactNumber(v));

  // X labels: show ~6 evenly-spaced day labels so the axis never crowds.
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const showLabel = (i: number) => i === 0 || i === n - 1 || i % labelEvery === 0;

  const ready = width > 0 && n > 0;
  // Guard the hover index against the *current* series length: switching the
  // global date range can shrink `daily` while a larger hover index is still in
  // state, so a raw `series[hover]` would dereference undefined and crash.
  const hi = hover != null && hover >= 0 && hover < n ? hover : null;

  return (
    <Card className="p-5">
      <Stack gap="4">
        <Cluster justify="between" align="start" className="gap-3">
          <Stack gap="0.5">
            <h2 className="text-lg font-semibold leading-snug">Spend over time</h2>
            <p className="text-sm text-[var(--text-muted)]">
              {windowLabel ? `${windowLabel} · ` : ""}
              {mode === "spend"
                ? `${formatUsdPrecise(totalSpend)} across ${n} day${n === 1 ? "" : "s"}`
                : `${formatCompactNumber(totalTokens)} tokens across ${n} day${n === 1 ? "" : "s"}`}
            </p>
          </Stack>
          <Cluster gap="3" align="center">
            <ChartLegend mode={mode} />
            <Segmented<SpendChartMode>
              ariaLabel="Chart metric"
              value={mode}
              onChange={onModeChange}
              options={[
                { value: "spend", label: "Spend" },
                { value: "tokens", label: "Tokens" },
              ]}
            />
          </Cluster>
        </Cluster>

        {tokensEmpty ? (
          <div className="flex h-[248px] items-center justify-center rounded-md bg-[var(--surface-2)]">
            <p className="text-sm text-[var(--text-muted)]">No token usage recorded in this window.</p>
          </div>
        ) : (
          <div
            ref={ref}
            className="relative"
            style={{ height: H }}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              if (!ready) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const rel = e.clientX - rect.left - M.left;
              const idx = Math.round(rel / step - 0.5);
              setHover(idx >= 0 && idx < n ? idx : null);
            }}
          >
            {ready && (
              <svg
                width={width}
                height={H}
                className="block"
                role="img"
                aria-label={
                  mode === "spend"
                    ? "Daily spend bars with a cumulative running-total overlay line"
                    : "Daily token usage with input and output stacked"
                }
              >
                {/* gridlines + y-axis labels */}
                {ticks.map((t, i) => (
                  <g key={i}>
                    <line
                      x1={M.left}
                      x2={width - M.right}
                      y1={y(t)}
                      y2={y(t)}
                      stroke="var(--border)"
                      strokeWidth={1}
                      strokeDasharray={i === 0 ? undefined : "3 3"}
                    />
                    <text x={M.left - 8} y={y(t) + 3} textAnchor="end" className="fill-[var(--text-subtle)]" fontSize={10}>
                      {fmtY(t)}
                    </text>
                  </g>
                ))}

                {/* bars */}
                {series.map((d, i) => {
                  const active = hi === i;
                  if (mode === "tokens") {
                    const h = innerH - (y(d.tokens) - M.top);
                    const inH = d.tokens > 0 ? (d.input / d.tokens) * h : 0;
                    const top = y(d.tokens);
                    return (
                      <g key={d.day} opacity={hi == null || active ? 1 : 0.45}>
                        <rect x={cx(i) - barW / 2} y={top} width={barW} height={Math.max(0, h - inH)} fill="var(--info)" rx={1.5} />
                        <rect x={cx(i) - barW / 2} y={top + (h - inH)} width={barW} height={Math.max(0, inH)} fill="var(--primary)" rx={1.5} />
                      </g>
                    );
                  }
                  const top = y(d.usd);
                  return (
                    <rect
                      key={d.day}
                      x={cx(i) - barW / 2}
                      y={top}
                      width={barW}
                      height={Math.max(2, M.top + innerH - top)}
                      rx={1.5}
                      fill="var(--primary)"
                      opacity={hi == null || active ? 1 : 0.45}
                    />
                  );
                })}

                {/* cumulative overlay (spend mode) */}
                {mode === "spend" && n > 1 && (
                  <polyline
                    fill="none"
                    stroke="var(--info)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={cumulative.map((c, i) => `${cx(i)},${yc(c)}`).join(" ")}
                  />
                )}

                {/* hover crosshair + markers */}
                {hi != null && (
                  <g pointerEvents="none">
                    <line x1={cx(hi)} x2={cx(hi)} y1={M.top} y2={M.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />
                    {mode === "spend" && (
                      <circle cx={cx(hi)} cy={yc(cumulative[hi]!)} r={3.5} fill="var(--info)" stroke="var(--surface)" strokeWidth={1.5} />
                    )}
                  </g>
                )}

                {/* x-axis labels */}
                {series.map((d, i) =>
                  showLabel(i) ? (
                    <text
                      key={d.day}
                      x={cx(i)}
                      y={H - 8}
                      textAnchor="middle"
                      className={cn("fill-[var(--text-subtle)]", hi === i && "fill-[var(--text)] font-semibold")}
                      fontSize={10}
                    >
                      {d.day}
                    </text>
                  ) : null,
                )}
              </svg>
            )}

            {/* tooltip */}
            {hi != null && ready && (
              <HoverTooltip
                x={cx(hi)}
                containerWidth={width}
                day={series[hi]!.day}
                mode={mode}
                usd={series[hi]!.usd}
                cumulative={cumulative[hi]!}
                input={series[hi]!.input}
                output={series[hi]!.output}
              />
            )}
          </div>
        )}
      </Stack>
    </Card>
  );
}

function ChartLegend({ mode }: { mode: SpendChartMode }) {
  const items =
    mode === "spend"
      ? [
          { c: "var(--primary)", label: "Daily", bar: true },
          { c: "var(--info)", label: "Cumulative", bar: false },
        ]
      : [
          { c: "var(--primary)", label: "Input", bar: true },
          { c: "var(--info)", label: "Output", bar: true },
        ];
  return (
    <Cluster gap="3" align="center" className="hidden sm:flex">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
          {it.bar ? (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: it.c }} aria-hidden />
          ) : (
            <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: it.c }} aria-hidden />
          )}
          {it.label}
        </span>
      ))}
    </Cluster>
  );
}

function HoverTooltip({
  x,
  containerWidth,
  day,
  mode,
  usd,
  cumulative,
  input,
  output,
}: {
  x: number;
  containerWidth: number;
  day: string;
  mode: SpendChartMode;
  usd: number;
  cumulative: number;
  input: number;
  output: number;
}) {
  const W = 168;
  const left = Math.min(Math.max(x - W / 2, 4), containerWidth - W - 4);
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-2)]"
      style={{ left, width: W }}
    >
      <p className="mb-1 text-xs font-semibold text-[var(--text)]">{day}</p>
      {mode === "spend" ? (
        <Stack gap="0.5">
          <Row label="Daily" value={formatUsdPrecise(usd)} dot="var(--primary)" />
          <Row label="Cumulative" value={formatUsdPrecise(cumulative)} dot="var(--info)" />
        </Stack>
      ) : (
        <Stack gap="0.5">
          <Row label="Input" value={formatCompactNumber(input)} dot="var(--primary)" />
          <Row label="Output" value={formatCompactNumber(output)} dot="var(--info)" />
          <Row label="Total" value={formatCompactNumber(input + output)} />
        </Stack>
      )}
    </div>
  );
}

function Row({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
        {dot && <span className="inline-block size-2 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
        {label}
      </span>
      <span className="tabular-nums font-medium text-[var(--text)]">{value}</span>
    </div>
  );
}
