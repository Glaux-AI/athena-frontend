"use client";

/**
 * "By key" — BYO spend per saved provider key (the "Your keys" billing source
 * only). One row per saved key (or a since-revoked key that still carries spend
 * this window), showing the key's last-4, model count, calls, last-used and
 * spend. Extracted from the old inline page table; restyled to match the
 * redesigned cards (prominent title, tabular numerics, share bar).
 */

import { KeyRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { formatUsdPrecise } from "@/lib/utils/format";

type KeyRow = {
  provider: string;
  name: string;
  key_last4: string | null;
  has_key: boolean;
  usd: number;
  pct: number;
  calls: number;
  models: number;
  last_used: string;
};

export function SpendByKeyTable({ rows }: { rows: KeyRow[] }) {
  const total = Math.max(1, rows.reduce((s, k) => s + k.usd, 0));
  return (
    <Card className="p-5">
      <Stack gap="4">
        <Stack gap="0.5">
          <h2 className="text-lg font-semibold leading-snug">By key</h2>
          <p className="text-sm text-[var(--text-muted)]">Spend routed through each of your own provider keys</p>
        </Stack>

        {rows.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title="No BYO-key spend in this window"
            description="Add a provider key in Settings → Models to route calls through your own account and see per-key spend here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  <th className="pb-2 pr-3 font-semibold">Key</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Models</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Calls</th>
                  <th className="pb-2 pr-3 font-semibold">Last used</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Share</th>
                  <th className="pb-2 text-right font-semibold">Spend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k) => (
                  <tr key={k.provider} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pr-3">
                      <Cluster gap="2" align="center">
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)]">
                          <KeyRound className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                        </span>
                        <Stack gap="0">
                          <span className="font-medium text-[var(--text)]">{k.name}</span>
                          {k.has_key ? (
                            <span className="font-mono text-xs text-[var(--text-subtle)]">•••• {k.key_last4 ?? "????"}</span>
                          ) : (
                            <span className="text-xs text-[var(--warning)]">key removed · spend retained</span>
                          )}
                        </Stack>
                      </Cluster>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text-muted)]">{k.models.toLocaleString()}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--text-muted)]">{k.calls.toLocaleString()}</td>
                    <td className="py-2.5 pr-3 text-xs text-[var(--text-subtle)]">{k.last_used ? new Date(k.last_used).toLocaleDateString() : "—"}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <Cluster gap="2" align="center" justify="end">
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)] sm:block">
                          <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${(k.usd / total) * 100}%` }} />
                        </span>
                        <span className="w-9 text-right text-xs tabular-nums text-[var(--text-subtle)]">{Math.round((k.usd / total) * 100)}%</span>
                      </Cluster>
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-[var(--text)]">{formatUsdPrecise(k.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>
    </Card>
  );
}
