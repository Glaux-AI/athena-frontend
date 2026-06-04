"use client";

/**
 * TopologyExplorer — the unified, search-driven, on-demand topology surface
 * shared by every scope (repo / capability / org). Composition only: the
 * <ExplorerProvider> owns the one selection that every part syncs to, and the
 * leaves (search bar → graph + structure tree → detail panel) all read/write it.
 *
 * The page passes a scope `seed` (synthetic root + 1-hop children, built from
 * data it already loaded) plus the scope kind + ids for search. Everything else
 * — focus, neighbour expansion, the dossier below — is driven from the single
 * selection inside.
 */

import type { SearchScope } from "@/lib/api/client";

import { ExplorerProvider } from "@/components/topology/explorer/explorer-store";
import { ExplorerSearchBar } from "@/components/topology/explorer/explorer-search-bar";
import { ExplorerGraphPanel } from "@/components/topology/explorer/explorer-graph-panel";
import { ExplorerDetailPanel } from "@/components/topology/explorer/explorer-detail-panel";
import { ContainmentTree } from "@/components/topology/explorer/containment-tree";
import type { Seed } from "@/components/topology/explorer/explorer-graph";

interface TopologyExplorerProps {
  seed: Seed;
  scope: SearchScope;
  capabilityId?: string | undefined;
  repoId?: string | undefined;
  graphHeight?: number;
}

export function TopologyExplorer({ seed, scope, capabilityId, repoId, graphHeight = 520 }: TopologyExplorerProps) {
  return (
    <ExplorerProvider seed={seed}>
      <div className="space-y-4">
        <ExplorerSearchBar scope={scope} capabilityId={capabilityId} repoId={repoId} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <ExplorerGraphPanel height={graphHeight} />
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
            <div className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Structure
            </div>
            <ContainmentTree />
          </div>
        </div>
        <ExplorerDetailPanel capabilityId={capabilityId} />
      </div>
    </ExplorerProvider>
  );
}
