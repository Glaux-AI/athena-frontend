"use client";

/**
 * /cost — spend analytics with a global date-range control.
 *
 * Layout (top → bottom):
 *   1. Toolbar header   — title + scope subtitle + date-range picker + source toggle
 *   2. Alerts           — derived budget / savings banners
 *   3. KPI hero row      — total spend · forecast · budget used · usage (deltas + sparklines)
 *   4. Spend over time   — unified daily-spend / tokens chart (mode toggle)
 *   5. Where it goes     — dimension-switching breakdown (donut + ranked list)
 *   6. Trend + top tasks — per-model spend trend · costliest tasks
 *   7. By key            — BYO per-key spend (Your keys source only)
 *
 * The date-range picker is the single time control: it drives the summary fetch
 * (`from`/`to`) and the per-model trend window (`rangeDays`). Switching the
 * range or billing source re-fetches with the prior data kept on screen
 * (dimmed) rather than dropping to a skeleton.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowRight, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type CostSummary, type CostBillingSource } from "@/lib/api/client";
import { formatUsdCompact } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

import { BillingSourceToggle } from "@/components/cost/billing-source-toggle";
import { DateRangePicker } from "@/components/cost/date-range-picker";
import { CostKpis } from "@/components/cost/cost-kpis";
import { SpendChart, type SpendChartMode } from "@/components/cost/spend-chart";
import { SpendBreakdown } from "@/components/cost/spend-breakdown";
import { PerModelBurndownChart } from "@/components/cost/per-model-burndown";
import { SpendByKeyTable } from "@/components/cost/spend-by-key-table";
import { RepoIngestCostCard } from "@/components/cost/repo-ingest-cost";
import { type CostRange, defaultRange, formatRangeSpan, rangeDays } from "@/components/cost/date-range";

/** Normalize the optional-everywhere wire shape into a guaranteed-shape view so
 *  every read site stays total; absent fields fall back to 0 / [] / sane stubs. */
type CostView = Required<CostSummary>;

function normalizeCostSummary(raw: CostSummary): CostView {
  return {
    month: raw.month ?? "",
    source: raw.source ?? "all",
    range: raw.range ?? { from: "", to: "", label: "", days: 0, is_current_period: true },
    compare: raw.compare ?? { label: "prior period", spend_usd: 0, total_tokens: 0, total_calls: 0 },
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
    spend_by_domain: raw.spend_by_domain ?? [],
    spend_by_model: raw.spend_by_model ?? [],
    spend_by_provider: raw.spend_by_provider ?? [],
    spend_by_key: raw.spend_by_key ?? [],
    spend_by_role: raw.spend_by_role ?? [],
    spend_by_phase: raw.spend_by_phase ?? [],
    spend_by_repo: raw.spend_by_repo ?? [],
    top_tasks: raw.top_tasks ?? [],
    alerts: raw.alerts ?? [],
  };
}

const SOURCE_BLURB: Record<CostBillingSource, string> = {
  all: "all spend · your keys + Athena credits",
  byo: "spend on your own provider keys",
  athena: "spend on your Athena credits",
};

