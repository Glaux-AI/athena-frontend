"use client";

/**
 * OrgDashboardHeader — the computed dashboard band on the org Blueprint tab
 * (Phase D locked IA). Surfaces clickable capability links. The org
 * `portfolio` Mermaid diagram is NOT rendered here — it lives in the
 * `portfolio` Blueprint section below (the richer, narrated render), so the
 * header doesn't duplicate it.
 *
 * Capability links come from the org `portfolio` Blueprint section's
 * `body_json` (OrgPortfolioBody), falling back to the `OrgKnowledge` registry.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  type OrgKnowledge,
  type OrgPortfolioBody,
} from "@/lib/api/client";

interface OrgDashboardHeaderProps {
  orgId: string;
  orgKnowledge: OrgKnowledge | null;
}

export function OrgDashboardHeader({ orgId, orgKnowledge }: OrgDashboardHeaderProps) {
  const [portfolio, setPortfolio] = useState<OrgPortfolioBody | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.blueprint.org
      .getSection(orgId, "portfolio")
      .then((s) => { if (!cancelled) setPortfolio((s.body_json as OrgPortfolioBody | null) ?? null); })
      .catch(() => { if (!cancelled) setPortfolio(null); });
    return () => { cancelled = true; };
  }, [orgId]);

  // Prefer the section's `capabilities` link list; fall back to the registry.
  const caps = portfolio?.capabilities ?? orgKnowledge?.capabilities.map((c) => ({ capability_id: c.id, name: c.name })) ?? [];

  if (caps.length === 0) return null;

  return (
    <Card variant="elevated" data-testid="org-dashboard-header">
      <Stack gap="3">
        <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Layers className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Capabilities</span>
          <span className="text-xs text-[var(--text-muted)]">{caps.length} · open a capability</span>
        </Cluster>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {caps.map((c) => (
            <li key={c.capability_id}>
              <Link
                href={`/capabilities/${encodeURIComponent(c.capability_id)}`}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 transition-[box-shadow,transform,background-color,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-2)]"
              >
                <span className="truncate text-sm font-medium">{c.name}</span>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Stack>
    </Card>
  );
}
