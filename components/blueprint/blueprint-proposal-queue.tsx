"use client";

/**
 * BlueprintProposalQueue - banner shown at the top of the Blueprint page when one or more
 * pending proposals exist. Click → opens the proposal-diff modal.
 *
 * Per knowledge-model.md §5.9 / F-04.3. The banner is the "human's interaction
 * surface" for the approval-gated update flow (§5.4).
 */

import { AlertTriangle, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import type { BlueprintSectionProposal } from "@/lib/api/client";

interface BlueprintProposalQueueProps {
  proposals: BlueprintSectionProposal[];
  onOpen: () => void;
}

export function BlueprintProposalQueue({ proposals, onOpen }: BlueprintProposalQueueProps) {
  const pending = proposals.filter((p) => p.status === "pending");
  if (pending.length === 0) return null;

  return (
    <Card variant="elevated" className="border-[var(--border-strong)] bg-[var(--warning-soft)]">
      <Cluster justify="between" align="center" gap="3">
        <Cluster gap="3" align="center">
          <AlertTriangle className="size-4 text-[var(--warning-ink)]" aria-hidden />
          <Stack gap="0.5">
            <span className="text-sm font-semibold text-[var(--warning-ink)]">
              {pending.length === 1
                ? "1 update awaiting your review"
                : `${pending.length} updates awaiting your review`}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Athena has proposed changes to {distinctSectionCount(pending)} section
              {distinctSectionCount(pending) === 1 ? "" : "s"}. Accept, edit, or reject
              each one before they land.
            </span>
          </Stack>
        </Cluster>
        <Button
          size="sm"
          variant="secondary"
          onClick={onOpen}
          className="border-[var(--warning)] text-[var(--warning-ink)]"
        >
          Review updates
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      </Cluster>
    </Card>
  );
}

function distinctSectionCount(proposals: BlueprintSectionProposal[]): number {
  return new Set(proposals.map((p) => p.section_key)).size;
}
