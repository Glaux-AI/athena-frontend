"use client";

/**
 * "Where it goes" — the unified spend-breakdown explorer.
 *
 * Replaces the old page's five near-identical breakdown cards (capability /
 * model / role / provider / phase) with ONE card and a dimension switcher: a
 * donut + a ranked, bar-backed list that swap together. Donut and list share a
 * hover so pointing at either highlights the other. Capability rows keep their
 * budget bar + "Set budget" affordance (the only actionable dimension).
 *
 * Categorical colours come from the accent palette (see palette.ts) — not the
 * semantic success/warning tokens the old page mis-used for categories.
 */

import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatUsdCompact, formatUsdPrecise } from "@/lib/utils/format";
import { cn } from "@/lib/cn";
import type { CostBillingSource } from "@/lib/api/client";

import { Segmented, type SegmentedOption } from "./segmented";
import { seriesColor } from "./palette";

const PHASE_LABELS: Record<string, string> = {
  ingest: "Knowledge ingestion",
  "prd.frame": "PRD · Frame",
  "prd.research": "PRD · Research",
  "prd.draft": "PRD · Draft",
  "prd.signoff": "PRD · Sign-off",
  "impl.spec": "Implement · Spec",
  "impl.plan": "Implement · Plan",
  "impl.implement": "Implement · Code",
  "impl.review": "Implement · Review",
  "impl.ci_gate": "Implement · CI gate",
  "impl.pr": "Implement · PR",
  blueprint_deep: "Blueprint (deep rebuild)",
  unattributed: "Uncategorized",
};
const prettyPhase = (name: string) => PHASE_LABELS[name] ?? name;

type Dim = "capability" | "model" | "provider" | "role" | "phase";

interface Row {
  key: string;
  name: string;
  sub?: string;
  usd: number;
  pct: number;
  trend?: string;
  // capability-only:
  capId?: string;
  budget?: number;
}

type Caps = { id: string; name: string; usd: number; pct: number; budget: number; trend: string; top_task: string }[];
type Models = { id: string; name: string; provider: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
type Providers = { provider: string; name: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
type Roles = { role: string; usd: number; pct: number; calls: number; input_tok_k: number; output_tok_k: number }[];
type Phases = { name: string; usd: number; pct: number }[];

const tokenSub = (calls: number, inK: number, outK: number) =>
  `${calls.toLocaleString()} calls · ${outK > 0 ? `${inK.toLocaleString()}k in / ${outK.toLocaleString()}k out` : `${inK.toLocaleString()}k tokens`}`;

export function SpendBreakdown({
  capabilities,
  models,
  providers,
  roles,
  phases,
  source,
  onSetBudget,
}: {
  capabilities: Caps;
  models: Models;
  providers: Providers;
  roles: Roles;
  phases: Phases;
  source: CostBillingSource;
  onSetBudget: (c: { id: string; name: string; current: number }) => void;
}) {
  const dims = useMemo(() => {
    const opts: SegmentedOption<Dim>[] = [
      { value: "capability", label: "Capability" },
      { value: "model", label: "Model" },
    ];
    // Per-vendor rollup answers "which vendor did we pay across both billing
    // sources" — only meaningful on the All view.
    if (source === "all" && providers.length > 0) opts.push({ value: "provider", label: "Provider" });
    opts.push({ value: "role", label: "Role" });
    opts.push({ value: "phase", label: "Phase" });
    return opts;
  }, [source, providers.length]);

  const [dim, setDim] = useState<Dim>("capability");
  const [hover, setHover] = useState<string | null>(null);

  // Guard: if the active dim disappears (e.g. switching to "Your keys" hides
  // Provider), fall back to capability.
  const activeDim = dims.some((d) => d.value === dim) ? dim : "capability";

  const rows: Row[] = useMemo(() => {
    switch (activeDim) {
      case "capability":
        return capabilities.map((c) => ({
          key: c.id, capId: c.id, name: c.name, usd: c.usd, pct: c.pct, trend: c.trend, budget: c.budget,
          sub: `Top task: ${c.top_task}`,
        }));
      case "model":
        return models.map((m) => ({ key: m.id, name: m.name, usd: m.usd, pct: m.pct, sub: `${m.provider} · ${tokenSub(m.calls, m.input_tok_k, m.output_tok_k)}` }));
      case "provider":
        return providers.map((p) => ({ key: p.provider, name: p.name, usd: p.usd, pct: p.pct, sub: tokenSub(p.calls, p.input_tok_k, p.output_tok_k) }));
      case "role":
        return roles.map((r) => ({ key: r.role, name: r.role, usd: r.usd, pct: r.pct, sub: tokenSub(r.calls, r.input_tok_k, r.output_tok_k) }));
      case "phase":
        return phases.map((p) => ({ key: p.name, name: prettyPhase(p.name), usd: p.usd, pct: p.pct }));
    }
  }, [activeDim, capabilities, models, providers, roles, phases]);

  const total = rows.reduce((s, r) => s + r.usd, 0);
  const maxUsd = Math.max(1, ...rows.map((r) => r.usd));
  const dimLabel = dims.find((d) => d.value === activeDim)?.label ?? "";

  return (
    <Card className="p-5">
      <Stack gap="4">
        <Cluster justify="between" align="center" className="gap-3">
          <Stack gap="0.5">
            <h2 className="text-lg font-semibold leading-snug">Where it goes</h2>
            <p className="text-sm text-[var(--text-muted)]">Spend by {dimLabel.toLowerCase()} · {rows.length} {rows.length === 1 ? "row" : "rows"}</p>
          </Stack>
          <Segmented<Dim> ariaLabel="Breakdown dimension" value={activeDim} onChange={setDim} options={dims} className="flex-wrap" />
        </Cluster>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">No spend to break down in this window.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            <div className="flex items-center justify-center">
              <Donut rows={rows} total={total} hover={hover} setHover={setHover} centerLabel={dimLabel} />
            </div>

            <Stack gap="1" as="ul">
              {rows.map((r, i) => {
                const dimmed = hover != null && hover !== r.key;
                const util = r.budget && r.budget > 0 ? Math.min(1, r.usd / r.budget) : null;
                return (
                  <li
                    key={r.key}
                    onMouseEnter={() => setHover(r.key)}
                    onMouseLeave={() => setHover(null)}
                    className={cn("rounded-md px-2 py-1.5 transition-colors", hover === r.key && "bg-[var(--surface-2)]")}
                  >
                    <Cluster justify="between" align="center" className="gap-2">
                      <Cluster gap="2" align="center" className="min-w-0 flex-1">
                        <span
                          className="size-2.5 shrink-0 rounded-sm transition-opacity"
                          style={{ backgroundColor: seriesColor(i), opacity: dimmed ? 0.35 : 1 }}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-medium text-[var(--text)]">{r.name}</span>
                      </Cluster>
                      <Cluster gap="2" align="baseline" className="shrink-0">
                        <span className="tabular-nums text-sm font-medium text-[var(--text)]">{formatUsdCompact(r.usd)}</span>
                        <span className="w-9 text-right text-xs tabular-nums text-[var(--text-subtle)]">{Math.round((r.usd / Math.max(1, total)) * 100)}%</span>
                      </Cluster>
                    </Cluster>

                    {/* share bar (or budget-utilization bar for capabilities) */}
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{
                          width: `${(util != null ? util : r.usd / maxUsd) * 100}%`,
                          backgroundColor: util != null && util > 0.9 ? "var(--warning)" : seriesColor(i),
                          opacity: dimmed ? 0.5 : 1,
                        }}
                      />
                    </div>

                    {(r.sub || r.capId) && (
                      <Cluster justify="between" align="center" className="mt-1 gap-2">
                        <span className="truncate text-xs text-[var(--text-subtle)]">
                          {r.budget != null ? `${formatUsdCompact(r.usd)} of ${formatUsdCompact(r.budget)} budget` : r.sub}
                        </span>
                        <Cluster gap="2" align="center" className="shrink-0">
                          {r.trend && (
                            <span className={cn("text-xs tabular-nums", r.trend.startsWith("+") ? "text-[var(--warning)]" : "text-[var(--success)]")}>{r.trend}</span>
                          )}
                          {r.capId && (
                            <button
                              type="button"
                              onClick={() => onSetBudget({ id: r.capId!, name: r.name, current: r.budget ?? 0 })}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--primary)]"
                            >
                              <Wallet className="size-3" aria-hidden /> Budget
                            </button>
                          )}
                        </Cluster>
                      </Cluster>
                    )}
                  </li>
                );
              })}
            </Stack>
          </div>
        )}
      </Stack>
    </Card>
  );
}

