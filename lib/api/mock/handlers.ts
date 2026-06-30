/**
 * Mock request handlers - the in-process backend behind `NEXT_PUBLIC_API_MODE=mock`.
 *
 * `handleMockRequest(path, init)` pattern-matches the (method, path) pair
 * against every endpoint surfaced in `lib/api/client.ts`. It returns the same
 * envelope shape a real backend would: bare arrays for short lists, paginated
 * `{ items, next_cursor }` for streams, raw resource for single GETs, updated
 * resource for mutations, and `{ error: { code, message, field? } }` for
 * failures.
 *
 * The real backend will replace this file - until then, this module is the
 * authoritative API contract.
 */

import * as db from "./db";
import type {
  BlueprintSectionProposal,
  FileDependentsEnvelope,
  FileDependentsItem,
  NodeDossierResponse,
  RepoFileContentResponse,
  RepoFileDetail,
  RepoFileRow,
  RepoFilesOut,
  RepoGrepEnvelope,
  RepoGrepResult,
  SyncStage,
} from "../client";

const LATENCY_MS = 120;  // simulate network round-trip

// Session-scoped inbox read marks so mark-read / mark-all-read actually take
// effect in demo mode (the page's dismiss-on-action + unread badge rely on it).
const mockInboxReadIds = new Set<string>();

/**
 * §5.29.9 - flatten every scope's MockBlueprint into a single list so the
 * cross-scope `/v1/blueprint-proposals` endpoint can merge proposals across
 * orgs / domains / repos. Mirrors the BE join over `blueprints.scope_kind`.
 */
function collectAllBlueprintsForCrossScope(): { bp: db.MockBlueprint; scope_kind: string; scope_id: string }[] {
  const out: { bp: db.MockBlueprint; scope_kind: string; scope_id: string }[] = [];
  for (const [id, bp] of Object.entries(db.blueprints.orgs)) {
    out.push({ bp, scope_kind: "org", scope_id: id });
  }
  for (const [id, bp] of Object.entries(db.blueprints.domains)) {
    out.push({ bp, scope_kind: "domain", scope_id: id });
  }
  for (const [id, bp] of Object.entries(db.blueprints.repos)) {
    out.push({ bp, scope_kind: "repo", scope_id: id });
  }
  return out;
}

/**
 * §5.29.5 - mock-mode mutable state for notification routing rules.
 *
 * Kept module-local (rather than threaded through `db.ts`) because the
 * BE-side surface is a single replace-PATCH per org and we only need
 * one snapshot in the demo. Seeded with a reasonable starting set so
 * the page renders rows on first paint.
 */
let notificationRules: { event: string; channels: string[]; audience: string }[] = [
  { event: "review_requested",       channels: ["email", "slack"],             audience: "members" },
  { event: "ci_failed",              channels: ["email", "slack", "pagerduty"], audience: "members" },
  { event: "budget_alert",           channels: ["email", "in_app"],            audience: "admins" },
  { event: "mention",                channels: ["in_app", "slack"],            audience: "mentioned" },
];

/** Budget-alert rules + models kill switch (migration 0099) - module-local
 *  for the same reason as `notificationRules` above. */
let alertRules: {
  id: string;
  kind: "org_budget" | "domain_budget";
  domain_id: string | null;
  threshold_pct: number;
  channels: string[];
  audience_roles: string[];
  enabled: boolean;
}[] = [
  { id: "ar-1", kind: "org_budget", domain_id: null, threshold_pct: 80, channels: ["in_app", "email"], audience_roles: ["admin"], enabled: true },
];
let modelsKillSwitchDisabled = false;
/** Migration 0100 - every alert category is OPT-IN (default off). */
let alertSettings = { cost_badges: false, ingest_anomaly: false, credit_warning: false };

export class MockResponse {
  constructor(
    public status: number,
    public body: unknown,
  ) {}
}

/**
 * §7.9.5 row 2463 - Seat-billing fixtures keyed by org id. Designers
 * exercise all three branches (solo-at-cap, pro-with-headroom,
 * pro-at-cap) by flipping the active org id in `X-Athena-Org-Id`
 * (driven by the OrgSwitcher localStorage key). The default demo
 * org `org_lumen` falls through to the `pro-with-headroom` shape
 * so the UI renders something sensible without the seeded fixtures.
 */
/**
 * ADR-081 - mock Razorpay Order payload. The amount is the INR subunit
 * (paise) so it mirrors `usd_to_subunit`. `razorpay_key_id` is a fake
 * test key (browser-safe in the real flow too - no secret).
 */
function mockOrderPayload(orgId: string, purchase: string, amountRupees: number) {
  const amount = Math.round(amountRupees * 100); // paise subunit
  const orderId = `order_mock_${purchase}_${orgId.slice(0, 8)}`;
  return {
    order_id: orderId,
    razorpay_key_id: "rzp_test_mock",
    amount,
    currency: "INR",
    purchase,
    checkout_options: {
      key: "rzp_test_mock",
      order_id: orderId,
      amount,
      currency: "INR",
      name: "Athena",
      description: `Athena - ${purchase}`,
      notes: { athena_org_id: orgId },
    },
  };
}

function seatsFixtureForOrg(orgId: string): {
  tier: string;
  included_seats: number;
  additional_seats: number;
  total_seats: number;
  active_seats: number;
  pending_invitations: number;
  available_seats: number;
  extra_seat_price_per_month: number | null;
  pro_upgrade_quote: {
    pro_included_seats: number;
    pro_extra_seat_price_per_month: number;
    breakeven_seats: number;
  } | null;
} {
  if (orgId === "solo-at-cap") {
    return {
      tier: "solo",
      included_seats: 1,
      additional_seats: 0,
      total_seats: 1,
      active_seats: 1,
      pending_invitations: 0,
      available_seats: 0,
      extra_seat_price_per_month: 1299,
      pro_upgrade_quote: {
        pro_included_seats: 5,
        pro_extra_seat_price_per_month: 899,
        breakeven_seats: 8,
      },
    };
  }
  if (orgId === "pro-at-cap") {
    return {
      tier: "pro",
      included_seats: 5,
      additional_seats: 0,
      total_seats: 5,
      active_seats: 5,
      pending_invitations: 0,
      available_seats: 0,
      extra_seat_price_per_month: 899,
      pro_upgrade_quote: null,
    };
  }
  // Default: pro-with-headroom (covers demo org `org_lumen` + any
  // unrecognised id so the UI doesn't go blank).
  return {
    tier: "pro",
    included_seats: 5,
    additional_seats: 2,
    total_seats: 7,
    active_seats: 4,
    pending_invitations: 1,
    available_seats: 3,
    extra_seat_price_per_month: 899,
    pro_upgrade_quote: null,
  };
}

/**
 * §7.10.5 - Credit-balance fixtures keyed by `X-Athena-Org-Id` so
 * designers can flip between every credit-meter / halt-banner state
 * without spinning up the BE. Mirrors the seat-fixture pattern above.
 *
 * Mutations (configureOverage / setSpendCap / topup) update this
 * module-local state so the page re-renders with the new shape on
 * `refreshCredits()`.
 */
interface CreditFixture {
  credits_remaining_usd: string;
  monthly_credit_usd: number;
  period_start: string;
  period_end: string;
  overage_enabled: boolean;
  overage_cap_usd: number | null;
  hard_cap_usd: number | null;
  mtd_spend_usd: string;
  over_80_pct_threshold: boolean;
  tier: string;
}

function periodWindow(): { period_start: string; period_end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { period_start: start.toISOString(), period_end: end.toISOString() };
}

