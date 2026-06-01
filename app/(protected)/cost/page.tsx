"use client";

/**
 * /cost — month-to-date spend with breakdowns.
 *
 * Sections: KPI cards (spend / forecast / budget util), daily burn bars,
 * per-capability table, per-model table, per-phase split, top tasks, alerts.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowRight, Info, KeyRound, Loader2, TrendingUp, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { api, ApiError, type CostSummary, type CostBillingSource } from "@/lib/api/client";
import { cn } from "@/lib/cn";
// Cost USD figures come from the shared formatters (same source the run-page
// `<CostPill>` uses) so a given amount renders identically across surfaces:
// `formatUsdCompact` for the ≥$1k-aware breakdown rows, `formatUsdPrecise`
// for exact KPI / table / tooltip figures.
import { formatUsdCompact, formatUsdPrecise } from "@/lib/utils/format";
import { PerModelBurndownChart } from "@/components/cost/per-model-burndown";
import { BillingSourceToggle } from "@/components/cost/billing-source-toggle";

/** Compact token / call counts: 178379 → "178.4k", 2_400_000 → "2.4M". */
function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

/**
 * `CostSummary` fields are optional at the type layer so mock mode and
 * compat callers can omit any of them. The BE (`athena/billing/cost_summary.py`)
 * returns the full shape today; normalize into a guaranteed-shape view so
 * every read site below stays total — absent fields fall back to 0 / [] and
 * render the same empty states the loading branch already produces.
 */
type CostView = Required<CostSummary>;

function normalizeCostSummary(raw: CostSummary): CostView {
  return {
    month: raw.month ?? "",
    source: raw.source ?? "all",
    spend_usd: raw.spend_usd ?? 0,
    forecast_usd: raw.forecast_usd ?? 0,
    budget_usd: raw.budget_usd ?? 0,
    budget_utilization: raw.budget_utilization ?? 0,
    trend: raw.trend ?? "",
    total_prompt_tokens: raw.total_prompt_tokens ?? 0,
    total_completion_tokens: raw.total_completion_tokens ?? 0,
    total_cached_tokens: raw.total_cached_tokens ?? 0,
    total_calls: raw.total_calls ?? 0,
    spend_daily: raw.spend_daily ?? [],
    spend_by_capability: raw.spend_by_capability ?? [],
    spend_by_model: raw.spend_by_model ?? [],
    spend_by_provider: raw.spend_by_provider ?? [],
    spend_by_key: raw.spend_by_key ?? [],
    spend_by_role: raw.spend_by_role ?? [],
    spend_by_phase: raw.spend_by_phase ?? [],
    top_tasks: raw.top_tasks ?? [],
    alerts: raw.alerts ?? [],
  };
}

