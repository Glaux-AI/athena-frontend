"use client";

/**
 * ExplorerDetailPanel — the "node details below the graph" surface. Whatever is
 * selected (root / synthetic scope-ref / real node) renders here, in sync with
 * the graph + tree:
 *   • synthetic scope node (repo/cap/org) → <ScopeDossierPanel>, which surfaces
 *     that scope's Blueprint read-only inline (there's no KG node for a scope —
 *     its rich detail lives in the parallel Blueprint system);
 *   • real node → fetched dossier via the shared <NodeDossierBody> (the SAME
 *     render as the slide-over drawer), with a leaf → home-file CTA and, for
 *     file nodes, an "Open full detail" → tabbed <FileDetailDrawer>.
 * Ref chips inside either body open the GLOBAL node drawer (node→node hops)
 * without disturbing the explorer's own selection.
 */

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { api, type NodeDossierResponse } from "@/lib/api/client";
import {
  NodeDossierBody,
  isSelfBlueprint,
  resolveFileTarget,
  type FileTarget,
} from "@/components/knowledge/node-dossier-body";
import { useNodeDossier } from "@/components/knowledge/node-dossier-context";
import { FileDetailDrawer } from "@/components/repo/file-detail-drawer";
import { useExplorer } from "@/components/topology/explorer/explorer-store";
import { ScopeDossierPanel } from "@/components/topology/explorer/scope-dossier-panel";
import { parseScopeId, type ScopeKind } from "@/components/topology/explorer/scope-seed";

export function ExplorerDetailPanel({ capabilityId }: { capabilityId?: string | undefined } = {}) {
  const { selectedId, rootId, graph } = useExplorer();
  const { open } = useNodeDossier();

  const targetId = selectedId ?? rootId;
  const scope = parseScopeId(targetId);

  // `contains`-edge fan-out under the selected scope root/ref. Computed before
  // any early return so hook order stays stable across real/synthetic targets.
  const childCount = useMemo(() => {
    let n = 0;
    for (const e of graph.edges.values()) if (e.kind === "contains" && e.source_id === targetId) n++;
    return n;
  }, [graph.edges, targetId]);

  const [res, setRes] = useState<NodeDossierResponse | null>(null);
  const [fileTarget, setFileTarget] = useState<FileTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerFileId, setDrawerFileId] = useState<string | null>(null);

  useEffect(() => {
    if (scope) { setRes(null); setFileTarget(null); setError(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRes(null);
    setFileTarget(null);
    api.knowledge
      .node(targetId)
      .then(async (r) => {
        if (cancelled) return;
        const target = isSelfBlueprint(r) ? null : await resolveFileTarget(r);
        if (cancelled) return;
        setRes(r);
        setFileTarget(target);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load node"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [targetId, scope]);

  if (scope) {
    return (
      <ScopeDossierPanel
        kind={scope.kind}
        scopeId={scope.id}
        node={graph.nodes.get(targetId)}
        childCount={childCount}
        fullHref={scopeBlueprintHref(scope.kind, scope.id, capabilityId)}
      />
    );
  }

  const kind = res?.node_kind ?? res?.dossier?.kind ?? "Node";
  const name = res?.name ?? res?.dossier?.name ?? (loading ? "Loading…" : "—");
  const isFile = res?.node_kind === "file" && !!res.repo_id;

  return (
    <div data-testid="explorer-detail" className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <Stack gap="0" className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{kind}</span>
          <span className="truncate text-sm font-semibold text-[var(--text)]" title={name}>{name}</span>
        </Stack>
        {isFile && (
          <button
            type="button"
            onClick={() => setDrawerFileId(targetId)}
            data-testid="open-full-detail"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <FileText className="size-3.5" aria-hidden />
            Open full detail
          </button>
        )}
      </header>
      <div className="p-4">
        <NodeDossierBody res={res} fileTarget={fileTarget} loading={loading} error={error} onNavigate={open} />
      </div>

      {drawerFileId && res?.repo_id && (
        <FileDetailDrawer
          repoId={res.repo_id}
          fileId={drawerFileId}
          onClose={() => setDrawerFileId(null)}
          onNavigateFile={(id) => setDrawerFileId(id)}
        />
      )}
    </div>
  );
}

/** Canonical Blueprint-tab route for a scope, used by the "Open full blueprint"
 *  link in <ScopeDossierPanel>. A repo's canonical page is nested under its
 *  owning capability, so the repo link needs `capabilityId` (absent on the org
 *  surface, where no repo refs appear) — null there hides the link. */
function scopeBlueprintHref(kind: ScopeKind, id: string, capabilityId: string | undefined): string | null {
  if (kind === "capability") return `/capabilities/${encodeURIComponent(id)}?tab=blueprint`;
  if (kind === "org") return "/knowledge?tab=blueprint";
  return capabilityId
    ? `/capabilities/${encodeURIComponent(capabilityId)}/repos/${encodeURIComponent(id)}?tab=blueprint`
    : null;
}
