"use client";

/**
 * Domain-level and repo-level deep-dive cost views, driven by a `CostSummary`
 * scoped to that domain/repo (api.cost.summary with scope + domain_id/repo_id).
 * Repo cost is ingestion-only because token_usage.repo_id is set only for
 * ingest calls - the view says so explicitly.
 */

import { FolderGit2, GitCommit, Lock, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { formatTokens, formatUsdCompact, formatUsdPrecise } from "@/lib/utils/format";
import type { RepoIngestCycles } from "@/lib/api/client";

import { DailyBars, DenseTable, Donut, Eyebrow, Hint, KpiTile, RankedList, Ring } from "./cost-atoms";
import type { CostView } from "./cost-view";

// =============================================================== DOMAIN ========
export function CostDomainView({ data: m, name, budget, canAttribution, canBudgets, onSetBudget }: {
  data: CostView; name: string; budget: number; canAttribution: boolean; canBudgets: boolean;
  onSetBudget: (t: { id: string; name: string; current: number }) => void;
}) {
  const delta = m.compare.spend_usd > 0 ? (m.spend_usd - m.compare.spend_usd) / m.compare.spend_usd : 0;
  const used = budget > 0 ? m.spend_usd / budget : 0;
  const over = budget > 0 && m.forecast_usd > budget;
  const members = m.spend_by_member.filter((x) => x.id !== "unattributed").length;
  return (
    <Stack gap="5">
      <Grid cols="1" gap="4" className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Domain spend" value={formatUsdPrecise(m.spend_usd)} sub={`${m.compare.label} ${formatUsdPrecise(m.compare.spend_usd)}`} delta={delta} source="SUM(token_usage.cost_usd) WHERE domain_id = this domain" spark={m.spend_daily.map((x) => x.usd)} />
        <Card variant="elevated" className="p-4"><Stack gap="1.5">
          <Cluster justify="between" align="center"><Cluster gap="1" align="center"><Eyebrow>Budget</Eyebrow><Hint text="domain_settings.budget_mtd_usd" /></Cluster>
            {budget > 0 && <Pill size="sm" tone={over ? "warning" : "success"}>{over ? "Over forecast" : "On track"}</Pill>}</Cluster>
          <span className="text-2xl font-semibold tabular-nums text-[var(--text)]">{budget > 0 ? `${Math.round(used * 100)}%` : "—"}</span>
          <span className="text-xs text-[var(--text-muted)]">{budget > 0 ? `${formatUsdPrecise(m.spend_usd)} of ${formatUsdPrecise(budget)}` : "No domain budget set"}</span>
          {budget > 0 && <div className="comet-track mt-1 h-1.5 w-full"><div className="comet-fill" style={{ "--comet-value": `${Math.min(100, used * 100)}%`, ...(used > 0.9 ? { "--primary": "var(--warning)" } : {}) } as React.CSSProperties} /></div>}
        </Stack></Card>
        <KpiTile label="Forecast" value={formatUsdPrecise(m.forecast_usd)} sub="run-rate, 30-day normalised" source="billing/_forecast on this domain's window" />
        <KpiTile label="Contributors" value={members > 0 ? `${members} members` : "—"} sub={`${m.spend_by_repo.length} repos · ${m.spend_by_task_type.reduce((s, t) => s + t.count, 0)} tasks`} source="distinct actor_user_id + domain attachments" />
      </Grid>

      <Card variant="elevated" className="p-5"><Stack gap="4">
        <Cluster justify="between" align="center">
          <Stack gap="0.5"><h2 className="text-base font-semibold">{name} spend over time</h2><p className="text-xs text-[var(--text-muted)]">{m.range.label}</p></Stack>
          {budget > 0 && <Ring pct={used} value={`${Math.round(used * 100)}%`} label="budget" tone={over ? "warning" : "primary"} size={72} />}
        </Cluster>
        <hr className="hr-horizon" aria-hidden />
        <DailyBars data={m.spend_daily} height={150} />
      </Stack></Card>

      <Grid cols="1" gap="4" className="lg:grid-cols-2">
        <DonutCard title="By repo (ingestion)" hint="repo_id is ingest-only - these are the domain's repos' build cost" rows={m.spend_by_repo.map((r) => ({ key: r.repo_id, name: r.name, usd: r.usd, pct: r.pct }))} />
        <DonutCard title="By model" hint="cost_rollups_daily.model scoped to domain_id" rows={m.spend_by_model.map((mm) => ({ key: mm.id, name: mm.name, usd: mm.usd, pct: mm.pct, sub: mm.provider }))} />
        {canAttribution && <DonutCard title="By member" hint="token_usage.actor_user_id within this domain" gated rows={m.spend_by_member.map((mm) => ({ key: mm.id, name: mm.name, usd: mm.usd, pct: mm.pct, sub: mm.email }))} />}
        <DonutCard title="By task type" hint="join task_id → tasks.type within this domain" rows={m.spend_by_task_type.map((t) => ({ key: t.type, name: t.name, usd: t.usd, pct: t.pct, sub: `${t.count} tasks` }))} />
      </Grid>

      <Card variant="elevated" className="p-5"><Stack gap="3">
        <h2 className="text-base font-semibold">Costliest tasks in {name}</h2>
        <hr className="hr-horizon" aria-hidden />
        <DenseTable head={["Task", "Runs", "Spend", "Last used"]} align={["left", "right", "right", "left"]} empty="No task-attributed spend in this window."
          rows={m.top_tasks.map((t) => [t.title, String(t.runs), formatUsdPrecise(t.usd), t.last_used || "—"])} />
        {canBudgets && (
          <Cluster gap="2" align="center"><Button type="button" variant="secondary" size="sm" onClick={() => onSetBudget({ id: m.scope.id ?? "", name, current: budget })}><Wallet className="size-3.5" /> Set domain budget</Button></Cluster>
        )}
      </Stack></Card>
    </Stack>
  );
}

// ================================================================= REPO ========
type CycleState = RepoIngestCycles["cycles"] | "loading" | "error" | null;
export function CostRepoView({ data: m, domain, cycles }: { data: CostView; name?: string; domain?: string; cycles: CycleState }) {
  const delta = m.compare.spend_usd > 0 ? (m.spend_usd - m.compare.spend_usd) / m.compare.spend_usd : 0;
  const tokens = m.total_prompt_tokens + m.total_completion_tokens;
  const avgPerSync = Array.isArray(cycles) && cycles.length > 0 ? m.spend_usd / cycles.length : 0;
  const lastSync = Array.isArray(cycles) && cycles.length > 0 ? cycles[0]! : null;
  return (
    <Stack gap="5">
      <Cluster gap="2" align="center" className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <FolderGit2 className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
        <span className="text-xs text-[var(--text-muted)]">Repo cost = <strong className="font-medium text-[var(--text)]">ingestion only</strong> (token_usage.repo_id is set only for ingest calls). Agent + chat work attributes to {domain ? <>the <strong className="font-medium text-[var(--text)]">{domain}</strong> domain</> : <>its owning domain</>}, not the repo.</span>
      </Cluster>

      <Grid cols="1" gap="4" className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Ingestion spend" value={formatUsdPrecise(m.spend_usd)} sub={`${m.compare.label} ${formatUsdPrecise(m.compare.spend_usd)}`} delta={delta} source="token_usage WHERE repo_id = this repo AND phase_key='ingest'" spark={m.spend_daily.map((x) => x.usd)} />
        <KpiTile label="Sync cycles" value={Array.isArray(cycles) ? String(cycles.length) : "…"} sub={avgPerSync > 0 ? `avg ${formatUsdPrecise(avgPerSync)} / sync` : "per branch_sha"} source="distinct branch_sha buckets" />
        <KpiTile label="Last sync" value={lastSync ? formatUsdPrecise(lastSync.usd) : "—"} sub={lastSync ? new Date(lastSync.started_at).toLocaleDateString() : "no sync in window"} source="most recent branch_sha cycle" />
        <KpiTile label="Tokens ingested" value={formatTokens(tokens)} sub="prompt + completion" source="SUM(prompt+completion_tokens)" />
      </Grid>

      <Card variant="elevated" className="p-5"><Stack gap="4">
        <h2 className="text-base font-semibold">Ingestion spend over time</h2>
        <hr className="hr-horizon" aria-hidden />
        <DailyBars data={m.spend_daily} height={140} />
      </Stack></Card>

      <Grid cols="1" gap="4" className="lg:grid-cols-[1fr_1.4fr]">
        <DonutCard title="By model (ingestion)" hint="which models the sync used - blueprint synthesis vs per-file enrichment" rows={m.spend_by_model.map((mm) => ({ key: mm.id, name: mm.name, usd: mm.usd, pct: mm.pct, sub: mm.provider }))} />
        <Card variant="elevated" className="p-5"><Stack gap="3">
          <Cluster gap="1.5" align="center"><GitCommit className="size-4 text-[var(--text-subtle)]" /><h2 className="text-base font-semibold">Sync-cycle history</h2><Hint text="GET /v1/cost/repos/{id}/ingest-cycles - one row per branch_sha" /></Cluster>
          <hr className="hr-horizon" aria-hidden />
          <CycleTable cycles={cycles} />
        </Stack></Card>
      </Grid>
    </Stack>
  );
}

function CycleTable({ cycles }: { cycles: CycleState }) {
  if (cycles === null || cycles === "loading") return <Skeleton className="h-24 w-full" aria-label="Loading sync history" />;
  if (cycles === "error") return <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">Couldn&apos;t load this repo&apos;s sync history.</div>;
  return (
    <DenseTable head={["Commit", "When", "Calls", "Tokens", "Cost"]} align={["left", "left", "right", "right", "right"]} empty="No per-sync cost recorded in this window."
      rows={cycles.map((c) => [<span key={c.branch_sha} className="font-mono text-xs">{c.branch_sha.slice(0, 7)}</span>, c.started_at ? new Date(c.started_at).toLocaleDateString() : "—", c.calls.toLocaleString(), formatTokens(c.prompt_tokens + c.completion_tokens), formatUsdPrecise(c.usd)])} />
  );
}

// ------------------------------------------------------------------- atoms ----
function DonutCard({ title, hint, rows, gated }: { title: string; hint: string; rows: { key: string; name: string; usd: number; pct: number; sub?: string }[]; gated?: boolean }) {
  const total = rows.reduce((s, r) => s + r.usd, 0);
  return (
    <Card variant="elevated" className="p-5"><Stack gap="3">
      <Cluster gap="1.5" align="center">
        <h2 className="text-sm font-semibold">{title}</h2><Hint text={hint} />
        {gated && <Eyebrow className="ml-auto inline-flex items-center gap-1"><Lock className="size-3" /> attribution</Eyebrow>}
      </Cluster>
      <hr className="hr-horizon" aria-hidden />
      {total > 0 ? (
        <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
          <div className="flex items-center justify-center"><Donut rows={rows} total={total} size={120} /></div>
          <RankedList rows={rows} />
        </div>
      ) : <p className="py-6 text-center text-xs text-[var(--text-subtle)]">{formatUsdCompact(0)} - platform-managed / no spend in window.</p>}
    </Stack></Card>
  );
}
