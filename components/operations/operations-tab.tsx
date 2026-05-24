"use client";

/**
 * OperationsTab — org-only home for cost, sync health, integrations,
 * members, audit preview, and re-embed classifier metrics.
 *
 * Per ADR-073 §4: every datapoint in this tab has exactly one home — this
 * one. Cost rollups are NOT on the Topology header; integration status is
 * NOT on the org header chip strip; members are NOT shown on capability
 * pages. The tab is composed of six self-contained cards laid out in a
 * 12-column grid.
 *
 * Most cards are summary-only and link out to the dedicated surface for
 * details (e.g. /cost, /settings/integrations, /settings/audit).
 */

import Link from "next/link";
import {
  Coins,
  GitBranch,
  Plug,
  Users,
  ScrollText,
  Activity as ActivityIcon,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { FreshnessPill, type FreshnessState } from "@/components/scope/freshness-pill";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";

/* ----------------------------- Cost card ------------------------------ */

export interface CostSparkPoint {
  day: string;
  cost_usd: number;
}

export interface CostCardData {
  /** Org-wide spend month-to-date. */
  spent_mtd_usd: number;
  /** Optional budget for the month, in USD. Renders a small progress bar. */
  monthly_budget_usd?: number;
  /** Last 14 days sparkline. */
  spark: CostSparkPoint[];
  /** Top 3 capabilities by MTD spend, for the breakdown row. */
  top_caps: Array<{ capability_id: string; capability_name: string; spent_usd: number }>;
}

function CostCard({ data }: { data: CostCardData }) {
  const max = Math.max(0.01, ...data.spark.map((p) => p.cost_usd));
  const budgetPct =
    data.monthly_budget_usd && data.monthly_budget_usd > 0
      ? Math.min(100, (data.spent_mtd_usd / data.monthly_budget_usd) * 100)
      : null;
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <Coins className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Cost MTD</span>
          <Link
            href="/cost"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)] hover:underline"
          >
            details <ExternalLink className="size-3" aria-hidden />
          </Link>
        </Cluster>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            ${data.spent_mtd_usd.toFixed(2)}
          </span>
          {data.monthly_budget_usd && (
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              / ${data.monthly_budget_usd.toFixed(0)} budget
            </span>
          )}
        </div>
        {budgetPct !== null && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        )}
        <div className="flex h-10 items-end gap-0.5" aria-hidden>
          {data.spark.map((p) => (
            <div
              key={p.day}
              className="flex-1 rounded-sm bg-[var(--primary-soft)]"
              style={{ height: `${Math.max(8, (p.cost_usd / max) * 100)}%` }}
              title={`${p.day}: $${p.cost_usd.toFixed(2)}`}
            />
          ))}
        </div>
        <Stack gap="1" as="ul" className="text-xs">
          {data.top_caps.map((c) => (
            <li key={c.capability_id} className="flex items-center justify-between">
              <Link
                href={`/capabilities/${c.capability_id}`}
                className="truncate text-[var(--text-muted)] hover:text-[var(--primary)]"
              >
                {c.capability_name}
              </Link>
              <span className="tabular-nums text-[var(--text)]">${c.spent_usd.toFixed(2)}</span>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/* -------------------------- Sync health card -------------------------- */

export interface RepoSyncRow {
  repo_id: string;
  repo_full_name: string;
  capability_id: string;
  freshness: FreshnessState;
  commits_behind: number;
  last_sync_relative: string;
}

function SyncHealthCard({ rows }: { rows: readonly RepoSyncRow[] }) {
  const stale = rows.filter((r) => r.freshness === "stale_minor" || r.freshness === "stale_major" || r.freshness === "failed");
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Sync health</span>
          <span className="text-xs text-[var(--text-muted)]">
            {rows.length} repos · {stale.length} need attention
          </span>
        </Cluster>
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--text-subtle)]">No repos attached to any capability.</p>
        ) : (
          <VirtualList
            items={rows}
            estimatedItemHeight={36}
            ariaLabel="Repo sync health"
            getKey={(r) => r.repo_id}
            renderItem={(r) => (
              <Link
                href={`/capabilities/${r.capability_id}/repos/${r.repo_id}`}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs hover:border-[var(--primary)] hover:bg-[var(--surface-2)]"
              >
                <code className="truncate font-mono text-[var(--text-muted)]">{r.repo_full_name}</code>
                <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">
                  {r.commits_behind > 0 ? `${r.commits_behind} behind` : ""}
                </span>
                <FreshnessPill state={r.freshness} detail={r.last_sync_relative} />
              </Link>
            )}
          />
        )}
      </Stack>
    </Card>
  );
}

