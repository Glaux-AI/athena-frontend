"use client";

/**
 * RepoDashboardHeader — the computed dashboard band that sits on top of the
 * repo Blueprint tab (Phase D locked IA). Merges what used to be a separate
 * "overview" surface into one header:
 *
 *   - the repo headline `summary` (rendered prominently)
 *   - the Mermaid architecture diagram with CLICKABLE nodes (contract #5)
 *   - the unified SyncStatus panel (passed in by the parent, which owns the
 *     sync mutation + live-staleness gate)
 *   - clickable architecture hubs / entry points / services that deep-link
 *     into the node-dossier drawer (contract #1)
 *
 * The diagram + hubs come from the repo `architecture` Blueprint section's
 * `body_json` (RepoArchitectureBody); this component fetches that one section
 * directly so the header is self-contained.
 */

import { useEffect, useState, type ReactNode } from "react";
import { FileCode, Workflow, DoorOpen, Boxes } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  type RepoKnowledge,
  type RepoArchitectureBody,
} from "@/lib/api/client";
import { KnowledgeMermaid } from "@/components/knowledge/knowledge-mermaid";
import { NodeRefChip } from "@/components/knowledge/node-ref-chip";

interface RepoDashboardHeaderProps {
  repoId: string;
  knowledge: RepoKnowledge | null;
  /** The unified SyncStatus panel — owned by the parent route. */
  syncSlot?: ReactNode;
}

export function RepoDashboardHeader({ repoId, knowledge, syncSlot }: RepoDashboardHeaderProps) {
  const [arch, setArch] = useState<RepoArchitectureBody | null>(null);

  // Fetch the `architecture` Blueprint section's structured body for the
  // diagram + hubs. Soft-fail (many repos have no Blueprint yet).
  useEffect(() => {
    let cancelled = false;
    api.blueprint.repo
      .getSection(repoId, "architecture")
      .then((s) => {
        if (cancelled) return;
        setArch((s.body_json as RepoArchitectureBody | null) ?? null);
      })
      .catch(() => { if (!cancelled) setArch(null); });
    return () => { cancelled = true; };
  }, [repoId]);

  const hubs = arch?.hubs ?? [];
  const entryPoints = arch?.entry_points ?? [];
  const services = arch?.services ?? [];
  const hasDiagram = !!arch?.mermaid;

  return (
    <Card data-testid="repo-dashboard-header">
      <Stack gap="4">
        {/* Headline summary */}
        {knowledge?.summary && (
          <p className="max-w-prose text-sm leading-relaxed text-[var(--text)]">{knowledge.summary}</p>
        )}

        {/* Unified SyncStatus panel (owned by the parent route). Counts live
            on the Topology tab's TopologyHeader (ADR-073 canonical-home). */}
        {syncSlot}

        {/* Architecture diagram (clickable nodes) */}
        {hasDiagram && (
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <Workflow className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Architecture</span>
              <span className="text-xs text-[var(--text-muted)]">click a node to open its dossier</span>
            </Cluster>
            <KnowledgeMermaid chart={arch!.mermaid!} nodeMap={arch?.mermaid_nodes} ariaLabel="Repo architecture diagram" />
          </Stack>
        )}

        {/* Clickable hubs / entry points / services */}
        {hubs.length > 0 && (
          <HubGroup icon={<Boxes className="size-4 text-[var(--primary)]" aria-hidden />} title="Hubs" hint="most-connected modules">
            {hubs.map((h) => (
              <NodeRefChip key={h.node_id} node={{ node_id: h.node_id, name: h.name, kind: h.kind, path: h.path }} />
            ))}
          </HubGroup>
        )}
        {entryPoints.length > 0 && (
          <HubGroup icon={<DoorOpen className="size-4 text-[var(--primary)]" aria-hidden />} title="Entry points">
            {entryPoints.map((e) => (
              <NodeRefChip key={e.node_id} node={{ node_id: e.node_id, name: e.name, kind: "entry_point", path: e.path }} />
            ))}
          </HubGroup>
        )}
        {services.length > 0 && (
          <HubGroup icon={<FileCode className="size-4 text-[var(--primary)]" aria-hidden />} title="Services">
            {services.map((s) => (
              <NodeRefChip key={s.node_id} node={{ node_id: s.node_id, name: s.name, kind: "service" }} />
            ))}
          </HubGroup>
        )}
      </Stack>
    </Card>
  );
}

function HubGroup({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        {hint && <span className="text-xs text-[var(--text-muted)]">{hint}</span>}
      </Cluster>
      <Cluster gap="1.5" align="center" className="flex-wrap">
        {children}
      </Cluster>
    </Stack>
  );
}
