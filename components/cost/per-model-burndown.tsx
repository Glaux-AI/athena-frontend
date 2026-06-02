"use client";

/**
 * "Per-model spend trend" on /cost — one line per model over the selected
 * window, so a regression in any single model surfaces immediately.
 *
 * Redesign notes vs the original §5.29.12 r1 chart:
 *  - Driven by the page's GLOBAL date range (`days`), not its own 7/30/90 chips
 *    — the whole page now shares one time control.
 *  - Real pixel-space axes (gridlines + USD labels + date ends) via `useMeasure`
 *    instead of a bare distorted `viewBox`, plus a hover crosshair/tooltip.
 *  - Categorical accent palette (palette.ts), fixing the old `--on-primary`
 *    token (which doesn't exist in the design system) it referenced.
 */

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type PerModelBurndown } from "@/lib/api/client";
import { formatUsdCompact, formatUsdPrecise } from "@/lib/utils/format";

import { useMeasure } from "./use-measure";
import { niceMax } from "./chart-math";
import { seriesColor } from "./palette";

const H = 220;
const M = { top: 16, right: 18, bottom: 26, left: 52 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function PerModelBurndownChart({ orgId, days }: { orgId: string; days: number }) {
  const [data, setData] = useState<PerModelBurndown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await api.cost.perModelBurndown(orgId, { days });
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load spend trend");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, days]);

  return (
    <Card className="p-5">
      <Stack gap="4">
        <Stack gap="0.5">
          <h2 className="text-lg font-semibold leading-snug">Per-model spend trend</h2>
          <p className="text-sm text-[var(--text-muted)]">Daily spend by model — watch for a single model running away</p>
        </Stack>

        {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
        {loading && !error && <div className="h-[220px] w-full animate-pulse rounded-md bg-[var(--surface-2)]" aria-busy="true" aria-label="Loading per-model spend trend" />}
        {!loading && !error && data && <TrendChart data={data} />}
      </Stack>
    </Card>
  );
}

function TrendChart({ data }: { data: PerModelBurndown }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const axis = useMemo(() => {
    const seen = new Set<string>();
    for (const m of data.models) for (const p of m.daily) seen.add(p.day);
    return [...seen].sort();
  }, [data]);

  const byModel = useMemo(
    () =>
      data.models.map((m) => {
        const map = new Map(m.daily.map((p) => [p.day, Number(p.spent_usd)]));
        return { model: m.model, values: axis.map((d) => map.get(d) ?? null) };
      }),
    [data, axis],
  );

  const max = useMemo(() => niceMax(Math.max(1, ...byModel.flatMap((m) => m.values.map((v) => v ?? 0)))), [byModel]);

  if (axis.length === 0 || data.models.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-muted)]">No spend in this window yet.</p>;
  }

  const n = axis.length;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = H - M.top - M.bottom;
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const y = (v: number) => M.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const ready = width > 0;
  // Guard the hover index against the current axis length — switching the global
  // date range shrinks `axis` while a larger hover index may still be in state.
  const hi = hover != null && hover >= 0 && hover < n ? hover : null;

  return (
    <Stack gap="3">
      <Cluster gap="3" align="center" className="flex-wrap">
        {data.models.map((m, idx) => (
          <span key={m.model} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: seriesColor(idx) }} aria-hidden />
            {m.model}
          </span>
        ))}
      </Cluster>

      <div
        ref={ref}
        className="relative"
        style={{ height: H }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (!ready || n < 1) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = e.clientX - rect.left - M.left;
          const idx = n > 1 ? Math.round((rel / innerW) * (n - 1)) : 0;
          setHover(idx >= 0 && idx < n ? idx : null);
        }}
      >
        {ready && (
          <svg width={width} height={H} className="block" role="img" aria-label="Per-model daily spend lines">
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray={i === 0 ? undefined : "3 3"} />
                <text x={M.left - 8} y={y(t) + 3} textAnchor="end" className="fill-[var(--text-subtle)]" fontSize={10}>
                  {formatUsdCompact(t)}
                </text>
              </g>
            ))}

            {byModel.map((m, idx) => {
              // Skip null gaps — segment across missing days rather than dropping to 0.
              const pts = m.values
                .map((v, i) => (v == null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`))
                .filter((s): s is string => s !== null)
                .join(" ");
              return <polyline key={m.model} fill="none" stroke={seriesColor(idx)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts} opacity={hi == null ? 1 : 0.92} vectorEffect="non-scaling-stroke" />;
            })}

            {hi != null && (
              <g pointerEvents="none">
                <line x1={x(hi)} x2={x(hi)} y1={M.top} y2={M.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />
                {byModel.map((m, idx) => {
                  const v = m.values[hi];
                  return v == null ? null : <circle key={m.model} cx={x(hi)} cy={y(v)} r={3.5} fill={seriesColor(idx)} stroke="var(--surface)" strokeWidth={1.5} />;
                })}
              </g>
            )}

            <text x={M.left} y={H - 8} textAnchor="start" className="fill-[var(--text-subtle)]" fontSize={10}>{fmtISO(axis[0]!)}</text>
            <text x={width - M.right} y={H - 8} textAnchor="end" className="fill-[var(--text-subtle)]" fontSize={10}>{fmtISO(axis[n - 1]!)}</text>
          </svg>
        )}

        {hi != null && ready && (
          <TrendTooltip
            x={x(hi)}
            containerWidth={width}
            day={fmtISO(axis[hi]!)}
            rows={byModel
              .map((m, idx) => ({ model: m.model, value: m.values[hi], color: seriesColor(idx) }))
              .filter((r): r is { model: string; value: number; color: string } => r.value != null)
              .sort((a, b) => b.value - a.value)}
          />
        )}
      </div>
    </Stack>
  );
}

function TrendTooltip({
  x,
  containerWidth,
  day,
  rows,
}: {
  x: number;
  containerWidth: number;
  day: string;
  rows: { model: string; value: number; color: string }[];
}) {
  const W = 196;
  const left = Math.min(Math.max(x - W / 2, 4), containerWidth - W - 4);
  return (
    <div className="pointer-events-none absolute top-1 z-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-2)]" style={{ left, width: W }}>
      <p className="mb-1 text-xs font-semibold text-[var(--text)]">{day}</p>
      <Stack gap="0.5">
        {rows.map((r) => (
          <div key={r.model} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--text-muted)]">
              <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
              <span className="truncate">{r.model}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-[var(--text)]">{formatUsdPrecise(r.value)}</span>
          </div>
        ))}
      </Stack>
    </div>
  );
}
