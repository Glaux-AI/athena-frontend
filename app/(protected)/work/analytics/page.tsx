"use client";

/**
 * /work/analytics - the Delivery workbench (Phase 3, Layer A).
 *
 * Read-side projection of how work flows: throughput, lead/cycle time, on-time,
 * and the AI-vs-human split. Leadership (delivery:read) sees the org rollup;
 * everyone can see their OWN delivery (the /me endpoint is always available), so
 * the page degrades gracefully to a self view rather than a permission wall.
 * Plain language throughout - never "gate dwell p90".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock, Sparkles, Target, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Cluster, Grid, Stack } from "@/components/layout/primitives";
import { api, ApiError, type DeliverySummary } from "@/lib/api/client";
import { usePermissions } from "@/lib/session/use-permissions";

const RANGES = [7, 30, 90] as const;

export default function DeliveryAnalyticsPage() {
  const { can } = usePermissions();
  const canOrg = can("delivery:read");
  const [scope, setScope] = useState<"org" | "me">(canOrg ? "org" : "me");
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<DeliverySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = scope === "org" && canOrg
        ? await api.delivery.summary(days)
        : await api.delivery.me(days);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load delivery metrics.");
    } finally {
      setLoading(false);
    }
  }, [scope, days, canOrg]);

  useEffect(() => {
    void load();
  }, [load]);

  const throughputPerWeek = useMemo(() => {
    if (!data || data.period_days === 0) return 0;
    return (data.completed / data.period_days) * 7;
  }, [data]);

  return (
    <div className="p-6">
      <Stack gap="5">
        <Cluster justify="between" align="center" className="flex-wrap gap-3">
          <Stack gap="0.5">
            <h1 className="text-xl font-semibold text-[var(--text)]">Delivery</h1>
            <p className="text-sm text-[var(--text-muted)]">
              How work flows - throughput, speed, and the human + AI split.
            </p>
          </Stack>
          <Cluster gap="2">
            {canOrg && (
              <Segmented<"org" | "me">
                ariaLabel="Whose delivery to show"
                options={[
                  { value: "org", label: "Org" },
                  { value: "me", label: "Mine" },
                ]}
                value={scope}
                onChange={setScope}
              />
            )}
            <Segmented<string>
              ariaLabel="Time range"
              options={RANGES.map((r) => ({ value: String(r), label: `${r}d` }))}
              value={String(days)}
              onChange={(v) => setDays(Number(v) as (typeof RANGES)[number])}
            />
          </Cluster>
        </Cluster>

        {loading ? (
          <AnalyticsSkeleton />
        ) : error ? (
          <p
            role="alert"
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
          >
            {error}
          </p>
        ) : !data || data.completed + data.created === 0 ? (
          <EmptyState
            icon={<Activity className="size-5" />}
            title="No delivery yet"
            description="Once tasks start completing in this window, throughput, cycle time, and the human + AI split show up here."
          />
        ) : (
          <Stack gap="5">
            <Grid cols="auto-fit-220" gap="3">
              <Kpi
                icon={<TrendingUp className="size-4" />}
                label="Completed"
                value={String(data.completed)}
                sub={`${throughputPerWeek.toFixed(1)} / week`}
              />
              <Kpi
                icon={<Clock className="size-4" />}
                label="Cycle time (p50)"
                value={fmtDuration(data.lead_time.p50_seconds)}
                sub={`p90 ${fmtDuration(data.lead_time.p90_seconds)}`}
                {...(data.cycle_time_provisional
                  ? { note: "elapsed, provisional" }
                  : {})}
              />
              <Kpi
                icon={<Target className="size-4" />}
                label="On-time"
                value={
                  data.target_dated > 0
                    ? `${Math.round((data.on_time / data.target_dated) * 100)}%`
                    : "—"
                }
                sub={`${data.on_time}/${data.target_dated} with a target`}
              />
              <Kpi
                icon={<Activity className="size-4" />}
                label="Open now"
                value={String(data.open_now)}
                sub={`${data.created} created in ${data.period_days}d`}
              />
            </Grid>

            <Grid cols="2" gap="4" className="lg:grid-cols-[2fr_1fr]">
              <FlowCard data={data} />
              <ExecutorCard data={data} />
            </Grid>
          </Stack>
        )}
      </Stack>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  note?: string;
}) {
  return (
    <Card className="p-4">
      <Stack gap="1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <span className="text-[var(--primary)]">{icon}</span>
          {label}
        </span>
        <span className="text-2xl font-semibold tabular-nums text-[var(--text)]">
          {value}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
          {sub}
          {note && (
            <Pill tone="neutral" size="sm">
              {note}
            </Pill>
          )}
        </span>
      </Stack>
    </Card>
  );
}

/** Completed-vs-created per day, as dependency-free columns. */
function FlowCard({ data }: { data: DeliverySummary }) {
  const max = Math.max(1, ...data.flow.map((p) => Math.max(p.completed, p.created)));
  return (
    <Card className="p-4">
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <span className="text-sm font-medium text-[var(--text)]">Flow</span>
          <Cluster gap="3" className="text-xs text-[var(--text-muted)]">
            <Legend color="var(--primary)" label="Completed" />
            <Legend color="var(--acc-cyan)" label="Created" />
          </Cluster>
        </Cluster>
        <div className="flex h-32 items-end gap-1 overflow-x-auto">
          {data.flow.map((p) => (
            <div
              key={p.day}
              className="flex min-w-[10px] flex-1 flex-col items-center justify-end gap-0.5"
              title={`${p.day}: ${p.completed} completed, ${p.created} created`}
            >
              <div className="flex w-full items-end justify-center gap-px">
                <span
                  className="w-1/2 rounded-t-sm bg-[var(--primary)]"
                  style={{ height: `${(p.completed / max) * 100}px` }}
                />
                <span
                  className="w-1/2 rounded-t-sm bg-[var(--acc-cyan)]"
                  style={{ height: `${(p.created / max) * 100}px` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Stack>
    </Card>
  );
}

/** The human + AI split - the headline "are we shipping with people or Athena". */
function ExecutorCard({ data }: { data: DeliverySummary }) {
  const { ai_completed, human_completed, ai_spend_usd, human_spend_usd } = data.executor;
  const total = Math.max(1, ai_completed + human_completed);
  const aiPct = Math.round((ai_completed / total) * 100);
  return (
    <Card className="p-4">
      <Stack gap="3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
          <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
          Humans + AI
        </span>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <span className="bg-[var(--primary)]" style={{ width: `${aiPct}%` }} />
          <span className="bg-[var(--acc-cyan)]" style={{ width: `${100 - aiPct}%` }} />
        </div>
        <Stack gap="2">
          <SplitRow
            color="var(--primary)"
            label="Athena-delegated"
            count={ai_completed}
            spend={ai_spend_usd}
          />
          <SplitRow
            color="var(--acc-cyan)"
            label="Human-run"
            count={human_completed}
            spend={human_spend_usd}
          />
        </Stack>
      </Stack>
    </Card>
  );
}

function SplitRow({
  color,
  label,
  count,
  spend,
}: {
  color: string;
  label: string;
  count: number;
  spend: number;
}) {
  return (
    <Cluster justify="between" align="center" className="text-sm">
      <span className="inline-flex items-center gap-2 text-[var(--text-muted)]">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular-nums text-[var(--text)]">
        {count} <span className="text-[var(--text-subtle)]">· ${spend.toFixed(2)}</span>
      </span>
    </Cluster>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Seconds -> a human duration ("2.3d", "5h", "12m"). */
function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

function AnalyticsSkeleton() {
  return (
    <Stack gap="5" aria-hidden>
      <Grid cols="auto-fit-220" gap="3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </Grid>
      <div className="skeleton h-44 rounded-xl" />
    </Stack>
  );
}
