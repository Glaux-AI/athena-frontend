"use client";

/**
 * OperationsTab - org-only home for cost, sync health, integrations,
 * members, audit preview, and re-embed classifier metrics.
 *
 * Per ADR-073 §4: every datapoint in this tab has exactly one home - this
 * one. Cost rollups are NOT on the Topology header; integration status is
 * NOT on the org header chip strip; members are NOT shown on domain
 * pages. The tab is composed of six self-contained cards laid out in a
 * 12-column grid.
 *
 * Most cards are summary-only and link out to the dedicated surface for
 * details (e.g. /cost, /settings/integrations, /settings/audit). The
 * Re-embed classifier card explains itself via an inline modal (ADR-048)
 * since there is no dedicated drill-down surface.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  Coins,
  GitBranch,
  Plug,
  Users,
  ScrollText,
  Activity as ActivityIcon,
  ExternalLink,
  HelpCircle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing } from "@/components/ui/focus";
import { Modal } from "@/components/ui/overlay";
import { Pill } from "@/components/ui/pill";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { FreshnessPill, type FreshnessState } from "@/components/scope/freshness-pill";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/utils/format";

/** Eyebrow-style micro-link with a real hit area (the card corner links). */
const MICRO_LINK = cn(
  "ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-micro font-semibold uppercase tracking-wider text-[var(--primary)]",
  "transition-colors hover:bg-[var(--primary-soft)]",
  focusRing,
);

function MicroLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={MICRO_LINK}>
      {children} <ExternalLink className="size-3" aria-hidden />
    </Link>
  );
}

/* ----------------------------- Cost card ------------------------------ */

interface CostSparkPoint {
  day: string;
  cost_usd: number;
}