const creditFixtures: Record<string, CreditFixture> = {
  "free-no-credit": {
    credits_remaining_usd: "0.00",
    monthly_credit_usd: 0,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "0.00",
    over_80_pct_threshold: false,
    tier: "free",
  },
  "free-with-byo": {
    credits_remaining_usd: "0.00",
    monthly_credit_usd: 0,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "0.00",
    over_80_pct_threshold: false,
    tier: "free",
  },
  "solo-healthy": {
    credits_remaining_usd: "25.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "0.00",
    over_80_pct_threshold: false,
    tier: "solo",
  },
  "solo-warning": {
    credits_remaining_usd: "4.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "21.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
  "solo-halted": {
    credits_remaining_usd: "0.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "25.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
  "solo-overage": {
    credits_remaining_usd: "-10.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: true,
    overage_cap_usd: 50,
    hard_cap_usd: null,
    mtd_spend_usd: "35.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
  "solo-spend-cap-hit": {
    credits_remaining_usd: "5.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: 50,
    mtd_spend_usd: "50.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
};

function creditFixtureForOrg(orgId: string): CreditFixture {
  return creditFixtures[orgId] ?? creditFixtures["solo-healthy"]!;
}

/* -------------------------------------------------------------- helpers */

async function delay(ms = LATENCY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ok<T>(body: T, status = 200): MockResponse {
  return new MockResponse(status, body);
}

function notFound(message = "Not found"): MockResponse {
  return new MockResponse(404, { error: { code: "not_found", message } });
}

function methodNotAllowed(): MockResponse {
  return new MockResponse(405, { error: { code: "method_not_allowed", message: "Method not allowed" } });
}

function noContent(): MockResponse {
  return new MockResponse(204, undefined);
}

function parseBody<T = Record<string, unknown>>(init: RequestInit): T {
  if (!init.body) return {} as T;
  try {
    return JSON.parse(init.body as string) as T;
  } catch {
    return {} as T;
  }
}

function method(init: RequestInit): string {
  return (init.method || "GET").toUpperCase();
}

/** Re-derive the TOC's per-row metadata from the section store. Called after
 * any mutation that changes editability / lock state / version / proposal
 * status so the next GET /blueprint reflects the change. */
function recomputeBlueprintToc(blueprint: db.MockBlueprint): void {
  blueprint.toc.sections = Object.values(blueprint.sections)
    .sort((a, b) => a.ordering - b.ordering)
    .map((s) => ({
      section_key: s.section_key,
      title: s.title,
      summary: s.summary,
      token_count: s.token_count,
      origin: s.origin,
      editable: s.editable,
      locked: s.locked,
      protected_from_ai: s.protected_from_ai,
      current_version: s.current_version,
      has_pending_proposal: blueprint.proposals.some(
        (p) => p.section_key === s.section_key && p.status === "pending",
      ),
      parent_section_key: s.parent_section_key,
      ordering: s.ordering,
    }));
  blueprint.toc.pending_proposals_count = blueprint.proposals.filter((p) => p.status === "pending").length;
}

/* ----------------------------------------------------------------- cost */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDayLabel = (d: Date) => `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
const isoToUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Deterministic pseudo-random daily spend (USD), seeded purely by the calendar
 * date so the same window always renders identically across refetches (no
 * `Math.random` flicker when the billing-source toggle re-requests). A gentle
 * sine wave + weekday rhythm gives the burn chart a believable shape.
 */
function seededDaySpend(d: Date): number {
  const seed = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const wave = Math.sin(seed / 2.3) * 55 + Math.cos(seed / 5.1) * 36;
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6 ? -110 : 52;
  // ≈ $290/day average → a trailing-30-day window lands ~87% of the $10k
  // monthly budget (an "on track, watch it" story rather than a scary 126%).
  return Math.max(34, Math.round(205 + (seed % 13) * 13 + wave + weekend));
}

function genDailySeries(from: Date, to: Date): { day: string; usd: number }[] {
  const out: { day: string; usd: number }[] = [];
  const cur = new Date(from);
  let guard = 0;
  while (cur <= to && guard < 420) {
    out.push({ day: fmtDayLabel(cur), usd: seededDaySpend(cur) });
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return out;
}

/**
 * Build the `/v1/cost/summary` response for the requested window + billing
 * source. The BE (`athena/billing/cost_summary.py:build_cost_summary`) does
 * the real version of this off `cost_rollups_daily` + `token_usage`; the mock
 * reproduces the same *shape* so the redesigned page is fully exercisable:
 *
 *  - `from`/`to` (inclusive ISO dates) → a synthesised daily series for the
 *    window; absent → the canonical current-month series from `db.costData`.
 *  - `source` (all/byo/athena) → headline + breakdowns scaled to that slice.
 *  - Every breakdown keeps its pct so its rows always sum to the headline; the
 *    per-day token split + call/token counts scale against the canonical month.
 *  - `compare` carries the immediately-preceding equal-length window so the FE
 *    can render period-over-period deltas without a second round-trip.
 */
function buildCostSummaryResponse(query: URLSearchParams) {
  const base = db.costData;
  const source = ((query.get("source") as "all" | "byo" | "athena") || "all");
  const fromQ = query.get("from");
  const toQ = query.get("to");
  const reqLabel = query.get("label") || undefined;
  const sourceFactor = source === "byo" ? 0.38 : source === "athena" ? 0.62 : 1;
  // Org / Domain / Repo scope: scale the whole picture to a slice. A repo scope
  // is ingestion-only in the real BE (token_usage.repo_id is ingest-only), which
  // the page reflects; the mock just scales so the shape stays exercisable.
  const scopeKind = (query.get("scope") as "domain" | "repo" | null) || "org";
  const scopeId = query.get("domain_id") || query.get("repo_id") || undefined;
  const scopeName =
    scopeKind === "domain"
      ? base.spend_by_domain.find((d) => d.id === scopeId)?.name || "Domain"
      : scopeKind === "repo"
        ? base.spend_by_repo.find((r) => r.repo_id === scopeId)?.name || "Repository"
        : undefined;
  const scopeFactor = scopeKind === "domain" ? 0.3 : scopeKind === "repo" ? 0.14 : 1;
  const factor = sourceFactor * scopeFactor;

  // --- daily series + window metadata ---------------------------------
  let rawDaily: { day: string; usd: number }[];
  let rangeFrom: string;
  let rangeTo: string;
  let isCurrentPeriod: boolean;
  if (fromQ && toQ) {
    const from = isoToUTC(fromQ);
    const to = isoToUTC(toQ);
    rawDaily = genDailySeries(from, to);
    rangeFrom = fromQ;
    rangeTo = toQ;
    // "Today" in the caller's tz (real BE resolves the window in `tz`, not UTC);
    // compare YYYY-MM-DD strings so an IST evening isn't mis-flagged as a closed
    // period. Falls back to UTC today when no tz is sent.
    const tzParam = query.get("tz") || undefined;
    const todayLocal = tzParam
      ? new Date().toLocaleDateString("en-CA", { timeZone: tzParam })
      : new Date().toISOString().slice(0, 10);
    isCurrentPeriod = toQ >= todayLocal;
  } else {
    rawDaily = base.spend_daily.map((d) => ({ day: d.day, usd: d.usd }));
    rangeFrom = "2026-05-01";
    rangeTo = "2026-05-22";
    isCurrentPeriod = true;
  }

  // Source slice + per-day token split (proportional to spend). ~85k tokens/$
  // keeps the derived blended rate (~$12/1M) and I/O ratio realistic.
  const TOK_IN = 71_000;
  const TOK_OUT = 14_000;
  const spend_daily = rawDaily.map((d) => {
    const u = Math.round(d.usd * factor);
    return { day: d.day, usd: u, prompt_tokens: u * TOK_IN, completion_tokens: u * TOK_OUT };
  });

  const windowSpend = spend_daily.reduce((s, d) => s + d.usd, 0);
  const total_prompt_tokens = spend_daily.reduce((s, d) => s + d.prompt_tokens, 0);
  const total_completion_tokens = spend_daily.reduce((s, d) => s + d.completion_tokens, 0);
  // Scale call/token counts on the breakdown rows relative to the canonical
  // all-up month so they track the selected window + source.
  const callsRatio = windowSpend / Math.max(1, base.spend_usd);

  // --- headline -------------------------------------------------------
  const budget_usd = base.budget_usd;
  const daysElapsed = Math.max(1, spend_daily.length);
  const forecast_usd = isCurrentPeriod
    ? Math.round((windowSpend / daysElapsed) * Math.max(daysElapsed, 30))
    : windowSpend;
  const budget_utilization = budget_usd > 0 ? windowSpend / budget_usd : 0;

  // --- compare (previous equal-length window) -------------------------
  let compareSpend: number;
  if (fromQ && toQ) {
    const len = spend_daily.length;
    const prevTo = isoToUTC(fromQ);
    prevTo.setUTCDate(prevTo.getUTCDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setUTCDate(prevFrom.getUTCDate() - (len - 1));
    compareSpend = genDailySeries(prevFrom, prevTo).reduce((s, d) => s + Math.round(d.usd * factor), 0);
  } else {
    compareSpend = Math.round(windowSpend / 1.18);
  }
  const compareCalls = Math.round(base.total_calls * factor * (compareSpend / Math.max(1, windowSpend)));
  const trendPct = compareSpend > 0 ? Math.round(((windowSpend - compareSpend) / compareSpend) * 100) : 0;

  // --- breakdowns (pct preserved → rows sum to headline) --------------
  const scaleUsd = (pct: number) => Math.round(pct * windowSpend);
  const scaleCount = (n: number) => Math.round(n * callsRatio);
  const spend_by_domain = base.spend_by_domain.map((c) => ({ ...c, usd: scaleUsd(c.pct) }));
  const spend_by_model = base.spend_by_model.map((mm) => ({
    ...mm, usd: scaleUsd(mm.pct), calls: scaleCount(mm.calls),
    input_tok_k: scaleCount(mm.input_tok_k), output_tok_k: scaleCount(mm.output_tok_k),
  }));
  const spend_by_role = base.spend_by_role.map((r) => ({
    ...r, usd: scaleUsd(r.pct), calls: scaleCount(r.calls),
    input_tok_k: scaleCount(r.input_tok_k), output_tok_k: scaleCount(r.output_tok_k),
  }));
  const spend_by_provider = base.spend_by_provider.map((p) => ({
    ...p, usd: scaleUsd(p.pct), calls: scaleCount(p.calls),
    input_tok_k: scaleCount(p.input_tok_k), output_tok_k: scaleCount(p.output_tok_k),
  }));
  const spend_by_phase = base.spend_by_phase.map((p) => ({ ...p, usd: scaleUsd(p.pct) }));
  const spend_by_repo = base.spend_by_repo.map((r) => ({
    ...r, usd: scaleUsd(r.pct), calls: scaleCount(r.calls),
    prompt_tokens: scaleCount(r.prompt_tokens), completion_tokens: scaleCount(r.completion_tokens),
  }));
  const spend_by_key = source === "byo"
    ? base.spend_by_key.map((k) => ({ ...k, usd: scaleUsd(k.pct), calls: scaleCount(k.calls) }))
    : [];
  const top_tasks = base.top_tasks.map((t) => ({ ...t, usd: Math.max(1, scaleCount(t.usd)) }));

  // --- alerts (derived, not authored) ---------------------------------
  const alerts: { level: "info" | "warning" | "danger"; text: string }[] = [];
  if (isCurrentPeriod && forecast_usd > budget_usd) {
    alerts.push({
      level: "warning",
      text: `Forecast (${usd0(forecast_usd)}) is on track to exceed the ${usd0(budget_usd)} monthly budget by ~${usd0(forecast_usd - budget_usd)} - ${spend_by_domain[0]?.name ?? "the top domain"} is the largest driver.`,
    });
  }
  if (source !== "byo") {
    alerts.push({ level: "info", text: "Sonnet 4.6 routing saved an estimated $1,840 vs all-Opus over this window." });
  }

  // --- rehaul additions (efficiency / work-type / members / movers) --------
  const tokensTotal = total_prompt_tokens + total_completion_tokens;
  const cachedTokens = Math.round(base.total_cached_tokens * callsRatio);
  const blended = tokensTotal > 0 ? (windowSpend / tokensTotal) * 1_000_000 : 0;
  const callsTotal = Math.max(1, scaleCount(base.total_calls));
  const efficiency = {
    blended_per_1m: blended,
    prev_blended_per_1m: blended * 1.06,
    cache_hit_pct: total_prompt_tokens > 0 ? cachedTokens / total_prompt_tokens : 0,
    cache_savings_est_usd: Math.round(windowSpend * 0.23),
    avg_cost_per_call: windowSpend / callsTotal,
    avg_tokens_per_call: Math.round(tokensTotal / callsTotal),
    io_ratio: total_completion_tokens > 0 ? total_prompt_tokens / total_completion_tokens : 0,
    fallback_rate_pct: 2.1,
    call_distribution: { p50: 0.018, p95: 0.412, p99: 1.84, max: 6.21 },
  };
  const wt = (pct: number) => Math.round(pct * windowSpend);
  const work_type = [
    { key: "agent_task", name: "Agent tasks", group: "run" as const, usd: wt(0.37), note: "internal task stages (task_id set, phase_key NULL)" },
    { key: "chat", name: "Chat", group: "run" as const, usd: wt(0.15), note: "no task/run/repo id" },
    { key: "external_agent", name: "External agents", group: "run" as const, usd: wt(0.14), note: "MCP coding agents (usage_source != internal)" },
    { key: "ingest", name: "Knowledge ingestion", group: "build" as const, usd: wt(0.27), note: "phase_key = 'ingest'" },
    { key: "blueprint", name: "Blueprint (deep)", group: "build" as const, usd: wt(0.07), note: "phase_key = 'blueprint_deep'" },
    { key: "embeddings", name: "Embeddings", group: "build" as const, usd: 0, note: "platform-managed, $0 to org" },
  ];
  const usage_source = [
    { key: "internal", label: "Measured (internal)", value: 0.71, note: "Athena-run calls, provider-reported" },
    { key: "client_measured", label: "Exact (agent transcript)", value: 0.14, note: "coding-agent hook (ADR-089)" },
    { key: "measured_mcp_io", label: "Metered floor (MCP I/O)", value: 0.09, note: "server-side I/O metering" },
    { key: "self_reported", label: "Self-reported (estimate)", value: 0.06, note: "external agent's own claim" },
  ];
  const mem = (pct: number) => Math.round(pct * windowSpend);
  const spend_by_member = [
    { id: "u1", name: "Priya Nair", email: "priya@athena.ai", usd: mem(0.22), pct: 0.22, calls: scaleCount(7820), last_active: "2h ago", top_domain: "Payments" },
    { id: "u2", name: "Marcus Lee", email: "marcus@athena.ai", usd: mem(0.18), pct: 0.18, calls: scaleCount(6110), last_active: "5m ago", top_domain: "Platform" },
    { id: "u3", name: "Aisha Khan", email: "aisha@athena.ai", usd: mem(0.15), pct: 0.15, calls: scaleCount(5340), last_active: "1h ago", top_domain: "Growth" },
    { id: "u4", name: "Tom Becker", email: "tom@athena.ai", usd: mem(0.11), pct: 0.11, calls: scaleCount(3980), last_active: "yesterday", top_domain: "Data" },
    { id: "u-others", name: "12 other members", email: "", usd: mem(0.27), pct: 0.27, calls: scaleCount(10350), last_active: "", top_domain: "" },
    { id: "unattributed", name: "Unattributed", email: "before per-member tracking shipped", usd: mem(0.07), pct: 0.07, calls: scaleCount(4820), last_active: "", top_domain: "" },
  ];
  const tt = (pct: number) => Math.round(pct * windowSpend);
  const spend_by_task_type = [
    { type: "implementation", name: "Implementation", usd: tt(0.39), pct: 0.39, count: scaleCount(38), per_task: tt(0.39) / Math.max(1, scaleCount(38)) },
    { type: "feature", name: "Feature", usd: tt(0.14), pct: 0.14, count: scaleCount(22), per_task: tt(0.14) / Math.max(1, scaleCount(22)) },
    { type: "bug", name: "Bug", usd: tt(0.06), pct: 0.06, count: scaleCount(41), per_task: tt(0.06) / Math.max(1, scaleCount(41)) },
    { type: "design", name: "Design", usd: tt(0.05), pct: 0.05, count: scaleCount(12), per_task: tt(0.05) / Math.max(1, scaleCount(12)) },
    { type: "chore", name: "Chore", usd: tt(0.02), pct: 0.02, count: scaleCount(28), per_task: tt(0.02) / Math.max(1, scaleCount(28)) },
    { type: "test", name: "Test", usd: tt(0.02), pct: 0.02, count: scaleCount(19), per_task: tt(0.02) / Math.max(1, scaleCount(19)) },
  ];
  const top_movers = [
    { key: "mv1", name: spend_by_domain[0]?.name ?? "Growth", kind: "domain", delta_usd: Math.round(windowSpend * 0.035), delta_pct: 0.31, dir: "up" as const },
    { key: "mv2", name: spend_by_model[0]?.name ?? "claude-opus-4-8", kind: "model", delta_usd: Math.round(windowSpend * 0.03), delta_pct: 0.08, dir: "up" as const },
    { key: "mv3", name: spend_by_domain[1]?.name ?? "Platform", kind: "domain", delta_usd: -Math.round(windowSpend * 0.015), delta_pct: -0.06, dir: "down" as const },
    { key: "mv4", name: "Mobile", kind: "domain", delta_usd: -Math.round(windowSpend * 0.011), delta_pct: -0.12, dir: "down" as const },
  ];

  return {
    scope: { kind: scopeKind, id: scopeId, name: scopeName },
    efficiency,
    work_type,
    usage_source,
    spend_by_member,
    spend_by_task_type,
    top_movers,
    month: base.month,
    source,
    range: {
      from: rangeFrom,
      to: rangeTo,
      label: reqLabel || "This month",
      days: spend_daily.length,
      is_current_period: isCurrentPeriod,
    },
    compare: {
      label: fromQ && toQ ? "vs previous period" : "vs last month",
      spend_usd: compareSpend,
      total_tokens: Math.round((total_prompt_tokens + total_completion_tokens) * (compareSpend / Math.max(1, windowSpend))),
      total_calls: compareCalls,
    },
    spend_usd: windowSpend,
    forecast_usd,
    budget_usd,
    budget_utilization,
    trend: `${trendPct >= 0 ? "+" : ""}${trendPct}%`,
    total_prompt_tokens,
    total_completion_tokens,
    total_cached_tokens: Math.round(base.total_cached_tokens * callsRatio),
    total_calls: scaleCount(base.total_calls),
    spend_daily,
    spend_by_domain,
    spend_by_model,
    spend_by_role,
    spend_by_provider,
    spend_by_key,
    spend_by_phase,
    spend_by_repo,
    top_tasks,
    alerts,
  };
}

/** Split path into (pathname, searchParams). */
function splitPath(path: string): { pathname: string; query: URLSearchParams } {
  const idx = path.indexOf("?");
  if (idx < 0) return { pathname: path, query: new URLSearchParams() };
  return { pathname: path.slice(0, idx), query: new URLSearchParams(path.slice(idx + 1)) };
}

/* -------------------------------------------------------------- handler */

export async function handleMockRequest(path: string, init: RequestInit = {}): Promise<MockResponse> {
  await delay();
  const m = method(init);
  const { pathname, query } = splitPath(path);

  // /v1/me
  if (pathname === "/v1/me" && m === "GET") {
    return ok({ ...db.me, server_time: new Date().toISOString() });
  }

  // /v1/auth/sync
  if (pathname === "/v1/auth/sync" && m === "POST") {
    return ok({
      user_id: db.me.id,
      email: db.me.email,
      display_name: db.me.display_name,
      avatar_url: db.me.avatar_url,
      membership_count: db.me.memberships.length,
      server_time: new Date().toISOString(),
    });
  }
  if (pathname === "/v1/auth/logout" && m === "POST") {
    return ok({ accepted: true });
  }

  // /v1/orgs
  if (pathname === "/v1/orgs" && m === "GET") return ok(db.orgs);
  if (pathname === "/v1/orgs" && m === "POST") {
    const body = parseBody<{ name: string; slug: string; display_name?: string; edition?: string }>(init);
    const newOrg = {
      id: `org_${Date.now()}`,
      name: body.name,
      display_name: body.display_name ?? body.name,
      slug: body.slug,
      edition: body.edition ?? "pro",
      verified_domains: [],
      auto_join_for_verified_domain: false,
      default_role_for_invite: "engineer",
      created_at: new Date().toISOString(),
    };
    return ok(newOrg, 201);
  }
  let mm = pathname.match(/^\/v1\/orgs\/([^/]+)$/);
  if (mm) {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    if (m === "GET") return ok(org);
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(org, body);
      return ok(org);
    }
    if (m === "DELETE") {
      const body = parseBody<{ confirm_slug: string }>(init);
      if (body.confirm_slug !== org.slug) {
        return new MockResponse(422, { error: { code: "confirm_mismatch", message: "Slug confirmation does not match.", field: "confirm_slug" } });
      }
      return noContent();
    }
    return methodNotAllowed();
  }
  // §5.31 - org lifecycle endpoints. The new /v1/orgs/{id}/permanent DELETE
  // replaces the old DELETE /v1/orgs/{id} as the stage-2 path.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+):soft-delete$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    const body = parseBody<{ confirm_slug?: string }>(init);
    if (body.confirm_slug !== org.slug) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "Slug mismatch." } });
    }
    if (!org.deleted_at) {
      org.deleted_at = new Date().toISOString();
      org.deleted_by_user_id = db.me.id;
      // Cascade to every cap.
      for (const c of db.domains) {
        if (!c.deleted_at) { c.deleted_at = org.deleted_at; c.deleted_by_user_id = db.me.id; }
      }
    }
    return ok(org);
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+):restore$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    const cascadeAt = org.deleted_at;
    org.deleted_at = null;
    org.deleted_by_user_id = null;
    if (cascadeAt) {
      for (const c of db.domains) {
        if (c.deleted_at === cascadeAt) { c.deleted_at = null; c.deleted_by_user_id = null; }
      }
    }
    return ok(org);
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/permanent$/);
  if (mm && m === "DELETE") {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    if (!org.deleted_at) {
      return new MockResponse(409, { error: { code: "must_soft_delete_first", message: "Soft-delete first." } });
    }
    const body = parseBody<{ confirm_slug?: string }>(init);
    if (body.confirm_slug !== org.slug) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "Slug mismatch." } });
    }
    return noContent();
  }

  // /v1/orgs/{id}/knowledge
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    const k = db.orgKnowledge[orgId];
    if (!k) return notFound("Org knowledge not found");
    return ok(k);
  }

  // Per-route drill-down behind ONE cross-repo connection. Mirrors the BE:
  // pages the concrete edges for a (src_repo, dst_repo, kind) triple with a
  // true `total` so the FE's pager works. Synthesises `count` rows from the
  // matching connection fixture (source of truth for the rolled-up count).
  // GET /v1/orgs/{id}/knowledge/cross-repo-edges?src_repo_id=&dst_repo_id=&kind=&offset=&limit=
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/knowledge\/cross-repo-edges$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    const srcRepoId = query.get("src_repo_id") ?? "";
    const dstRepoId = query.get("dst_repo_id") ?? "";
    const kind = query.get("kind") ?? "";
    const offset = Math.max(0, Number(query.get("offset")) || 0);
    const limit = Math.max(1, Math.min(100, Number(query.get("limit")) || 20));
    const conn = db.orgKnowledge[orgId]?.cross_repo_edges.connections.find(
      (c) => c.src_repo_id === srcRepoId && c.dst_repo_id === dstRepoId && c.kind === kind,
    );
    const total = conn?.count ?? 0;
    const ROUTES = [
      "GET /v1/domains/{domain_id}",
      "POST /v1/mcp",
      "GET /v1/knowledge/search",
      "DELETE /v1/mcp/{server_id}",
      "GET /v1/repos",
    ];
    const HANDLERS = ["get_domain", "create_server", "search_knowledge", "delete_server", "list_repos"];
    const pageLen = Math.max(0, Math.min(limit, total - offset));
    const items = Array.from({ length: pageLen }, (_, i) => {
      const idx = offset + i;
      return {
        route: ROUTES[idx % ROUTES.length]!,
        src_symbol: "client.ts",
        dst_symbol: HANDLERS[idx % HANDLERS.length]!,
        transport: null,
        confidence: 0.9,
      };
    });
    return ok({ items, total, offset, limit });
  }

  // §6.0 row (5) - GET /v1/domains/{id}/knowledge → DomainKnowledge
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const cap = db.domains.find((c) => c.id === capId);
    if (!cap) return notFound("Domain not found");
    if (cap.deleted_at) return notFound("Domain soft-deleted");
    const k = db.domainKnowledge[capId];
    if (!k) return notFound("Domain knowledge not found");
    return ok(k);
  }

  // §6.0 row (6) - GET /v1/domains/{id}/repos/{repo_id}/knowledge → RepoKnowledge
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const cap = db.domains.find((c) => c.id === capId);
    if (!cap) return notFound("Domain not found");
    if (cap.deleted_at) return notFound("Domain soft-deleted");
    const k = db.repoKnowledge[`${capId}::${repoId}`];
    if (!k) return notFound("Repo knowledge not found");
    return ok(k);
  }

  // GET /v1/domains/{id}/repos/{repo_id}/branches → RepoBranchesResponse
  // (multi-branch picker, ADR-058 amendment). The default branch is always
  // indexed (its state mirrors the repo scalars); the sample feature branches
  // start un-indexed so the picker's "Index" affordance is exercisable.
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/branches$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const cap = db.domains.find((c) => c.id === capId);
    if (!cap) return notFound("Domain not found");
    if (cap.deleted_at) return notFound("Domain soft-deleted");
    const repo = (db.domainRepos[capId] ?? []).find(
      (r) => (r.repo_id ?? r.id) === repoId,
    );
    if (!repo) return notFound("Repo attachment not found");
    return ok({
      repo_id: repoId,
      default_branch: repo.default_branch,
      branches: [
        {
          name: repo.default_branch,
          is_default: true,
          indexed: true,
          head_sha: repo.branch_head_sha ?? null,
          last_indexed_sha: repo.last_indexed_sha ?? null,
          commits_behind: repo.commits_behind ?? 0,
          sync_stage: repo.current_sync_stage ?? null,
        },
        {
          name: "develop",
          is_default: false,
          indexed: false,
          head_sha: "def5678901234abcdef5678901234abcdef56789",
          last_indexed_sha: null,
          commits_behind: 5,
          sync_stage: null,
        },
        {
          name: "feat/branch-picker",
          is_default: false,
          indexed: false,
          head_sha: "fee9999888777666fee9999888777666fee99998",
          last_indexed_sha: null,
          commits_behind: 12,
          sync_stage: null,
        },
      ],
    });
  }

  // §5.29.14 - /v1/orgs/{id}/operations
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/operations$/);
  if (mm && m === "GET") {
    return ok(db.orgOperations);
  }

  // /v1/orgs/{id}/members
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/members$/);
  if (mm) {
    if (m === "GET") return ok(db.members);
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/members\/([^/]+)\/role$/);
  if (mm && m === "PATCH") {
    const userId = decodeURIComponent(mm[1]!);
    const member = db.members.find((u) => u.user_id === userId);
    if (!member) return notFound("Member not found");
    const body = parseBody<{ role: string }>(init);
    member.role = body.role;
    return ok(member);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/members\/([^/]+)\/(deactivate|reactivate)$/);
  if (mm && m === "POST") {
    const userId = decodeURIComponent(mm[1]!);
    const action = mm[2]!;
    const member = db.members.find((u) => u.user_id === userId);
    if (!member) return notFound("Member not found");
    member.deactivated_at = action === "deactivate" ? new Date().toISOString() : null;
    return ok(member);
  }
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/members\/transfer-ownership$/) && m === "POST") {
    const body = parseBody<{ new_owner_user_id: string; confirm_slug: string }>(init);
    const newOwner = db.members.find((u) => u.user_id === body.new_owner_user_id);
    if (!newOwner) return notFound("Target member not found");
    db.members.forEach((u) => { u.is_owner = u.user_id === newOwner.user_id; if (u.is_owner) u.role = "owner"; });
    return ok(newOwner);
  }

  // Roles & permissions - the data-driven RBAC surface.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/permissions$/);
  if (mm && m === "GET") return ok(db.permissionCatalog);
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/roles$/);
  if (mm) {
    if (m === "GET") {
      // Live member counts so role-changes on /settings/members reflect here.
      return ok(db.orgRoles.map((r) => ({
        ...r,
        member_count: db.members.filter((u) => u.role === r.name && !u.deactivated_at).length,
      })));
    }
    if (m === "POST") {
      const body = parseBody<{ name: string; description?: string | null; permissions: string[] }>(init);
      const name = body.name.trim();
      if (["owner", "service"].includes(name.toLowerCase())) {
        return new MockResponse(400, { error: { code: "invalid_argument", field: "name", message: `'${name}' is a reserved role name.` } });
      }
      if (db.orgRoles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
        return new MockResponse(409, { error: { code: "conflict", field: "name", message: `A role named '${name}' already exists.` } });
      }
      const role = {
        id: `role_${Date.now().toString(36)}`,
        name,
        description: body.description ?? null,
        permissions: [...new Set(body.permissions)].sort(),
        is_system: false,
        member_count: 0,
        pending_invitation_count: 0,
        is_default_for_invite: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.orgRoles.push(role);
      return ok(role, 201);
    }
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/roles\/([^/]+)$/);
  if (mm) {
    const roleId = decodeURIComponent(mm[1]!);
    const role = db.orgRoles.find((r) => r.id === roleId);
    if (!role) return notFound("Role not found in this organization.");
    if (m === "PATCH") {
      const body = parseBody<{ name?: string; description?: string | null; permissions?: string[] }>(init);
      if (body.name && body.name.trim() !== role.name) {
        const newName = body.name.trim();
        if (db.orgRoles.some((r) => r.id !== role.id && r.name.toLowerCase() === newName.toLowerCase())) {
          return new MockResponse(409, { error: { code: "conflict", field: "name", message: `A role named '${newName}' already exists.` } });
        }
        // Rename cascade - memberships keep pointing at the role.
        db.members.forEach((u) => { if (u.role === role.name) u.role = newName; });
        role.name = newName;
      }
      if (body.description !== undefined) role.description = body.description ?? null;
      if (body.permissions) role.permissions = [...new Set(body.permissions)].sort();
      role.updated_at = new Date().toISOString();
      return ok(role);
    }
    if (m === "DELETE") {
      const usedBy = db.members.filter((u) => u.role === role.name && !u.deactivated_at);
      const reassignTo = query.get("reassign_to");
      if ((usedBy.length > 0 || role.is_default_for_invite) && !reassignTo) {
        return new MockResponse(409, { error: { code: "conflict", message: `'${role.name}' is still in use. Pick a role to move its members to, then delete it.` } });
      }
      if (reassignTo) {
        const target = db.orgRoles.find((r) => r.id === reassignTo);
        if (!target) return notFound("Reassignment role not found.");
        usedBy.forEach((u) => { u.role = target.name; });
        if (role.is_default_for_invite) target.is_default_for_invite = true;
      }
      db.orgRoles.splice(db.orgRoles.findIndex((r) => r.id === role.id), 1);
      return new MockResponse(204, null);
    }
  }

  // /v1/orgs/{id}/invitations
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/invitations$/);
  if (mm) {
    if (m === "GET") return ok(db.invitations);
    if (m === "POST") {
      const body = parseBody<{ email: string; role: string }>(init);
      const orgId = decodeURIComponent(mm[1]!);
      const inv: typeof db.invitations[number] = {
        id: `inv_${Date.now()}`,
        org_id: orgId,
        email: body.email,
        kind: "email",
        role: body.role,
        invited_by_user_id: db.me.id,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        accepted_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      db.invitations.push(inv);
      // §7.9.6 row 2471 - soft-cap warning: when adding this invitation
      // would tip the workspace over `total_seats`, BE attaches a
      // non-fatal `warning` envelope. Mock follows the contract so the
      // FE soft-cap toast renders.
      const fixture = seatsFixtureForOrg(orgId);
      const projected =
        fixture.active_seats + fixture.pending_invitations + 1;
      if (projected > fixture.total_seats) {
        const overBy = projected - fixture.total_seats;
        return ok({
          ...inv,
          warning: {
            code: "over_seat_cap",
            message: `Workspace is ${overBy} over capacity. Buy seats or upgrade to admit them.`,
            metadata: {
              active_seats: fixture.active_seats,
              total_seats: fixture.total_seats,
              pending_invitations: fixture.pending_invitations + 1,
            },
          },
        }, 201);
      }
      return ok(inv, 201);
    }
    return methodNotAllowed();
  }
  // §5.4 row-3 - link-mode mint. Stays adjacent to the email-mode mint
  // for parity. The returned `invitation_url` is the share payload.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/invitations\/link$/);
  if (mm && m === "POST") {
    const body = parseBody<{ role: string }>(init);
    const orgId = decodeURIComponent(mm[1]!);
    const invId = `inv_${Date.now()}`;
    const inv: typeof db.invitations[number] = {
      id: invId,
      org_id: orgId,
      email: null,
      kind: "link",
      role: body.role,
      invited_by_user_id: db.me.id,
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      accepted_at: null,
      revoked_at: null,
      created_at: new Date().toISOString(),
    };
    db.invitations.push(inv);
    return ok({ ...inv, invitation_url: `/accept-invite/mock-${invId}` }, 201);
  }
  // §5.4 row-2 - resend an email-mode invitation. Mirrors BE: extends
  // `expires_at` and 409s on link-mode / accepted / revoked rows.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/invitations\/([^/]+)\/resend$/);
  if (mm && m === "POST") {
    const invId = decodeURIComponent(mm[1]!);
    const inv = db.invitations.find((i) => i.id === invId);
    if (!inv) return notFound("Invitation not found");
    if (inv.kind !== "email" || inv.email === null) {
      return new MockResponse(409, {
        error: { code: "invitation_not_resendable", message: "Only email-mode invitations can be resent." },
      });
    }
    if (inv.accepted_at !== null) {
      return new MockResponse(409, {
        error: { code: "invitation_already_used", message: "This invitation has already been accepted." },
      });
    }
    if (inv.revoked_at !== null) {
      return new MockResponse(409, {
        error: { code: "invitation_revoked", message: "This invitation has been revoked. Issue a new one instead." },
      });
    }
    inv.expires_at = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    return ok(inv);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/invitations\/([^/]+)\/revoke$/);
  if (mm && m === "POST") {
    const invId = decodeURIComponent(mm[1]!);
    const inv = db.invitations.find((i) => i.id === invId);
    if (!inv) return notFound("Invitation not found");
    inv.revoked_at = new Date().toISOString();
    return ok(inv);
  }
  mm = pathname.match(/^\/v1\/invitations\/([^/]+)\/accept$/);
  if (mm && m === "POST") {
    return ok({ org_id: db.ORG_ID, role: "engineer" });
  }

  // /v1/orgs/{id}/email-domains
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/email-domains$/);
  if (mm) {
    if (m === "GET") return ok(db.emailDomains);
    if (m === "POST") {
      const body = parseBody<{ domain: string }>(init);
      const d = {
        id: `dom_${Date.now()}`,
        domain: body.domain,
        dns_txt_record_name: `_athena.${body.domain}`,
        dns_txt_value: `athena-verify=${Math.random().toString(36).slice(2, 12)}`,
        verified_at: null,
        last_checked_at: null,
        last_error: null,
      };
      db.emailDomains.push(d);
      return ok(d, 201);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/email-domains\/([^/]+)\/verify$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const d = db.emailDomains.find((x) => x.id === id);
    if (!d) return notFound("Domain not found");
    d.verified_at = new Date().toISOString();
    d.last_checked_at = new Date().toISOString();
    d.last_error = null;
    return ok(d);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/email-domains\/([^/]+)$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const idx = db.emailDomains.findIndex((x) => x.id === id);
    if (idx < 0) return notFound("Domain not found");
    db.emailDomains.splice(idx, 1);
    return noContent();
  }

  // /v1/domains  - §5.31 supports ?include_deleted=false|true|only
  if (pathname === "/v1/domains" && m === "GET") {
    const includeDeleted = query.get("include_deleted") ?? "false";
    let list = db.domains;
    if (includeDeleted === "false") list = list.filter((c) => !c.deleted_at);
    else if (includeDeleted === "only") list = list.filter((c) => !!c.deleted_at);
    return ok(list.map((c) => ({ ...c, repos: (db.domainRepos[c.id] ?? []).length })));
  }
  if (pathname === "/v1/domains" && m === "POST") {
    const body = parseBody<{ slug: string; name: string; description?: string }>(init);
    const cap = {
      id: `dom_${Date.now()}`,
      org_id: db.ORG_ID,
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      created_by_user_id: db.me.id,
      archived_at: null,
      created_at: new Date().toISOString(),
      emblem: "violet" as const,
      icon: "circle",
      repos: 0,
      open_tasks: 0,
      domain_notes: 0,
      last_activity: "just now",
    };
    db.domains.push(cap);
    return ok(cap, 201);
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)$/);
  if (mm) {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.domains.find((c) => c.id === id);
    if (!cap) return notFound("Domain not found");
    if (m === "GET") return ok({ ...cap, repos: (db.domainRepos[cap.id] ?? []).length });
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(cap, body);
      return ok(cap);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/archive$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.domains.find((c) => c.id === id);
    if (!cap) return notFound("Domain not found");
    cap.archived_at = new Date().toISOString();
    return ok(cap);
  }
  // §5.31 - domain soft-delete / restore / permanent-delete.
  mm = pathname.match(/^\/v1\/domains\/([^/]+):soft-delete$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.domains.find((c) => c.id === id);
    if (!cap) return notFound("Domain not found");
    if (!cap.deleted_at) {
      cap.deleted_at = new Date().toISOString();
      cap.deleted_by_user_id = db.me.id;
    }
    return ok({ ...cap, repos: (db.domainRepos[cap.id] ?? []).length });
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+):restore$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.domains.find((c) => c.id === id);
    if (!cap) return notFound("Domain not found");
    cap.deleted_at = null;
    cap.deleted_by_user_id = null;
    return ok({ ...cap, repos: (db.domainRepos[cap.id] ?? []).length });
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/permanent$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.domains.find((c) => c.id === id);
    if (!cap) return notFound("Domain not found");
    if (!cap.deleted_at) {
      return new Response(
        JSON.stringify({ error: { code: "must_soft_delete_first", message: "Soft-delete first." } }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    }
    const body = parseBody<{ confirm_slug?: string }>(init);
    if (body.confirm_slug !== cap.slug) {
      return new Response(
        JSON.stringify({ error: { code: "invalid_argument", message: "Slug mismatch." } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const idx = db.domains.findIndex((c) => c.id === id);
    if (idx >= 0) db.domains.splice(idx, 1);
    delete db.domainRepos[id];
    delete db.domainMembers[id];
    return new Response(null, { status: 204 });
  }
  // §5.30 - per-domain access control: members CRUD.
  {
    const listOrAdd = pathname.match(/^\/v1\/domains\/([^/]+)\/members$/);
    const itemOp = pathname.match(/^\/v1\/domains\/([^/]+)\/members\/([^/]+)$/);
    const capId = decodeURIComponent((listOrAdd ?? itemOp)?.[1] ?? "");
    if (capId) {
      const list = (db.domainMembers[capId] ??= []);
      const memberToWire = (row: db.MockDomainMember) => {
        const u = row.user_id === db.me.id
          ? { email: db.me.email, display_name: db.me.display_name, avatar_url: db.me.avatar_url }
          : (() => {
              const orgMember = db.members.find((mm) => mm.user_id === row.user_id);
              return {
                email: orgMember?.email ?? "unknown@example.com",
                display_name: orgMember?.display_name ?? null,
                avatar_url: orgMember?.avatar_url ?? null,
              };
            })();
        // Effective permissions mirror the BE derivation: admin → all,
        // viewer → none, custom → the row's configured subset.
        const allDomainPerms = db.permissionCatalog.domain.map((p) => p.key);
        const permissions =
          row.role === "admin" ? allDomainPerms
          : row.role === "custom" ? (row.permissions ?? [])
          : [];
        return {
          id: row.id,
          domain_id: row.domain_id,
          user_id: row.user_id,
          role: row.role,
          permissions,
          email: u.email,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          joined_at: row.joined_at,
          added_by_user_id: row.added_by_user_id,
        };
      };

      if (listOrAdd && m === "GET") {
        return ok(list.filter((r) => r.deactivated_at === null).map(memberToWire));
      }
      if (listOrAdd && m === "POST") {
        const body = parseBody<{ email: string; role: "admin" | "viewer" | "custom"; permissions?: string[] }>(init);
        const emailLc = body.email.toLowerCase();
        const orgUser = emailLc === db.me.email.toLowerCase()
          ? { user_id: db.me.id }
          : db.members.find((mm) => mm.email.toLowerCase() === emailLc && mm.deactivated_at === null);
        if (!orgUser) {
          return new MockResponse(404, {
            error: {
              code: "user_not_in_org",
              message: "No Athena user with that email is in your organization.",
            },
          });
        }
        const existing = list.find((r) => r.user_id === orgUser.user_id && r.deactivated_at === null);
        if (existing) {
          return new MockResponse(409, {
            error: {
              code: "conflict",
              field: "email",
              message: `User is already a ${existing.role} of this domain.`,
            },
          });
        }
        const row: db.MockDomainMember = {
          id: `cm_${Date.now().toString(36)}`,
          domain_id: capId,
          user_id: orgUser.user_id,
          role: body.role,
          permissions: body.role === "custom" ? (body.permissions ?? []) : [],
          joined_at: new Date().toISOString(),
          added_by_user_id: db.me.id,
          deactivated_at: null,
        };
        list.push(row);
        return ok(memberToWire(row), 201);
      }
      if (itemOp) {
        const userId = decodeURIComponent(itemOp[2]!);
        const row = list.find((r) => r.user_id === userId && r.deactivated_at === null);
        if (!row) return notFound("Domain member not found.");
        if (m === "PATCH") {
          const body = parseBody<{ role: "admin" | "viewer" | "custom"; permissions?: string[] }>(init);
          row.role = body.role;
          row.permissions = body.role === "custom" ? (body.permissions ?? []) : [];
          return ok(memberToWire(row));
        }
        if (m === "DELETE") {
          row.deactivated_at = new Date().toISOString();
          return new MockResponse(204, null);
        }
      }
    }
  }
  // §5.29.12 - PATCH /v1/domains/{id}/settings (currently just budget).
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/settings$/);
  if (mm && m === "PATCH") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.domains.find((c) => c.id === id);
    if (!cap) return notFound("Domain not found");
    const body = parseBody<{ budget_mtd_usd?: number }>(init);
    // Reflect the budget in the cost summary's per-domain budget too,
    // so the /cost page's progress bar updates without a refetch round-trip.
    if (typeof body.budget_mtd_usd === "number") {
      const summary = db.costData?.spend_by_domain?.find((c) => c.id === id);
      if (summary) summary.budget = body.budget_mtd_usd;
    }
    return ok({ id, budget_mtd_usd: body.budget_mtd_usd ?? null });
  }
  // §5.31 - /v1/repos lifecycle. We don't keep a separate org-scoped
  // `repos` store in the mock; we derive everything from the per-cap
  // attachment rows (`db.domainRepos`). The endpoints below mutate
  // `repo_deleted_at` on every attachment row for the given `repo_id`
  // - that's the only state the FE consumes for the per-row chip.
  if (pathname === "/v1/repos" && m === "GET") {
    const includeDeleted = query.get("include_deleted") ?? "false";
    const byRepoId = new Map<string, db.MockRepoFull>();
    for (const [capId, list] of Object.entries(db.domainRepos)) {
      for (const a of list) {
        const rid = a.repo_id;
        if (!rid) continue;
        const existing = byRepoId.get(rid);
        const attached = [...(existing?.attached_domain_ids ?? []), capId];
        byRepoId.set(rid, {
          id: rid,
          org_id: db.ORG_ID,
          integration_id: a.integration_id,
          full_name: a.repo_full_name,
          default_branch: a.default_branch,
          last_indexed_sha: a.last_indexed_sha ?? null,
          branch_head_sha: a.branch_head_sha ?? null,
          archived_at: null,
          deleted_at: a.repo_deleted_at ?? null,
          deleted_by_user_id: null,
          current_sync_stage: a.current_sync_stage ?? null,
          created_at: a.created_at,
          attached_domain_ids: attached,
        });
      }
    }
    let rows = [...byRepoId.values()];
    if (includeDeleted === "false") rows = rows.filter((r) => !r.deleted_at);
    else if (includeDeleted === "only") rows = rows.filter((r) => !!r.deleted_at);
    return ok(rows);
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+):soft-delete$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const now = new Date().toISOString();
    let any = false;
    for (const list of Object.values(db.domainRepos)) {
      for (const a of list) {
        if (a.repo_id === id) { a.repo_deleted_at = now; any = true; }
      }
    }
    if (!any) return notFound("Repo not found");
    return ok({ id, deleted_at: now });
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+):restore$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    let any = false;
    for (const list of Object.values(db.domainRepos)) {
      for (const a of list) {
        if (a.repo_id === id) { a.repo_deleted_at = null; any = true; }
      }
    }
    if (!any) return notFound("Repo not found");
    return ok({ id, deleted_at: null });
  }
  // ADR-086-A - sandbox tab. Mock shows the full AI-setup flow: a "ready" repo
  // with a guideline + a couple of known issues so the redesigned tab renders.
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox\/status$/);
  if (mm && m === "GET") {
    return ok({
      state: "configured",
      feature_enabled: true,
      tier_eligible: true,
      has_config: true,
      snapshot_status: "ready",
      snapshot_built_at: new Date(Date.now() - 3600_000).toISOString(),
      snapshot_error: null,
      profile_status: "ready",
      open_issue_count: 1,
      message: "Sandbox is configured.",
    });
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox\/profile$/);
  if (mm && m === "GET") {
    return ok({
      status: "ready",
      model: "claude-opus-4-8",
      facts: {
        toolchain: "Node 22, pnpm 9",
        package_managers: ["pnpm"],
        build_command: "pnpm build",
        test_command: "pnpm test",
        working_dir: ".",
        run_notes: "Tests need no network; build emits to dist/.",
      },
      guideline_md:
        "# Working in this repo\n\n- Install: `pnpm i`\n- Build: `pnpm build`\n- Test: `pnpm test`\n\nPrefer editing `src/`; the `dist/` folder is generated.",
      summary: "Build and tests pass. One legacy test is flaky.",
      last_setup_at: new Date(Date.now() - 3600_000).toISOString(),
      updated_at: new Date(Date.now() - 3600_000).toISOString(),
    });
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox\/activity$/);
  if (mm && m === "GET") {
    return ok({
      status: "ready",
      steps: [
        { summary: "Validated build + tests", status: "done" },
        { summary: "Wrote the repo guideline", status: "done" },
        { summary: "Setup ready", status: "done" },
      ],
      log_tail: "$ pnpm i\n... done\n$ pnpm build\n... ok\n$ pnpm test\n6 passed, 1 flaky\n[exit 0]",
    });
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox\/issues$/);
  if (mm && m === "GET") {
    return ok([
      {
        id: "iss_1", kind: "flaky", severity: "warning",
        title: "test_legacy_sync occasionally times out",
        detail: "AssertionError: timed out after 5000ms (intermittent)",
        status: "open", source: "setup",
        first_seen_at: new Date(Date.now() - 3600_000).toISOString(),
        last_seen_at: new Date(Date.now() - 3600_000).toISOString(),
      },
    ]);
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox\/issues\/([^/]+)$/);
  if (mm && m === "PATCH") {
    const status = parseBody<{ status?: string }>(init).status ?? "ignored";
    return ok({
      id: mm[2], kind: "flaky", severity: "warning",
      title: "test_legacy_sync occasionally times out",
      detail: "AssertionError: timed out after 5000ms (intermittent)",
      status, source: "setup",
      first_seen_at: new Date(Date.now() - 3600_000).toISOString(),
      last_seen_at: new Date(Date.now() - 3600_000).toISOString(),
    });
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox:configure$/);
  if (mm && m === "POST") return ok({ status: "configuring", job_id: "mock_setup" });
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox\/config$/);
  if (mm && m === "GET") return ok(null);
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox\/config:autodetect$/);
  if (mm && m === "POST") {
    return ok({
      spec: {
        base_image: "node-22",
        install_commands: ["npm ci"],
        build_command: "npm run build",
        test_command: "npm test",
        test_select_cmd: null,
        working_subdir: null,
        env: {},
        resource_profile: "default",
      },
      confidence: "low",
      low_confidence_fields: ["base_image", "install_commands", "build_command", "test_command"],
      detect_signature: null,
      note: "Review and adjust these commands for your project.",
    });
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/sandbox:build$/);
  if (mm && m === "POST") return ok({ status: "building", job_id: "mock_build" });
  // §3.13 row 1 - synthetic ingest-progress for the FE timeline
  // disclosure. Derived from whatever `current_sync_stage` the
  // attachment carries so the timeline animates in lockstep with the
  // existing chip flow (queued → cloning → … → completed).
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/ingest-progress$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    let stage: string | null = null;
    let branchSha = "";
    let lastIndexed: string | null = null;
    for (const list of Object.values(db.domainRepos)) {
      for (const a of list) {
        if (a.repo_id === id) {
          stage = a.current_sync_stage ?? null;
          branchSha = a.branch_head_sha ?? a.last_indexed_sha ?? "";
          lastIndexed = a.last_indexed_sha ?? null;
        }
      }
    }
    if (!stage && !lastIndexed) return ok(null);
    const effectiveStage = stage ?? "completed";
    const startedIso = new Date(Date.now() - 30_000).toISOString();
    const completedIso = effectiveStage === "completed" || effectiveStage === "failed"
      ? new Date().toISOString()
      : null;
    const current = {
      stage: effectiveStage,
      entered_at: startedIso,
      duration_ms: completedIso ? 30_000 : Math.max(1_000, Date.now() - Date.parse(startedIso)),
      files_total: 120,
      files_processed: effectiveStage === "completed" ? 120 : effectiveStage === "indexing" ? 96 : 42,
      last_processed_path: "src/example/module.py",
      error:
        effectiveStage === "failed"
          ? "git: clone timed out (mock)"
          : effectiveStage === "paused"
            ? "LLM call failed after 3 attempts (src/giant-generated.ts)"
            : null,
      // item 1 - the file the paused ingest stopped on (drives the skip dialog).
      paused_path: effectiveStage === "paused" ? "src/giant-generated.ts" : null,
      // The WHY - the underlying LLM error, shown so the user knows the reason.
      paused_error:
        effectiveStage === "paused"
          ? "LLM call failed after 3 attempts (src/giant-generated.ts) - RateLimitError: 429 quota exceeded"
          : null,
    };
    return ok({
      repo_id: id,
      current,
      history: [current],
      job_id: "mock_job_1",
      branch_sha: branchSha || "abc123def456",
      last_heartbeat_at: startedIso,
      files_total: current.files_total,
      files_processed: current.files_processed,
      last_processed_path: current.last_processed_path,
    });
  }
  // §6.0 - per-repo file browser. Generates fake file rows from the
  // existing knowledge fixtures (modules + symbols from `repoKnowledge`)
  // so the FE works end-to-end in mock mode. The detail endpoint expands
  // the synthesised lists. Repo lookup is by `repo_id` across every
  // domain's repoKnowledge keyspace (`${capId}::${repoId}`).
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    return ok(mockRepoFilesList(repoId, query));
  }
  // §6.5.6 FE-mirror routes - `/dependents`, `/dependencies`, `/slice`,
  // `/content` MUST match before the generic `/files/{id}$` route below
  // so the latter doesn't gobble the segment.
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/dependents$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    return ok(mockFileGraphWalk(repoId, fileId, "incoming", query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/dependencies$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    return ok(mockFileGraphWalk(repoId, fileId, "outgoing", query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/slice$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    return ok(mockFileGraphWalk(repoId, fileId, "slice", query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/content$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    const body = mockFileContent(repoId, fileId, query);
    if (!body) return notFound("File not found");
    return ok(body);
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/grep$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    return ok(mockRepoGrep(repoId, query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    const detail = mockRepoFileDetail(repoId, fileId);
    if (!detail) return notFound("File not found");
    return ok(detail);
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/permanent$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    let found = false;
    for (const capId of Object.keys(db.domainRepos)) {
      const list = db.domainRepos[capId] ?? [];
      const before = list.length;
      db.domainRepos[capId] = list.filter((a) => a.repo_id !== id);
      if (db.domainRepos[capId].length < before) found = true;
    }
    if (!found) return notFound("Repo not found");
    return new Response(null, { status: 204 });
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos$/);
  if (mm) {
    const id = decodeURIComponent(mm[1]!);
    if (m === "GET") return ok([...(db.domainRepos[id] ?? [])]);
    if (m === "POST") {
      const body = parseBody<{ integration_id: string; repo_full_name: string; default_branch?: string }>(init);
      // Auto-enqueue first ingest on attach (§5.29.11 / B7.3). Stage starts at
      // `queued` - the real BE flips `queued → cloning` only when the Arq
      // worker actually picks up the job (max-jobs=1 → repos process 1-by-1).
      // We simulate that here by stacking the pickup delays across all
      // currently-in-flight rows in this domain so the chips show the
      // serial queue behaviour even though setTimeout itself is parallel.
      const newSha = Math.random().toString(16).slice(2, 14).padEnd(40, "0");
      const list = (db.domainRepos[id] ??= []);
      // Count rows already queued/cloning to stagger the new one's pickup.
      const inFlight = list.filter((r) =>
        r.current_sync_stage && ["queued", "cloning", "parsing", "embedding", "indexing"].includes(r.current_sync_stage),
      ).length;
      const pickupDelay = 600 + inFlight * 5500; // each prior row needs ~5.5s to drain
      const repo = {
        id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        domain_id: id,
        integration_id: body.integration_id,
        repo_full_name: body.repo_full_name,
        default_branch: body.default_branch ?? "main",
        attached_by_user_id: db.me.id,
        created_at: new Date().toISOString(),
        branch_head_sha: newSha,
        last_indexed_sha: null as string | null,
        last_sync_attempt_at: new Date().toISOString(),
        current_sync_stage: "queued" as SyncStage | null,
        last_sync_job_id: `arq_${Date.now()}`,
      };
      list.push(repo);
      setTimeout(() => { repo.current_sync_stage = "cloning"; },   pickupDelay);
      setTimeout(() => { repo.current_sync_stage = "parsing"; },   pickupDelay + 1500);
      setTimeout(() => { repo.current_sync_stage = "embedding"; }, pickupDelay + 3000);
      setTimeout(() => { repo.current_sync_stage = "indexing"; },  pickupDelay + 4500);
      setTimeout(() => {
        repo.current_sync_stage = "completed";
        repo.last_indexed_sha = newSha;
      }, pickupDelay + 5500);
      return ok(repo, 201);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)$/);
  if (mm && m === "DELETE") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const list = db.domainRepos[capId] ?? [];
    const idx = list.findIndex((r) => r.id === repoId);
    if (idx < 0) return notFound("Repo not found on domain");
    list.splice(idx, 1);
    return noContent();
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/resources$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    return ok(db.domainResources[id] ?? []);
  }
  // NOTE: the multipart POST upload is short-circuited client-side in
  // `uploadDomainResource` (config.isMock) - it persists straight to the mock
  // db - so there is no POST arm here (it would never be reached).
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/resources\/([^/]+)$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const resourceId = decodeURIComponent(mm[2]!);
    // Assign a NEW array (not in-place splice) so the GET that follows returns
    // a fresh reference and React's `setResources` actually re-renders.
    db.domainResources[id] = (db.domainResources[id] ?? []).filter((r) => r.id !== resourceId);
    return noContent();
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/config$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const cfg = db.domainConfigs[id];
    if (!cfg) return notFound("Domain config not found");
    // Mirror the BE: derive attached skills from the live skill records (as
    // {id,name,slug}) so an attach/detach on the Config tab is reflected on
    // refetch, and links never point at a stale id.
    const skills = db.skills
      .filter((s) => s.attached_domains.includes(id) && s.status !== "archived")
      .map((s) => ({ id: s.id, name: s.name, slug: s.slug }));
    return ok({ ...cfg, skills });
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/notes$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    return ok(db.domainNotes[id] ?? []);
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const k = db.domainKnowledge[id];
    if (!k) return notFound("Domain knowledge not found");
    return ok(k);
  }
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const key = `${capId}::${repoId}`;
    const k = db.repoKnowledge[key];
    if (!k) return notFound("Repo knowledge not found");
    return ok(k);
  }
  // §5.27 r14 - GET /v1/domains/{dom_id}/repos/{repo_id}/tier-tree
  // ADR-073 §4 five-tier hierarchy for the TierExplorer on the repo
  // detail page. Returns 404 when no curated tree exists; the FE page
  // catches and renders without the tree (already does in the live API
  // contract).
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/tier-tree$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const key = `${capId}:${repoId}`;
    const tree = db.tierTrees[key];
    if (!tree) return notFound("Tier tree not found");
    return ok(tree);
  }
  // §5.29.11 / B7.2 - POST /v1/domains/{id}/repos/{dom_repo_id}/knowledge:sync
  // Simulates the worker by stepping through the 4 stages
  // (cloning → parsing → embedding → indexing → completed) and
  // flipping last_indexed_sha at the end. Refuses with 409 when a
  // stage is already in flight so the FE's dedup path can demo.
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/knowledge:sync$/);
  if (mm && m === "POST") {
    const capId = decodeURIComponent(mm[1]!);
    const capRepoId = decodeURIComponent(mm[2]!);
    const list = db.domainRepos[capId] ?? [];
    const repo = list.find((r) => r.id === capRepoId);
    if (!repo) return notFound("Repo attachment not found");
    const inFlight = new Set(["cloning", "parsing", "embedding", "indexing"]);
    if (repo.current_sync_stage && inFlight.has(repo.current_sync_stage)) {
      return new MockResponse(409, {
        error: {
          code: "conflict",
          message: `Sync already in progress (stage: ${repo.current_sync_stage}). Wait for it to finish.`,
        },
      });
    }
    const newSha = Math.random().toString(16).slice(2, 14).padEnd(40, "0");
    const jobId = `arq_${Date.now()}`;
    repo.branch_head_sha = newSha;
    repo.current_sync_stage = "cloning";
    repo.last_sync_attempt_at = new Date().toISOString();
    setTimeout(() => { repo.current_sync_stage = "parsing"; },   1500);
    setTimeout(() => { repo.current_sync_stage = "embedding"; }, 3000);
    setTimeout(() => { repo.current_sync_stage = "indexing"; },  4500);
    setTimeout(() => {
      repo.current_sync_stage = "completed";
      repo.last_indexed_sha = newSha;
    }, 5500);
    return ok({
      job_id: jobId,
      status: "queued",
      repo_id: capRepoId,
      branch_sha: newSha,
    });
  }
  // Stop ingestion - POST /v1/domains/{id}/repos/{dom_repo_id}/knowledge:cancel
  // Mirrors the BE cooperative cancel: when a stage is in flight we flip it to
  // `cancelled` (instant FE feedback) and report cancelled:true; when nothing
  // is running it's an idempotent no-op (cancelled:false).
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/knowledge:cancel$/);
  if (mm && m === "POST") {
    const capId = decodeURIComponent(mm[1]!);
    const capRepoId = decodeURIComponent(mm[2]!);
    const list = db.domainRepos[capId] ?? [];
    const repo = list.find((r) => r.id === capRepoId);
    if (!repo) return notFound("Repo attachment not found");
    const inFlight = new Set(["queued", "cloning", "parsing", "embedding", "indexing"]);
    const wasRunning = !!repo.current_sync_stage && inFlight.has(repo.current_sync_stage);
    if (wasRunning) {
      repo.current_sync_stage = "cancelled";
    }
    return ok({
      repo_id: capRepoId,
      cancelled: wasRunning,
      branch_sha: repo.branch_head_sha ?? null,
    });
  }
  // Batch 12k - POST /v1/domains/{id}/repos/{dom_repo_id}/knowledge:retry-enrichments
  // Mock simulates a successful backfill that flips the chip from
  // ``degraded`` back to ``completed`` so the FE demo path is honest.
  mm = pathname.match(
    /^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/knowledge:retry-enrichments$/,
  );
  if (mm && m === "POST") {
    const capId = decodeURIComponent(mm[1]!);
    const capRepoId = decodeURIComponent(mm[2]!);
    const list = db.domainRepos[capId] ?? [];
    const repo = list.find((r) => r.id === capRepoId);
    if (!repo) return notFound("Repo attachment not found");
    if (repo.current_sync_stage === "degraded") {
      repo.current_sync_stage = "completed";
    }
    return ok({
      retried: 3,
      succeeded: 3,
      still_failed: 0,
      by_kind: {
        embedding: { retried: 3, succeeded: 3, still_failed: 0 },
      },
    });
  }
  // item 1 - POST /v1/domains/{id}/repos/{dom_repo_id}/knowledge:skip-file
  // Resume a PAUSED ingest by skipping the failed file. Mock flips a `paused`
  // repo back to `completed` (the file resolved without the LLM) so the demo
  // path is honest; a no-op when nothing is paused.
  mm = pathname.match(
    /^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/knowledge:skip-file$/,
  );
  if (mm && m === "POST") {
    const capId = decodeURIComponent(mm[1]!);
    const capRepoId = decodeURIComponent(mm[2]!);
    const list = db.domainRepos[capId] ?? [];
    const repo = list.find((r) => r.id === capRepoId);
    if (!repo) return notFound("Repo attachment not found");
    const skipAll = parseBody<{ skip_all?: boolean }>(init).skip_all === true;
    const wasPaused = repo.current_sync_stage === "paused";
    if (wasPaused) {
      repo.current_sync_stage = "completed";
    }
    return ok({
      repo_id: capRepoId,
      resumed: wasPaused,
      skipped_path: wasPaused ? "src/giant-generated.ts" : null,
      job_id: wasPaused ? "ingest:mock:skip" : null,
      branch_sha: repo.branch_head_sha ?? null,
      skip_all: wasPaused ? skipAll : false,
    });
  }

  // /v1/audit/events
  if (pathname === "/v1/audit/events" && m === "GET") {
    const limit = Number(query.get("limit")) || 50;
    const action = query.get("action");
    const actorId = query.get("actor_id");
    let events = db.auditEvents.slice();
    if (action) events = events.filter((e) => e.action.includes(action));
    if (actorId) events = events.filter((e) => e.actor_id === actorId);
    return ok({ events: events.slice(0, limit), next_cursor: null });
  }
  if (pathname === "/v1/audit/verify" && m === "POST") {
    return ok({ verified: db.auditEvents.length });
  }

  // /v1/orgs/{id}/api-tokens
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/api-tokens$/);
  if (mm) {
    if (m === "GET") return ok(db.apiTokens);
    if (m === "POST") {
      const body = parseBody<{ name: string; scopes?: string[]; expires_at?: string | null }>(init);
      const id = `tok_${Date.now()}`;
      const raw = `ath_live_${Math.random().toString(36).slice(2, 26)}`;
      const summary = {
        id,
        name: body.name,
        prefix: `${raw.slice(0, 12)}…${raw.slice(-3)}`,
        scopes: body.scopes ?? [],
        expires_at: body.expires_at ?? null,
        last_used_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      db.apiTokens.push(summary);
      return ok({ ...summary, token: raw }, 201);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/api-tokens\/([^/]+)\/revoke$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const tok = db.apiTokens.find((t) => t.id === id);
    if (!tok) return notFound("Token not found");
    tok.revoked_at = new Date().toISOString();
    return ok(tok);
  }

  // §5.29.10 Item 1b - DecisionRecord CRUD for domain + org scopes.
  // GET returns only `active` rows (superseded/reverted hidden from the tab).
  {
    const capList = pathname.match(/^\/v1\/domains\/([^/]+)\/decisions$/);
    const capItem = pathname.match(/^\/v1\/domains\/([^/]+)\/decisions\/([^/]+)$/);
    const capRevert = pathname.match(/^\/v1\/domains\/([^/]+)\/decisions\/([^/]+)\/revert$/);
    const capEscalate = pathname.match(/^\/v1\/domains\/([^/]+)\/decisions\/([^/]+)\/escalate$/);
    const orgList = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions$/);
    const orgItem = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions\/([^/]+)$/);
    const orgRevert = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions\/([^/]+)\/revert$/);
    const orgEscalate = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions\/([^/]+)\/escalate$/);
    // §5.29.10 row 1c - repo-scoped governance feed. Same shape as
    // domain/org so it shares the resolveScope path.
    const repoList = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions$/);
    const repoItem = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions\/([^/]+)$/);
    const repoRevert = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions\/([^/]+)\/revert$/);
    const repoEscalate = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions\/([^/]+)\/escalate$/);

    const resolveScope = (
      capMatch: RegExpMatchArray | null,
      orgMatch: RegExpMatchArray | null,
      repoMatch: RegExpMatchArray | null,
    ) => {
      if (capMatch) {
        const id = decodeURIComponent(capMatch[1]!);
        return { id, store: db.domainDecisions as Record<string, db.MockDecisionRecord[]> };
      }
      if (orgMatch) {
        const id = decodeURIComponent(orgMatch[1]!);
        return { id, store: db.orgDecisions as Record<string, db.MockDecisionRecord[]> };
      }
      if (repoMatch) {
        const id = decodeURIComponent(repoMatch[1]!);
        return { id, store: db.repoDecisions as Record<string, db.MockDecisionRecord[]> };
      }
      return null;
    };

    const scope = resolveScope(
      capList ?? capItem ?? capRevert ?? capEscalate,
      orgList ?? orgItem ?? orgRevert ?? orgEscalate,
      repoList ?? repoItem ?? repoRevert ?? repoEscalate,
    );
    if (scope) {
      const list = (scope.store[scope.id] ??= []);
      const isList = capList || orgList || repoList;
      const isItem = capItem || orgItem || repoItem;
      const isRevert = capRevert || orgRevert || repoRevert;
      const isEscalate = capEscalate || orgEscalate || repoEscalate;
      const itemMatch = capItem ?? orgItem ?? repoItem;
      const revertMatch = capRevert ?? orgRevert ?? repoRevert;
      const escalateMatch = capEscalate ?? orgEscalate ?? repoEscalate;

      if (isList && m === "GET") {
        return ok(list.filter((d) => d.status === "active"));
      }
      if (isList && m === "POST") {
        const body = parseBody<{ title: string; tag: string; kind: "ADR" | "Convention" | "Domain note"; summary: string }>(init);
        const now = new Date();
        const row: db.MockDecisionRecord = {
          id: `dr_${Date.now().toString(36)}`,
          title: body.title, tag: body.tag, kind: body.kind, summary: body.summary,
          author: db.me.display_name, date: "just now",
          status: "active", created_at: now.toISOString(),
        };
        list.unshift(row);
        return ok(row, 201);
      }
      if (isItem && m === "PATCH") {
        const decisionId = decodeURIComponent(itemMatch![2]!);
        const original = list.find((d) => d.id === decisionId && d.status === "active");
        if (!original) return notFound("Decision not found");
        const body = parseBody<Partial<{ title: string; tag: string; kind: "ADR" | "Convention" | "Domain note"; summary: string }>>(init);
        original.status = "superseded";
        const replacement: db.MockDecisionRecord = {
          ...original,
          id: `dr_${Date.now().toString(36)}`,
          title: body.title ?? original.title,
          tag: body.tag ?? original.tag,
          kind: body.kind ?? original.kind,
          summary: body.summary ?? original.summary,
          status: "active",
          date: "just now",
          created_at: new Date().toISOString(),
        };
        list.unshift(replacement);
        return ok(replacement);
      }
      if (isRevert && m === "POST") {
        const decisionId = decodeURIComponent(revertMatch![2]!);
        const target = list.find((d) => d.id === decisionId);
        if (!target) return notFound("Decision not found");
        target.status = "reverted";
        return ok(target);
      }
      if (isEscalate && m === "POST") {
        const decisionId = decodeURIComponent(escalateMatch![2]!);
        const target = list.find((d) => d.id === decisionId);
        if (!target) return notFound("Decision not found");
        // Escalation on a governance record converts a Domain note → Convention
        // → ADR (one rung at a time). Capped at ADR.
        if (target.kind === "Domain note") target.kind = "Convention";
        else if (target.kind === "Convention") target.kind = "ADR";
        return ok(target);
      }
    }
  }

  // /v1/orgs/{id}/integrations
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations$/);
  if (mm && m === "GET") return ok(db.integrations);

  // GET /v1/orgs/{id}/integrations/providers - per-deployment OAuth
  // readiness. Demo posture: everything reads as configured so the
  // cards render Connect buttons (which then 403 with the demo toast).
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/providers$/);
  if (mm && m === "GET") {
    return ok(
      [
        ["github", "source_control"], ["gitlab", "source_control"],
        ["bitbucket", "source_control"], ["jira", "work"],
        ["linear", "work"], ["asana", "work"], ["azure_devops", "work"],
        ["slack", "chat"], ["figma", "design"], ["notion", "knowledge"],
        ["confluence", "knowledge"],
      ].map(([provider, kind]) => ({
        provider,
        kind,
        name: provider,
        category: kind,
        blurb: "",
        provides_mcp: false,
        connect_kind: "oauth",
        configured: true,
        // GitHub OAuth App → authorized-app page (grant new-org access).
        manage_url:
          provider === "github"
            ? "https://github.com/settings/connections/applications/demo_client_id"
            : null,
      })),
    );
  }

  // POST /v1/orgs/{id}/integrations/{provider}/{kind}/oauth/initiate
  // Canonical OAuth-start route (replaces the legacy
  // `/v1/integrations/{provider}/oauth/start` shape). Demo posture: read-only
  // so the FE shows a structured 403 toast rather than firing the popup.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)\/([^/]+)\/oauth\/initiate$/);
  if (mm && m === "POST") {
    return new MockResponse(403, {
      error: {
        code: "demo_mode",
        message: "OAuth flows are read-only in demo mode.",
      },
    });
  }

  // POST /v1/integrations/{id}/disconnect - FE-canonical disconnect
  // (header-scoped org). Demo posture: read-only.
  mm = pathname.match(/^\/v1\/integrations\/([^/]+)\/disconnect$/);
  if (mm && m === "POST") {
    return new MockResponse(403, {
      error: {
        code: "demo_mode",
        message: "Integrations are read-only in demo mode.",
      },
    });
  }

  // POST /v1/integrations/{id}/acknowledge-drift - FE-canonical drift ack
  // (header-scoped org). Demo posture: read-only.
  mm = pathname.match(/^\/v1\/integrations\/([^/]+)\/acknowledge-drift$/);
  if (mm && m === "POST") {
    return new MockResponse(403, {
      error: {
        code: "demo_mode",
        message: "Integrations are read-only in demo mode.",
      },
    });
  }

  // §5.14 r2 - GET /v1/orgs/{id}/integrations/{provider}/{kind}/schema
  // Mock-mode returns a synthetic JSON Schema for known providers so the
  // wizard exercises its dynamic-fields branch without the real BE. The
  // schemas mirror the live `config_schema` blocks in
  // athena-backend/athena/integrations/providers/*.py.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)\/([^/]+)\/schema$/);
  if (mm && m === "GET") {
    const provider = decodeURIComponent(mm[1]!);
    const schemas: Record<string, unknown> = {
      github: {
        type: "object",
        required: ["app_id"],
        properties: {
          app_id:           { type: "string", title: "GitHub App ID", description: "Found on your App's settings page." },
          app_slug:         { type: "string", title: "App slug", description: "Used to build the install URL." },
          installation_id:  { type: "string", title: "Installation ID", description: "Populated automatically after install.", readOnly: true },
          api_base:         { type: "string", title: "API base URL", description: "Override for GHES. Defaults to api.github.com.", format: "uri" },
        },
      },
      gitlab: {
        type: "object",
        required: ["client_id"],
        properties: {
          client_id: { type: "string", title: "OAuth Application ID", description: "Found at gitlab.com/-/profile/applications." },
          api_base:  { type: "string", title: "GitLab base URL",     description: "Default https://gitlab.com. Override for self-managed.", format: "uri" },
          group:     { type: "string", title: "Default group",       description: "Optional. Scopes the repo-listing to one group." },
        },
      },
      bitbucket: {
        type: "object",
        required: ["client_id"],
        properties: {
          client_id:    { type: "string", title: "OAuth client ID",      description: "Bitbucket Cloud workspace setting." },
          api_base:     { type: "string", title: "API base URL",         description: "Default https://api.bitbucket.org/2.0.", format: "uri" },
          workspace_id: { type: "string", title: "Workspace slug",       description: "Optional default workspace." },
        },
      },
    };
    const schema = schemas[provider];
    if (!schema) return notFound(`No integration registered for provider=${provider}.`);
    return ok(schema);
  }

  // §5.29.11 / B7.4 - GET /v1/orgs/{id}/integrations/{id}/available-repos
  // Returns a synthetic catalog so AttachRepoDialog has something to
  // render in mock mode. Mixes public/private/archived to exercise UI
  // edge cases.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/[^/]+\/available-repos$/);
  if (mm && m === "GET") {
    const today = new Date();
    const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000).toISOString();
    return ok([
      { full_name: "lumen/inbox-web",           default_branch: "main",   private: false, description: "Customer inbox front-end (React 19, Vite).",          pushed_at: daysAgo(1),   archived: false },
      { full_name: "lumen/inbox-svc",           default_branch: "main",   private: true,  description: "Inbox routing service (Go).",                         pushed_at: daysAgo(2),   archived: false },
      { full_name: "lumen/triage-worker",       default_branch: "main",   private: true,  description: "AI triage worker (Python).",                          pushed_at: daysAgo(3),   archived: false },
      { full_name: "lumen/billing-svc",         default_branch: "main",   private: true,  description: "Stripe-backed billing service.",                      pushed_at: daysAgo(4),   archived: false },
      { full_name: "lumen/billing-web",         default_branch: "main",   private: false, description: "Billing portal SPA.",                                 pushed_at: daysAgo(5),   archived: false },
      { full_name: "lumen/finance-pipeline",    default_branch: "main",   private: true,  description: "Stripe → ledger ETL.",                                pushed_at: daysAgo(6),   archived: false },
      { full_name: "lumen/marketing-site",      default_branch: "main",   private: false, description: "Public marketing site (Next.js).",                    pushed_at: daysAgo(7),   archived: false },
      { full_name: "lumen/dbt-models",          default_branch: "main",   private: true,  description: "dbt models for the warehouse.",                       pushed_at: daysAgo(8),   archived: false },
      { full_name: "lumen/lake-ingest",         default_branch: "main",   private: true,  description: "S3 → Snowflake ingestion.",                           pushed_at: daysAgo(9),   archived: false },
      { full_name: "lumen/identity-svc",        default_branch: "main",   private: true,  description: "SSO/SCIM/JWT identity service.",                      pushed_at: daysAgo(10),  archived: false },
      { full_name: "lumen/design-tokens",       default_branch: "main",   private: false, description: "OKLCH design tokens + Tailwind preset.",              pushed_at: daysAgo(11),  archived: false },
      { full_name: "lumen/admin-web",           default_branch: "main",   private: true,  description: "Internal admin console.",                             pushed_at: daysAgo(12),  archived: false },
      { full_name: "lumen/infra",               default_branch: "main",   private: true,  description: "Terraform + Pulumi infra modules.",                   pushed_at: daysAgo(13),  archived: false },
      { full_name: "lumen/sandbox-experiments", default_branch: "main",   private: true,  description: "Internal experiments + spikes.",                      pushed_at: daysAgo(14),  archived: false },
      { full_name: "lumen/old-monolith",        default_branch: "master", private: true,  description: "Pre-2024 PHP monolith - retained read-only.",         pushed_at: daysAgo(180), archived: true },
    ]);
  }
  // DELETE /v1/orgs/{id}/integrations/{id} - disconnect via spec-compliant
  // verb (matches the BE `disconnect_integration` route). The legacy
  // POST `/disconnect` form is still handled below for back-compat.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)$/);
  if (mm && m === "DELETE") {
    const intId = decodeURIComponent(mm[1]!);
    const integ = db.integrations.find((i) => i.id === intId);
    if (!integ) return notFound("Integration not found");
    integ.status = "available";
    delete integ.connected_at;
    delete integ.last_sync;
    delete integ.connected_as;
    delete integ.scope;
    return new MockResponse(204, undefined);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)\/(connect|disconnect|test)$/);
  if (mm) {
    const intId = decodeURIComponent(mm[1]!);
    const action = mm[2]!;
    const integ = db.integrations.find((i) => i.id === intId);
    if (!integ) return notFound("Integration not found");
    // Demo posture: connect / disconnect are state mutations we don't want
    // to expose in the read-only demo. `test` stays available because it's
    // a no-op read that just returns a synthetic latency.
    if ((action === "connect" || action === "disconnect") && m === "POST") {
      return new MockResponse(403, { error: { code: "demo_mode", message: "Integrations are read-only in demo mode." } });
    }
    if (action === "connect" && m === "POST") {
      integ.status = "connected";
      integ.connected_at = new Date().toISOString();
      integ.last_sync = "just now";

      // Auto-provision a paired MCP entry if this integration publishes one
      // and we don't already have a server linked to it. Status starts as
      // pending_review so a human enables the tools before agents use them.
      if (integ.provides_mcp && !db.mcpServers.find((s) => s.integration_id === integ.id)) {
        db.mcpServers.push({
          id: `mcp_${integ.id.replace("int_", "")}`,
          org_id: db.ORG_ID,
          slug: integ.id.replace("int_", ""),
          name: integ.name,
          source: "integration",
          integration_id: integ.id,
          transport: "http",
          endpoint_url: `https://mcp.${integ.id.replace("int_", "")}.com/v1`,
          auth: {
            method: integ.connect_kind === "oauth" ? "oauth" : "bearer",
            last_rotated_at: "just now",
            ...(integ.connect_kind === "oauth" ? { oauth_connected_as: integ.connected_as ?? integ.name } : { bearer_hint: "••• ending xxxx" }),
          },
          egress_policy: "any",
          version: "1.0.0",
          version_last_reviewed: new Date().toISOString().slice(0, 10),
          health: {
            status: "pending_review",
            status_message: "Auto-provisioned from a connected integration. Review and enable tools to start using it.",
            last_check_at: new Date().toISOString(),
            latency_p50_ms: 0,
            latency_p95_ms: 0,
            error_rate_24h: 0,
            uptime_30d: 1.0,
          },
          tools: [],
          created_by_user_id: db.me.id,
          created_at: new Date().toISOString(),
        });
      }
      return ok(integ);
    }
    if (action === "disconnect" && m === "POST") {
      integ.status = "available";
      delete integ.connected_at;
      delete integ.last_sync;
      delete integ.connected_as;
      delete integ.scope;
      return ok(integ);
    }
    if (action === "test" && m === "POST") {
      return ok({ ok: true, latency_ms: Math.floor(80 + Math.random() * 220), detail: `${integ.name} reachable.` });
    }
  }

  // /v1/mcp - MCP servers (org-scoped)
  if (pathname === "/v1/mcp" && m === "GET") return ok(db.mcpServers);

  // POST /v1/mcp/{id}/sync-tools - live tools/list refresh. Demo
  // posture: no upstream to probe, report a clean no-op.
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/sync-tools$/);
  if (mm && m === "POST") {
    return ok({ synced: 0, detail: "Demo mode - no live server to sync from." });
  }
  if (pathname === "/v1/mcp" && m === "POST") {
    const body = parseBody<{
      name: string; source: "custom" | "integration"; integration_id?: string;
      transport: "http" | "sse" | "websocket"; endpoint_url: string;
      auth: { method: string; bearer_hint?: string; oauth_app_id?: string; oauth_connected_as?: string; mtls_cert_subject?: string; header_name?: string };
      egress_policy: "any" | "region_pinned" | "vpc_peered"; egress_region?: string;
      enabled_tools: Array<{ name: string; description?: string; approval: "none" | "per_session" | "per_call"; risk: "read" | "write" | "destructive" }>;
    }>(init);
    const id = `mcp_${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}_${Date.now().toString(36)}`;
    const server: db.MockMcpServer = {
      id,
      org_id: db.ORG_ID,
      slug: body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32),
      name: body.name,
      source: body.source,
      ...(body.integration_id ? { integration_id: body.integration_id } : {}),
      transport: body.transport,
      endpoint_url: body.endpoint_url,
      auth: { ...body.auth, method: body.auth.method as db.MockMcpServer["auth"]["method"], last_rotated_at: "just now" },
      egress_policy: body.egress_policy,
      ...(body.egress_region ? { egress_region: body.egress_region } : {}),
      version: "1.0.0",
      version_last_reviewed: new Date().toISOString().slice(0, 10),
      health: {
        status: "connected",
        last_check_at: new Date().toISOString(),
        latency_p50_ms: Math.floor(60 + Math.random() * 180),
        latency_p95_ms: Math.floor(150 + Math.random() * 400),
        error_rate_24h: 0,
        uptime_30d: 1.0,
      },
      tools: body.enabled_tools.map((t, i) => ({
        id: `tl_${id.slice(4, 10)}_${i}`,
        name: t.name,
        description: t.description ?? `Tool ${t.name}`,
        enabled: true,
        approval: t.approval,
        risk: t.risk,
        usage_count_30d: 0,
        last_used_at: null,
      })),
      created_by_user_id: db.me.id,
      created_at: new Date().toISOString(),
    };
    db.mcpServers.push(server);
    return ok(server, 201);
  }
  mm = pathname.match(/^\/v1\/mcp\/discover$/);
  if (mm && m === "POST") {
    // Mocked introspection - returns a generic set of tools so the wizard can render.
    return ok({
      version: "1.0.0",
      tools: [
        { name: "search",        description: "Full-text search across the connected resource.",                  risk: "read" },
        { name: "get_item",      description: "Fetch a single item by id.",                                       risk: "read" },
        { name: "list_items",    description: "List items with paging + filters.",                                risk: "read" },
        { name: "create_item",   description: "Create a new item. Requires session-level approval.",              risk: "write" },
        { name: "update_item",   description: "Patch fields on an existing item.",                                risk: "write" },
        { name: "delete_item",   description: "Permanently remove an item. Requires per-call approval.",          risk: "destructive" },
      ],
    });
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)$/);
  if (mm) {
    const id = decodeURIComponent(mm[1]!);
    const srv = db.mcpServers.find((s) => s.id === id);
    if (!srv) return notFound("MCP server not found");
    if (m === "GET") return ok(srv);
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(srv, body);
      return ok(srv);
    }
    if (m === "DELETE") {
      const idx = db.mcpServers.findIndex((s) => s.id === id);
      if (idx >= 0) db.mcpServers.splice(idx, 1);
      return noContent();
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/test$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const srv = db.mcpServers.find((s) => s.id === id);
    if (!srv) return notFound("MCP server not found");
    const ok_ = srv.health.status === "connected" || srv.health.status === "degraded";
    return ok({
      ok: ok_,
      latency_ms: srv.health.latency_p50_ms || Math.floor(120 + Math.random() * 280),
      tool_count: srv.tools.length,
      detail: ok_ ? `${srv.name} reachable. ${srv.tools.length} tools advertised.` : (srv.health.status_message ?? "Server unreachable."),
    });
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/acknowledge-drift$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const srv = db.mcpServers.find((s) => s.id === id);
    if (!srv) return notFound("MCP server not found");
    srv.pending_drift = false;
    srv.version_last_reviewed = new Date().toISOString().slice(0, 10);
    srv.tools.forEach((t) => { t.added_since_review = false; });
    return ok(srv);
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/tools\/([^/]+)\/toggle$/);
  if (mm && m === "POST") {
    const match = mm;
    const srv = db.mcpServers.find((s) => s.id === decodeURIComponent(match[1]!));
    if (!srv) return notFound("MCP server not found");
    const tool = srv.tools.find((t) => t.id === decodeURIComponent(match[2]!));
    if (!tool) return notFound("Tool not found");
    const body = parseBody<{ enabled: boolean }>(init);
    tool.enabled = body.enabled;
    return ok(tool);
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/tools\/([^/]+)\/approval$/);
  if (mm && m === "POST") {
    const match = mm;
    const srv = db.mcpServers.find((s) => s.id === decodeURIComponent(match[1]!));
    if (!srv) return notFound("MCP server not found");
    const tool = srv.tools.find((t) => t.id === decodeURIComponent(match[2]!));
    if (!tool) return notFound("Tool not found");
    const body = parseBody<{ approval: "none" | "per_session" | "per_call" }>(init);
    tool.approval = body.approval;
    return ok(tool);
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/calls$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    return ok(db.mcpRecentCalls[id] ?? []);
  }

  // §5.29.3 / ADR-081 - /v1/billing/* - mock-mode billing surface. Returns
  // the same dev-unrestricted shape the live BE produces when the flag is
  // on, so the UI exercises the dev-mode empty state without a real backend.
  // The gateway columns are `gateway_*` (was `stripe_*`) post migration 0083.
  if (pathname === "/v1/billing/subscription" && m === "GET") {
    return ok({
      id: "00000000-0000-0000-0000-000000000001",
      gateway_subscription_id: "dev_mock0001",
      gateway_plan_id: "dev_unrestricted",
      tier: "dev_unrestricted",
      status: "active",
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }
  // ADR-081 - checkout-order (renamed from checkout-session) + in-app cancel
  // (replaced portal-session). Both 503 in dev-unrestricted mock mode.
  if (pathname === "/v1/billing/checkout-order" && m === "POST") {
    return new MockResponse(503, {
      error: { code: "dev_mode_active", message: "Razorpay is disabled in dev mode." },
    });
  }
  if (pathname === "/v1/billing/cancel" && m === "POST") {
    return new MockResponse(503, {
      error: { code: "dev_mode_active", message: "Razorpay is disabled in dev mode." },
    });
  }
  // ADR-081 - verify the Checkout.js callback. Mock mode always confirms so
  // a designer exercising the flow sees the success path.
  if (pathname === "/v1/billing/verify" && m === "POST") {
    const body = parseBody<{ razorpay_order_id?: string; razorpay_payment_id?: string }>(init);
    return ok({
      verified: true,
      order_id: body.razorpay_order_id ?? "order_mock",
      payment_id: body.razorpay_payment_id ?? "pay_mock",
    });
  }
  // §7.9.5 row 2464 / ADR-081 - public price catalog. INR ints (or null in
  // dev). Served directly in mock mode so designers can verify the ₹ labels
  // without a network round-trip; the FE also falls back to the constants in
  // `lib/billing/price-catalog.ts` when the endpoint is unreachable.
  if (pathname === "/v1/billing/price-catalog" && m === "GET") {
    return ok({
      currency: "INR",
      solo_base: 1499,
      solo_extra_seat: 1299,
      pro_base: 7999,
      pro_extra_seat: 899,
      usd_to_inr: 100,
    });
  }

  // §7.9.5 row 2463 - seat-billing fixtures keyed by org id. Three
  // fixtures the dispatcher requires: solo-at-cap, pro-with-headroom,
  // pro-at-cap. Falls back to a `pro-with-headroom`-shaped payload for
  // the demo org so the UI renders something sensible.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/seats$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    return ok(seatsFixtureForOrg(orgId));
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/seats\/buy$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ count: number }>(init);
    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    const fixture = seatsFixtureForOrg(orgId);
    const perSeat = fixture.extra_seat_price_per_month ?? 0;
    return ok({
      ...mockOrderPayload(orgId, "seats", count * perSeat),
      tier: fixture.tier,
      requested_seats: count,
      projected_total: fixture.total_seats + count,
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/seats\/release$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ count: number }>(init);
    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    const fixture = seatsFixtureForOrg(orgId);
    if (fixture.additional_seats - count < 0
        || fixture.total_seats - count < fixture.active_seats) {
      return new MockResponse(409, {
        error: {
          code: "seats_release_would_displace",
          message: "Releasing those seats would displace an active member.",
          metadata: {
            active_seats: fixture.active_seats,
            additional_seats: fixture.additional_seats,
          },
        },
      });
    }
    return ok({
      additional_seats: fixture.additional_seats - count,
      total_seats: fixture.total_seats - count,
      tier: fixture.tier,
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/billing\/upgrade$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ additional_seats?: number }>(init);
    const extras = Math.max(0, Math.min(50, Number(body.additional_seats) || 0));
    // ADR-081 - upgrade is now a one-time Razorpay Order (Pro base + extras).
    return ok(mockOrderPayload(orgId, "tier_pro", 7999 + extras * 899));
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/billing\/downgrade-to-solo$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const fixture = seatsFixtureForOrg(orgId);
    // 409 when more than one active member - matches the BE contract.
    if (fixture.active_seats > 1) {
      return new MockResponse(409, {
        error: {
          code: "downgrade_blocked_active_members",
          message: "Reduce the team to a single member before downgrading to Solo.",
          metadata: { active_seats: fixture.active_seats },
        },
      });
    }
    // ADR-081 - in-app flip (no charge, no checkout URL).
    return ok({ tier: "solo", status: "active" });
  }

  // §7.10.5 - Credit-balance fixtures keyed by org id. Returns one of
  // 7 named fixtures (free-no-credit, free-with-byo, solo-healthy,
  // solo-warning, solo-halted, solo-overage, solo-spend-cap-hit) so
  // designers exercise every meter / banner state.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/credits$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    // The ledger is USD; stamp the fixed USD→INR rate so the FE renders
    // the customer-facing credit/cap figures in ₹ (ADR-081).
    return ok({ ...creditFixtureForOrg(orgId), usd_to_inr: 100 });
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/credits\/topup$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ amount_usd: number }>(init);
    const amount = Math.max(10, Math.min(1000, Number(body.amount_usd) || 25));
    // ADR-081 - one-time Razorpay Order (charged in INR; ledger stays USD).
    return ok(mockOrderPayload(orgId, "credit_topup", amount * 100));
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/credits\/configure-overage$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ enabled: boolean; cap_usd: number | null }>(init);
    const fixture = creditFixtures[orgId];
    if (fixture) {
      fixture.overage_enabled = !!body.enabled;
      fixture.overage_cap_usd =
        body.cap_usd === null || body.cap_usd === undefined
          ? null
          : Number(body.cap_usd);
    }
    return noContent();
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/spend-cap$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ cap_usd: number | null }>(init);
    const fixture = creditFixtures[orgId];
    if (fixture) {
      fixture.hard_cap_usd =
        body.cap_usd === null || body.cap_usd === undefined
          ? null
          : Number(body.cap_usd);
    }
    return noContent();
  }

  // §7.9.7 - invitation preview. Token suffix drives the fixture so QA
  // can exercise both branches without a real BE: tokens ending in
  // "_full" surface `seats_available: false` (solo copy unless the
  // token includes "_pro"), everything else surfaces the open path.
  mm = pathname.match(/^\/v1\/invitations\/([^/]+)\/preview$/);
  if (mm && m === "GET") {
    const token = decodeURIComponent(mm[1]!);
    const seatsAvailable = !token.endsWith("_full");
    const isPro = token.includes("_pro");
    return ok({
      org_slug: "acme",
      org_name: "Acme Corp",
      role: "engineer",
      inviter_email: "owner@acme.com",
      seats_available: seatsAvailable,
      owner_email: "owner@acme.com",
      tier: isPro ? "pro" : "solo",
    });
  }

  // /v1/orgs/{id}/sso
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/sso$/);
  if (mm) {
    if (m === "GET") return ok(db.ssoConfig);
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(db.ssoConfig, body);
      return ok(db.ssoConfig);
    }
    return methodNotAllowed();
  }
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/sso\/scim\/sync$/) && m === "POST") {
    db.ssoConfig.scim_last_sync = "just now";
    return ok({
      users_provisioned: db.ssoConfig.scim_users_provisioned,
      groups_mapped: db.ssoConfig.scim_groups_mapped,
      last_sync: db.ssoConfig.scim_last_sync,
    });
  }

  // /v1/llm/providers/catalog (§7.8.1) - project onto the full wire shape
  // (description / pricing / rate-limit synthesised for omitted fields).
  if (pathname === "/v1/llm/providers/catalog" && m === "GET") {
    return ok(db.catalogWire());
  }

  // /v1/users/me/ai-subscriptions - personal subscription connections.
  // Mock keeps an in-memory list: connect always "verifies", PATCH swaps
  // the toggles, DELETE removes. Enough to walk the whole settings flow
  // offline (the chat egress itself has no mock-mode parity).
  if (pathname === "/v1/users/me/ai-subscriptions" && m === "GET") {
    return ok(db.aiSubscriptions);
  }
  mm = pathname.match(/^\/v1\/users\/me\/ai-subscriptions\/([^/]+)(\/verify)?$/);
  if (mm) {
    const provider = decodeURIComponent(mm[1]!);
    const existing = db.aiSubscriptions.find((r) => r.provider === provider);
    if (m === "PUT") {
      const credential = parseBody<{ credential?: string }>(init).credential ?? "";
      const row = {
        provider,
        status: "connected" as const,
        enabled_models:
          provider === "claude-subscription"
            ? ["claude-sub-opus", "claude-sub-sonnet", "claude-sub-haiku"]
            : ["codex-sub-default"],
        credential_hint: credential.slice(-4),
        last_verified_at: new Date().toISOString(),
        last_error: null,
      };
      const idx = db.aiSubscriptions.findIndex((r) => r.provider === provider);
      if (idx >= 0) db.aiSubscriptions.splice(idx, 1, row);
      else db.aiSubscriptions.push(row);
      return ok(row);
    }
    if (m === "POST" && mm[2] === "/verify" && existing) {
      existing.status = "connected";
      existing.last_verified_at = new Date().toISOString();
      existing.last_error = null;
      return ok(existing);
    }
    if (m === "PATCH" && existing) {
      existing.enabled_models =
        parseBody<{ enabled_models?: string[] }>(init).enabled_models ?? [];
      return ok(existing);
    }
    if (m === "DELETE" && existing) {
      db.aiSubscriptions.splice(db.aiSubscriptions.indexOf(existing), 1);
      return new Response(null, { status: 204 });
    }
  }

  // /v1/users/me/coding-agent-tokens - coding agents over MCP. Mock mints
  // a fake ath_ token (raw value once) so the whole guided connect flow
  // walks offline; the /mcp endpoint itself has no mock parity.
  if (pathname === "/v1/users/me/coding-agent-tokens" && m === "GET") {
    return ok({
      mcp_enabled: true,
      mcp_url: "https://api.tryathena.dev/mcp",
      tokens: db.codingAgentTokens,
    });
  }
  if (pathname === "/v1/users/me/coding-agent-tokens" && m === "POST") {
    const body = parseBody<{
      client?: string;
      name?: string;
      scope_bundle?: string;
      expires_in_days?: number | null;
    }>(init);
    const raw = `ath_${Array.from({ length: 48 }, () =>
      "0123456789abcdef".charAt(Math.floor(Math.random() * 16)),
    ).join("")}`;
    const names: Record<string, string> = {
      "claude-code": "Claude Code",
      "codex-cli": "Codex CLI",
      cursor: "Cursor",
      "gemini-cli": "Gemini CLI",
      antigravity: "Antigravity",
      "copilot-cli": "Copilot CLI",
    };
    const row = {
      id: `cat_${Date.now()}`,
      name: body.name || names[body.client ?? ""] || "Coding agent",
      client: body.client ?? "other",
      scope_bundle: body.scope_bundle ?? "work.write",
      prefix: raw.slice(0, 16),
      expires_at:
        body.expires_in_days == null
          ? null
          : new Date(
              Date.now() + body.expires_in_days * 86_400_000,
            ).toISOString(),
      last_used_at: null,
      revoked_at: null,
      created_at: new Date().toISOString(),
    };
    db.codingAgentTokens.unshift(row);
    return ok(
      { ...row, token: raw, mcp_url: "https://api.tryathena.dev/mcp" },
      201,
    );
  }
  mm = pathname.match(/^\/v1\/users\/me\/coding-agent-tokens\/([^/]+)\/revoke$/);
  if (mm && m === "POST") {
    const row = db.codingAgentTokens.find((t) => t.id === mm![1]);
    if (!row) return notFound();
    row.revoked_at = row.revoked_at ?? new Date().toISOString();
    return ok(row);
  }

  // /v1/models/enabled - the per-action <ModelSelector> data source. Mock the
  // usable set as every Athena-hosted (platform) model, enabled + source athena.
  if (pathname === "/v1/models/enabled" && m === "GET") {
    const enabled = db
      .catalogWire()
      .filter((p) => p.platform_hosted)
      .flatMap((p) =>
        p.models
          .filter((mm2) => !mm2.supports_embeddings && mm2.model_type !== "embedding")
          .map((mm2) => ({
            id: mm2.id,
            provider: p.id,
            display_name: mm2.display_name,
            source: "athena",
            supports_tools: mm2.supports_tools,
            supports_vision: mm2.supports_vision,
            thinking: mm2.thinking,
            thinking_optional: mm2.thinking_optional,
            context_window: mm2.context_window,
            input_price: mm2.input_price,
            output_price: mm2.output_price,
            model_type: mm2.model_type,
            enabled: true,
          })),
      );
    // Plus the user's connected subscription models (source=subscription)
    // so the chat picker's "Your plan" group is walkable in mock mode.
    const catalog = db.catalogWire();
    for (const sub of db.aiSubscriptions) {
      if (sub.status !== "connected") continue;
      const providerEntry = catalog.find((p) => p.id === sub.provider);
      for (const modelId of sub.enabled_models) {
        const mm2 = providerEntry?.models.find((x) => x.id === modelId);
        if (!mm2) continue;
        enabled.push({
          id: mm2.id,
          provider: sub.provider,
          display_name: mm2.display_name,
          source: "subscription",
          supports_tools: mm2.supports_tools,
          supports_vision: mm2.supports_vision,
          thinking: mm2.thinking,
          thinking_optional: mm2.thinking_optional,
          context_window: mm2.context_window,
          input_price: mm2.input_price,
          output_price: mm2.output_price,
          model_type: mm2.model_type,
          enabled: true,
        });
      }
    }
    return ok(enabled);
  }

  // GET /v1/models/ingestion - the two configurable ingestion tiers. Mock the
  // unconfigured state (both null) + the Athena defaults the FE pre-selects.
  if (pathname === "/v1/models/ingestion" && m === "GET") {
    return ok({
      file: null,
      synthesis: null,
      file_default: { provider: "google", model_id: "gemini-3.1-flash-lite", source: "athena" },
      synthesis_default: { provider: "google", model_id: "gemini-3.5-flash", source: "athena" },
    });
  }
  // PUT /v1/models/ingestion - echo the picks back (mock no-op, no persistence).
  if (pathname === "/v1/models/ingestion" && m === "PUT") {
    const body = parseBody<{
      file?: unknown;
      synthesis?: unknown;
    }>(init);
    return ok({
      file: body.file ?? null,
      synthesis: body.synthesis ?? null,
      file_default: { provider: "google", model_id: "gemini-3.1-flash-lite", source: "athena" },
      synthesis_default: { provider: "google", model_id: "gemini-3.5-flash", source: "athena" },
    });
  }

  // GET /v1/models/slack-agent - the @Athena Slack bot's model (ADR-092).
  // Mock the unconfigured state (null) + the Athena chat default the FE
  // pre-selects.
  if (pathname === "/v1/models/slack-agent" && m === "GET") {
    return ok({
      model: null,
      default: { provider: "google", model_id: "gemini-3.5-flash", source: "athena" },
    });
  }
  // PUT /v1/models/slack-agent - echo the pick back (mock no-op, no persistence).
  if (pathname === "/v1/models/slack-agent" && m === "PUT") {
    const body = parseBody<{ model?: unknown }>(init);
    return ok({
      model: body.model ?? null,
      default: { provider: "google", model_id: "gemini-3.5-flash", source: "athena" },
    });
  }

  // GET /v1/models/context-budget - the org default + per-model overrides.
  // Mock the unconfigured state (null default, no overrides) + the platform
  // fallback the FE shows when the default is null.
  if (pathname === "/v1/models/context-budget" && m === "GET") {
    return ok({
      default_budget_tokens: null,
      platform_default_budget_tokens: 200000,
      overrides: [],
    });
  }
  // PUT /v1/models/context-budget - echo the config back (mock no-op).
  if (pathname === "/v1/models/context-budget" && m === "PUT") {
    const body = parseBody<{
      default_budget_tokens?: number | null;
      overrides?: unknown;
    }>(init);
    return ok({
      default_budget_tokens: body.default_budget_tokens ?? null,
      platform_default_budget_tokens: 200000,
      overrides: Array.isArray(body.overrides) ? body.overrides : [],
    });
  }

  // PATCH /v1/models/{provider}/{model_id} - toggle echo (mock no-op).
  mm = pathname.match(/^\/v1\/models\/([^/]+)\/(.+)$/);
  if (mm && m === "PATCH") {
    const provider = decodeURIComponent(mm[1]!);
    const modelId = decodeURIComponent(mm[2]!);
    const enabled = !!parseBody<{ enabled?: boolean }>(init).enabled;
    const cat = db.catalogWire().find((p) => p.id === provider);
    const cm = cat?.models.find((x) => x.id === modelId);
    return ok({
      id: modelId,
      provider,
      display_name: cm?.display_name ?? modelId,
      source: "athena",
      supports_tools: cm?.supports_tools ?? true,
      supports_vision: cm?.supports_vision ?? false,
      thinking: cm?.thinking ?? false,
      thinking_optional: cm?.thinking_optional ?? false,
      context_window: cm?.context_window ?? 0,
      input_price: cm?.input_price ?? null,
      output_price: cm?.output_price ?? null,
      model_type: cm?.model_type ?? "chat",
      enabled,
    });
  }

  // /v1/orgs/{id}/model-providers
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers$/);
  if (mm && m === "GET") return ok(db.modelProviders);
  if (mm && m === "POST") {
    const body = parseBody<{
      provider: string; via?: string; region?: string;
      enabled_models?: string[]; residency_note?: string; api_key?: string;
    }>(init);
    const catalogEntry = db.llmProviderCatalog.find((c) => c.id === body.provider);
    if (!catalogEntry) {
      return { status: 400, body: { error: { code: "invalid_argument", message: `Unknown provider '${body.provider}'.` } } };
    }
    const nextId = `mp_${body.provider}_${Math.random().toString(36).slice(2, 8)}`;
    const created: db.MockModelProvider = {
      id: nextId,
      provider: body.provider,
      via: body.via ?? "direct",
      region: body.region ?? "us-east-1",
      status: "enabled",
      enabled_models: body.enabled_models ?? [],
      request_count: 0,
      cost_mtd: 0,
      residency_note: body.residency_note ?? "",
      has_api_key: typeof body.api_key === "string" && body.api_key.length >= 8,
      api_key_last4:
        typeof body.api_key === "string" && body.api_key.length >= 8
          ? body.api_key.slice(-4) : null,
    };
    db.modelProviders.push(created);
    return { status: 201, body: created };
  }
  // /v1/orgs/{id}/model-providers/{id}/usage (§7.8.1) - specific path
  // BEFORE the generic /{id} matcher below.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)\/usage$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    const seeded = db.providerUsageByModelProviderId[id];
    return ok({
      provider: provider.provider,
      range: "mtd",
      models: seeded?.models ?? [],
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)\/set-primary$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    db.modelProviders.forEach((p) => { p.status = p.id === id ? "primary" : (p.status === "primary" ? "available" : p.status); });
    return ok(provider);
  }
  // §7.8 - DELETE /api-key revokes the stored BYO key without
  // deleting the row. Must come BEFORE the generic /{id} matcher so
  // the more-specific path wins.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)\/api-key$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    provider.has_api_key = false;
    provider.api_key_last4 = null;
    return ok(provider);
  }
  // PATCH the provider - fields include enabled_models, residency_note,
  // status, api_key. Plaintext api_key is reduced to last4 for storage
  // (mirrors the BE: the plaintext never persists in the mock either).
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)$/);
  if (mm && m === "PATCH") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    const body = parseBody<Partial<{
      enabled_models: string[];
      residency_note: string;
      status: "available" | "enabled" | "disabled";
      api_key: string;
    }>>(init);
    if (Array.isArray(body.enabled_models)) provider.enabled_models = body.enabled_models;
    if (typeof body.residency_note === "string") provider.residency_note = body.residency_note;
    if (body.status === "available" || body.status === "enabled" || body.status === "disabled") {
      // The BE's `disabled` status doesn't map onto the FE's
      // narrower 3-state status enum - treat as "available" for
      // mock-mode parity.
      provider.status = body.status === "disabled" ? "available" : body.status;
    }
    if (typeof body.api_key === "string" && body.api_key.length >= 8) {
      provider.has_api_key = true;
      provider.api_key_last4 = body.api_key.slice(-4);
    }
    return ok(provider);
  }

  // /v1/orgs/{id}/privacy - partial PATCH matches the BE shape:
  // { redaction?, data_retention?, encryption?, residency? }.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/privacy$/);
  if (mm) {
    if (m === "GET") return ok(db.privacySettings);
    if (m === "PATCH") {
      const body = parseBody<Partial<{
        redaction: typeof db.privacySettings.redaction;
        data_retention: typeof db.privacySettings.data_retention;
        encryption: typeof db.privacySettings.encryption;
        residency: typeof db.privacySettings.residency;
      }>>(init);
      if (body.redaction) db.privacySettings.redaction = { ...body.redaction, last_updated: "just now", last_updated_by: db.me.display_name };
      if (body.data_retention) db.privacySettings.data_retention = body.data_retention;
      if (body.encryption) db.privacySettings.encryption = body.encryption;
      if (body.residency) db.privacySettings.residency = body.residency;
      return ok(db.privacySettings);
    }
    return methodNotAllowed();
  }

  // /v1/inbox
  if (pathname === "/v1/inbox" && m === "GET") {
    const limit = Number(query.get("limit")) || 50;
    const unreadOnly = query.get("unread_only") === "true";
    const wire = (i: db.MockInboxItem, idx: number) => ({
      ...i,
      // Stable-ish descending timestamps so absolute-time rendering is sane.
      created_at: new Date(Date.now() - idx * 3_600_000).toISOString(),
      read: mockInboxReadIds.has(i.id),
      task_id: i.task_id ?? null,
      actor_avatar: i.actor_avatar ?? null,
      phase: i.phase ?? null,
      to: i.to ?? null,
      payload: {},
      resolved_at: null,
      expires_at: null,
    });
    let items = db.inboxItems.map(wire);
    if (unreadOnly) items = items.filter((i) => !i.read);
    return ok({ items: items.slice(0, limit), unread_count: items.filter((i) => !i.read).length, next_cursor: null });
  }
  mm = pathname.match(/^\/v1\/inbox\/([^/]+)\/read$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const item = db.inboxItems.find((i) => i.id === id);
    if (!item) return notFound("Inbox item not found");
    mockInboxReadIds.add(id);
    return ok({ ...item, created_at: new Date().toISOString(), read: true, task_id: item.task_id ?? null, actor_avatar: item.actor_avatar ?? null, phase: item.phase ?? null, to: item.to ?? null, payload: {}, resolved_at: null, expires_at: null });
  }
  if (pathname === "/v1/inbox/read-all" && m === "POST") {
    const before = mockInboxReadIds.size;
    for (const i of db.inboxItems) mockInboxReadIds.add(i.id);
    return ok({ marked: mockInboxReadIds.size - before });
  }

  // /v1/cost/summary - windowed + source-scoped (see buildCostSummaryResponse).
  // Alerts are opt-in (migration 0100): badges render only when the org
  // enabled the cost_badges category under Settings → Budgets & alerts.
  if (pathname === "/v1/cost/summary" && m === "GET") {
    const summary = buildCostSummaryResponse(query);
    return ok(alertSettings.cost_badges ? summary : { ...summary, alerts: [] });
  }
  // §5.29.12 r1 - per-day burn-down split by model. Mock returns a
  // 7-day window for 3 models so the chart has shape in mock mode
  // even when `days` resolves to 30 or 90; the FE clamps to whatever
  // BE returns.
  if (pathname === "/v1/cost/per-model-burndown" && m === "GET") {
    // Honor the requested window (driven by the global date-range picker),
    // clamped to a sane span so the multi-line chart stays legible.
    const days = Math.max(2, Math.min(Number(query.get("days")) || 30, 120));
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const range: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      range.push(fmt(d));
    }
    const series = [
      { model: "claude-opus-4-7",   base: 540, jitter: 70 },
      { model: "claude-sonnet-4-6", base: 210, jitter: 40 },
      { model: "claude-haiku-4-5",  base:  90, jitter: 15 },
    ];
    return ok({
      range_start: range[0]!,
      range_end: range[range.length - 1]!,
      models: series.map((s) => ({
        model: s.model,
        // Wire-shape: Decimal-as-string (Pydantic v2 default JSON
        // serialisation). The chart Number()-coerces at the call site.
        daily: range.map((day, i) => ({
          day,
          spent_usd: (s.base + Math.sin(i / 1.7) * s.jitter).toFixed(6),
        })),
      })),
    });
  }
  // GET /v1/cost/by-source - AI spend bucketed by surface (ADR-092). A few
  // representative surfaces so the breakdown card has honest shape in mock mode.
  if (pathname === "/v1/cost/by-source" && m === "GET") {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const start = new Date(today);
    start.setUTCDate(today.getUTCDate() - 29);
    return ok({
      range_start: query.get("from") || fmt(start),
      range_end: query.get("to") || fmt(today),
      surfaces: [
        { surface: "chat", calls: 318, prompt_tokens: 1_240_000, completion_tokens: 410_000, total_tokens: 1_650_000, cost_usd: "4.820000" },
        { surface: "tasks", calls: 96, prompt_tokens: 2_100_000, completion_tokens: 520_000, total_tokens: 2_620_000, cost_usd: "3.140000" },
        { surface: "slack", calls: 142, prompt_tokens: 690_000, completion_tokens: 240_000, total_tokens: 930_000, cost_usd: "1.270000" },
        { surface: "coding_agent", calls: 54, prompt_tokens: 880_000, completion_tokens: 160_000, total_tokens: 1_040_000, cost_usd: "0.000000" },
      ],
    });
  }
  // Per-sync-cycle ingestion cost for one repo (the per-repo drill-down).
  // Synthesises a few recent commits whose costs roughly sum to the repo's
  // window spend so the expanded view has honest shape in mock mode.
  const cyclesMatch = pathname.match(/^\/v1\/cost\/repos\/([^/]+)\/ingest-cycles$/);
  if (cyclesMatch && m === "GET") {
    const repoId = decodeURIComponent(cyclesMatch[1]!);
    const repo = db.costData.spend_by_repo.find((r) => r.repo_id === repoId);
    if (!repo) return ok({ repo_id: repoId, cycles: [] });
    const shas = ["a1b2c3d", "9f8e7d6", "4c5b6a7", "0d1e2f3"];
    const nowMs = Date.now();
    const cycles = shas.map((sha, i) => ({
      branch_sha: sha,
      started_at: new Date(nowMs - (i + 1) * 36 * 3_600_000).toISOString(),
      usd: Math.max(2, Math.round((repo.usd / (i + 2)) * 100) / 100),
      calls: Math.max(8, Math.round(repo.calls / (i + 2))),
      prompt_tokens: Math.max(2000, 40_000 - i * 6_000),
      completion_tokens: Math.max(800, 12_000 - i * 1_500),
    }));
    return ok({ repo_id: repoId, cycles });
  }
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/cost\/budget$/) && m === "PUT") {
    const body = parseBody<{ domain_id?: string; usd: number }>(init);
    if (body.domain_id) {
      const cap = db.costData.spend_by_domain.find((c) => c.id === body.domain_id);
      if (cap) cap.budget = body.usd;
    } else {
      db.costData.budget_usd = body.usd;
    }
    return ok(db.costData);
  }

  // /v1/skills
  if (pathname === "/v1/skills" && m === "GET") return ok(db.skills);
  if (pathname === "/v1/skills" && m === "POST") {
    const body = parseBody<{
      name?: string;
      slug?: string;
      description?: string | null;
      icon?: string | null;
      phases?: string[];
      version?: string;
      status?: "active" | "draft" | "archived";
      system_prompt?: string | null;
      knowledge_refs?: { kind: string; id: string; title: string }[];
    }>(init);
    if (!body.name || !body.slug) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "name and slug are required", field: "slug" } });
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(body.slug)) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "Invalid slug.", field: "slug" } });
    }
    if (db.skills.some((s) => s.slug === body.slug)) {
      return new MockResponse(409, { error: { code: "conflict", message: "Slug already exists.", field: "slug" } });
    }
    const id = `skl_${body.slug.replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
    const created: db.MockSkill = {
      id,
      name: body.name,
      slug: body.slug,
      version: body.version ?? "0.1.0",
      status: body.status ?? "draft",
      description: body.description ?? "",
      icon: body.icon ?? "sparkles",
      phases: body.phases ?? [],
      attached_domains: [],
      usage_count: 0,
      last_used: "never",
    };
    db.skills.push(created);
    db.skillDetails[id] = {
      ...created,
      system_prompt: body.system_prompt ?? "",
      knowledge_refs: body.knowledge_refs ?? [],
      author: "you",
      last_updated: "just now",
    };
    return ok(created, 201);
  }
  // /v1/skills/import - parse a Claude Code / Cursor / Windsurf / markdown file
  if (pathname === "/v1/skills/import" && m === "POST") {
    const body = parseBody<{ text?: string; filename?: string | null; commit?: boolean }>(init);
    const text = (body.text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    if (!text.trim()) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "No skill body found in the imported file." } });
    }
    const fname = (body.filename ?? "").toLowerCase();
    const fm = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/);
    const front: Record<string, string> = {};
    if (fm) {
      for (const line of fm[1]!.split("\n")) {
        const kv = line.match(/^([A-Za-z_][\w-]*):[ \t]*(.*)$/);
        if (kv) front[kv[1]!.toLowerCase()] = kv[2]!.replace(/^['"]|['"]$/g, "").trim();
      }
    }
    const bodyText = (fm ? text.slice(fm[0].length) : text).trim();
    let fmt = "generic_markdown";
    if (fname.endsWith(".mdc") || "globs" in front || "alwaysapply" in front) fmt = "cursor_mdc";
    else if (fm && front.name && front.description) fmt = "claude_code";
    else if (fname.endsWith(".cursorrules")) fmt = "cursor_legacy";
    else if (fname.endsWith(".windsurfrules")) fmt = "windsurf";
    else if (fm) fmt = "frontmatter_markdown";
    const h1 = bodyText.match(/^#[ \t]+(.+?)[ \t]*$/m);
    const firstLine = bodyText.split("\n").find((l) => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("---")) ?? "";
    const name = (front.name || (h1 ? h1[1]! : "") || "Imported skill").trim().slice(0, 200);
    const description = (front.description || firstLine).trim().slice(0, 200);
    const baseSlug = (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)) || "imported-skill";
    let slug = baseSlug;
    let n = 2;
    while (db.skills.some((s) => s.slug === slug)) slug = `${baseSlug}-${n++}`;
    const warnings: string[] = [];
    if (!front.name) warnings.push("Name was derived from the heading/filename - edit it if needed.");
    if (!description) warnings.push("No description found - add a one-line summary.");
    if ("globs" in front || "alwaysapply" in front) warnings.push("Cursor 'globs'/'alwaysApply' were dropped (Athena scopes skills by stage phase, not file globs).");
    if (slug !== baseSlug) warnings.push(`Slug '${baseSlug}' was taken; using '${slug}' instead.`);
    const preview = { detected_format: fmt, name, slug, description, system_prompt: bodyText, warnings, created: false, skill_id: null as string | null };
    if (!body.commit) return ok(preview);
    const id = `skl_${slug.replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
    const created: db.MockSkill = { id, name, slug, version: "0.1.0", status: "draft", description, icon: "sparkles", phases: [], attached_domains: [], usage_count: 0, last_used: "never" };
    db.skills.push(created);
    db.skillDetails[id] = { ...created, system_prompt: bodyText, knowledge_refs: [], author: "you", last_updated: "just now" };
    return ok({ ...preview, created: true, skill_id: id });
  }
  mm = pathname.match(/^\/v1\/skills\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    // Detail (rich) overrides list shape when available.
    const detail = db.skillDetails[id];
    if (detail) return ok(detail);
    const skill = db.skills.find((s) => s.id === id);
    if (!skill) return notFound("Skill not found");
    return ok(skill);
  }
  if (mm && m === "PATCH") {
    const id = decodeURIComponent(mm[1]!);
    const idx = db.skills.findIndex((s) => s.id === id);
    if (idx === -1) return notFound("Skill not found");
    const body = parseBody<{
      name?: string;
      description?: string | null;
      icon?: string | null;
      phases?: string[];
      version?: string;
      status?: "active" | "draft" | "archived";
      system_prompt?: string | null;
      knowledge_refs?: { kind: string; id: string; title: string }[];
    }>(init);
    const cur = db.skills[idx]!;
    const next: db.MockSkill = {
      ...cur,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description ?? "" } : {}),
      ...(body.icon !== undefined ? { icon: body.icon ?? "sparkles" } : {}),
      ...(body.phases !== undefined ? { phases: body.phases } : {}),
      ...(body.version !== undefined ? { version: body.version } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    };
    db.skills[idx] = next;
    const detail = db.skillDetails[id];
    if (detail) {
      db.skillDetails[id] = {
        ...detail,
        ...next,
        ...(body.system_prompt !== undefined ? { system_prompt: body.system_prompt ?? "" } : {}),
        ...(body.knowledge_refs !== undefined ? { knowledge_refs: body.knowledge_refs } : {}),
        last_updated: "just now",
      };
    }
    return ok(next);
  }
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const idx = db.skills.findIndex((s) => s.id === id);
    if (idx === -1) return notFound("Skill not found");
    // Soft-delete: archive
    db.skills[idx] = { ...db.skills[idx]!, status: "archived" };
    return noContent();
  }
  // /v1/skills/{id}/attach/{domain_id}
  mm = pathname.match(/^\/v1\/skills\/([^/]+)\/attach\/([^/]+)$/);
  if (mm) {
    const skillId = decodeURIComponent(mm[1]!);
    const capId = decodeURIComponent(mm[2]!);
    const idx = db.skills.findIndex((s) => s.id === skillId);
    if (idx === -1) return notFound("Skill not found");
    const cur = db.skills[idx]!;
    if (m === "POST") {
      if (!cur.attached_domains.includes(capId)) {
        db.skills[idx] = { ...cur, attached_domains: [...cur.attached_domains, capId] };
      }
      const detail = db.skillDetails[skillId];
      if (detail && !detail.attached_domains.includes(capId)) {
        db.skillDetails[skillId] = { ...detail, attached_domains: [...detail.attached_domains, capId] };
      }
      return noContent();
    }
    if (m === "DELETE") {
      db.skills[idx] = { ...cur, attached_domains: cur.attached_domains.filter((c) => c !== capId) };
      const detail = db.skillDetails[skillId];
      if (detail) {
        db.skillDetails[skillId] = { ...detail, attached_domains: detail.attached_domains.filter((c) => c !== capId) };
      }
      return noContent();
    }
  }

  // /v1/activity
  if (pathname === "/v1/activity" && m === "GET") {
    const limit = Number(query.get("limit")) || 50;
    const capId = query.get("dom_id");
    let items = db.activity.map((a) => ({
      ...a,
      text_html: a.text,
      dom_id: a.dom_id ?? null,
      who_avatar: a.who_avatar ?? null,
      task_id: a.task_id ?? null,
    }));
    if (capId) items = items.filter((a) => a.dom_id === capId);
    return ok({ items: items.slice(0, limit), next_cursor: null });
  }

  // /v1/chat/threads
  if (pathname === "/v1/chat/threads" && m === "GET") {
    return ok(db.chatThreads.map((t) => ({
      id: t.id, title: t.title, scope: t.scope, preview: t.preview, updated_at: t.updated_at,
    })));
  }
  if (pathname === "/v1/chat/threads" && m === "POST") {
    // In demo mode the chat is read-only - new threads / sends are blocked at
    // the page layer, but if anything slips through we return 403 so the UI
    // doesn't pretend an unbacked thread exists.
    return new MockResponse(403, { error: { code: "demo_mode", message: "Chat is read-only in demo mode." } });
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const t = db.chatThreads.find((x) => x.id === id);
    if (!t) return notFound("Thread not found");
    const messages = t.messages.map((mes, i) => ({
      id: `${t.id}_${i}`,
      thread_id: t.id,
      role: mes.role,
      who: mes.who,
      avatar: mes.avatar,
      content: mes.content,
      created_at: new Date(Date.now() - (t.messages.length - i) * 60_000).toISOString(),
      citations: mes.citations ?? undefined,
      confidence_score: mes.confidence_score ?? null,
      confidence_reason: mes.confidence_reason ?? "",
    }));
    return ok({
      thread: {
        id: t.id, title: t.title, scope: t.scope, preview: t.preview, updated_at: t.updated_at,
      },
      messages,
    });
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)\/messages$/);
  if (mm && m === "POST") {
    // Same as POST /v1/chat/threads: chat compose is disabled in demo mode.
    return new MockResponse(403, { error: { code: "demo_mode", message: "Chat compose is disabled in demo mode." } });
  }

  // --- Sharable threads + message pins. The demo conversations are read-only
  //     so the writes 403 and the reads return empty (no shares/pins seeded);
  //     the page hides/disables these affordances in demo mode anyway.
  if (pathname === "/v1/chat/shares/incoming" && m === "GET") {
    return ok([]);
  }
  mm = pathname.match(/^\/v1\/chat\/shares\/([^/]+)\/import$/);
  if (mm && m === "POST") {
    return new MockResponse(403, { error: { code: "demo_mode", message: "Importing shared chats is disabled in demo mode." } });
  }
  mm = pathname.match(/^\/v1\/chat\/shares\/([^/]+)$/);
  if (mm && m === "GET") {
    return notFound("Shared chat not found");
  }
  if (mm && m === "DELETE") {
    return new MockResponse(403, { error: { code: "demo_mode", message: "Chat is read-only in demo mode." } });
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)\/pins$/);
  if (mm && m === "GET") {
    return ok([]);
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)\/shares$/);
  if (mm && m === "GET") {
    return ok([]);
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)\/share$/);
  if (mm && m === "POST") {
    return new MockResponse(403, { error: { code: "demo_mode", message: "Sharing is disabled in demo mode." } });
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)\/messages\/([^/]+)\/pin$/);
  if (mm && (m === "POST" || m === "DELETE")) {
    return new MockResponse(403, { error: { code: "demo_mode", message: "Pinning is disabled in demo mode." } });
  }

  // /v1/knowledge/graph - supports `domain_id`, `repo_id`, `layer`, `limit`.
  // The mock has no real cap→repo attachment table, so `domain_id` is
  // accepted but unfiltered; `repo_id` + `layer` apply.
  if (pathname === "/v1/knowledge/graph" && m === "GET") {
    const repoId = query.get("repo_id");
    const layer = query.get("layer");
    const limitRaw = query.get("limit");
    const limit = limitRaw ? Math.max(10, Math.min(1000, Number(limitRaw) || 200)) : 200;
    let allNodes = db.knowledgeNodes
      .filter((n) => (repoId ? n.repo_id === repoId : true))
      .filter((n) => (layer ? n.layer === layer : true));
    // A directory is a `module` node. The graph fixtures don't carry per-repo
    // folders, so synthesise one module per directory for a known repo - this is
    // what the Files tab's folder→dossier map reads. Skipped under a `layer`
    // filter (real modules have a null layer, so they'd be excluded anyway).
    if (repoId && !layer) {
      const rk = _findRepoKnowledge(repoId);
      if (rk) allNodes = [..._syntheticModuleNodes(rk), ...allNodes];
    }
    const nodes = allNodes.slice(0, limit);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = db.knowledgeEdges.filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));
    return ok({
      nodes,
      edges,
      totals: { nodes: db.knowledgeNodes.length, edges: db.knowledgeEdges.length },
      truncated: nodes.length >= limit,
    });
  }

  // Phase D contract #1 - /v1/knowledge/nodes/{id} → { dossier }. Synthesise
  // a dossier from the `knowledgeNodes` + `knowledgeEdges` fixtures so the
  // shared node-dossier drawer renders real, navigable content in mock mode.
  mm = pathname.match(/^\/v1\/knowledge\/nodes\/([^/]+)$/);
  if (mm && m === "GET") {
    const nodeId = decodeURIComponent(mm[1]!);
    const node = db.knowledgeNodes.find((n) => n.id === nodeId);
    if (!node) {
      // A directory is a `module` node - resolve a synthetic folder id to a
      // synthesised module dossier (mirrors the BE per-directory module dossier).
      const folderHit = _findFolderModuleById(nodeId);
      if (folderHit) return ok(_folderDossierResponse(folderHit.rk, folderHit.dirPath));
      // A file's repo-file id IS its knowledge-node id - resolve file-browser
      // ids to a synthesised file dossier so the file-detail drawer's Overview
      // renders the whole card, not just the flat summary.
      const fileHit = _findFileRowById(nodeId);
      if (fileHit) return ok(_fileDossierResponse(fileHit.rk, fileHit.row));
      return notFound("Node not found");
    }
    const refOf = (id: string) => {
      const n = db.knowledgeNodes.find((x) => x.id === id);
      if (!n) return null;
      return { node_id: n.id, name: n.name, path: n.path ?? "", kind: n.node_kind, layer: n.layer };
    };
    const childIds = db.knowledgeEdges.filter((e) => e.kind === "contains" && e.source_id === nodeId).map((e) => e.target_id);
    const parentEdge = db.knowledgeEdges.find((e) => e.kind === "contains" && e.target_id === nodeId);
    // Build typed relation buckets (calls / called_by / references / …).
    const relations: Record<string, Array<ReturnType<typeof refOf>>> = {};
    for (const e of db.knowledgeEdges) {
      if (e.kind === "contains") continue;
      if (e.source_id === nodeId) {
        (relations[e.kind] ??= []).push(refOf(e.target_id));
      } else if (e.target_id === nodeId) {
        (relations[`${e.kind}_by`] ??= []).push(refOf(e.source_id));
      }
    }
    const cleanRelations: Record<string, unknown[]> = {};
    for (const [k, v] of Object.entries(relations)) {
      const filtered = v.filter(Boolean);
      if (filtered.length) cleanRelations[k] = filtered;
    }
    // Folded symbol index + an optional diagram for code nodes, so the dossier
    // drawer's Elements + Diagram sections render in mock mode (the BE carries
    // these in metadata.dossier.{elements,mermaid}).
    const isCodeNode = node.node_kind === "file" || node.node_kind === "module";
    const baseName = node.name.replace(/\.[^.]+$/, "");
    const elements = isCodeNode
      ? Array.from({ length: 4 }, (_, i) => ({
          name: i === 0 ? baseName : `${baseName}_fn${i}`,
          kind: i === 0 ? "class" : "function",
          line_start: 12 + i * 22,
          line_end: 30 + i * 22,
          signature: i === 0 ? `class ${baseName}:` : `def ${baseName}_fn${i}(self, ...) -> None`,
          ...(i % 2 === 0 ? { doc: `Handles the ${baseName} responsibility #${i + 1}.` } : {}),
          complexity: 2 + i,
        }))
      : [];
    const mermaid = isCodeNode
      ? `flowchart TD\n  A[${node.name}] --> B[dependency]\n  A --> C[helper]`
      : null;
    return ok({
      // Top-level row columns the BE returns alongside `dossier` (present even
      // when `dossier` is null) - the shared drawer reads these to render an
      // identity header + resolve a leaf node's home FILE blueprint.
      node_kind: node.node_kind,
      name: node.name,
      path: node.path ?? null,
      summary: node.summary ?? null,
      layer: node.layer,
      repo_id: node.repo_id ?? null,
      dossier: {
        node_id: node.id,
        name: node.name,
        kind: node.node_kind,
        path: node.path ?? null,
        headline: node.summary ?? `${node.name} (${node.node_kind})`,
        what: node.summary ?? "",
        architecture: {
          layer: node.layer,
          role: node.tags.includes("entrypoint") ? "entry point" : null,
          pattern: node.tags.includes("state-machine") ? "state machine" : null,
          responsibilities: node.summary ? [node.summary] : [],
        },
        signals: {
          language: null,
          loc: node.line_start && node.line_end ? node.line_end - node.line_start : null,
          tags: node.tags,
          complexity: node.complexity ?? null,
          centrality: node.centrality ?? null,
        },
        contains: childIds.map(refOf).filter(Boolean),
        contained_by: parentEdge ? refOf(parentEdge.source_id) : null,
        relations: cleanRelations,
        see_also: db.knowledgeNodes
          .filter((n) => n.id !== nodeId && n.layer === node.layer)
          .slice(0, 3)
          .map((n) => refOf(n.id))
          .filter(Boolean),
        elements,
        mermaid,
      },
    });
  }

  // /v1/knowledge/nodes/{id}/neighbors - on-demand 1-hop expansion for the
  // topology explorer. Mirrors the BE: returns the neighbours only (NOT the
  // focus), edges among {focus} ∪ neighbours, parent + contains spine pinned
  // ahead of the centrality fill, capped at `limit`.
  mm = pathname.match(/^\/v1\/knowledge\/nodes\/([^/]+)\/neighbors$/);
  if (mm && m === "GET") {
    const nodeId = decodeURIComponent(mm[1]!);
    const focus = db.knowledgeNodes.find((n) => n.id === nodeId);
    if (!focus) return notFound("Node not found");
    const limitRaw = query.get("limit");
    const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw) || 60)) : 60;

    const containsIds = new Set<string>();
    const neighbourIds = new Set<string>();
    for (const e of db.knowledgeEdges) {
      if (e.source_id !== nodeId && e.target_id !== nodeId) continue;
      const other = e.source_id === nodeId ? e.target_id : e.source_id;
      if (other === nodeId) continue;
      neighbourIds.add(other);
      if (e.kind === "contains") containsIds.add(other);
    }
    const parentEdge = db.knowledgeEdges.find((e) => e.kind === "contains" && e.target_id === nodeId);
    const parentId = parentEdge?.source_id ?? focus.parent_id ?? null;
    if (parentId) { neighbourIds.add(parentId); containsIds.add(parentId); }

    let neighbours = db.knowledgeNodes.filter((n) => neighbourIds.has(n.id));
    neighbours.sort((a, b) => {
      const ap = a.id === parentId ? 0 : 1, bp = b.id === parentId ? 0 : 1;
      if (ap !== bp) return ap - bp;                                     // parent first
      const ac = containsIds.has(a.id) ? 0 : 1, bc = containsIds.has(b.id) ? 0 : 1;
      if (ac !== bc) return ac - bc;                                     // then structural
      return (b.centrality ?? 0) - (a.centrality ?? 0);                  // then centrality
    });
    const truncated = neighbours.length > limit;
    neighbours = neighbours.slice(0, limit);

    const present = new Set<string>([focus.id, ...neighbours.map((n) => n.id)]);
    const edges = db.knowledgeEdges.filter((e) => present.has(e.source_id) && present.has(e.target_id));
    // Backfill the parent→focus contains edge for snapshots that only carry
    // `parent_id` (no stored contains row), matching the BE's derivation.
    if (parentId && present.has(parentId) &&
        !edges.some((e) => e.kind === "contains" && e.source_id === parentId && e.target_id === focus.id)) {
      edges.push({ source_id: parentId, target_id: focus.id, kind: "contains" });
    }
    return ok({ nodes: neighbours, edges, truncated });
  }

  // /v1/knowledge/derived?scope=&scope_id=&list=&offset=&limit= - whole-dataset
  // paginated derived component list. Mirrors the BE: pages over the matching
  // Blueprint section's items (the source of truth for these lists) with a true
  // `total` + offset/limit echo, so the FE's 10/20/50/100 pager works in mock.
  if (pathname === "/v1/knowledge/derived" && m === "GET") {
    const scope = query.get("scope");
    const scopeId = query.get("scope_id") ?? "";
    const list = query.get("list") ?? "";
    const offset = Math.max(0, Number(query.get("offset")) || 0);
    const limit = Math.max(1, Math.min(100, Number(query.get("limit")) || 10));
    const store = scope === "domain" ? db.blueprints.domains : db.blueprints.repos;
    const section = store[scopeId]?.sections?.[list];
    const itemsRaw = (section?.body_json as { items?: unknown } | null | undefined)?.items;
    const all = Array.isArray(itemsRaw) ? itemsRaw : [];
    return ok({ items: all.slice(offset, offset + limit), total: all.length, offset, limit });
  }

  // Phase D contract #3 - live staleness gate (mocked, no real GitHub call).
  // GET /v1/domains/{id}/repos/{repo_id}/knowledge/sync-status
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/knowledge\/sync-status$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const repos = db.domainRepos[capId] ?? [];
    const repo = repos.find((r) => (r.repo_id ?? r.id) === repoId || r.id === repoId);
    const indexed = repo?.last_indexed_sha ?? null;
    const head = repo?.branch_head_sha ?? null;
    const behind = repo?.commits_behind ?? null;
    const isStale = !!(head && indexed && head !== indexed);
    return ok({
      repo_id: repoId,
      is_stale: isStale,
      commits_behind: behind,
      last_indexed_sha: indexed,
      current_head_sha: head,
      checked_live: true,
    });
  }

  // Phase D contract #4 - open pull requests for a repo (mocked).
  // GET /v1/domains/{id}/repos/{repo_id}/pull-requests
  mm = pathname.match(/^\/v1\/domains\/([^/]+)\/repos\/([^/]+)\/pull-requests$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[2]!);
    return ok({
      repo_id: repoId,
      available: true,
      pull_requests: [
        {
          number: 482,
          title: "Add idempotency key to checkout webhook handler",
          url: "https://github.com/lumen/billing-svc/pull/482",
          state: "open",
          draft: false,
          author: "maya",
          head_branch: "fix/webhook-idempotency",
          base_branch: "main",
          created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
          updated_at: new Date(Date.now() - 3600e3).toISOString(),
        },
        {
          number: 479,
          title: "WIP: revenue recognition for partial refunds",
          url: "https://github.com/lumen/billing-svc/pull/479",
          state: "open",
          draft: true,
          author: "devon",
          head_branch: "feat/partial-refund-rev-rec",
          base_branch: "main",
          created_at: new Date(Date.now() - 5 * 864e5).toISOString(),
          updated_at: new Date(Date.now() - 6 * 3600e3).toISOString(),
        },
      ],
    });
  }

  // /v1/citations/resolve - turn a citation ref (kn node / decision / overlay)
  // into the title + body the drawer shows. Mock resolves node refs against the
  // `knowledgeNodes` fixtures (stripping any `:L<a>-L<b>` line range) and falls
  // back to a generic preview so the drawer is never empty in mock mode.
  if (pathname === "/v1/citations/resolve" && m === "GET") {
    const source = query.get("source") || "kn";
    const ref = (query.get("ref") || "").trim();
    if (source !== "kn" || !ref) {
      return new MockResponse(404, {
        error: { code: "not_found", message: "Citation not resolvable." },
      });
    }
    const id = ref.split(":")[0];
    const node = db.knowledgeNodes.find((n) => n.id === id);
    if (node) {
      return new MockResponse(200, {
        title: node.name,
        body: `${node.name} (${node.node_kind}) - layer: ${node.layer ?? "-"}; tags: ${node.tags.join(", ") || "none"}.`,
        source_url: null,
        language: null,
      });
    }
    return new MockResponse(200, {
      title: "Knowledge source",
      body: `Preview for citation ${ref}.`,
      source_url: null,
      language: null,
    });
  }

  // /v1/knowledge/search - substring-match across mock knowledge fixtures.
  // The real BE wraps the agent retrieval tools (BM25 + cosine + RRF);
  // the mock keeps it cheap: a normalised substring filter over the
  // existing `knowledgeNodes` fixtures + `domainKnowledge[*].top_entities`
  // (the only entries the FE ships with a `summary`).
  if (pathname === "/v1/knowledge/search" && m === "GET") {
    const q = (query.get("q") || "").trim().toLowerCase();
    const scope = query.get("scope") || "org";
    const repoId = query.get("repo_id");
    const capId = query.get("domain_id");
    const kinds = query.getAll("kind");
    const layers = query.getAll("layer");
    const mode = (query.get("mode") || "hybrid") as "semantic" | "lexical" | "hybrid";
    const limit = Math.max(1, Math.min(50, Number(query.get("limit")) || 20));
    if (q.length < 2) {
      return new MockResponse(400, {
        error: { code: "invalid_argument", message: "q must be ≥2 chars.", field: "q" },
      });
    }
    const score_basis =
      mode === "semantic" ? "cosine_distance" : mode === "lexical" ? "ts_rank" : "rrf";
    // Build a unified pool: nodes (with synthesised summary from name+tags+layer)
    // + top_entities from domainKnowledge (carry real path + description).
    const nodePool = db.knowledgeNodes.map((n, i) => ({
      id: n.id,
      kind: "node" as const,
      node_kind: n.node_kind,
      overlay_kind: null,
      name: n.name,
      path: `${n.repo_id ?? "repo"}/${n.name}`,
      summary: `${n.name} (${n.node_kind}) - layer: ${n.layer ?? "-"}; tags: ${n.tags.join(", ") || "none"}.`,
      layer: n.layer,
      language: null,
      tags: n.tags,
      repo_id: n.repo_id,
      repo_full_name: n.repo_id ?? null,
      domain_id: null,
      // Deterministic per-row score; semantic = ascending distance, RRF/lexical = descending value.
      _seed: i,
    }));
    const topPool = Object.entries(db.domainKnowledge).flatMap(([cid, ck]) =>
      ck.top_entities.map((e) => ({
        id: e.id,
        kind: "node" as const,
        node_kind: e.kind,
        overlay_kind: null,
        name: e.name,
        path: e.path,
        summary: e.description,
        layer: null,
        language: null,
        tags: [] as string[],
        repo_id: null,
        repo_full_name: e.repo,
        domain_id: cid,
        _seed: 50, // dedup by id below; this only matters if absent from nodePool.
      })),
    );
    const seenIds = new Set(nodePool.map((p) => p.id));
    const merged = [...nodePool, ...topPool.filter((p) => !seenIds.has(p.id))];
    let matches = merged.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)),
    );
    if (scope === "repo" && repoId) matches = matches.filter((p) => p.repo_id === repoId);
    if (scope === "domain" && capId) matches = matches.filter((p) => p.domain_id == null || p.domain_id === capId);
    if (kinds.length > 0)
      matches = matches.filter((p) => kinds.includes(p.node_kind));
    if (layers.length > 0)
      matches = matches.filter((p) => p.layer != null && layers.includes(p.layer));
    const matched = matches.length;
    const items = matches.slice(0, limit).map((p, i) => {
      const score =
        mode === "semantic"
          ? 0.10 + i * 0.03 // ascending distance (lower = better)
          : mode === "lexical"
          ? Math.max(0.05, 0.95 - i * 0.05) // descending rank
          : Math.max(0.005, 0.035 - i * 0.0015); // RRF - descending
      return {
        id: p.id,
        kind: p.kind,
        node_kind: p.node_kind,
        overlay_kind: p.overlay_kind,
        name: p.name,
        path: p.path,
        summary: p.summary.length > 280 ? p.summary.slice(0, 280) + "…" : p.summary,
        layer: p.layer,
        language: p.language,
        tags: p.tags,
        repo_id: p.repo_id,
        repo_full_name: p.repo_full_name,
        domain_id: p.domain_id,
        score,
        score_basis,
      };
    });
    return ok({
      query: q,
      mode,
      items,
      totals: { matched, returned: items.length },
      freshness: "fresh",
      search_quality: items.length === 0 ? "no_match" : matched > 0 && items[0]!.name.toLowerCase() === q ? "exact" : "fuzzy",
    });
  }

  // /v1/orgs/{id}/notifications/routing - GET + §5.29.5 PATCH-replace.
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/notifications\/routing$/)) {
    if (m === "GET") return ok(notificationRules);
    if (m === "PATCH") {
      const body = parseBody<{ rules?: { event: string; channels: string[]; audience: string }[] }>(init);
      notificationRules = (body.rules ?? []).map((r) => ({
        event: r.event,
        channels: r.channels,
        audience: r.audience,
      }));
      return ok(notificationRules);
    }
  }

  // /v1/orgs/{id}/cost/budget - PUT org/domain monthly cap; echoes summary.
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/cost\/budget$/) && m === "PUT") {
    return ok(buildCostSummaryResponse(query));
  }
  // /v1/orgs/{id}/alert-settings - GET + PUT (opt-in alert categories, 0100).
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/alert-settings$/)) {
    if (m === "GET") return ok(alertSettings);
    if (m === "PUT") {
      const body = parseBody<Partial<typeof alertSettings>>(init);
      alertSettings = {
        cost_badges: !!body.cost_badges,
        ingest_anomaly: !!body.ingest_anomaly,
        credit_warning: !!body.credit_warning,
      };
      return ok(alertSettings);
    }
  }
  // /v1/orgs/{id}/alert-rules - GET + PUT-replace (budget alerts, 0099).
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/alert-rules$/)) {
    if (m === "GET") return ok(alertRules);
    if (m === "PUT") {
      const body = parseBody<{ rules?: Omit<(typeof alertRules)[number], "id">[] }>(init);
      alertRules = (body.rules ?? []).map((r, i) => ({ ...r, id: `ar-${i + 1}` }));
      return ok(alertRules);
    }
  }
  // /v1/orgs/{id}/cost/domain-budgets - budgets settings table.
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/cost\/domain-budgets$/) && m === "GET") {
    return ok(
      db.domains.map((d, i) => ({
        domain_id: d.id,
        name: d.name,
        budget_mtd_usd: i === 0 ? 500 : null,
        spent_mtd_usd: Math.round(((i + 1) * 37.5) * 100) / 100,
      })),
    );
  }
  // /v1/orgs/{id}/models/kill-switch - GET state / POST flip.
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/models\/kill-switch$/)) {
    if (m === "GET") return ok({ disabled: modelsKillSwitchDisabled });
    if (m === "POST") {
      const body = parseBody<{ disabled?: boolean }>(init);
      modelsKillSwitchDisabled = !!body.disabled;
      return ok({ disabled: modelsKillSwitchDisabled });
    }
  }

  // /v1/orgs/{id}/onboarding
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/onboarding$/) && m === "GET") {
    return ok(db.onboardingState);
  }
  // §5.29.4 - POST /v1/orgs/{id}/onboarding/{step_id}/complete:
  // explicit-mark a step done (used by "Skip for now" in the wizard).
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/onboarding\/([^/]+)\/complete$/);
  if (mm && m === "POST") {
    const stepId = decodeURIComponent(mm[1]!);
    const valid = new Set(["connect_scm", "create_domain", "attach_repo", "first_run"]);
    if (!valid.has(stepId)) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: `Unknown step '${stepId}'.` } });
    }
    db.onboardingState.steps = db.onboardingState.steps.map((s) =>
      s.id === stepId ? { ...s, status: "done" } : s,
    );
    const doneCount = db.onboardingState.steps.filter((s) => s.status === "done").length;
    db.onboardingState.current =
      doneCount === 0 ? "first_run" : doneCount === db.onboardingState.steps.length ? "complete" : "in_progress";
    return ok(db.onboardingState);
  }

  // §5.29.9 - cross-scope blueprint proposal queue.
  // GET /v1/blueprint-proposals?status=&scope_kind=&scope_id=
  if (pathname === "/v1/blueprint-proposals" && m === "GET") {
    const status = query.get("status") ?? "pending";
    const scopeKind = query.get("scope_kind");
    const scopeId = query.get("scope_id");
    const allBlueprints = collectAllBlueprintsForCrossScope();
    const merged: BlueprintSectionProposal[] = [];
    for (const { bp, scope_kind, scope_id } of allBlueprints) {
      if (scopeKind && scopeKind !== scope_kind) continue;
      if (scopeId && scopeId !== scope_id) continue;
      for (const p of bp.proposals) {
        if (status !== "all" && p.status !== status) continue;
        const section = bp.sections[p.section_key];
        merged.push({
          ...p,
          section_title: section?.title ?? p.section_key,
          blueprint_id: bp.toc.blueprint_id,
          scope_kind: scope_kind as "org" | "domain" | "repo",
        });
      }
    }
    merged.sort((a, b) => b.proposed_at.localeCompare(a.proposed_at));
    return ok(merged);
  }
  // POST /v1/blueprint-proposals/{id}/(accept|edit-accept|reject) - cross-scope
  mm = pathname.match(/^\/v1\/blueprint-proposals\/([^/]+)\/(accept|edit-accept|reject)$/);
  if (mm && m === "POST") {
    const pid = decodeURIComponent(mm[1]!);
    const action = mm[2]!;
    const all = collectAllBlueprintsForCrossScope();
    const hit = all.find(({ bp }) => bp.proposals.some((p) => p.id === pid));
    if (!hit) return notFound("Proposal not found");
    const proposal = hit.bp.proposals.find((p) => p.id === pid)!;
    if (proposal.status !== "pending") {
      return new MockResponse(409, { error: { code: "proposal_already_decided", message: `Proposal already ${proposal.status}.` } });
    }
    const section = hit.bp.sections[proposal.section_key];
    if (!section) return notFound("Section not found");
    if (action === "accept" || action === "edit-accept") {
      const body = action === "edit-accept"
        ? parseBody<{ body_markdown?: string; body_json?: Record<string, unknown> }>(init)
        : {};
      section.current_version += 1;
      section.body_markdown = body.body_markdown ?? proposal.proposed_body_markdown;
      section.body_json = body.body_json ?? proposal.proposed_body_json;
      if (proposal.proposed_summary) section.summary = proposal.proposed_summary;
      if (proposal.proposed_title) section.title = proposal.proposed_title;
      section.protected_from_ai = true;
      section.last_synced_at = new Date().toISOString();
      proposal.status = "accepted";
      recomputeBlueprintToc(hit.bp);
      return ok({ proposal_id: pid, section_id: proposal.blueprint_section_id, new_version: section.current_version });
    }
    if (action === "reject") {
      proposal.status = "rejected";
      recomputeBlueprintToc(hit.bp);
      const cooldown = new Date(Date.now() + 7 * 86400000).toISOString();
      return ok({ proposal_id: pid, section_id: proposal.blueprint_section_id, cooldown_until: cooldown });
    }
  }

  /* ------------------------------------------------------------ /v1/.../blueprint
   * Blueprint endpoints per knowledge-model.md §5.6. Three scopes share the same
   * route shape - we pattern-match `(domains|repos|orgs)` first then
   * dispatch on the trailing segment. Mutations mutate the in-memory store
   * so the FE sees changes reflected immediately. */
  {
    const blueprintMatch = pathname.match(/^\/v1\/(domains|repos|orgs)\/([^/]+)\/blueprint(?:(\/.+)|(:rebuild))?$/);
    if (blueprintMatch) {
      const scopeKind = blueprintMatch[1]! as "domains" | "repos" | "orgs";
      const scopeId = decodeURIComponent(blueprintMatch[2]!);
      const sub = blueprintMatch[3] ?? "";
      const rebuild = blueprintMatch[4] === ":rebuild";

      const store =
        scopeKind === "domains" ? db.blueprints.domains
        : scopeKind === "repos"      ? db.blueprints.repos
        :                              db.blueprints.orgs;
      const blueprint = store[scopeId];
      if (!blueprint) return notFound(`Blueprint not found for ${scopeKind}/${scopeId}`);

      // TOC: GET /v1/{scope}/{id}/blueprint
      if (sub === "" && !rebuild && m === "GET") {
        return ok(blueprint.toc);
      }

      // Force rebuild: POST /v1/{scope}/{id}/blueprint:rebuild
      if (rebuild && m === "POST") {
        const body = parseBody<{ confirm_slug: string }>(init);
        if (!body.confirm_slug) {
          return new MockResponse(422, {
            error: { code: "confirm_required", message: "confirm_slug is required for rebuild.", field: "confirm_slug" },
          });
        }
        blueprint.toc.status = "ready";
        blueprint.toc.last_synced_at = new Date().toISOString();
        return ok(blueprint.toc);
      }

      // List proposals: GET /v1/{scope}/{id}/blueprint/proposals
      if (sub === "/proposals" && m === "GET") {
        return ok(blueprint.proposals.filter((p) => p.status === "pending"));
      }

      // Proposal mutations: POST .../proposals/{pid}/(accept|edit-and-accept|reject)
      const proposalActionMatch = sub.match(/^\/proposals\/([^/]+)\/(accept|edit-and-accept|reject)$/);
      if (proposalActionMatch && m === "POST") {
        const pid = decodeURIComponent(proposalActionMatch[1]!);
        const action = proposalActionMatch[2]!;
        const proposal = blueprint.proposals.find((p) => p.id === pid);
        if (!proposal) return notFound("Proposal not found");
        if (proposal.status !== "pending") {
          return new MockResponse(409, {
            error: { code: "proposal_already_decided", message: `Proposal already ${proposal.status}.` },
          });
        }

        if (action === "accept") {
          const section = blueprint.sections[proposal.section_key];
          if (!section) return notFound("Section not found");
          section.current_version += 1;
          section.body_markdown = proposal.proposed_body_markdown;
          section.body_json = proposal.proposed_body_json;
          if (proposal.proposed_summary) section.summary = proposal.proposed_summary;
          if (proposal.proposed_title) section.title = proposal.proposed_title;
          section.protected_from_ai = true;
          section.last_synced_at = new Date().toISOString();
          proposal.status = "accepted";
          // Bump TOC mirror.
          recomputeBlueprintToc(blueprint);
          // Append revision.
          (blueprint.revisions[proposal.section_key] ??= []).push({
            id: `rev_${proposal.section_key}_${section.current_version}`,
            version: section.current_version,
            body_markdown: section.body_markdown,
            body_json: section.body_json,
            author_kind: "agent",
            author_id: "athena_blueprint_builder",
            change_note: `Accepted proposal ${proposal.id}: ${proposal.diff_summary}`,
            created_at: new Date().toISOString(),
          });
          return ok(section);
        }

        if (action === "edit-and-accept") {
          const body = parseBody<{ body_markdown?: string; body_json?: Record<string, unknown>; change_note?: string }>(init);
          const section = blueprint.sections[proposal.section_key];
          if (!section) return notFound("Section not found");
          section.current_version += 1;
          if (body.body_markdown !== undefined) section.body_markdown = body.body_markdown;
          if (body.body_json !== undefined) section.body_json = body.body_json;
          section.protected_from_ai = true;
          section.last_edited_by_user_id = db.me.id;
          section.last_synced_at = new Date().toISOString();
          proposal.status = "accepted";
          recomputeBlueprintToc(blueprint);
          (blueprint.revisions[proposal.section_key] ??= []).push({
            id: `rev_${proposal.section_key}_${section.current_version}`,
            version: section.current_version,
            body_markdown: section.body_markdown,
            body_json: section.body_json,
            author_kind: "human",
            author_id: db.me.id,
            change_note: body.change_note ?? `Edit-and-accept of proposal ${proposal.id}`,
            created_at: new Date().toISOString(),
          });
          return ok(section);
        }

        if (action === "reject") {
          proposal.status = "rejected";
          recomputeBlueprintToc(blueprint);
          return ok(proposal);
        }
      }

      // Section-scoped routes: /sections/{key}…
      const sectionMatch = sub.match(/^\/sections\/([^/]+)(.*)$/);
      if (sectionMatch) {
        const sectionKey = decodeURIComponent(sectionMatch[1]!);
        const tail = sectionMatch[2] ?? "";
        const section = blueprint.sections[sectionKey];
        if (!section) return notFound(`Section ${sectionKey} not found`);

        // GET /sections/{key}
        if (tail === "" && m === "GET") return ok(section);

        // PATCH /sections/{key} - user-edit
        if (tail === "" && m === "PATCH") {
          const body = parseBody<{
            body_markdown?: string; body_json?: Record<string, unknown>;
            title?: string; summary?: string; change_note?: string;
          }>(init);
          if (!section.editable || section.locked) {
            return new MockResponse(403, {
              error: { code: "section_not_editable", message: "This section is locked or derived and cannot be user-edited." },
            });
          }
          section.current_version += 1;
          if (body.body_markdown !== undefined) section.body_markdown = body.body_markdown;
          if (body.body_json !== undefined) section.body_json = body.body_json;
          if (body.title !== undefined) section.title = body.title;
          if (body.summary !== undefined) section.summary = body.summary;
          section.protected_from_ai = true;
          section.last_edited_by_user_id = db.me.id;
          section.last_synced_at = new Date().toISOString();
          recomputeBlueprintToc(blueprint);
          (blueprint.revisions[sectionKey] ??= []).push({
            id: `rev_${sectionKey}_${section.current_version}`,
            version: section.current_version,
            body_markdown: section.body_markdown,
            body_json: section.body_json,
            author_kind: "human",
            author_id: db.me.id,
            change_note: body.change_note ?? null,
            created_at: new Date().toISOString(),
          });
          return ok(section);
        }

        // GET /sections/{key}/revisions
        if (tail === "/revisions" && m === "GET") {
          return ok(blueprint.revisions[sectionKey] ?? []);
        }

        // POST /sections/{key}/(lock|unlock|regenerate)
        const actionMatch = tail.match(/^\/(lock|unlock|regenerate)$/);
        if (actionMatch && m === "POST") {
          const action = actionMatch[1]!;
          if (action === "lock") {
            section.locked = true;
          } else if (action === "unlock") {
            section.locked = false;
          } else {
            // Regenerate - for the mock, just bump the version and append a
            // synthetic revision. Real backend may instead create a proposal
            // if the section is `protected_from_ai`.
            section.current_version += 1;
            section.last_synced_at = new Date().toISOString();
            (blueprint.revisions[sectionKey] ??= []).push({
              id: `rev_${sectionKey}_${section.current_version}`,
              version: section.current_version,
              body_markdown: section.body_markdown,
              body_json: section.body_json,
              author_kind: "agent",
              author_id: "athena_blueprint_builder",
              change_note: "Section regenerated on user request",
              created_at: new Date().toISOString(),
            });
          }
          recomputeBlueprintToc(blueprint);
          return ok(section);
        }
      }

      return notFound(`Blueprint route not implemented: ${m} ${pathname}`);
    }
  }

  // /v1/rules
  if (pathname === "/v1/rules" && m === "GET") {
    return ok(db.rules);
  }
  mm = pathname.match(/^\/v1\/rules\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const rule = db.rules.find((r) => r.id === id);
    if (!rule) return notFound("Rule not found");
    return ok(rule);
  }

  // Mock auth fast-paths
  if (pathname === "/v1/mock-auth/sign-in" && m === "POST") {
    const body = parseBody<{ email: string; password?: string }>(init);
    if (!body.email) {
      return new MockResponse(422, { error: { code: "missing_field", message: "Email is required.", field: "email" } });
    }
    // Demo: accept any email; if it's the demo user's, return the demo user; otherwise create a new identity.
    return ok({
      access_token: `mock_at_${Math.random().toString(36).slice(2)}`,
      refresh_token: `mock_rt_${Math.random().toString(36).slice(2)}`,
      user_id: db.me.id,
      email: body.email,
      display_name: body.email === db.me.email ? db.me.display_name : body.email.split("@")[0]!,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  }
  if (pathname === "/v1/mock-auth/sign-up" && m === "POST") {
    const body = parseBody<{ email: string; password?: string; display_name: string }>(init);
    if (!body.email) {
      return new MockResponse(422, { error: { code: "missing_field", message: "Email is required.", field: "email" } });
    }
    if (!body.display_name) {
      return new MockResponse(422, { error: { code: "missing_field", message: "Name is required.", field: "display_name" } });
    }
    return ok({
      access_token: `mock_at_${Math.random().toString(36).slice(2)}`,
      refresh_token: `mock_rt_${Math.random().toString(36).slice(2)}`,
      user_id: db.me.id,
      email: body.email,
      display_name: body.display_name,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    }, 201);
  }
  if (pathname === "/v1/mock-auth/sign-out" && m === "POST") {
    return ok({ accepted: true });
  }

  // Unhandled - log and 404
  console.warn(`[mock-server] unhandled ${m} ${pathname}`);
  return notFound(`Mock route not implemented: ${m} ${pathname}`);
}

/* ----------------------------------------------------------------------- */
/* §6.0 - repo file-browser mock helpers                                   */
/* ----------------------------------------------------------------------- */

/** Hash a string into a positive integer; deterministic across runs. Used
 *  to derive stable fake LOC / count values per file path so the mock UI
 *  doesn't flicker on re-render. */
function _hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Resolve a `repoKnowledge` fixture by `repo_id` alone. The keyspace is
 *  `${capId}::${repoId}` so we scan and return the first match. */
function _findRepoKnowledge(repoId: string): db.MockRepoKnowledge | null {
  for (const k of Object.values(db.repoKnowledge)) {
    if (k.repo_id === repoId) return k;
  }
  return null;
}

/** Synthesise a deterministic file-row list for a repo by projecting the
 *  ranked `top_files` + `configs` rows into the file-browser wire shape and
 *  topping up to `files_indexed` count with synthetic rows so the paging /
 *  counts feel real. The `top_files` id is reused verbatim, so selecting a
 *  graph node resolves the same row in the file-detail handler. */
function _buildFileRows(rk: db.MockRepoKnowledge): RepoFileRow[] {
  const language = rk.primary_language;
  const sha = rk.snapshot.indexed_sha || null;
  const seedFromFiles: RepoFileRow[] = rk.top_files.map((f) => {
    const h = _hashStr(f.path);
    return {
      id: f.id,
      path: f.path,
      name: f.name,
      language: f.language || language,
      layer: f.layer || (f.path.includes("config") ? "Infra" : "Service"),
      parser: h % 3 === 0 ? "tree_sitter" : h % 3 === 1 ? "regex" : "skipped",
      loc: f.loc || (40 + (h % 480)),
      symbols_count: f.symbols || (h % 12),
      imports_count: h % 22,
      todos_count: h % 7 === 0 ? 1 + (h % 3) : 0,
      summary_preview: (f.summary ?? "").slice(0, 180),
      indexed_branch_sha: sha,
    };
  });
  const seedFromConfigs: RepoFileRow[] = rk.configs.map((cfg, i) => {
    const h = _hashStr(cfg.path);
    return {
      id: `file_${rk.repo_id}_cfg_${i}`,
      path: cfg.path,
      name: cfg.path.split("/").pop() ?? "",
      language: cfg.format,
      layer: "Infra",
      parser: "skipped",
      loc: 20 + (h % 120),
      symbols_count: 0,
      imports_count: 0,
      todos_count: 0,
      summary_preview: cfg.summary.slice(0, 180),
      indexed_branch_sha: sha,
    };
  });
  const all = [...seedFromFiles, ...seedFromConfigs];
  // Top up to the reported `files_indexed` so the count chip lines up.
  const padCount = Math.max(0, Math.min(rk.files_indexed - all.length, 200));
  for (let i = 0; i < padCount; i++) {
    const path = `src/generated/file_${String(i + 1).padStart(3, "0")}.${language === "Python" ? "py" : "ts"}`;
    const h = _hashStr(path);
    all.push({
      id: `file_${rk.repo_id}_synth_${i}`,
      path,
      name: path.split("/").pop()!,
      language,
      layer: ["API", "Service", "Data", "UI", "Util", "Test"][h % 6] ?? "Service",
      parser: h % 3 === 0 ? "tree_sitter" : h % 3 === 1 ? "regex" : "skipped",
      loc: 20 + (h % 600),
      symbols_count: h % 18,
      imports_count: h % 30,
      todos_count: h % 11 === 0 ? 1 : 0,
      summary_preview: `Synthesised module ${i + 1} for ${rk.repo_full_name}.`,
      indexed_branch_sha: sha,
    });
  }
  return all.sort((a, b) => a.path.localeCompare(b.path));
}

/* ----------------------------------------------------------------------- */
/* Folder (`module`) nodes - the Files-tab directory dossiers.             */
/*                                                                          */
/* Real mode persists one `module` knowledge-node per directory; the graph */
/* fixtures don't carry per-repo folders, so we synthesise them from each   */
/* repo's file paths. This makes a folder click in the Files tree resolve a */
/* node id (`buildFolderNodeMap`) and open the shared node-dossier drawer,  */
/* exactly like real mode.                                                  */
/* ----------------------------------------------------------------------- */

/** Unique directory paths in a repo, derived from its file rows the same way
 *  `<FileTree>` derives folders. */
function _repoDirPaths(rk: db.MockRepoKnowledge): string[] {
  const set = new Set<string>();
  for (const row of _buildFileRows(rk)) {
    const parts = row.path.split(/[\\/]/).filter(Boolean);
    let cur = "";
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur ? `${cur}/${parts[i]}` : parts[i]!;
      set.add(cur);
    }
  }
  return [...set].sort();
}

