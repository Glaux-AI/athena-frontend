"use client";

/**
 * ReviewPhase — renders the latest `documents` row for `phase =
 * "implement.review"`. Each BE-declared section becomes a per-file
 * block so reviewer comments + feedback widgets anchor cleanly.
 */

import { Eye } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { CitationRenderer } from "../citations/citation-renderer";
import { SectionFeedback } from "../feedback/section-feedback";
import { PhaseGateBadge } from "./phase-gate-badge";

interface ReviewPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

export function ReviewPhase({ runId, document }: ReviewPhaseProps) {
  const blocks =
    document.sections.length > 0
      ? document.sections
      : [{ id: "review.body", label: "Review summary" }];
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <Eye className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">{document.title}</span>
            </Cluster>
            <PhaseGateBadge gateState={document.gate_state} />
          </Cluster>
        </Stack>
      </Card>
      {blocks.map((b) => (
        <Card key={b.id}>
          <Stack gap="3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {b.label}
            </span>
            <div className="text-sm leading-relaxed text-[var(--text)]">
              <CitationRenderer text={document.body_markdown} />
            </div>
            <SectionFeedback runId={runId} sectionId={b.id} artifactId={document.id} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