/** Donut — slices ordered as the list; tail beyond 6 folds into "Other" so the
 *  ring stays legible. Center shows the window total. Hover syncs with the list. */
function Donut({
  rows,
  total,
  hover,
  setHover,
  centerLabel,
}: {
  rows: Row[];
  total: number;
  hover: string | null;
  setHover: (k: string | null) => void;
  centerLabel: string;
}) {
  const slices = useMemo(() => {
    if (rows.length <= 7) return rows.map((r, i) => ({ key: r.key, usd: r.usd, color: seriesColor(i) }));
    const head = rows.slice(0, 6).map((r, i) => ({ key: r.key, usd: r.usd, color: seriesColor(i) }));
    const tail = rows.slice(6).reduce((s, r) => s + r.usd, 0);
    return [...head, { key: "__other__", usd: tail, color: "var(--text-subtle)" }];
  }, [rows]);

  const cx = 50;
  const cy = 50;
  const r = 38;
  const rInner = 24;
  let acc = 0;
  const arcs = slices.map((s) => {
    const a0 = total > 0 ? (acc / total) * 2 * Math.PI : 0;
    acc += s.usd;
    const a1 = total > 0 ? (acc / total) * 2 * Math.PI : 0;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${(cx + rad * Math.sin(ang)).toFixed(2)} ${(cy - rad * Math.cos(ang)).toFixed(2)}`;
    const d = `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, rInner)} A ${rInner} ${rInner} 0 ${large} 0 ${p(a0, rInner)} Z`;
    return { ...s, d };
  });

  return (
    <svg viewBox="0 0 100 100" className="size-44" role="img" aria-label={`Spend by ${centerLabel.toLowerCase()} donut chart`}>
      {arcs.map((a) => (
        <path
          key={a.key}
          d={a.d}
          fill={a.color}
          stroke="var(--surface)"
          strokeWidth={0.75}
          opacity={hover == null || hover === a.key ? 1 : 0.35}
          onMouseEnter={() => a.key !== "__other__" && setHover(a.key)}
          onMouseLeave={() => setHover(null)}
          style={{ transition: "opacity 120ms" }}
        />
      ))}
      <text x={cx} y={cy - 1} textAnchor="middle" className="fill-[var(--text)]" fontSize={11} fontWeight={600}>
        {formatUsdPrecise(total)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="fill-[var(--text-subtle)]" fontSize={5.5} style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Total
      </text>
    </svg>
  );
}
