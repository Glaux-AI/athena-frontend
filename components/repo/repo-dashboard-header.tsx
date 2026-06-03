"use client";

/**
 * RepoDashboardHeader — the computed dashboard band that sits on top of the
 * repo Blueprint tab (Phase D locked IA):
 *
 *   - the repo headline `summary` (rendered prominently)
 *   - the unified SyncStatus panel (passed in by the parent, which owns the
 *     sync mutation + live-staleness gate)
 *
 * The architecture diagram + clickable hubs / entry points / services are NOT
 * rendered here — they live in the `architecture` Blueprint section below
 * (the richer, narrated render via <BlueprintSectionViewer>), so the header
 * doesn't duplicate them.
 */

import { type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";
import { type RepoKnowledge } from "@/lib/api/client";

interface RepoDashboardHeaderProps {
  knowledge: RepoKnowledge | null;
  /** The unified SyncStatus panel — owned by the parent route. */
  syncSlot?: ReactNode;
}

export function RepoDashboardHeader({ knowledge, syncSlot }: RepoDashboardHeaderProps) {
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
      </Stack>
    </Card>
  );
}
