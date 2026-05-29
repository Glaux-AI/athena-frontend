"use client";

/**
 * SpecPhase — renders the latest `documents` row for `phase = "spec"`
 * on the run detail page. Pure presentation: takes the run + document
 * and emits the canonical spec body plus a `<SectionFeedback>` widget
 * at the end of every logical section.
 *
 * Sections come from `document.sections` (BE-emitted ids + labels).
 * When the BE list is empty we render the body as a single "spec"
 * section so the feedback widget still anchors. Citation chips are
 * injected by wrapping section bodies in `<CitationRenderer>`.
 */

import { FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { CitationRenderer } from "../citations/citation-renderer";
import { SectionFeedback } from "../feedback/section-feedback";
import { PhaseGateBadge } from "./phase-gate-badge";

interface SpecPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

function splitBodyBySections(
  body: string,
  sections: { id: string; label: string }[],
): { id: string; label: string; body: string }[] {
  if (sections.length === 0) {
    return [{ id: "spec.body", label: "Spec", body }];
  }
  // We don't have a content-by-anchor map from the BE; render the full
  // body once and surface every BE-declared section anchor with its own
  // feedback widget. Keeps the source-of-truth on the BE without
  // re-implementing markdown anchor extraction in the FE.
  return sections.map((s) => ({ id: s.id, label: s.label, body }));
}

export function SpecPhase({ runId, document }: SpecPhaseProps) {
  const sections = splitBodyBySections(document.body_markdown, document.sections);
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <FileText className="size-4 text-[var(--text-muted)]" />
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
              <CitationRenderer text={s.body} />
            </div>
            <SectionFeedback runId={runId} sectionId={s.id} artifactId={document.id} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
