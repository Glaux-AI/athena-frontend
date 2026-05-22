"use client";

/**
 * /cost — month-to-date spend with breakdowns.
 *
 * Sections: KPI cards (spend / forecast / budget util), daily burn bars,
 * per-capability table, per-model table, per-phase split, top tasks, alerts.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, Loader2, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { api, ApiError, type CostSummary } from "@/lib/api/client";
import { cn } from "@/lib/cn";

function formatUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(value < 10000 ? 2 : 1)}k`;
  return `$${value.toFixed(0)}`;
}
function formatUsdPrecise(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function CostPage() {
  const [data, setData] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.cost.summary();
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load cost data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const maxDaily = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.spend_daily.map((d) => d.usd));
  }, [data]);

  if (loading || !data) {
    return (
      <Stack gap="4">
        <Cluster gap="2" align="center">
          {loading && <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />}
          <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
        </Cluster>
        {error && <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>}
      </Stack>
    );
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {data.month} · spend across every Athena run. Budget set in Settings → Organization.
        </p>
      </Stack>

      {data.alerts.length > 0 && (
        <Stack gap="2">
          {data.alerts.map((a, i) => (
            <Card key={i} className={cn("border-l-2 p-3", a.level === "warning" ? "border-l-[var(--warning)] bg-[var(--warning-soft)]" : a.level === "danger" ? "border-l-[var(--danger)] bg-[var(--danger-soft)]" : "border-l-[var(--info)] bg-[var(--info-soft)]")}>
              <Cluster gap="2" align="center">
                {a.level === "info" ? <Info className="size-4 text-[var(--info)]" /> : <AlertTriangle className="size-4 text-[var(--warning)]" />}
                <span className="text-sm">{a.text}</span>
              </Cluster>
            </Card>
          ))}
        </Stack>
      )}

      <Grid cols="auto-fit-200" gap="3">
        <KpiCard label="Spent month-to-date" value={formatUsdPrecise(data.spend_usd)} trend={data.trend} />
        <KpiCard label="Forecast end-of-month" value={formatUsdPrecise(data.forecast_usd)} sub={`vs budget ${formatUsdPrecise(data.budget_usd)}`} />
        <KpiCard label="Budget utilization" value={`${Math.round(data.budget_utilization * 100)}%`} sub={data.budget_utilization > 0.9 ? "Watch closely" : "Healthy"} tone={data.budget_utilization > 0.9 ? "warning" : "neutral"} />
        <KpiCard label="Top cost driver" value={data.spend_by_capability[0]?.name ?? "—"} sub={formatUsdPrecise(data.spend_by_capability[0]?.usd ?? 0)} />
      </Grid>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Daily burn</span>
            <span className="text-xs text-[var(--text-muted)]">22 days · {formatUsdPrecise(data.spend_usd)}</span>
          </Cluster>
          <div className="flex h-32 items-end gap-1 overflow-x-auto" role="img" aria-label="Daily burn chart">
            {data.spend_daily.map((d) => {
              const h = Math.max(4, (d.usd / maxDaily) * 124);
              return (
                <div key={d.day} className="group flex flex-1 min-w-[12px] flex-col items-center gap-1" title={`${d.day}: ${formatUsdPrecise(d.usd)}`}>
                  <div
                    className="w-full rounded-t-sm bg-[var(--primary)] opacity-80 group-hover:opacity-100"
                    style={{ height: `${h}px` }}
                  />
                </div>
              );
            })}
          </div>
          <Cluster justify="between">
            <span className="text-xs text-[var(--text-subtle)]">{data.spend_daily[0]?.day ?? ""}</span>
            <span className="text-xs text-[var(--text-subtle)]">{data.spend_daily[data.spend_daily.length - 1]?.day ?? ""}</span>
          </Cluster>
        </Stack>
      </Card>

      <Grid cols="auto-fit-360" gap="4">
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">By capability</span>
              <span className="text-xs text-[var(--text-muted)]">{data.spend_by_capability.length} capabilities</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {data.spend_by_capability.map((c) => {
                const util = Math.min(1, c.usd / c.budget);
                return (
                  <li key={c.id} className="text-sm">
                    <Cluster justify="between" align="center">
                      <span className="font-medium">{c.name}</span>
                      <Cluster gap="2" align="center">
                        <span className="text-[var(--text-muted)]">{formatUsd(c.usd)} / {formatUsd(c.budget)}</span>
                        <span className={cn("text-xs", c.trend.startsWith("+") ? "text-[var(--warning)]" : "text-[var(--success)]")}>{c.trend}</span>
                      </Cluster>
                    </Cluster>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--surface-2)]">
                      <div
                        className={cn("h-full rounded-full", util > 0.9 ? "bg-[var(--warning)]" : "bg-[var(--primary)]")}
                        style={{ width: `${util * 100}%` }}
                      />
                    </div>
                    <span className="mt-1 block text-xs text-[var(--text-subtle)]">Top task: {c.top_task}</span>
                  </li>
                );
              })}
            </Stack>
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">By model</span>
              <span className="text-xs text-[var(--text-muted)]">Routed via LiteLLM</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {data.spend_by_model.map((m) => (
                <li key={m.id} className="text-sm">
                  <Cluster justify="between" align="center">
                    <Stack gap="0">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{m.provider} · {m.calls.toLocaleString()} calls</span>
                    </Stack>
                    <Cluster gap="2" align="center">
                      <span className="text-[var(--text-muted)]">{formatUsd(m.usd)}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{Math.round(m.pct * 100)}%</span>
                    </Cluster>
                  </Cluster>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${m.pct * 100}%` }} />
                  </div>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      </Grid>

      <Grid cols="auto-fit-360" gap="4">
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">By phase</span>
              <span className="text-xs text-[var(--text-muted)]">Where in the lifecycle spend lands</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {data.spend_by_phase.map((p) => (
                <li key={p.name} className="text-sm">
                  <Cluster justify="between" align="center">
                    <span>{p.name}</span>
                    <Cluster gap="2" align="center">
                      <span className="text-[var(--text-muted)]">{formatUsd(p.usd)}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{Math.round(p.pct * 100)}%</span>
                    </Cluster>
                  </Cluster>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-[var(--info)]" style={{ width: `${p.pct * 100}%` }} />
                  </div>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">Top tasks this month</span>
              <Link href="/runs" className="text-xs font-medium text-[var(--primary)] hover:underline">All tasks <ArrowRight className="inline size-3" /></Link>
            </Cluster>
            <Stack gap="2" as="ul">
              {data.top_tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/runs/${t.id}`} className="flex items-center justify-between gap-2 rounded-md py-1 text-sm hover:bg-[var(--surface-2)]">
                    <span className="line-clamp-1 flex-1">{t.title}</span>
                    <span className="text-[var(--text-muted)]">{formatUsd(t.usd)}</span>
                    <span className="text-xs text-[var(--text-subtle)]">{t.runs} runs</span>
                  </Link>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

function KpiCard({ label, value, sub, trend, tone }: { label: string; value: string; sub?: string; trend?: string; tone?: "warning" | "neutral" }) {
  return (
    <Card>
      <Stack gap="1">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        <Cluster gap="2" align="baseline">
          <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", tone === "warning" && "text-[var(--warning)]")}>{value}</span>
          {trend && (
            <Cluster gap="1" align="center">
              <TrendingUp className="size-3 text-[var(--warning)]" />
              <span className="text-xs font-medium text-[var(--warning)]">{trend}</span>
            </Cluster>
          )}
        </Cluster>
        {sub && <span className="text-xs text-[var(--text-muted)]">{sub}</span>}
      </Stack>
    </Card>
  );
}
