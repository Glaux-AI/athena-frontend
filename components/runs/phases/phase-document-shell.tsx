"use client";

/**
 * PhaseDocumentShell — the single cohesive surface for a phase artifact.
 *
 * One card, not three: a header row carrying the document title + gate
 * badge on the left and the phase actions (Edit / Improve in read mode, or
 * the editor's Preview toggle in edit mode) on the right, a divider, then
 * the body. The per-phase renderers (`SpecPhase`, `PrdPhase`, …) return
 * body-only content dropped into `children`, so every phase reads as one
 * connected panel instead of a stack of floating, separately-hovering cards.
 */

import { type ReactNode } from "react";
import { FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { PhaseGateBadge } from "./phase-gate-badge";

interface PhaseDocumentShellProps {
  title: string;
  gateState: RunPhaseDocument["gate_state"];
  /** Right-aligned header actions (Edit/Improve, or the editor's controls). */
  actions?: ReactNode;
  children: ReactNode;
}

export function PhaseDocumentShell({
  title,
  gateState,
  actions,
  children,
}: PhaseDocumentShellProps) {
  return (
    <Card variant="elevated" className="overflow-hidden p-0">
      <Cluster
        justify="between"
        align="center"
        gap="3"
        className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] px-4 py-2.5 shadow-[var(--inner-highlight)]"
      >
        <Cluster gap="2" align="center" className="min-w-0">
          <FileText className="size-4 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate text-sm font-semibold">{title}</span>
          <PhaseGateBadge gateState={gateState} />
        </Cluster>
        {actions ? (
          <Cluster gap="2" align="center" className="shrink-0">
            {actions}
          </Cluster>
        ) : null}
      </Cluster>
      <div className="px-4 py-4">{children}</div>
    </Card>
  );
}