/** Deterministic synthetic id for a repo's directory `module` node. The client
 *  percent-encodes it before the route sees it, so `/` + `::` are safe. */
function _folderModuleId(repoId: string, dirPath: string): string {
  return `mod::${repoId}::${dirPath}`;
}

/** One synthetic `module` KG node per directory so `buildFolderNodeMap` resolves
 *  a node id for each folder (mirrors the BE's per-directory module node). */
function _syntheticModuleNodes(rk: db.MockRepoKnowledge): db.MockKnowledgeNode[] {
  return _repoDirPaths(rk).map((dirPath) => ({
    id: _folderModuleId(rk.repo_id, dirPath),
    node_kind: "module",
    name: dirPath.split("/").pop() ?? dirPath,
    layer: null,
    repo_id: rk.repo_id,
    tags: [],
    summary: `Directory ${dirPath} in ${rk.repo_full_name}.`,
    path: dirPath,
    centrality: null,
  }));
}

/** Resolve a synthetic folder-module id → its repo + directory path. */
function _findFolderModuleById(nodeId: string): { rk: db.MockRepoKnowledge; dirPath: string } | null {
  for (const rk of Object.values(db.repoKnowledge)) {
    for (const dirPath of _repoDirPaths(rk)) {
      if (_folderModuleId(rk.repo_id, dirPath) === nodeId) return { rk, dirPath };
    }
  }
  return null;
}

