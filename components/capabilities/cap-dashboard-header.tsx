"use client";

/**
 * CapDashboardHeader — the computed dashboard band on the capability
 * Blueprint tab (Phase D locked IA). Surfaces clickable attached-repo links.
 * The cap `overview` Mermaid diagram is NOT rendered here — it lives in the
 * `overview` Blueprint section below (the richer, narrated render), so the
 * header doesn't duplicate it. Counts live on the Topology tab's
 * TopologyHeader (ADR-073 canonical-home), not here.
 */

import Link from "next/link";
import { GitBranch, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { type CapabilityRepo } from "@/lib/api/client";

interface CapDashboardHeaderProps {
  capabilityId: string;
  repos: CapabilityRepo[];
}

export function CapDashboardHeader({ capabilityId, repos }: CapDashboardHeaderProps) {
  // Nothing attached yet → render nothing (the narrative sections still show).
  if (repos.length === 0) return null;

  return (
    <Card variant="elevated" data-testid="cap-dashboard-header">
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
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-accent)] hover:shadow-[var(--shadow-2)]"
              >
                <code className="truncate font-mono text-xs font-semibold">{r.repo_full_name}</code>
                <ChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Stack>
    </Card>
  );
}