interface CostCardData {
  /** Org-wide spend month-to-date. */
  spent_mtd_usd: number;
  /** Optional budget for the month, in USD. Renders a small progress bar. */
  monthly_budget_usd?: number;
  /** Last 14 days sparkline. */
  spark: CostSparkPoint[];
  /** Top 3 domains by MTD spend, for the breakdown row. */
  top_caps: Array<{ domain_id: string; domain_name: string; spent_usd: number }>;
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
          <MicroLink href="/cost">details</MicroLink>
        </Cluster>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {formatUsd(data.spent_mtd_usd)}
          </span>
          {data.monthly_budget_usd && (
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              / {formatUsd(data.monthly_budget_usd)} budget
            </span>
          )}
        </div>
        {budgetPct !== null && (
          <div className="comet-track h-1 w-full">
            <div
              className="comet-fill"
              style={{ "--comet-value": `${budgetPct}%` } as CSSProperties}
            />
          </div>
        )}
        <div className="flex h-10 items-end gap-0.5" aria-hidden>
          {data.spark.map((p) => (
            <div
              key={p.day}
              className="flex-1 rounded-sm bg-[var(--primary-soft)]"
              style={{ height: `${Math.max(8, (p.cost_usd / max) * 100)}%` }}
              title={`${p.day}: ${formatUsd(p.cost_usd)}`}
            />
          ))}
        </div>
        <Stack gap="1" as="ul" className="text-xs">
          {data.top_caps.map((c) => (
            <li key={c.domain_id} className="flex items-center justify-between rounded px-1 py-0.5 transition-colors hover:bg-[var(--surface-2)]">
              <Link
                href={`/domains/${c.domain_id}`}
                className="truncate text-[var(--text-muted)] hover:text-[var(--primary)]"
              >
                {c.domain_name}
              </Link>
              <span className="tabular-nums text-[var(--text)]">{formatUsd(c.spent_usd)}</span>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/* -------------------------- Sync health card -------------------------- */

interface RepoSyncRow {
  repo_id: string;
  repo_full_name: string;
  domain_id: string;
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
          <MicroLink href="/settings/integrations">integrations</MicroLink>
        </Cluster>
        {rows.length === 0 ? (
          <EmptyState className="py-6" title="No repos attached" description="Attach a repo to a domain to see its sync health here." />
        ) : (
          <VirtualList
            items={rows}
            estimatedItemHeight={36}
            ariaLabel="Repo sync health"
            getKey={(r) => r.repo_id}
            renderItem={(r) => (
              <Link
                href={`/domains/${r.domain_id}/repos/${r.repo_id}`}
                className={cn("grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[var(--surface-2)]", focusRing)}
              >
                <code className="truncate font-mono text-[var(--text-muted)]">{r.repo_full_name}</code>
                <span className="text-micro tabular-nums text-[var(--text-subtle)]">
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

interface IntegrationRow {
  id: string;
  kind: "github" | "slack" | "jira" | "linear" | "pagerduty" | "webhook" | "other";
  label: string;
  status: "connected" | "degraded" | "disconnected";
  detail?: string;
}

const INTEGRATION_STATUS: Record<IntegrationRow["status"], { tone: "success" | "warning" | "danger"; label: string; live: boolean }> = {
  connected:    { tone: "success", label: "Connected", live: true },
  degraded:     { tone: "warning", label: "Degraded", live: false },
  disconnected: { tone: "danger",  label: "Disconnected", live: false },
};

function IntegrationsCard({ rows }: { rows: readonly IntegrationRow[] }) {
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <Plug className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Integrations</span>
          <MicroLink href="/settings/integrations">manage</MicroLink>
        </Cluster>
        {rows.length === 0 ? (
          <EmptyState className="py-6" title="No integrations connected" description="Connect one from Settings → Integrations." />
        ) : (
          <Stack gap="1" as="ul" className="text-xs">
            {rows.map((r) => {
              const s = INTEGRATION_STATUS[r.status];
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <Cluster gap="2" align="center">
                    <span className="font-medium">{r.label}</span>
                    <Pill size="sm">{r.kind}</Pill>
                  </Cluster>
                  <Cluster gap="1.5" align="center">
                    <Pill size="sm" tone={s.tone} dot live={s.live}>{s.label}</Pill>
                    {r.detail && <span className="text-micro text-[var(--text-subtle)]">{r.detail}</span>}
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

interface MembersCardData {
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
          <MicroLink href="/settings/members">manage</MicroLink>
        </Cluster>
        <Cluster gap="2" align="center" className="text-xs">
          {data.by_role.map((r) => (
            <Pill key={r.role} size="sm" className="tabular-nums">
              <span className="font-semibold text-[var(--text)]">{r.count}</span> {r.role}
            </Pill>
          ))}
        </Cluster>
        {data.recent_invites.length > 0 && (
          <Stack gap="1" as="ul" className="text-xs">
            <Eyebrow>
              Recent invites
            </Eyebrow>
            {data.recent_invites.slice(0, 3).map((inv) => (
              <li key={inv.email} className="flex items-center justify-between rounded px-1 py-0.5 transition-colors hover:bg-[var(--surface-2)]">
                <span className="truncate text-[var(--text-muted)]">{inv.email}</span>
                <span className="text-micro text-[var(--text-subtle)] tabular-nums">
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

interface AuditPreviewRow {
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
          <span className="ml-auto text-xs text-[var(--text-muted)]">most recent 10 events</span>
        </Cluster>
        <Stack gap="1" as="ul" className="text-xs">
          {rows.slice(0, 10).map((r) => (
            <li
              key={r.id}
              className={cn(
                "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded px-2 py-1 transition-colors",
                r.outcome === "failure"
                  ? "bg-[var(--danger-soft)]"
                  : "hover:bg-[var(--surface-2)]",
              )}
            >
              <code className="font-mono text-micro text-[var(--text-muted)]">{r.actor}</code>
              <span className="truncate">
                <span className="font-semibold text-[var(--text)]">{r.action}</span>{" "}
                <code className="font-mono text-micro text-[var(--text-subtle)]">{r.resource}</code>
              </span>
              <Pill size="sm" tone={r.outcome === "success" ? "success" : "danger"}>
                {r.outcome === "success" ? "Success" : "Failure"}
              </Pill>
              <span className="text-micro text-[var(--text-subtle)] tabular-nums">{r.when}</span>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/* -------------------- Re-embed classifier card ----------------------- */

interface ReembedRatioData {
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
  const [explainOpen, setExplainOpen] = useState(false);
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <ActivityIcon className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Re-embed classifier</span>
          <span
            className="text-xs text-[var(--text-muted)]"
            title="ADR-048 - deterministic AST-diff classifier governs whether changed code is re-embedded"
          >
            7d · ADR-048
          </span>
          <button
            type="button"
            onClick={() => setExplainOpen(true)}
            className={MICRO_LINK}
            aria-label="How the re-embed classifier works"
          >
            how this works <HelpCircle className="size-3" aria-hidden />
          </button>
        </Cluster>
        <div className="comet-track flex h-3 w-full">
          <div
            className="h-full bg-[var(--surface-2)]"
            style={{ width: `${data.cosmetic_pct}%` }}
            title={`cosmetic ${data.cosmetic_pct.toFixed(0)}% - no re-embed`}
          />
          <div
            className="h-full bg-[var(--info-soft)]"
            style={{ width: `${data.minor_pct}%` }}
            title={`minor ${data.minor_pct.toFixed(0)}% - summary refresh only`}
          />
          <div
            className="h-full bg-[var(--warning-soft)]"
            style={{ width: `${data.material_pct}%` }}
            title={`material ${data.material_pct.toFixed(0)}% - full re-embed`}
          />
        </div>
        <Cluster gap="3" align="center" className="text-micro text-[var(--text-muted)]">
          <span><strong>{data.cosmetic_pct.toFixed(0)}%</strong> cosmetic</span>
          <span><strong>{data.minor_pct.toFixed(0)}%</strong> minor</span>
          <span><strong>{data.material_pct.toFixed(0)}%</strong> material</span>
          <span className="ml-auto">{data.commits_classified} commits</span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Estimated <strong className="text-[var(--text)] tabular-nums">{formatUsd(data.saved_usd)}</strong> saved in
          re-embed cost vs naive (every change re-embedded) over the last 7 days.
        </p>
      </Stack>
      <ReembedExplainModal open={explainOpen} onOpenChange={setExplainOpen} />
    </Card>
  );
}

/* ----------------- Re-embed classifier explain modal ----------------- */

function ReembedExplainModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      size="lg"
      title="Re-embed classifier"
      description="ADR-048 · deterministic AST-diff governs whether changed code is re-embedded."
    >
      <Stack gap="3">
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          Every changed file in an ingest pass runs through a tree-sitter AST diff. The diff
          shape - not the changed-line count - decides whether the file&apos;s embedding stays valid,
          needs a summary refresh, or has to be re-embedded from scratch. Three buckets:
        </p>
        <Stack gap="2" as="ul" className="text-sm">
          <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
            <Cluster gap="2" align="center">
              <span className="star-dot" style={{ "--dot-color": "var(--text-muted)" } as CSSProperties} aria-hidden />
              <strong className="text-[var(--text)]">Cosmetic</strong>
              <Eyebrow>no re-embed</Eyebrow>
            </Cluster>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Whitespace, comment-only changes, import re-ordering, formatting passes. AST is
              identical after normalization → existing embedding is kept verbatim.
            </p>
          </li>
          <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
            <Cluster gap="2" align="center">
              <span className="star-dot" style={{ "--dot-color": "var(--info)" } as CSSProperties} aria-hidden />
              <strong className="text-[var(--text)]">Minor</strong>
              <Eyebrow>summary refresh</Eyebrow>
            </Cluster>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Renamed local variables, inlined helpers, docstring edits, type-annotation
              tightening. AST topology unchanged but symbol-table content shifted → summary +
              signature embeddings refresh; chunk embeddings reused.
            </p>
          </li>
          <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
            <Cluster gap="2" align="center">
              <span className="star-dot" style={{ "--dot-color": "var(--warning)" } as CSSProperties} aria-hidden />
              <strong className="text-[var(--text)]">Material</strong>
              <Eyebrow>full re-embed</Eyebrow>
            </Cluster>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              New function added, signature changed, control-flow restructured, external import
              added or removed. AST topology shifted → full chunk + summary + signature
              re-embed for affected nodes.
            </p>
          </li>
        </Stack>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          The classifier is a deterministic Python pass - no LLM call - so its output is
          reproducible across runs and auditable line-by-line. The 7-day saved-USD figure on
          the card is the difference between the actual embedding spend and the
          naive-every-change-re-embedded counterfactual.
        </p>
      </Stack>
    </Modal>
  );
}

/* ----------------------------- The tab ------------------------------- */

interface OperationsTabProps {
  /** Null when the caller lacks `cost:read` - the cost card is then hidden. */
  cost: CostCardData | null;
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
      {cost && <CostCard data={cost} />}
      <SyncHealthCard rows={syncHealth} />
      <IntegrationsCard rows={integrations} />
      <MembersCard data={members} />
      <ReembedClassifierCard data={reembed} />
      <AuditPreviewCard rows={auditPreview} />
    </Grid>
  );
}
