"use client";

/**
 * PrPhase — body of the latest `documents` row for `phase = "pr.authored"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title (the PR title)
 * + gate badge + Edit/Improve header. This emits the PR body once as formatted
 * markdown (via `<DocMarkdown>`, preserving `kn://` / `repo://` chips),
 * followed by a feedback anchor for each BE-declared section.
 */

import { Stack } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";

interface PrPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

export function PrPhase({ runId, document }: PrPhaseProps) {
  const sections =
    document.sections.length > 0
      ? document.sections
      : [{ id: "pr.body", label: "PR body" }];
  return (
    <Stack gap="3">
      <DocMarkdown content={document.body_markdown} />
      <SectionFeedbackList runId={runId} artifactId={document.id} sections={sections} />
    </Stack>
  );
}
