/**
 * Normalises the optional-everywhere `CostSummary` wire shape into a
 * guaranteed-shape view, so every read site in the cost components stays total.
 * Absent fields fall back to 0 / [] / sane stubs - older BE builds that don't
 * yet emit the rehaul fields render gracefully (empty sections, derived
 * efficiency from the totals it does send).
 */

import type { CostSummary, CreditBalance } from "@/lib/api/client";

export type CostView = Required<CostSummary>;

export function normalizeCost(raw: CostSummary): CostView {
  const prompt = raw.total_prompt_tokens ?? 0;
  const completion = raw.total_completion_tokens ?? 0;
  const cached = raw.total_cached_tokens ?? 0;
  const calls = raw.total_calls ?? 0;
  const spend = raw.spend_usd ?? 0;
  const tokens = prompt + completion;
  // Derive efficiency from the totals the BE always sends, so the Efficiency
  // tab is never empty even before the dedicated fields land.
  const derivedEfficiency = {
    blended_per_1m: tokens > 0 ? (spend / tokens) * 1_000_000 : 0,
    prev_blended_per_1m: 0,
    cache_hit_pct: prompt > 0 ? cached / prompt : 0,
    cache_savings_est_usd: 0,
    avg_cost_per_call: calls > 0 ? spend / calls : 0,
    avg_tokens_per_call: calls > 0 ? Math.round(tokens / calls) : 0,
    io_ratio: completion > 0 ? prompt / completion : 0,
    fallback_rate_pct: 0,
    call_distribution: { p50: 0, p95: 0, p99: 0, max: 0 },
  };
  return {
    scope: raw.scope ?? { kind: "org" },
    month: raw.month ?? "",
    source: raw.source ?? "all",
    range: raw.range ?? { from: "", to: "", label: "", days: 0, is_current_period: true },
    compare: raw.compare ?? { label: "prior period", spend_usd: 0, total_tokens: 0, total_calls: 0 },
    spend_usd: spend,
    forecast_usd: raw.forecast_usd ?? 0,
    budget_usd: raw.budget_usd ?? 0,
    budget_utilization: raw.budget_utilization ?? 0,
    trend: raw.trend ?? "",
    total_prompt_tokens: prompt,
    total_completion_tokens: completion,
    total_cached_tokens: cached,
    total_calls: calls,
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
    efficiency: raw.efficiency ?? derivedEfficiency,
    work_type: raw.work_type ?? [],
    usage_source: raw.usage_source ?? [],
    spend_by_member: raw.spend_by_member ?? [],
    spend_by_task_type: raw.spend_by_task_type ?? [],
    top_movers: raw.top_movers ?? [],
  };
}

export interface CreditView {
  remaining: number;
  allowance: number;
  mtdSpend: number;
  daysToDepletion: number | null;
  overageEnabled: boolean;
  overageCapUsd: number | null;
  hardCapUsd: number | null;
  tier: string;
}

/** Map the credit balance wire shape into the meter's props, computing a
 *  days-to-depletion estimate from MTD platform burn. */
export function normalizeCredit(raw: CreditBalance | null, daysElapsed: number): CreditView | null {
  if (!raw) return null;
  const remaining = Number(raw.credits_remaining_usd) || 0;
  const mtdSpend = Number(raw.mtd_spend_usd) || 0;
  const dailyBurn = daysElapsed > 0 ? mtdSpend / daysElapsed : 0;
  const days = dailyBurn > 0 && remaining > 0 ? Math.round(remaining / dailyBurn) : null;
  return {
    remaining,
    allowance: raw.monthly_credit_usd ?? 0,
    mtdSpend,
    daysToDepletion: days,
    overageEnabled: raw.overage_enabled,
    overageCapUsd: raw.overage_cap_usd,
    hardCapUsd: raw.hard_cap_usd,
    tier: raw.tier,
  };
}
