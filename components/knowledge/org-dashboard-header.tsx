"use client";

/**
 * OrgDashboardHeader — the computed dashboard band on the org Blueprint tab
 * (Phase D locked IA). Surfaces the org `portfolio` Mermaid diagram with
 * CLICKABLE capability nodes (contract #5) + org-wide KG KPIs + clickable
 * capability links. The narrative org Blueprint sections render below it.
 *
 * Diagram comes from the org `portfolio` Blueprint section's `body_json`
 * (OrgPortfolioBody); KPIs come from the `OrgKnowledge.totals`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Workflow, Layers, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  type OrgKnowledge,
  type OrgPortfolioBody,
} from "@/lib/api/client";
import { KnowledgeMermaid } from "@/components/knowledge/knowledge-mermaid";

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

  const hasDiagram = !!portfolio?.mermaid;
  const kpis = orgKnowledge
    ? [
        { label: "capabilities", value: orgKnowledge.capabilities.length.toLocaleString() },
        { label: "repos", value: orgKnowledge.totals.repos.toLocaleString() },
        { label: "nodes", value: orgKnowledge.totals.nodes.toLocaleString() },
        { label: "edges", value: orgKnowledge.totals.edges.toLocaleString() },
        { label: "decisions", value: orgKnowledge.totals.decisions.toLocaleString() },
      ]
    : [];
  // Prefer the section's `capabilities` link list; fall back to the registry.
  const caps = portfolio?.capabilities ?? orgKnowledge?.capabilities.map((c) => ({ capability_id: c.id, name: c.name })) ?? [];

  if (!hasDiagram && kpis.length === 0 && caps.length === 0) return null;

  return (
    <Card data-testid="org-dashboard-header">
      <Stack gap="4">
        {kpis.length > 0 && (
          <Cluster gap="4" align="center" className="flex-wrap" data-testid="org-dashboard-kpis">
            {kpis.map((k) => (
              <Stack key={k.label} gap="0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{k.label}</span>
                <span className="text-lg font-semibold tabular-nums text-[var(--text)]">{k.value}</span>
              </Stack>
            ))}
          </Cluster>
        )}

        {hasDiagram && (
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <Workflow className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Portfolio</span>
              <span className="text-xs text-[var(--text-muted)]">click a node to open its dossier</span>
            </Cluster>
            <KnowledgeMermaid chart={portfolio!.mermaid!} nodeMap={portfolio?.mermaid_nodes} ariaLabel="Org portfolio diagram" />
          </Stack>
        )}

        {caps.length > 0 && (
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <Layers className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Capabilities</span>
              <span className="text-xs text-[var(--text-muted)]">{caps.length} · open a capability</span>
            </Cluster>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {caps.map((c) => (
                <li key={c.capability_id}>
                  <Link
                    href={`/capabilities/${encodeURIComponent(c.capability_id)}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-2)]"
                  >
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <ChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
