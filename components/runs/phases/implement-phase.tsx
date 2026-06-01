"use client";

/**
 * ImplementPhase — body of the latest `documents` row for any `implement.*`
 * phase.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header. This emits the implementation body exactly once as
 * formatted markdown (via `<DocMarkdown>`, which keeps embedded `kn://` /
 * `repo://` chips clickable through the renderer-hoisted drawer), followed by
 * a per-section feedback anchor for each BE-declared section.
 */

import { Stack } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";

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
    <Stack gap="3">
      <DocMarkdown content={document.body_markdown} />
      <SectionFeedbackList runId={runId} artifactId={document.id} sections={sections} />
    </Stack>
  );
}
