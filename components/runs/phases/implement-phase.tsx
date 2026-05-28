"use client";

/**
 * ImplementPhase — renders the latest `documents` row for any
 * `implement.*` phase. Body is rendered as scannable prose plus a
 * per-section feedback widget; citations embedded in the body open
 * via the renderer-hoisted drawer.
 */

import { Hammer } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { CitationRenderer } from "../citations/citation-renderer";
import { SectionFeedback } from "../feedback/section-feedback";
import { PhaseGateBadge } from "./phase-gate-badge";

interface ImplementPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

export function ImplementPhase({ runId, document }: ImplementPhaseProps) {
  const sections =
    document.sections.length > 0
      ? document.sections
      : [{ id: "implement.body", label: "Implementation summary" }];
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <Hammer className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">{document.title}</span>
            </Cluster>
            <PhaseGateBadge gateState={document.gate_state} />
          </Cluster>
        </Stack>
      </Card>
      {sections.map((s) => (
        <Card key={s.id}>
          <Stack gap="3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {s.label}
            </span>
            <div className="text-sm leading-relaxed text-[var(--text)]">
              <CitationRenderer text={document.body_markdown} />
            </div>
            <SectionFeedback runId={runId} sectionId={s.id} artifactId={document.id} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
