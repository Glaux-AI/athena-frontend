"use client";

/**
 * §7.8.1 — per-model usage drill-down embedded inside a provider card.
 *
 * Lazy-loads `GET /v1/orgs/{id}/model-providers/{id}/usage` on first
 * mount; subsequent re-mounts inside the parent's expansion state hit
 * the endpoint fresh (the parent unmounts on collapse). The cost
 * column is informational only — BYO calls never debit the credit
 * ledger; a "free" badge calls that out per row when ``cost_usd``
 * is zero.
 */

import { useEffect, useState } from "react";

import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type ProviderUsage,
  type ProviderUsageModel,
} from "@/lib/api/client";


export function ProviderUsageDrilldown({
  orgId,
  providerId,
}: {
  orgId: string;
  providerId: string;
}) {
  const [usage, setUsage] = useState<ProviderUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setUsage(null);
    api.modelProviders.usage(orgId, providerId)
      .then((data) => { if (!cancelled) setUsage(data); })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Couldn't load usage.");
      });
    return () => { cancelled = true; };
  }, [orgId, providerId]);

  if (error) {
    return (
      <p className="text-xs text-[var(--danger)]">{error}</p>
    );
  }
  if (usage === null) {
    return <DrilldownSkeleton />;
  }
  if (usage.models.length === 0) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        No calls recorded against this provider this month yet.
      </p>
    );
  }
  return (
    <Stack gap="2">
      <Cluster
        align="center"
        className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        <span className="flex-1">Model</span>
        <span className="w-16 text-right">Reqs</span>
        <span className="w-20 text-right">In</span>
        <span className="w-20 text-right">Out</span>
        <span className="w-16 text-right">Cost</span>
        <span className="w-24 text-right">Last used</span>
      </Cluster>
      <Stack gap="1">
        {usage.models.map((row) => (
          <UsageRow key={row.model} row={row} />
        ))}
      </Stack>
    </Stack>
  );
}


function UsageRow({ row }: { row: ProviderUsageModel }) {
  const isFree = row.cost_usd === 0;
  return (
    <Cluster
      align="center"
      className="rounded-md border border-[var(--border-soft)] px-2 py-1 text-xs"
    >
      <span className="flex-1 truncate font-mono text-[11px]" title={row.model}>
        {row.model}
      </span>
      <span className="w-16 text-right">{row.requests.toLocaleString()}</span>
      <span className="w-20 text-right">{row.prompt_tokens.toLocaleString()}</span>
      <span className="w-20 text-right">{row.completion_tokens.toLocaleString()}</span>
      <span className="w-16 text-right">
        {isFree ? (
          <span className="rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]">
            free
          </span>
        ) : (
          <>${row.cost_usd.toFixed(2)}</>
        )}
      </span>
      <span className="w-24 truncate text-right text-[10px] text-[var(--text-muted)]">
        {formatLastUsed(row.last_used_at)}
      </span>
    </Cluster>
  );
}


function DrilldownSkeleton() {
  return (
    <Stack gap="1" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-6 w-full animate-pulse rounded-md bg-[var(--surface-2)]"
        />
      ))}
    </Stack>
  );
}


function formatLastUsed(iso: string | null): string {
  if (iso === null) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const diffMs = Date.now() - d.getTime();
    // Clamp negative diffs (clock skew or seed timestamps slightly in
    // the future) to 0 so the formatter never renders "-1d ago".
    const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}
