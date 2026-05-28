"use client";

/**
 * §5.29.12 r1 — Per-model burn-down line chart on `/cost`.
 *
 * Reads `api.cost.perModelBurndown(orgId, { days })` and renders one
 * SVG polyline per model so a regression in any single model surfaces
 * immediately. Same pure-SVG approach as the daily-burn chart on the
 * same page — no Recharts dep, no new tokens.
 *
 * Window chips: 7 / 30 / 90 days. The chart re-fetches on chip change.
 */

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { api, ApiError, type PerModelBurndown } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

const TONES = [
  "var(--primary)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
];

export function PerModelBurndownChart({ orgId }: { orgId: string }) {
  const [days, setDays] = useState<Window>(30);
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
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load burn-down");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, days]);

  /** Day axis spans the union of all per-model day points. Models with
   *  gaps render as poly-segments — missing days are skipped, not
   *  interpolated. */
  const axis = useMemo(() => {
    if (!data) return [] as string[];
    const seen = new Set<string>();
    for (const m of data.models) for (const p of m.daily) seen.add(p.day);
    return [...seen].sort();
  }, [data]);

  const max = useMemo(() => {
    if (!data) return 1;
    let mx = 0;
    for (const m of data.models) for (const p of m.daily) {
      const v = Number(p.spent_usd);
      if (v > mx) mx = v;
    }
    return mx || 1;
  }, [data]);

  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <span className="text-sm font-semibold">Per-model burn-down</span>
          <Cluster gap="1" align="center">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setDays(w)}
                aria-pressed={days === w}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium",
                  days === w
                    ? "bg-[var(--primary)] text-[var(--on-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                )}
              >
                {w}d
              </button>
            ))}
          </Cluster>
        </Cluster>

        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>
        )}
        {loading && !error && (
          <div
            className="h-32 w-full animate-pulse rounded-md bg-[var(--surface-2)]"
            aria-busy="true"
            aria-label="Loading per-model burn-down"
          />
        )}
        {!loading && !error && data && (
          <PerModelChart data={data} axis={axis} max={max} />
        )}
      </Stack>
    </Card>
  );
}

function PerModelChart({
  data, axis, max,
}: { data: PerModelBurndown; axis: string[]; max: number }) {
  if (axis.length === 0 || data.models.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No spend in this window yet.
      </p>
    );
  }
  const xIndex = new Map(axis.map((d, i) => [d, i]));
  const denom = Math.max(1, axis.length - 1);
  return (
    <div className="space-y-2">
      <div className="relative h-40" role="img" aria-label="Per-model spend by day">
        <svg
          className="size-full"
          viewBox={`0 0 ${denom} 100`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {data.models.map((m, idx) => {
            const tone = TONES[idx % TONES.length];
            const points = m.daily
              .map((p) => {
                const x = xIndex.get(p.day);
                if (x == null) return null;
                const y = 100 - (Number(p.spent_usd) / max) * 100;
                return `${x},${y.toFixed(2)}`;
              })
              .filter((s): s is string => s !== null)
              .join(" ");
            return (
              <polyline
                key={m.model}
                fill="none"
                stroke={tone}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                points={points}
              />
            );
          })}
        </svg>
      </div>
      <Cluster gap="3" align="center">
        {data.models.map((m, idx) => (
          <span
            key={m.model}
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]"
          >
            <span
              className="inline-block h-0.5 w-3"
              style={{ backgroundColor: TONES[idx % TONES.length] }}
              aria-hidden
            />
            {m.model}
          </span>
        ))}
      </Cluster>
      <Cluster justify="between">
        <span className="text-xs text-[var(--text-subtle)]">{data.range_start}</span>
        <span className="text-xs text-[var(--text-subtle)]">{data.range_end}</span>
      </Cluster>
    </div>
  );
}