/** Build a `module` (folder) `NodeDossierResponse` - the mock mirror of the BE's
 *  per-directory `metadata.dossier` (an LLM roll-up of child blueprints).
 *  `contains` links the folder's direct children (sub-dirs + files) as clickable
 *  refs so the dossier navigates back into the tree. */
function _folderDossierResponse(rk: db.MockRepoKnowledge, dirPath: string): NodeDossierResponse {
  const name = dirPath.split("/").pop() ?? dirPath;
  const dirParts = dirPath.split("/");
  const rows = _buildFileRows(rk);
  // Path parts of a row when it lives under `dirPath`, else null.
  const under = (path: string): string[] | null => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts.length > dirParts.length && parts.slice(0, dirParts.length).join("/") === dirPath ? parts : null;
  };
  const childFileRefs = rows
    .filter((r) => under(r.path)?.length === dirParts.length + 1)
    .slice(0, 20)
    .map((r) => ({ node_id: r.id, name: r.name, path: r.path, kind: "file", layer: r.layer }));
  const childDirPaths = [...new Set(
    rows
      .map((r) => under(r.path))
      .filter((p): p is string[] => p != null && p.length > dirParts.length + 1)
      .map((p) => p.slice(0, dirParts.length + 1).join("/")),
  )].sort();
  const childDirRefs = childDirPaths.map((p) => ({
    node_id: _folderModuleId(rk.repo_id, p), name: p.split("/").pop() ?? p, path: p, kind: "module", layer: null,
  }));
  const fileCount = rows.filter((r) => under(r.path) != null).length;
  const parentPath = dirParts.length > 1 ? dirParts.slice(0, -1).join("/") : null;
  const parentRef = parentPath
    ? { node_id: _folderModuleId(rk.repo_id, parentPath), name: parentPath.split("/").pop() ?? parentPath, path: parentPath, kind: "module", layer: null }
    : null;
  const what =
    `The \`${dirPath}\` directory in ${rk.repo_full_name} groups ${fileCount} file(s) across ` +
    `${childDirPaths.length} sub-folder(s). This module dossier (synthesised in mock mode) rolls ` +
    `up its children - the BE generates it as an LLM summary of the contained file blueprints.`;
  return {
    node_kind: "module",
    name,
    path: dirPath,
    summary: what,
    layer: null,
    repo_id: rk.repo_id,
    dossier: {
      node_id: _folderModuleId(rk.repo_id, dirPath),
      name,
      kind: "module",
      path: dirPath,
      headline: `${name}/ - ${fileCount} file(s)`,
      what,
      architecture: {
        layer: null,
        role: fileCount > 12 ? "hub" : null,
        pattern: null,
        responsibilities: [`Groups ${fileCount} file(s) under ${dirPath}.`],
      },
      signals: { language: rk.primary_language, loc: null, tags: [] },
      contains: [...childDirRefs, ...childFileRefs],
      contained_by: parentRef,
      relations: {},
      see_also: [],
      elements: [],
      mermaid: `flowchart TD\n  D["${name}/"] --> F[files]\n  D --> S[sub-folders]`,
    },
  };
}

