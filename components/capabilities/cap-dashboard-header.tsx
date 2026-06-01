"use client";

/**
 * CapDashboardHeader — the computed dashboard band on the capability
 * Blueprint tab (Phase D locked IA). Merges the old first-tab "overview"
 * surface in: the cap `overview` Mermaid diagram with CLICKABLE nodes
 * (contract #5) + at-a-glance KG KPIs + clickable attached-repo links. The
 * narrative Blueprint sections render below it.
 *
 * Diagram + repo links come from the cap `overview` Blueprint section's
 * `body_json` (CapabilityOverviewBody); KPIs come from `CapabilityKnowledge`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Workflow, GitBranch, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  type CapabilityKnowledge,
  type CapabilityRepo,
  type CapabilityOverviewBody,
} from "@/lib/api/client";
import { KnowledgeMermaid } from "@/components/knowledge/knowledge-mermaid";

interface CapDashboardHeaderProps {
  capabilityId: string;
  knowledge: CapabilityKnowledge | null;
  repos: CapabilityRepo[];
}

export function CapDashboardHeader({ capabilityId, knowledge, repos }: CapDashboardHeaderProps) {
  const [overview, setOverview] = useState<CapabilityOverviewBody | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.blueprint.capability
      .getSection(capabilityId, "overview")
      .then((s) => { if (!cancelled) setOverview((s.body_json as CapabilityOverviewBody | null) ?? null); })
      .catch(() => { if (!cancelled) setOverview(null); });
    return () => { cancelled = true; };
  }, [capabilityId]);

  const hasDiagram = !!overview?.mermaid;
  const kpis = knowledge
    ? [
        { label: "nodes", value: knowledge.nodes_total.toLocaleString() },
        { label: "edges", value: knowledge.edges_total.toLocaleString() },
        { label: "repos", value: knowledge.repos_indexed.toLocaleString() },
        { label: "entities", value: knowledge.top_entities.length.toLocaleString() },
        { label: "decisions", value: knowledge.decision_records.toLocaleString() },
      ]
    : [];

  // Nothing computed yet → render nothing (the narrative sections still show).
  if (!hasDiagram && kpis.length === 0 && repos.length === 0) return null;

  return (
    <Card data-testid="cap-dashboard-header">
      <Stack gap="4">
        {kpis.length > 0 && (
          <Cluster gap="4" align="center" className="flex-wrap" data-testid="cap-dashboard-kpis">
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
              <span className="text-sm font-semibold">Architecture</span>
              <span className="text-xs text-[var(--text-muted)]">click a node to open its dossier</span>
            </Cluster>
            <KnowledgeMermaid chart={overview!.mermaid!} nodeMap={overview?.mermaid_nodes} ariaLabel="Capability architecture diagram" />
          </Stack>
        )}

        {repos.length > 0 && (
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Repos</span>
              <span className="text-xs text-[var(--text-muted)]">{repos.length} attached · open the canonical repo home</span>
            </Cluster>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {repos.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/capabilities/${encodeURIComponent(capabilityId)}/repos/${encodeURIComponent(r.repo_id ?? r.id)}?tab=blueprint`}
                    className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-2)]"
                  >
                    <code className="truncate font-mono text-xs font-semibold">{r.repo_full_name}</code>
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