export default function CostPage() {
  const [range, setRange] = useState<CostRange>(() => defaultRange());
  const [source, setSource] = useState<CostBillingSource>("all");
  const [chartMode, setChartMode] = useState<SpendChartMode>("spend");
  const [data, setData] = useState<CostView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [budgetTarget, setBudgetTarget] = useState<{ id: string; name: string; current: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    (async () => {
      try {
        const result = await api.cost.summary({
          source,
          from: range.from,
          to: range.to,
          label: range.label,
          preset: range.preset,
        });
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
    return () => {
      cancelled = true;
    };
  }, [source, range]);

  const Header = (
    <div className="relative overflow-hidden rounded-xl">
      <AmbientBackground variant="subtle" grid={false} />
      <Cluster justify="between" align="end" className="relative flex-wrap gap-3">
        <Stack gap="1">
          <GradientText as="h1" className="text-2xl font-semibold tracking-tight">
            Cost
          </GradientText>
          <p className="text-sm text-[var(--text-muted)]">
            {data ? `${formatRangeSpan(range)} · ${SOURCE_BLURB[source]}` : "Spend analytics"}
          </p>
        </Stack>
        <Cluster gap="2" align="center" className="flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <BillingSourceToggle value={source} onChange={setSource} busy={refreshing} />
        </Cluster>
      </Cluster>
    </div>
  );

  if (loading || !data) {
    if (error) {
      return (
        <Stack gap="6">
          {Header}
          <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--danger-ink)]" />
              <p className="text-sm text-[var(--danger-ink)]">{error}</p>
            </Cluster>
          </Card>
        </Stack>
      );
    }
    return <CostSkeleton header={Header} />;
  }

  const tokensTotal = data.total_prompt_tokens + data.total_completion_tokens;

  return (
    <Stack gap="6">
      {Header}

      <div className={cn("transition-opacity duration-200", refreshing && "pointer-events-none opacity-60")}>
        <Stack gap="6">
          {data.alerts.length > 0 && (
            <Stack gap="2">
              {data.alerts.map((a, i) => (
                <Card
                  key={i}
                  className={cn(
                    "border-l-2 p-3",
                    a.level === "warning"
                      ? "border-l-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]"
                      : a.level === "danger"
                        ? "border-l-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
                        : "border-l-[var(--info)] bg-[var(--info-soft)] text-[var(--info-ink)]",
                  )}
                >
                  <Cluster gap="2" align="center">
                    {a.level === "info" ? <Info className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
                    <span className="text-sm font-medium">{a.text}</span>
                    <Link
                      href="/settings/alerts"
                      className="ml-auto shrink-0 text-xs underline opacity-80 hover:opacity-100"
                    >
                      Configure
                    </Link>
                  </Cluster>
                </Card>
              ))}
            </Stack>
          )}

          <CostKpis
            spendUsd={data.spend_usd}
            compareSpendUsd={data.compare.spend_usd}
            compareLabel={data.compare.label}
            forecastUsd={data.forecast_usd}
            budgetUsd={data.budget_usd}
            budgetUtil={data.budget_utilization}
            isCurrentPeriod={data.range.is_current_period}
            totalTokens={tokensTotal}
            compareTokens={data.compare.total_tokens}
            totalCalls={data.total_calls}
            modelCount={data.spend_by_model.length}
            dailySpend={data.spend_daily.map((d) => d.usd)}
            dailyTokens={data.spend_daily.map((d) => (d.prompt_tokens ?? 0) + (d.completion_tokens ?? 0))}
          />

          <SpendChart daily={data.spend_daily} mode={chartMode} onModeChange={setChartMode} windowLabel={range.label} />

          <SpendBreakdown
            domains={data.spend_by_domain}
            models={data.spend_by_model}
            providers={data.spend_by_provider}
            roles={data.spend_by_role}
            phases={data.spend_by_phase}
            source={source}
            onSetBudget={setBudgetTarget}
          />

          <RepoIngestCostCard
            rows={data.spend_by_repo}
            source={source}
            from={range.from}
            to={range.to}
          />

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            {/* Trend endpoint caps at 365 days; clamp so a long custom range can't 422. */}
            <PerModelBurndownChart orgId="org_current" days={Math.min(365, rangeDays(range))} />
            <TopTasksCard tasks={data.top_tasks} />
          </div>

          {source === "byo" && <SpendByKeyTable rows={data.spend_by_key} />}
        </Stack>
      </div>

      <SetBudgetDialog
        target={budgetTarget}
        onOpenChange={(o) => {
          if (!o) setBudgetTarget(null);
        }}
        onSaved={async (newBudget) => {
          setData((cur) => {
            if (!cur || !budgetTarget) return cur;
            return {
              ...cur,
              spend_by_domain: cur.spend_by_domain.map((c) => (c.id === budgetTarget.id ? { ...c, budget: newBudget } : c)),
            };
          });
        }}
      />
    </Stack>
  );
}

function TopTasksCard({ tasks }: { tasks: CostView["top_tasks"] }) {
  return (
    <Card variant="elevated" className="p-5">
      <Stack gap="4">
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-3">
          <Stack gap="0.5">
            <h2 className="text-lg font-semibold leading-snug">Top tasks</h2>
            <p className="text-sm text-[var(--text-muted)]">Costliest tasks in this window</p>
          </Stack>
          <Link href="/work" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline">
            All tasks <ArrowRight className="size-3" />
          </Link>
        </Cluster>
        {tasks.length === 0 ? (
          <EmptyState title="No task spend yet" description="Task-attributed spend appears here once runs execute in this window." />
        ) : (
          <Stack gap="0.5" as="ul">
            {tasks.map((t, i) => (
              <li key={t.id}>
                <Link href={`/work/${t.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[var(--surface-2)]">
                  <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-[var(--text-subtle)]">{i + 1}</span>
                  <Stack gap="0" className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium text-[var(--text)]">{t.title}</span>
                    <span className="text-xs text-[var(--text-subtle)]">{t.runs} runs · {t.last_used}</span>
                  </Stack>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--text)]">{formatUsdCompact(t.usd)}</span>
                </Link>
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function CostSkeleton({ header }: { header: React.ReactNode }) {
  return (
    <Stack gap="6" aria-busy="true" aria-label="Loading cost summary">
      {header}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
        ))}
      </div>
      <div className="h-[320px] w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
      <div className="h-[340px] w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
      <div className="h-56 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="h-72 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
        <div className="h-72 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
      </div>
    </Stack>
  );
}

/**
 * §5.29.12 — "Set budget" per-domain modal. Calls
 * `api.domains.patchSettings({ budget_mtd_usd })` then signals the parent
 * to patch local state.
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
      await api.domains.patchSettings(target.id, { budget_mtd_usd: parsed });
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 shadow-[var(--shadow-3)]">
          <div className="-mx-5 -mt-5 mb-4 flex items-start justify-between border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-5 py-3 shadow-[var(--inner-highlight)]">
            <div>
              <Dialog.Title className="text-base font-semibold">Set monthly budget</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-[var(--text-muted)]">
                {target?.name ?? ""} · agents refuse new runs once this domain hits its budget, with an admin-override prompt.
              </Dialog.Description>
            </div>
            <Dialog.Close className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit}>
            <Stack gap="3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Budget (USD / month)</span>
                <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 transition-[border-color,box-shadow] focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
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