function mockRepoFilesList(repoId: string, query: URLSearchParams): RepoFilesOut | MockResponse {
  const rk = _findRepoKnowledge(repoId);
  if (!rk) {
    return {
      repo_id: repoId, repo_full_name: "unknown/repo",
      items: [], next_cursor: null, has_more: false,
      totals: { files: 0, filtered: 0, by_language: {}, by_layer: {} },
    };
  }
  const all = _buildFileRows(rk);
  const pathPrefix = query.get("path_prefix");
  const language = query.get("language");
  const layer = query.get("layer");
  const q = (query.get("q") || "").toLowerCase();
  const limit = Math.min(200, Math.max(10, Number(query.get("limit") || 50)));
  const cursor = query.get("cursor");
  const cursorPath = cursor ? atob(cursor.replace(/_/g, "/").replace(/-/g, "+")) : null;
  let filtered = all;
  if (pathPrefix) filtered = filtered.filter((r) => r.path.startsWith(pathPrefix));
  if (language) filtered = filtered.filter((r) => r.language === language);
  if (layer) filtered = filtered.filter((r) => r.layer === layer);
  if (q) filtered = filtered.filter((r) => r.path.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  let windowed = filtered;
  if (cursorPath) windowed = windowed.filter((r) => r.path > cursorPath);
  const page = windowed.slice(0, limit);
  const hasMore = windowed.length > limit;
  const next = hasMore && page.length
    ? btoa(page[page.length - 1]!.path).replace(/\+/g, "-").replace(/\//g, "_")
    : null;
  const by_language: Record<string, number> = {};
  const by_layer: Record<string, number> = {};
  for (const r of all) {
    if (r.language) by_language[r.language] = (by_language[r.language] ?? 0) + 1;
    if (r.layer) by_layer[r.layer] = (by_layer[r.layer] ?? 0) + 1;
  }
  return {
    repo_id: rk.repo_id, repo_full_name: rk.repo_full_name,
    items: page, next_cursor: next, has_more: hasMore,
    totals: { files: all.length, filtered: filtered.length, by_language, by_layer },
  };
}

function mockRepoFileDetail(repoId: string, fileId: string): RepoFileDetail | null {
  const rk = _findRepoKnowledge(repoId);
  if (!rk) return null;
  const all = _buildFileRows(rk);
  const row = all.find((r) => r.id === fileId);
  if (!row) return null;
  const h = _hashStr(row.path);
  // Folded symbols are real in the BE (metadata.symbols); synthesise plausible
  // per-file names in mock mode from the file name + index.
  const base = row.name.replace(/\.[^.]+$/, "");
  const symbols = Array.from({ length: row.symbols_count }, (_, i) => `${base}_sym${i + 1}`);
  const importPool = ["typing.Iterator", "datetime.datetime", "asyncio.gather",
    "fastapi.APIRouter", "sqlalchemy.select", "pydantic.BaseModel"];
  const imports = Array.from({ length: row.imports_count }, (_, i) => importPool[i % importPool.length]!);
  const todos = Array.from({ length: row.todos_count }, (_, i) =>
    `TODO: ${["tighten validation", "extract helper", "cover edge case"][(h + i) % 3]}`,
  );
  const summary =
    `${row.summary_preview}\n\nFull file body (mock). Hash=${h}. Path=${row.path}. ` +
    `This is the synthesised full summary, longer than the 180-char preview ` +
    `truncation so the drawer's Summary tab renders the unabridged text.`;
  return {
    id: row.id, repo_id: rk.repo_id, path: row.path, name: row.name,
    language: row.language, layer: row.layer, parser: row.parser, loc: row.loc,
    symbols, imports, todos, summary,
    indexed_branch_sha: row.indexed_branch_sha,
  };
}

/** Resolve a repo FILE id (a file-browser row id) → its repo + row, scanning
 *  every `repoKnowledge` fixture. In real mode a file's repo-file id IS its
 *  knowledge-node id, so `GET /v1/knowledge/nodes/{id}` must resolve file ids
 *  too. This mirrors that so the file-detail drawer's Overview renders a real
 *  dossier in mock mode (not just the flat summary). */
function _findFileRowById(fileId: string): { rk: db.MockRepoKnowledge; row: RepoFileRow } | null {
  for (const rk of Object.values(db.repoKnowledge)) {
    const row = _buildFileRows(rk).find((r) => r.id === fileId);
    if (row) return { rk, row };
  }
  return null;
}

/** Build a file `NodeDossierResponse` from a file-browser row - the mock mirror
 *  of the BE's per-file `metadata.dossier` (headline / what / architecture /
 *  responsibilities / folded symbol elements / diagram). Imports/relations are
 *  intentionally omitted: the drawer's Imports tab owns that, and synthetic
 *  import ids wouldn't resolve as clickable nodes. */
function _fileDossierResponse(rk: db.MockRepoKnowledge, row: RepoFileRow): NodeDossierResponse {
  const base = row.name.replace(/\.[^.]+$/, "");
  const elements = Array.from({ length: Math.min(row.symbols_count, 8) }, (_, i) => ({
    name: i === 0 ? base : `${base}_fn${i}`,
    kind: i === 0 ? "class" : "function",
    line_start: 12 + i * 20,
    line_end: 28 + i * 20,
    signature: i === 0 ? `class ${base} { … }` : `function ${base}_fn${i}(…): void`,
    ...(i % 2 === 0 ? { doc: `Handles the ${base} responsibility #${i + 1}.` } : {}),
    complexity: 2 + (i % 5),
  }));
  const what =
    `${row.summary_preview}\n\nThis ${row.language ?? "source"} file lives in ` +
    `${rk.repo_full_name} under the ${row.layer ?? "-"} layer. The full dossier ` +
    `(synthesised in mock mode) folds its ${row.symbols_count} symbol(s) into the ` +
    `Elements list below and links its neighbours from the focused tabs.`;
  return {
    node_kind: "file",
    name: row.name,
    path: row.path,
    summary: what,
    layer: row.layer,
    repo_id: rk.repo_id,
    dossier: {
      node_id: row.id,
      name: row.name,
      kind: "file",
      path: row.path,
      headline: row.summary_preview || row.name,
      what,
      architecture: {
        layer: row.layer,
        role: row.imports_count > 12 ? "hub" : null,
        pattern: null,
        responsibilities: row.summary_preview ? [row.summary_preview] : [],
      },
      signals: { language: row.language, loc: row.loc, tags: [] },
      contains: [],
      contained_by: null,
      relations: {},
      see_also: [],
      elements,
      mermaid: `flowchart TD\n  A[${row.name}] --> B[dependency]\n  A --> C[helper]`,
    },
  };
}

/* ----------------------------------------------------------------------- */
/* §6.5.6 - FE-mirror mock helpers (BE tools, FE REST stubs)               */
/* ----------------------------------------------------------------------- */

/** Synthesise a deterministic graph-walk envelope so the dependents /
 *  dependencies / slice panels render real-looking data in mock mode.
 *  Pulls peer file rows from the same repo's `_buildFileRows()` set so
 *  click-through navigation works end-to-end. */
function mockFileGraphWalk(
  repoId: string,
  fileId: string,
  direction: "incoming" | "outgoing" | "slice",
  query: URLSearchParams,
): FileDependentsEnvelope {
  const rk = _findRepoKnowledge(repoId);
  if (!rk) {
    return {
      items: [], freshness: { kg_snapshot_id: null, last_indexed_at: null },
      search_quality: "empty",
    };
  }
  const all = _buildFileRows(rk);
  const seed = all.find((r) => r.id === fileId);
  if (!seed) {
    return {
      items: [], freshness: { kg_snapshot_id: null, last_indexed_at: null },
      search_quality: "empty",
    };
  }
  const maxHops = Math.max(1, Math.min(5, Number(query.get("max_hops") || (direction === "slice" ? 2 : 3))));
  const limit = Math.max(1, Math.min(100, Number(query.get("limit") || 30)));
  const peers = all.filter((r) => r.id !== fileId);
  // Deterministic hop assignment off the path hash so the same fileId
  // returns the same shape across renders. Cross-repo slot mixes in a
  // fake `repo_full_name` so the "(cross-repo)" highlight renders.
  const items: FileDependentsItem[] = [];
  for (let i = 0; i < Math.min(peers.length, limit); i++) {
    const peer = peers[i]!;
    const h = _hashStr(peer.path + fileId);
    const hop = (h % maxHops) + 1;
    const isCrossRepo = direction !== "slice" && i % 7 === 3;
    items.push({
      id: peer.id,
      node_kind: "file",
      path: peer.path,
      name: peer.name,
      summary: peer.summary_preview,
      tags: peer.language ? [peer.language] : [],
      layer: peer.layer,
      repo_full_name: isCrossRepo ? `acme/${rk.primary_language.toLowerCase()}-utils` : rk.repo_full_name,
      hops: hop,
    });
  }
  // Sort by hops then path so the tree groups predictably.
  items.sort((a, b) => (a.hops ?? 0) - (b.hops ?? 0) || a.path.localeCompare(b.path));
  return {
    items,
    total: items.length,
    freshness: {
      kg_snapshot_id: rk.snapshot.indexed_sha,
      last_indexed_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      commits_behind: 0,
      stale_but_usable: false,
    },
    search_quality: items.length >= 2 ? "exact" : items.length === 1 ? "fuzzy" : "empty",
  };
}

/** Synthesise file-content body for the content tab. The summary cache
 *  is the same string seeded into `mockRepoFileDetail`; `coverage_warning`
 *  is carried so the FE banner exercises in mock. */
function mockFileContent(
  repoId: string,
  fileId: string,
  query: URLSearchParams,
): RepoFileContentResponse | null {
  const detail = mockRepoFileDetail(repoId, fileId);
  if (!detail) return null;
  const allLines = detail.summary.split("\n");
  const total = allLines.length;
  const lineStartRaw = query.get("line_start");
  const lineEndRaw = query.get("line_end");
  let content: string;
  let citeStart = 1;
  let citeEnd = total;
  if (lineStartRaw !== null || lineEndRaw !== null) {
    const start = Math.max(1, Number(lineStartRaw || 1));
    const end = lineEndRaw ? Math.min(total, Number(lineEndRaw)) : total;
    content = allLines.slice(start - 1, end).join("\n");
    citeStart = start;
    citeEnd = end;
  } else {
    content = detail.summary;
  }
  return {
    content,
    language: detail.language,
    total_lines: total,
    indexed_branch_sha: detail.indexed_branch_sha,
    citation: `[node:${detail.id}:L${citeStart}-L${citeEnd}]`,
    truncated: false,
    coverage_warning:
      "only first 4000 chars per file scanned (partial summary)",
  };
}

/** Synthesise a grep envelope. Scans the synthesised file summaries
 *  with the Python-style regex compiled as a JS regex; bad patterns
 *  surface as a 400 via `MockResponse`. */
function mockRepoGrep(
  repoId: string,
  query: URLSearchParams,
): RepoGrepEnvelope | MockResponse {
  const pattern = query.get("pattern") || "";
  if (!pattern) {
    return new MockResponse(400, {
      error: { code: "invalid_argument", message: "pattern is required", field: "pattern" },
    });
  }
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern);
  } catch (exc) {
    return new MockResponse(400, {
      error: {
        code: "invalid_argument",
        message: `invalid regex: ${exc instanceof Error ? exc.message : String(exc)}`,
        field: "pattern",
      },
    });
  }
  const rk = _findRepoKnowledge(repoId);
  if (!rk) {
    return { items: [], total: 0, truncated: false, coverage_warning: null };
  }
  const all = _buildFileRows(rk);
  const maxResults = Math.max(1, Math.min(200, Number(query.get("max_results") || 50)));
  const pathGlob = query.get("path_glob");
  const items: RepoGrepResult[] = [];
  let truncated = false;
  for (const row of all) {
    if (pathGlob && !row.path.includes(pathGlob.replace(/%/g, ""))) continue;
    const body = row.summary_preview || "";
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = compiled.exec(line);
      if (!match) continue;
      items.push({
        path: row.path,
        line: i + 1,
        match: match[0].slice(0, 200),
        context_before: i >= 1 ? (lines[i - 1] ?? "") : "",
        context_after: i < lines.length - 1 ? (lines[i + 1] ?? "") : "",
        citation: `[node:${row.id}:L${i + 1}-L${i + 1}]`,
      });
      if (items.length >= maxResults) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  return {
    items,
    total: items.length,
    truncated,
    coverage_warning:
      "only first 4000 chars per file scanned (partial summary)",
  };
}
