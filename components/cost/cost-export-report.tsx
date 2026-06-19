"use client";

/**
 * Export → printable PDF cost report. Rendered as an overlay; the print styles
 * in globals.css (`@media print`) hide the app chrome and the overlay toolbar so
 * the report (`.cost-print-root`) prints clean. "Print / Save PDF" just calls
 * window.print(). Gated on cost:export by the page.
 */

import { Printer, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatTokens, formatUsdPrecise } from "@/lib/utils/format";
import { cn } from "@/lib/cn";
import type { CostBillingSource } from "@/lib/api/client";

import type { CostView, CreditView } from "./cost-view";

const SOURCE_LABEL: Record<CostBillingSource, string> = { all: "All billing sources", byo: "Your provider keys", athena: "Athena credits" };

export function CostExportReport({ data: m, credit, source, orgName, onClose }: {
  data: CostView; credit: CreditView | null; source: CostBillingSource; orgName: string; onClose: () => void;
}) {
  const over = m.budget_usd > 0 && m.forecast_usd > m.budget_usd;
  const spendDelta = m.compare.spend_usd > 0 ? Math.round(((m.spend_usd - m.compare.spend_usd) / m.compare.spend_usd) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--overlay)] backdrop-blur-sm">
      <Cluster justify="between" align="center" className="cost-no-print border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
        <Cluster gap="2" align="center"><span className="rounded-md bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Cost report</span><span className="text-xs text-[var(--text-muted)]">Use your browser&apos;s print dialog to save as PDF.</span></Cluster>
        <Cluster gap="2" align="center">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-fg)]"><Printer className="size-3.5" /> Print / Save PDF</button>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)]"><X className="size-4" /></button>
        </Cluster>
      </Cluster>

      <div className="flex-1 overflow-auto p-6">
        <Card variant="elevated" className="cost-print-root mx-auto max-w-[820px] bg-[var(--surface)] p-0">
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-8 py-6">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-subtle)]">Cost report</span>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{orgName}</h1>
            <p className="text-sm text-[var(--text-muted)]">{m.range.label} ({m.range.from} – {m.range.to}) · {SOURCE_LABEL[source]} · Generated {new Date().toLocaleString()}</p>
          </div>
          <div className="px-8 py-7"><Stack gap="8">
            <Section title="Executive summary">
              <p className="text-sm leading-relaxed text-[var(--text)]">
                Total spend was <strong className="font-semibold">{formatUsdPrecise(m.spend_usd)}</strong>{m.compare.spend_usd > 0 ? <>, {spendDelta >= 0 ? "up" : "down"} {Math.abs(spendDelta)}% from {formatUsdPrecise(m.compare.spend_usd)}</> : null}.{" "}
                {m.budget_usd > 0 && <>Forecast close is <strong className="font-semibold">{formatUsdPrecise(m.forecast_usd)}</strong> of a {formatUsdPrecise(m.budget_usd)} budget ({over ? "over budget" : "on track"}). </>}
                Blended cost was ${m.efficiency.blended_per_1m.toFixed(2)}/1M tokens.
                {credit && <> Athena credit remaining is {formatUsdPrecise(credit.remaining)}{credit.daysToDepletion != null ? ` (~${credit.daysToDepletion} days)` : ""}.</>}
              </p>
            </Section>
            {m.spend_by_domain.length > 0 && (
              <Section title="Spend by team">
                <ReportTable head={["Team", "Spend", "Share", "Budget", "Used"]} align={["left", "right", "right", "right", "right"]}
                  rows={m.spend_by_domain.map((d) => [d.name, formatUsdPrecise(d.usd), `${Math.round(d.pct * 100)}%`, d.budget > 0 ? formatUsdPrecise(d.budget) : "—", d.budget > 0 ? `${Math.round(Math.min(1, d.usd / d.budget) * 100)}%` : "—"])}
                  total={["Total", formatUsdPrecise(m.spend_usd), "100%", "", ""]} />
              </Section>
            )}
            {m.spend_by_model.length > 0 && (
              <Section title="Spend by model">
                <ReportTable head={["Model", "Provider", "Calls", "Spend"]} align={["left", "left", "right", "right"]}
                  rows={m.spend_by_model.map((d) => [d.name, d.provider, d.calls.toLocaleString(), formatUsdPrecise(d.usd)])} />
              </Section>
            )}
            <Section title="Efficiency">
              <ReportTable head={["Metric", "Value"]} align={["left", "right"]} rows={[
                ["Blended $/1M tokens", `$${m.efficiency.blended_per_1m.toFixed(2)}`],
                ["Cache hit rate", `${Math.round(m.efficiency.cache_hit_pct * 100)}%`],
                ["Avg cost / call", `$${m.efficiency.avg_cost_per_call.toFixed(3)}`],
                ["Fallback rate", `${m.efficiency.fallback_rate_pct.toFixed(1)}%`],
                ["Total tokens", formatTokens(m.total_prompt_tokens + m.total_completion_tokens)],
                ["Total calls", m.total_calls.toLocaleString()],
              ]} />
            </Section>
          </Stack></div>
        </Card>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Stack gap="3" as="section"><h2 className="border-b border-[var(--border)] pb-2 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</h2>{children}</Stack>;
}

type Cell = React.ReactNode;
function ReportTable({ head, rows, align, total }: { head: string[]; rows: Cell[][]; align: ("left" | "right")[]; total?: Cell[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-[var(--border-strong)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{head.map((h, i) => <th key={i} className={cn("py-2", align[i] === "right" ? "text-right" : "text-left")}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, ri) => <tr key={ri} className="border-b border-[var(--border)] last:border-0">{r.map((c, ci) => <td key={ci} className={cn("py-1.5 tabular-nums", align[ci] === "right" ? "text-right" : "text-left", ci === 0 ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]")}>{c}</td>)}</tr>)}</tbody>
      {total && <tfoot><tr className="border-t-2 border-[var(--border-strong)] font-semibold text-[var(--text)]">{total.map((c, ci) => <td key={ci} className={cn("py-2 tabular-nums", align[ci] === "right" ? "text-right" : "text-left")}>{c}</td>)}</tr></tfoot>}
    </table>
  );
}
