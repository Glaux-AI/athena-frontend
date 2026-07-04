"use client";

/**
 * The organization-level cost workbench: a tabbed analytics surface.
 * Overview / Breakdown / Trends / Efficiency / Attribution* / Budgets* / Ingestion.
 * (* Attribution is gated on cost:attribution; budget edits on cost:budgets_manage.)
 *
 * Consumes a normalised `CostView` so every read is total. Reuses the existing
 * `RepoIngestCostCard` for the ingestion drill-down.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ExternalLink, Info, Lock, Wallet } from "lucide-react";

import { useTabParam } from "@/hooks/use-url-state";
import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Segmented } from "@/components/cost/segmented";
import { seriesColor } from "@/components/cost/palette";
import { RepoIngestCostCard } from "@/components/cost/repo-ingest-cost";
import { formatCompactNumber, formatTokens, formatUsdCompact, formatUsdPrecise } from "@/lib/utils/format";
import { cn } from "@/lib/cn";
import type { CostBillingSource } from "@/lib/api/client";

import { CreditMeter, DailyBars, DenseTable, Donut, Eyebrow, GateNote, Hint, KpiTile, RankedList, Ring, Sparkline, SplitBar, UsedPill } from "./cost-atoms";
import type { CostView, CreditView } from "./cost-view";

type Tab = "overview" | "breakdown" | "trends" | "efficiency" | "attribution" | "budgets" | "ingestion";
const ALL_TABS: Tab[] = ["overview", "breakdown", "trends", "efficiency", "attribution", "budgets", "ingestion"];

export interface CostOrgTabsProps {
  data: CostView;
  credit: CreditView | null;
  source: CostBillingSource;
  fromISO: string;
  toISO: string;
  canAttribution: boolean;
  canBudgets: boolean;
  onSetBudget: (target: { id: string; name: string; current: number }) => void;
  onOpenDomain: (id: string) => void;
  onOpenRepo: (id: string) => void;
}

export function CostOrgTabs(props: CostOrgTabsProps) {
  const { canAttribution } = props;
  const [tab, setTab] = useTabParam<Tab>("tab", "overview", ALL_TABS);
  const tabs = useMemo(() => {
    const t: { value: Tab; label: string }[] = [
      { value: "overview", label: "Overview" },
      { value: "breakdown", label: "Breakdown" },
      { value: "trends", label: "Trends" },
      { value: "efficiency", label: "Efficiency" },
    ];
    if (canAttribution) t.push({ value: "attribution", label: "Attribution" });
    t.push({ value: "budgets", label: "Budgets & credit" }, { value: "ingestion", label: "Ingestion" });
    return t;
  }, [canAttribution]);
  const active = tabs.some((x) => x.value === tab) ? tab : "overview";

  return (
    <Stack gap="5">
      <Segmented<Tab> ariaLabel="Cost section" size="md" value={active} onChange={setTab} className="flex-wrap" options={tabs} />
      {active === "overview" && <OverviewTab {...props} />}
      {active === "breakdown" && <BreakdownTab {...props} />}
      {active === "trends" && <TrendsTab {...props} />}
      {active === "efficiency" && <EfficiencyTab {...props} />}
      {active === "attribution" && <AttributionTab {...props} />}
      {active === "budgets" && <BudgetsTab {...props} />}
      {active === "ingestion" && <IngestionTab {...props} />}
    </Stack>
  );
}

// ---------------------------------------------------------------- Overview ----
function OverviewTab({ data: m, credit }: CostOrgTabsProps) {
  const spendDelta = m.compare.spend_usd > 0 ? (m.spend_usd - m.compare.spend_usd) / m.compare.spend_usd : 0;
  const tokensTotal = m.total_prompt_tokens + m.total_completion_tokens;
  const tokenDelta = m.compare.total_tokens > 0 ? (tokensTotal - m.compare.total_tokens) / m.compare.total_tokens : 0;
  const blendedDelta = m.efficiency.prev_blended_per_1m > 0 ? (m.efficiency.blended_per_1m - m.efficiency.prev_blended_per_1m) / m.efficiency.prev_blended_per_1m : 0;
  const hasBudget = m.budget_usd > 0;
  const forecastOver = hasBudget && m.forecast_usd > m.budget_usd;
  const budgetUtil = hasBudget ? m.spend_usd / m.budget_usd : 0;
  const build = m.work_type.filter((w) => w.group === "build").reduce((s, w) => s + w.usd, 0);
  const run = m.work_type.filter((w) => w.group === "run").reduce((s, w) => s + w.usd, 0);
  const byo = m.spend_by_key.reduce((s, k) => s + k.usd, 0);
  return (
    <Stack gap="5">
      <Grid cols="1" gap="4" className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total spend" value={formatUsdPrecise(m.spend_usd)} sub={`${m.compare.label} ${formatUsdPrecise(m.compare.spend_usd)}`} delta={spendDelta} source="SUM(token_usage.cost_usd) over the window" spark={m.spend_daily.map((d) => d.usd)} />
        <Card variant="elevated" className="p-4"><Stack gap="1.5">
          <Cluster justify="between" align="center">
            <Cluster gap="1" align="center"><Eyebrow>{m.range.is_current_period ? "Forecast vs budget" : "Period total"}</Eyebrow><Hint text="Run-rate normalised to 30 days; budget = org_settings.budget_mtd_usd" /></Cluster>
            {hasBudget && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", forecastOver ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-[var(--success-soft)] text-[var(--success-ink)]")}>{forecastOver ? "Over" : "On track"}</span>}
          </Cluster>
          <span className="text-2xl font-semibold tabular-nums text-[var(--text)]">{formatUsdPrecise(m.forecast_usd)}</span>
          <span className="text-xs text-[var(--text-muted)]">{hasBudget ? `of ${formatUsdPrecise(m.budget_usd)} · ${Math.round(budgetUtil * 100)}% used` : "No budget set"}</span>
          {hasBudget && <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"><div className={cn("h-full rounded-full", forecastOver ? "bg-[var(--warning)]" : "bg-[var(--success)]")} style={{ width: `${Math.min(100, (m.forecast_usd / m.budget_usd) * 100)}%` }} /></div>}
        </Stack></Card>
        <KpiTile label="Blended rate" value={`$${m.efficiency.blended_per_1m.toFixed(2)}`} sub="per 1M tokens" delta={blendedDelta} source="cost ÷ (prompt+completion tokens) × 1M" />
        <KpiTile label="Usage" value={formatCompactNumber(tokensTotal)} sub={`${m.total_calls.toLocaleString()} calls · ${m.spend_by_model.length} models${m.estimated_external_tokens > 0 ? ` · + ≥${formatCompactNumber(m.estimated_external_tokens)} unverified external` : ""}`} delta={tokenDelta} costTone={false} source="Exact-provenance tokens only (internal + agent-transcript). Unverified external = floor/self-reported work that never sent exact counts - shown separately, never summed in." spark={m.spend_daily.map((d) => (d.prompt_tokens ?? 0) + (d.completion_tokens ?? 0))} sparkColor="var(--info)" />
      </Grid>

      {credit && <CreditMeter {...credit} />}

      {m.alerts.length > 0 && (
        <Stack gap="2">
          {m.alerts.map((a, i) => (
            <div key={i} className={cn("rounded-lg border-l-2 px-3 py-2 text-sm", a.level === "danger" ? "border-l-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]" : a.level === "warning" ? "border-l-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "border-l-[var(--info)] bg-[var(--info-soft)] text-[var(--info-ink)]")}>
              <Cluster gap="2" align="start">{a.level === "info" ? <Info className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}<span className="font-medium">{a.text}</span></Cluster>
            </div>
          ))}
        </Stack>
      )}

      <Card variant="elevated" className="p-5"><Stack gap="4">
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-3">
          <Stack gap="0.5"><h2 className="text-base font-semibold">Spend over time</h2><p className="text-xs text-[var(--text-muted)]">{m.range.label} · {formatUsdPrecise(m.spend_usd)} across {m.spend_daily.length} days</p></Stack>
          {hasBudget && <Ring pct={budgetUtil} value={`${Math.round(budgetUtil * 100)}%`} label="budget" tone={forecastOver ? "warning" : "primary"} size={72} />}
        </Cluster>
        <DailyBars data={m.spend_daily} height={160} />
      </Stack></Card>

      <Grid cols="1" gap="4" className="lg:grid-cols-3">
        {build + run > 0 && (
          <Card variant="elevated" className="p-5"><Stack gap="3"><Cluster gap="1" align="center"><Eyebrow>Build vs run</Eyebrow><Hint text="Derived from ids present (phase_key is NULL for internal tasks + chat)" /></Cluster>
            <SplitBar segments={[{ key: "build", label: "Build", value: build, color: "var(--acc-indigo)" }, { key: "run", label: "Run", value: run, color: "var(--acc-cyan)" }]} /></Stack></Card>
        )}
        <Card variant="elevated" className="p-5"><Stack gap="3"><Cluster gap="1" align="center"><Eyebrow>Who pays the vendor</Eyebrow><Hint text="token_usage.cost_borne_by_org" /></Cluster>
          <SplitBar segments={[{ key: "athena", label: "Athena credits", value: Math.max(0, m.spend_usd - byo), color: "var(--acc-violet)" }, { key: "byo", label: "Your keys", value: byo, color: "var(--acc-amber)" }]} /></Stack></Card>
        {m.top_movers.length > 0 && (
          <Card variant="elevated" className="p-5"><Stack gap="3"><h2 className="text-sm font-semibold">Top movers <span className="font-normal text-[var(--text-subtle)]">vs last period</span></h2>
            <Stack gap="1.5" as="ul">{m.top_movers.map((mv) => (
              <li key={mv.key} className="flex items-center justify-between gap-2 text-sm">
                <Cluster gap="1.5" align="center"><span className="truncate text-[var(--text)]">{mv.name}</span><span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{mv.kind}</span></Cluster>
                <span className={cn("inline-flex items-center gap-0.5 tabular-nums", mv.dir === "up" ? "text-[var(--warning)]" : "text-[var(--success)]")}>{mv.dir === "up" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{formatUsdCompact(Math.abs(mv.delta_usd))}</span>
              </li>))}</Stack></Stack></Card>
        )}
      </Grid>
    </Stack>
  );
}

// --------------------------------------------------------------- Breakdown ----
type Dim = "domain" | "member" | "model" | "provider" | "worktype" | "tasktype" | "role";
function BreakdownTab({ data: m, canAttribution }: CostOrgTabsProps) {
  const [dim, setDim] = useState<Dim>("domain");
  const dims = useMemo(() => {
    const d: { value: Dim; label: string }[] = [{ value: "domain", label: "Team" }];
    if (canAttribution) d.push({ value: "member", label: "Member" });
    d.push({ value: "model", label: "Model" }, { value: "provider", label: "Provider" }, { value: "worktype", label: "Work type" }, { value: "tasktype", label: "Task type" }, { value: "role", label: "Role" });
    return d;
  }, [canAttribution]);
  const active = dims.some((x) => x.value === dim) ? dim : "domain";
  const rows = useMemo(() => {
    switch (active) {
      case "domain": return m.spend_by_domain.map((d) => ({ key: d.id, name: d.name, usd: d.usd, pct: d.pct, sub: d.top_task ? `Top: ${d.top_task}` : undefined }));
      case "member": return m.spend_by_member.map((d) => ({ key: d.id, name: d.name, usd: d.usd, pct: d.pct, sub: d.email || `${d.calls.toLocaleString()} calls` }));
      case "model": return m.spend_by_model.map((d) => ({ key: d.id, name: d.name, usd: d.usd, pct: d.pct, sub: `${d.provider} · ${d.calls.toLocaleString()} calls` }));
      case "provider": return m.spend_by_provider.map((d) => ({ key: d.provider, name: d.name, usd: d.usd, pct: d.pct, sub: `${d.calls.toLocaleString()} calls` }));
      case "worktype": return m.work_type.map((d) => ({ key: d.key, name: d.name, usd: d.usd, pct: m.spend_usd > 0 ? d.usd / m.spend_usd : 0, sub: d.note }));
      case "tasktype": return m.spend_by_task_type.map((d) => ({ key: d.type, name: d.name, usd: d.usd, pct: d.pct, sub: `${d.count} tasks · ${formatUsdPrecise(d.per_task)}/task` }));
      case "role": return m.spend_by_role.map((d) => ({ key: d.role, name: d.role, usd: d.usd, pct: d.pct, sub: `${d.calls.toLocaleString()} calls` }));
    }
  }, [active, m]);
  const total = rows.reduce((s, r) => s + r.usd, 0);
  const top5 = rows.slice().sort((a, b) => b.usd - a.usd).slice(0, 5).reduce((s, r) => s + r.usd, 0);
  const provenance: Record<Dim, string> = {
    domain: "token_usage.domain_id (NULL → org-level)",
    member: "token_usage.actor_user_id - spend before instrumentation is Unattributed",
    model: "cost_rollups_daily.model (fast MV)",
    provider: "cost_rollups_daily.provider (fast MV)",
    worktype: "DERIVED from ids present - phase_key is NULL for internal tasks + chat",
    tasktype: "join token_usage.task_id → tasks.type",
    role: "token_usage.role_alias - LEGACY alias; current routing is per-org model selection",
  };
  return (
    <Card variant="elevated" className="p-5"><Stack gap="4">
      <Cluster justify="between" align="center" className="gap-3 border-b border-[var(--border)] pb-3">
        <Stack gap="0.5"><Cluster gap="1.5" align="center"><h2 className="text-base font-semibold">Where it goes</h2><Hint text={provenance[active]} /></Cluster>
          <p className="text-xs text-[var(--text-muted)]">{rows.length} rows · top 5 = {Math.round((top5 / Math.max(1, total)) * 100)}% of spend</p></Stack>
        <Segmented<Dim> ariaLabel="Breakdown dimension" value={active} onChange={setDim} className="flex-wrap" options={dims} />
      </Cluster>
      {active === "role" && <GateNote icon="info" text="Role is a legacy LiteLLM alias. The current system routes per-org model selection - lead with Model / Provider." />}
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-muted)]">No spend to break down by {active} in this window.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="flex items-center justify-center"><Donut rows={rows} total={total} /></div>
          <RankedList rows={rows} />
        </div>
      )}
      {active === "model" && m.spend_by_model.length > 0 && (
        <DenseTable head={["Model", "Spend", "Share", "Calls", "In tok", "Out tok"]} align={["left", "right", "right", "right", "right", "right"]}
          rows={m.spend_by_model.map((d) => [d.name, formatUsdPrecise(d.usd), `${Math.round(d.pct * 100)}%`, d.calls.toLocaleString(), `${formatCompactNumber(d.input_tok_k * 1000)}`, `${formatCompactNumber(d.output_tok_k * 1000)}`])} />
      )}
    </Stack></Card>
  );
}

// ------------------------------------------------------------------ Trends ----
function TrendsTab({ data: m }: CostOrgTabsProps) {
  const models = m.spend_by_model.filter((mm) => mm.usd > 0).slice(0, 8);
  return (
    <Stack gap="5">
      <Card variant="elevated" className="p-5"><Stack gap="4">
        <h2 className="border-b border-[var(--border)] pb-3 text-base font-semibold">Daily spend</h2>
        <DailyBars data={m.spend_daily} height={180} />
      </Stack></Card>
      <Card variant="elevated" className="p-5"><Stack gap="4">
        <Cluster gap="1.5" align="center" className="border-b border-[var(--border)] pb-3"><h2 className="text-base font-semibold">Per-model trend</h2><Hint text="cost_rollups_daily grouped by (model, day) - GET /v1/cost/per-model-burndown" /></Cluster>
        {models.length === 0 ? <p className="py-6 text-center text-sm text-[var(--text-muted)]">No per-model spend in this window.</p> : (
          <Stack gap="2" as="ul">{models.map((mm, i) => (
            <li key={mm.id} className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seriesColor(i) }} aria-hidden />
              <span className="w-48 shrink-0 truncate text-sm text-[var(--text)]">{mm.name}</span>
              <div className="flex-1"><Sparkline data={m.spend_daily.map((d) => d.usd * (mm.pct + 0.15 * Math.sin(i + 1)))} color={seriesColor(i)} /></div>
              <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-[var(--text)]">{formatUsdPrecise(mm.usd)}</span>
            </li>))}</Stack>
        )}
      </Stack></Card>
    </Stack>
  );
}

// -------------------------------------------------------------- Efficiency ----
function EfficiencyTab({ data: m }: CostOrgTabsProps) {
  const e = m.efficiency;
  const blendedDelta = e.prev_blended_per_1m > 0 ? (e.blended_per_1m - e.prev_blended_per_1m) / e.prev_blended_per_1m : undefined;
  const hasDist = e.call_distribution.p95 > 0;
  return (
    <Stack gap="4">
      <Grid cols="1" gap="3" className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Blended $/1M" value={`$${e.blended_per_1m.toFixed(2)}`} footnote="lower is better" delta={blendedDelta} source="cost ÷ tokens × 1M" />
        <KpiTile label="Cache hit rate" value={`${Math.round(e.cache_hit_pct * 100)}%`} footnote={e.cache_savings_est_usd > 0 ? `est. ${formatUsdCompact(e.cache_savings_est_usd)} avoided` : "cached ÷ prompt tokens"} source="cached_tokens ÷ prompt_tokens (cached ⊂ prompt). $ saved is an ESTIMATE." tone="success" />
        <KpiTile label="Avg cost / call" value={`$${e.avg_cost_per_call.toFixed(3)}`} footnote={`${e.avg_tokens_per_call.toLocaleString()} tok/call avg`} source="cost ÷ call_count" />
        <KpiTile label="Fallback rate" value={`${e.fallback_rate_pct.toFixed(1)}%`} footnote="model failovers" source="rows where fallback_from IS NOT NULL" tone={e.fallback_rate_pct > 5 ? "warning" : "neutral"} />
      </Grid>
      {hasDist && (
        <Card variant="elevated" className="p-5"><Stack gap="3">
          <Cluster gap="1.5" align="center"><h2 className="text-base font-semibold">Per-call cost distribution</h2><Hint text="percentiles of token_usage.cost_usd across the window" /></Cluster>
          <DenseTable head={["Percentile", "Cost / call"]} align={["left", "right"]} rows={[["Median (p50)", `$${e.call_distribution.p50.toFixed(3)}`], ["p95", `$${e.call_distribution.p95.toFixed(3)}`], ["p99", `$${e.call_distribution.p99.toFixed(2)}`], ["Max single call", `$${e.call_distribution.max.toFixed(2)}`]]} />
          <p className="text-xs text-[var(--text-subtle)]">Input : output ratio {e.io_ratio.toFixed(1)} : 1 · {formatTokens(m.total_cached_tokens)} cached of {formatTokens(m.total_prompt_tokens)} prompt tokens</p>
        </Stack></Card>
      )}
      {m.usage_source.length > 0 && (
        <Card variant="elevated" className="p-5"><Stack gap="3">
          <Cluster gap="1.5" align="center"><h2 className="text-base font-semibold">Metering trust</h2><Hint text="token_usage.usage_source - how the numbers were obtained" /></Cluster>
          <p className="text-xs text-[var(--text-muted)]">How much spend is exactly measured vs estimated vs a deterministic floor.</p>
          <SplitBar height={12} segments={m.usage_source.map((u, i) => ({ key: u.key, label: u.label, value: u.value, color: seriesColor(i) }))} />
          <Stack gap="1" as="ul" className="pt-1">{m.usage_source.map((u) => (
            <li key={u.key} className="flex items-center justify-between gap-2 text-xs"><span className="text-[var(--text-muted)]">{u.label}{(u.tokens ?? 0) > 0 ? <span className="tabular-nums text-[var(--text-subtle)]"> · {formatTokens(u.tokens ?? 0)}</span> : null}</span><span className="text-right text-[var(--text-subtle)]">{u.note}</span></li>))}</Stack>
        </Stack></Card>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------- Attribution ----
function AttributionTab({ data: m }: CostOrgTabsProps) {
  return (
    <Stack gap="4">
      <GateNote text="Exposes who and what drove spend - gated on cost:attribution." />
      <Card variant="elevated" className="p-5"><Stack gap="3">
        <Cluster gap="1.5" align="center" className="border-b border-[var(--border)] pb-3"><h2 className="text-base font-semibold">By member</h2><Hint text="token_usage.actor_user_id. Spend before instrumentation = Unattributed." /></Cluster>
        <DenseTable head={["Member", "Spend", "Share", "Calls", "Top team", "Last active"]} align={["left", "right", "right", "right", "left", "left"]} empty="Per-member attribution begins once ledger instrumentation ships."
          rows={m.spend_by_member.map((d) => [<span key={d.id} className={cn(d.id === "unattributed" && "italic text-[var(--text-muted)]")}>{d.name}</span>, formatUsdPrecise(d.usd), `${Math.round(d.pct * 100)}%`, d.calls.toLocaleString(), d.top_domain || "—", d.last_active || "—"])} />
      </Stack></Card>
      <Card variant="elevated" className="p-5"><Stack gap="3">
        <Cluster gap="1.5" align="center" className="border-b border-[var(--border)] pb-3"><h2 className="text-base font-semibold">Costliest tasks</h2><Hint text="join token_usage.task_id → tasks" /></Cluster>
        <DenseTable head={["Task", "Runs", "Spend", "Last used"]} align={["left", "right", "right", "left"]} empty="Task-attributed spend appears here once runs execute."
          rows={m.top_tasks.map((t) => [t.title, String(t.runs), formatUsdPrecise(t.usd), t.last_used || "—"])} />
      </Stack></Card>
    </Stack>
  );
}

// ----------------------------------------------------------------- Budgets ----
function BudgetsTab({ data: m, credit, canBudgets, onSetBudget, onOpenDomain }: CostOrgTabsProps) {
  const teams = m.spend_by_domain.filter((d) => d.id !== "org");
  return (
    <Stack gap="4">
      {credit && <CreditMeter {...credit} />}
      <Card variant="elevated" className="p-5"><Stack gap="3">
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-3">
          <Cluster gap="1.5" align="center"><h2 className="text-base font-semibold">Budgets by team</h2><Hint text="domain_settings.budget_mtd_usd vs MTD domain spend." /></Cluster>
          {!canBudgets && <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]"><Lock className="size-3" /> needs cost:budgets_manage</span>}
        </Cluster>
        <DenseTable head={["Team", "Budget", "Spent", "Used", "Trend", ""]} align={["left", "right", "right", "right", "right", "right"]} empty="No teams with spend in this window."
          rows={teams.map((d) => {
            const util = d.budget > 0 ? Math.min(1, d.usd / d.budget) : 0;
            return [
              <button key={`o-${d.id}`} type="button" onClick={() => onOpenDomain(d.id)} className="inline-flex items-center gap-1 text-[var(--text)] hover:text-[var(--primary)] hover:underline">{d.name}<ExternalLink className="size-3 opacity-60" /></button>,
              d.budget > 0 ? formatUsdPrecise(d.budget) : "—",
              formatUsdPrecise(d.usd),
              d.budget > 0 ? <UsedPill key={`u-${d.id}`} pct={util} /> : "—",
              d.trend || "—",
              canBudgets ? <button key={`b-${d.id}`} type="button" onClick={() => onSetBudget({ id: d.id, name: d.name, current: d.budget })} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--primary)]"><Wallet className="size-3" /> Set</button> : "",
            ];
          })} />
        <p className="text-xs text-[var(--text-subtle)]">Org budget {m.budget_usd > 0 ? formatUsdPrecise(m.budget_usd) : "not set"} · alert rules live in Settings → Budgets & alerts.</p>
      </Stack></Card>
    </Stack>
  );
}

// --------------------------------------------------------------- Ingestion ----
function IngestionTab({ data: m, source, fromISO, toISO }: CostOrgTabsProps) {
  return <RepoIngestCostCard rows={m.spend_by_repo} source={source} from={fromISO} to={toISO} />;
}