export default function CostPage() {
  const [data, setData] = useState<CostView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Billing-source toggle: all / byo ("Your keys") / athena ("Athena credits").
  const [source, setSource] = useState<CostBillingSource>("all");
  // True while re-fetching after a toggle switch — keeps the prior data on
  // screen (dimmed) instead of dropping to the full skeleton each switch.
  const [refreshing, setRefreshing] = useState(false);
  // §5.29.12 — "Set budget" modal state. `null` when closed; otherwise carries
  // the capability row being edited.
  const [budgetTarget, setBudgetTarget] = useState<{ id: string; name: string; current: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    (async () => {
      try {
        const result = await api.cost.summary({ source });
        if (!cancelled) {
          setData(normalizeCostSummary(result));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load cost data");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  const maxDaily = useMemo(() => {
    if (!data || data.spend_daily.length === 0) return 1;
    return Math.max(...data.spend_daily.map((d) => d.usd));
  }, [data]);

  /** §5.29.12 — cumulative running total per day (anchor of the MTD line overlay). */
  const cumulative = useMemo(() => {
    if (!data) return [] as { day: string; cumulative: number }[];
    let running = 0;
    return data.spend_daily.map((d) => {
      running += d.usd;
      return { day: d.day, cumulative: running };
    });
  }, [data]);
  const cumulativeMax = cumulative.length ? cumulative[cumulative.length - 1]!.cumulative : 1;

  /** Per-day token usage (input + output). Populated even when spend is $0
   *  — e.g. a model LiteLLM has no price for still reports token counts. */
  const tokenDaily = useMemo(
    () =>
      (data?.spend_daily ?? []).map((d) => ({
        day: d.day,
        input: d.prompt_tokens ?? 0,
        output: d.completion_tokens ?? 0,
      })),
    [data],
  );
  const maxTokens = useMemo(
    () => Math.max(1, ...tokenDaily.map((d) => d.input + d.output)),
    [tokenDaily],
  );

  if (loading || !data) {
    if (error) {
      return (
        <Stack gap="4">
          <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
          <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>
        </Stack>
      );
    }
    return (
      <Stack gap="6" aria-busy="true" aria-label="Loading cost summary">
        <Stack gap="1">
          <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
        <Grid cols="auto-fit-200" gap="3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
          ))}
        </Grid>
        <Card>
          <Stack gap="3">
            <div className="h-4 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-32 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
          </Stack>
        </Card>
        <Grid cols="auto-fit-360" gap="4">
          <div className="h-56 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-56 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Grid>
      </Stack>
    );
  }

  const sourceBlurb: Record<CostBillingSource, string> = {
    all: "all spend, both your keys and Athena credits",
    byo: "spend billed to your own provider keys",
    athena: "spend billed to your Athena credits",
  };

  return (
    <Stack gap="6">
      <Cluster justify="between" align="end" className="flex-wrap gap-3">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Cost</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {data.month} · {sourceBlurb[source]}. Budget set in Settings → Organization.
          </p>
        </Stack>
        <BillingSourceToggle value={source} onChange={setSource} busy={refreshing} />
      </Cluster>

      <div
        className={cn(
          "transition-opacity duration-200",
          refreshing && "pointer-events-none opacity-60",
        )}
      >
      <Stack gap="6">

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
        <KpiCard label="Forecast end-of-month" value={formatUsdPrecise(data.forecast_usd)} sub={data.budget_usd > 0 ? `vs budget ${formatUsdPrecise(data.budget_usd)}` : "no budget set"} />
        <KpiCard label="Tokens month-to-date" value={formatCompact(data.total_prompt_tokens + data.total_completion_tokens)} sub={`${formatCompact(data.total_prompt_tokens)} in · ${formatCompact(data.total_completion_tokens)} out`} />
        <KpiCard label="LLM calls" value={data.total_calls.toLocaleString()} sub={`across ${data.spend_by_model.length} model${data.spend_by_model.length === 1 ? "" : "s"}`} />
        <KpiCard label="Budget utilization" value={data.budget_usd > 0 ? `${Math.round(data.budget_utilization * 100)}%` : "—"} sub={data.budget_usd > 0 ? (data.budget_utilization > 0.9 ? "Watch closely" : "Healthy") : "No budget set"} tone={data.budget_utilization > 0.9 ? "warning" : "neutral"} />
      </Grid>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Daily burn + MTD running total</span>
            <Cluster gap="3" align="center">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <span className="inline-block h-2 w-3 rounded-sm bg-[var(--primary)] opacity-80" /> daily
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <span className="inline-block h-0.5 w-3 bg-[var(--info)]" /> cumulative
              </span>
              <span className="text-xs text-[var(--text-muted)]">22 days · {formatUsdPrecise(data.spend_usd)}</span>
            </Cluster>
          </Cluster>
          <div className="relative h-32" role="img" aria-label="Daily burn chart with MTD running total overlay">
            <div className="absolute inset-0 flex items-end gap-1 overflow-x-auto">
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
            {/* §5.29.12 — MTD running-total line overlay, scaled to its own max
                so it spans the full chart height; values shown via title-attr
                on each anchor circle. */}
            <svg
              className="pointer-events-none absolute inset-0 size-full"
              width="100%"
              height="100%"
              viewBox={`0 0 ${Math.max(1, cumulative.length - 1)} 100`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <polyline
                fill="none"
                stroke="var(--info)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                points={cumulative.map((c, i) => `${i},${100 - (c.cumulative / cumulativeMax) * 100}`).join(" ")}
              />
            </svg>
          </div>
          <Cluster justify="between">
            <span className="text-xs text-[var(--text-subtle)]">{data.spend_daily[0]?.day ?? ""}</span>
            <span className="text-xs text-[var(--text-subtle)]">
              cumulative {formatUsdPrecise(cumulativeMax)}
            </span>
            <span className="text-xs text-[var(--text-subtle)]">{data.spend_daily[data.spend_daily.length - 1]?.day ?? ""}</span>
          </Cluster>
        </Stack>
      </Card>

      {/* Token usage per day — input + output stacked. Populated even when
          spend is $0 (a model LiteLLM has no price for still reports tokens). */}
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <span className="text-sm font-semibold">Tokens per day</span>
            <Cluster gap="3" align="center">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <span className="inline-block h-2 w-3 rounded-sm bg-[var(--primary)] opacity-80" /> input
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                <span className="inline-block h-2 w-3 rounded-sm bg-[var(--info)] opacity-80" /> output
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatCompact(data.total_prompt_tokens + data.total_completion_tokens)} total
              </span>
            </Cluster>
          </Cluster>
          {tokenDaily.every((d) => d.input + d.output === 0) ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">No token usage recorded yet this month.</p>
          ) : (
            <div className="flex h-32 items-end gap-1 overflow-x-auto" role="img" aria-label="Token usage per day, input and output stacked">
              {tokenDaily.map((d) => {
                const total = d.input + d.output;
                const h = Math.max(4, (total / maxTokens) * 124);
                const inH = total > 0 ? (d.input / total) * h : 0;
                return (
                  <div
                    key={d.day}
                    className="group flex flex-1 min-w-[12px] flex-col items-center"
                    title={`${d.day}: ${formatCompact(d.input)} in · ${formatCompact(d.output)} out`}
                  >
                    <div className="flex w-full flex-col overflow-hidden rounded-t-sm" style={{ height: `${h}px` }}>
                      <div className="w-full bg-[var(--info)] opacity-80 group-hover:opacity-100" style={{ height: `${h - inH}px` }} />
                      <div className="w-full bg-[var(--primary)] opacity-80 group-hover:opacity-100" style={{ height: `${inH}px` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Stack>
      </Card>

      <Grid cols="auto-fit-360" gap="4">
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">By capability</span>
              <span className="text-xs text-[var(--text-muted)]">{data.spend_by_capability.length} capabilities</span>
            </Cluster>
            <CapabilityPie items={data.spend_by_capability} />
            <Stack gap="2" as="ul">
              {data.spend_by_capability.map((c) => {
                const util = Math.min(1, c.usd / c.budget);
                return (
                  <li key={c.id} className="text-sm">
                    <Cluster justify="between" align="center">
                      <span className="font-medium">{c.name}</span>
                      <Cluster gap="2" align="center">
                        <span className="text-[var(--text-muted)]">{formatUsdCompact(c.usd)} / {formatUsdCompact(c.budget)}</span>
                        <span className={cn("text-xs", c.trend.startsWith("+") ? "text-[var(--warning)]" : "text-[var(--success)]")}>{c.trend}</span>
                      </Cluster>
                    </Cluster>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--surface-2)]">
                      <div
                        className={cn("h-full rounded-full", util > 0.9 ? "bg-[var(--warning)]" : "bg-[var(--primary)]")}
                        style={{ width: `${util * 100}%` }}
                      />
                    </div>
                    <Cluster justify="between" align="center" className="mt-1">
                      <span className="text-xs text-[var(--text-subtle)]">Top task: {c.top_task}</span>
                      <button
                        type="button"
                        onClick={() => setBudgetTarget({ id: c.id, name: c.name, current: c.budget })}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--primary)]"
                      >
                        <Wallet className="size-3" aria-hidden /> Set budget
                      </button>
                    </Cluster>
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
              <span className="text-xs text-[var(--text-muted)]">Actual LLM model</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {data.spend_by_model.map((m) => (
                <li key={m.id} className="text-sm">
                  <Cluster justify="between" align="center">
                    <Stack gap="0">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{m.provider} · {m.calls.toLocaleString()} calls · {m.output_tok_k > 0 ? `${m.input_tok_k.toLocaleString()}k in / ${m.output_tok_k.toLocaleString()}k out` : `${m.input_tok_k.toLocaleString()}k tokens`}</span>
                    </Stack>
                    <Cluster gap="2" align="center">
                      <span className="text-[var(--text-muted)]">{formatUsdCompact(m.usd)}</span>
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

        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">By role</span>
              <span className="text-xs text-[var(--text-muted)]">Intent / LiteLLM role</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {data.spend_by_role.map((r) => (
                <li key={r.role} className="text-sm">
                  <Cluster justify="between" align="center">
                    <Stack gap="0">
                      <span className="font-medium">{r.role}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{r.calls.toLocaleString()} calls · {r.output_tok_k > 0 ? `${r.input_tok_k.toLocaleString()}k in / ${r.output_tok_k.toLocaleString()}k out` : `${r.input_tok_k.toLocaleString()}k tokens`}</span>
                    </Stack>
                    <Cluster gap="2" align="center">
                      <span className="text-[var(--text-muted)]">{formatUsdCompact(r.usd)}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{Math.round(r.pct * 100)}%</span>
                    </Cluster>
                  </Cluster>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-[var(--info)]" style={{ width: `${r.pct * 100}%` }} />
                  </div>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      </Grid>

      {/* By provider — only on the "All" view (the per-vendor rollup answers
          "which vendor did we pay across both billing sources"). */}
      {source === "all" && data.spend_by_provider.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster justify="between" align="center">
              <span className="text-sm font-semibold">By provider</span>
              <span className="text-xs text-[var(--text-muted)]">Vendor that served each call</span>
            </Cluster>
            <Stack gap="2" as="ul">
              {data.spend_by_provider.map((p) => (
                <li key={p.provider} className="text-sm">
                  <Cluster justify="between" align="center">
                    <Stack gap="0">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{p.calls.toLocaleString()} calls · {p.output_tok_k > 0 ? `${p.input_tok_k.toLocaleString()}k in / ${p.output_tok_k.toLocaleString()}k out` : `${p.input_tok_k.toLocaleString()}k tokens`}</span>
                    </Stack>
                    <Cluster gap="2" align="center">
                      <span className="text-[var(--text-muted)]">{formatUsdCompact(p.usd)}</span>
                      <span className="text-xs text-[var(--text-subtle)]">{Math.round(p.pct * 100)}%</span>
                    </Cluster>
                  </Cluster>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${p.pct * 100}%` }} />
                  </div>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {/* By key — only on the "Your keys" view. One row per saved BYO provider
          key (last-4), with this month's spend on it. */}
      {source === "byo" && <SpendByKeyTable rows={data.spend_by_key} />}

      {/* §5.29.12 r1 — per-model burn-down chart (7/30/90-day windows). */}
      <PerModelBurndownChart orgId="org_current" />

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
                      <span className="text-[var(--text-muted)]">{formatUsdCompact(p.usd)}</span>
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
                    <span className="text-[var(--text-muted)]">{formatUsdCompact(t.usd)}</span>
                    <span className="text-xs text-[var(--text-subtle)]">{t.runs} runs</span>
                  </Link>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      </Grid>

      </Stack>
      </div>

      <SetBudgetDialog
        target={budgetTarget}
        onOpenChange={(o) => { if (!o) setBudgetTarget(null); }}
        onSaved={async (newBudget) => {
          // Patch local state so the bar updates without a refetch round-trip.
          setData((cur) => {
            if (!cur || !budgetTarget) return cur;
            return {
              ...cur,
              spend_by_capability: cur.spend_by_capability.map((c) =>
                c.id === budgetTarget.id ? { ...c, budget: newBudget } : c,
              ),
            };
          });
        }}
      />
    </Stack>
  );
}

/**
 * §5.29.12 — "Set budget" per-capability modal. Calls
 * `api.capabilities.patchSettings({ budget_mtd_usd })` then signals the
 * parent to patch local state.
 */
function SetBudgetDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: { id: string; name: string; current: number } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (newBudget: number) => Promise<void> | void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (target) setValue(target.current ? String(Math.round(target.current)) : "");
  }, [target]);
  const parsed = Number(value);
  const canSave = !saving && Number.isFinite(parsed) && parsed > 0;
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !target) return;
    setSaving(true);
    try {
      await api.capabilities.patchSettings(target.id, { budget_mtd_usd: parsed });
      await onSaved(parsed);
      toast.success(`Budget set: ${target.name} → $${parsed.toLocaleString()}/mo.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save budget.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog.Root open={!!target} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold">Set monthly budget</Dialog.Title>
              <Dialog.Description className="text-xs text-[var(--text-muted)]">
                {target?.name ?? ""} · agents will refuse new runs once this capability hits its
                budget, with an admin-override prompt.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)]" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit}>
            <Stack gap="3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Budget (USD / month)</span>
                <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 focus-within:border-[var(--primary)]">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={50}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full bg-transparent text-sm focus:outline-none"
                    autoFocus
                    required
                  />
                </div>
              </label>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSave}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Save budget
                </Button>
              </div>
            </Stack>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * §5.29.12 — per-capability pie chart. Pure SVG; slices ordered by spend
 * descending. Slice tones cycle through the four primary token shades so
 * the legend underneath (existing capability list) reads the same order.
 */
function CapabilityPie({ items }: { items: { id: string; name: string; usd: number }[] }) {
  const total = items.reduce((s, i) => s + i.usd, 0);
  if (total <= 0 || items.length === 0) return null;
  // Concentric ring chart — radius 36, ring width 14. Arc paths assembled
  // via the standard `M cx cy L p1 A r r 0 large 1 p2 Z` triangle.
  const cx = 50;
  const cy = 50;
  const r = 36;
  const tones = ["var(--primary)", "var(--info)", "var(--success)", "var(--warning)"];
  let acc = 0;
  const arcs = items.map((it, idx) => {
    const start = (acc / total) * 2 * Math.PI;
    acc += it.usd;
    const end = (acc / total) * 2 * Math.PI;
    const x1 = cx + r * Math.sin(start);
    const y1 = cy - r * Math.cos(start);
    const x2 = cx + r * Math.sin(end);
    const y2 = cy - r * Math.cos(end);
    const large = end - start > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    return { d, tone: tones[idx % tones.length], it, pct: it.usd / total };
  });
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0" role="img" aria-label="Per-capability spend pie chart">
        {arcs.map((a) => (
          <path key={a.it.id} d={a.d} fill={a.tone} stroke="var(--surface)" strokeWidth="0.5">
            <title>{a.it.name}: ${a.it.usd.toFixed(0)} ({Math.round(a.pct * 100)}%)</title>
          </path>
        ))}
        {/* Hollow center for a cleaner donut feel. */}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--surface)" />
        <text x={cx} y={cy + 1} textAnchor="middle" className="fill-[var(--text-muted)]" fontSize="9" fontWeight="600">
          ${total.toFixed(0)}
        </text>
      </svg>
      <ul className="flex-1 space-y-1 text-xs">
        {arcs.map((a) => (
          <li key={a.it.id} className="flex items-center gap-2">
            <span className="inline-block size-2 shrink-0 rounded-sm" style={{ backgroundColor: a.tone }} aria-hidden />
            <span className="truncate text-[var(--text-muted)]">{a.it.name}</span>
            <span className="ml-auto tabular-nums text-[var(--text)]">{Math.round(a.pct * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
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

/**
 * Cost-by-key table for the "Your keys" view. One row per saved BYO provider
 * key (or a since-revoked key that still has spend this month), showing the
 * key's last-4, model count, calls, last-used, and MTD spend on it.
 */
function SpendByKeyTable({ rows }: { rows: CostView["spend_by_key"] }) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <span className="text-sm font-semibold">By key</span>
          <span className="text-xs text-[var(--text-muted)]">Spend on each of your provider keys</span>
        </Cluster>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            No BYO-key spend yet this month. Add a provider key in Settings → Models to route calls through your own account.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  <th className="pb-2 pr-3 font-semibold">Key</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Models</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Calls</th>
                  <th className="pb-2 pr-3 font-semibold">Last used</th>
                  <th className="pb-2 text-right font-semibold">Spend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => (
                  <tr key={k.provider} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3">
                      <Cluster gap="2" align="center">
                        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)]">
                          <KeyRound className="size-3 text-[var(--text-muted)]" aria-hidden />
                        </span>
                        <Stack gap="0">
                          <span className="font-medium">{k.name}</span>
                          {k.has_key ? (
                            <span className="font-mono text-xs text-[var(--text-subtle)]">•••• {k.key_last4 ?? "????"}</span>
                          ) : (
                            <span className="text-xs text-[var(--warning)]">key removed · spend retained</span>
                          )}
                        </Stack>
                      </Cluster>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--text-muted)]">{k.models.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--text-muted)]">{k.calls.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--text-subtle)]">{k.last_used ? new Date(k.last_used).toLocaleDateString() : "—"}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{formatUsdPrecise(k.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>
    </Card>
  );
}
