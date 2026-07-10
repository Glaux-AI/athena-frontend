"use client";

import { useEffect, useMemo, useState } from "react";

import { api, type CostBySource } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Cluster, Stack } from "@/components/layout/primitives";
import { Hint, RankedList } from "@/components/cost/cost-atoms";
import { formatUsdPrecise } from "@/lib/utils/format";

/** Friendly labels for the backend's surface keys (ADR-092). */
const SURFACE_LABEL: Record<string, string> = {
  chat: "In-app chat",
  tasks: "Task agents",
  slack: "Slack (@Athena)",
  coding_agent: "Coding agents",
};

/** "Spend by surface" - where the org's AI spend goes (in-app chat / task
 *  agents / the @Athena Slack bot / connected coding agents). Self-fetches
 *  `GET /v1/cost/by-source` for the dashboard's current date window. */
export function SpendBySurfaceCard({
  fromISO,
  toISO,
}: {
  fromISO: string;
  toISO: string;
}) {
  const [data, setData] = useState<CostBySource | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    void api.cost
      .bySource({ from: fromISO, to: toISO })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        /* the page surfaces top-level errors; this card stays quiet */
      });
    return () => {
      cancelled = true;
    };
  }, [fromISO, toISO]);

  const view = useMemo(() => {
    const surfaces = data?.surfaces ?? [];
    const total = surfaces.reduce((s, x) => s + Number(x.cost_usd), 0);
    const divisor = total || 1;
    const rows = surfaces.map((s) => {
      const usd = Number(s.cost_usd);
      return {
        key: s.surface,
        name: SURFACE_LABEL[s.surface] ?? s.surface,
        usd,
        pct: usd / divisor,
        sub: `${s.calls.toLocaleString()} calls · ${s.total_tokens.toLocaleString()} tok`,
      };
    });
    return { rows, total };
  }, [data]);

  return (
    <Card variant="elevated" className="p-5">
      <Stack gap="4">
        <Cluster
          justify="between"
          align="center"
          className="gap-3"
        >
          <Stack gap="0.5">
            <Cluster gap="1.5" align="center">
              <h2 className="text-base font-semibold">Spend by surface</h2>
              <Hint text="Where your AI spend goes: in-app chat, task agents, the @Athena Slack bot, and connected coding agents." />
            </Cluster>
            {data != null && (
              <p className="text-xs text-[var(--text-muted)]">
                {view.rows.length}{" "}
                {view.rows.length === 1 ? "surface" : "surfaces"} ·{" "}
                {formatUsdPrecise(view.total)} total
              </p>
            )}
          </Stack>
        </Cluster>
        <hr className="hr-horizon" aria-hidden />
        {data == null ? (
          <SpendBySurfaceSkeleton />
        ) : view.rows.length === 0 ? (
          <EmptyState
            title="No spend by surface"
            description="No AI spend to break down by surface in this window."
          />
        ) : (
          <RankedList rows={view.rows} />
        )}
      </Stack>
    </Card>
  );
}

function SpendBySurfaceSkeleton() {
  return (
    <Stack gap="2" aria-busy="true" aria-label="Loading spend by surface">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-8 rounded-md" />
      ))}
    </Stack>
  );
}