/* --------------------------- Integrations card ----------------------- */

export interface IntegrationRow {
  id: string;
  kind: "github" | "slack" | "jira" | "linear" | "pagerduty" | "webhook" | "other";
  label: string;
  status: "connected" | "degraded" | "disconnected";
  detail?: string;
}

const INTEGRATION_STATUS_TONE: Record<IntegrationRow["status"], { tone: string; Icon: typeof CheckCircle2 }> = {
  connected:    { tone: "text-[var(--success)]", Icon: CheckCircle2 },
  degraded:     { tone: "text-[var(--warning)]", Icon: AlertCircle  },
  disconnected: { tone: "text-[var(--danger)]",  Icon: AlertCircle  },
};

function IntegrationsCard({ rows }: { rows: readonly IntegrationRow[] }) {
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <Plug className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Integrations</span>
          <Link
            href="/settings/integrations"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)] hover:underline"
          >
            manage <ExternalLink className="size-3" aria-hidden />
          </Link>
        </Cluster>
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--text-subtle)]">No integrations connected.</p>
        ) : (
          <Stack gap="1" as="ul" className="text-xs">
            {rows.map((r) => {
              const { tone, Icon } = INTEGRATION_STATUS_TONE[r.status];
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-[var(--border)] p-2"
                >
                  <Cluster gap="2" align="center">
                    <span className="font-medium">{r.label}</span>
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      {r.kind}
                    </span>
                  </Cluster>
                  <Cluster gap="1" align="center" className={cn("text-[10px] uppercase tracking-wider font-semibold", tone)}>
                    <Icon className="size-3" aria-hidden />
                    {r.status}
                    {r.detail && <span className="ml-1 text-[var(--text-subtle)] normal-case font-normal">{r.detail}</span>}
                  </Cluster>
                </li>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/* ----------------------------- Members card --------------------------- */

export interface MembersCardData {
  total: number;
  by_role: { role: string; count: number }[];
  recent_invites: { email: string; role: string; invited_at: string }[];
}

function MembersCard({ data }: { data: MembersCardData }) {
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <Users className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Members</span>
          <span className="text-xs text-[var(--text-muted)]">{data.total} active</span>
          <Link
            href="/settings/members"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)] hover:underline"
          >
            manage <ExternalLink className="size-3" aria-hidden />
          </Link>
        </Cluster>
        <Cluster gap="2" align="center" className="text-xs">
          {data.by_role.map((r) => (
            <span
              key={r.role}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 tabular-nums text-[var(--text-muted)]"
            >
              <span className="font-semibold text-[var(--text)]">{r.count}</span>
              <span className="uppercase tracking-wider text-[10px] text-[var(--text-subtle)]">{r.role}</span>
            </span>
          ))}
        </Cluster>
        {data.recent_invites.length > 0 && (
          <Stack gap="1" as="ul" className="text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Recent invites
            </span>
            {data.recent_invites.slice(0, 3).map((inv) => (
              <li key={inv.email} className="flex items-center justify-between">
                <span className="truncate text-[var(--text-muted)]">{inv.email}</span>
                <span className="text-[10px] text-[var(--text-subtle)] tabular-nums">
                  {inv.role} · {inv.invited_at}
                </span>
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/* ------------------------ Audit preview card ------------------------- */

export interface AuditPreviewRow {
  id: string;
  actor: string;
  action: string;
  resource: string;
  outcome: "success" | "failure";
  when: string;
}

function AuditPreviewCard({ rows }: { rows: readonly AuditPreviewRow[] }) {
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <ScrollText className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Audit log</span>
          <span className="text-xs text-[var(--text-muted)]">most recent 10 events</span>
          <Link
            href="/settings/audit"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)] hover:underline"
          >
            full log <ExternalLink className="size-3" aria-hidden />
          </Link>
        </Cluster>
        <Stack gap="1" as="ul" className="text-xs">
          {rows.slice(0, 10).map((r) => (
            <li
              key={r.id}
              className={cn(
                "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded border border-[var(--border)] px-2 py-1",
                r.outcome === "failure" && "border-[var(--danger)] bg-[var(--danger-soft)]",
              )}
            >
              <code className="font-mono text-[10px] text-[var(--text-muted)]">{r.actor}</code>
              <span className="truncate">
                <span className="font-semibold text-[var(--text)]">{r.action}</span>{" "}
                <code className="font-mono text-[10px] text-[var(--text-subtle)]">{r.resource}</code>
              </span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  r.outcome === "success"
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "bg-[var(--danger-soft)] text-[var(--danger)]",
                )}
              >
                {r.outcome}
              </span>
              <span className="text-[10px] text-[var(--text-subtle)] tabular-nums">{r.when}</span>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/* -------------------- Re-embed classifier card ----------------------- */

export interface ReembedRatioData {
  /** Last 7 days. */
  cosmetic_pct: number;
  minor_pct: number;
  material_pct: number;
  /** Total commits classified in window. */
  commits_classified: number;
  /** Embedding cost saved by reuse, USD, last 7 days. */
  saved_usd: number;
}

function ReembedClassifierCard({ data }: { data: ReembedRatioData }) {
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <ActivityIcon className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Re-embed classifier</span>
          <span
            className="text-xs text-[var(--text-muted)]"
            title="ADR-048 — deterministic AST-diff classifier governs whether changed code is re-embedded"
          >
            7d · ADR-048
          </span>
        </Cluster>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full bg-[var(--surface-2)]"
            style={{ width: `${data.cosmetic_pct}%` }}
            title={`cosmetic ${data.cosmetic_pct.toFixed(0)}% — no re-embed`}
          />
          <div
            className="h-full bg-[var(--info-soft)]"
            style={{ width: `${data.minor_pct}%` }}
            title={`minor ${data.minor_pct.toFixed(0)}% — summary refresh only`}
          />
          <div
            className="h-full bg-[var(--warning-soft)]"
            style={{ width: `${data.material_pct}%` }}
            title={`material ${data.material_pct.toFixed(0)}% — full re-embed`}
          />
        </div>
        <Cluster gap="3" align="center" className="text-[10px] text-[var(--text-muted)]">
          <span><strong>{data.cosmetic_pct.toFixed(0)}%</strong> cosmetic</span>
          <span><strong>{data.minor_pct.toFixed(0)}%</strong> minor</span>
          <span><strong>{data.material_pct.toFixed(0)}%</strong> material</span>
          <span className="ml-auto">{data.commits_classified} commits</span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Estimated <strong className="text-[var(--text)] tabular-nums">${data.saved_usd.toFixed(2)}</strong> saved in
          re-embed cost vs naive (every change re-embedded) over the last 7 days.
        </p>
      </Stack>
    </Card>
  );
}

/* ----------------------------- The tab ------------------------------- */

export interface OperationsTabProps {
  cost: CostCardData;
  syncHealth: readonly RepoSyncRow[];
  integrations: readonly IntegrationRow[];
  members: MembersCardData;
  auditPreview: readonly AuditPreviewRow[];
  reembed: ReembedRatioData;
}

export function OperationsTab({
  cost,
  syncHealth,
  integrations,
  members,
  auditPreview,
  reembed,
}: OperationsTabProps) {
  return (
    <Grid cols="auto-fit-320" gap="4">
      <CostCard data={cost} />
      <SyncHealthCard rows={syncHealth} />
      <IntegrationsCard rows={integrations} />
      <MembersCard data={members} />
      <ReembedClassifierCard data={reembed} />
      <AuditPreviewCard rows={auditPreview} />
    </Grid>
  );
}
