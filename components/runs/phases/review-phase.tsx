"use client";

/**
 * ReviewPhase — body of the latest `documents` row for `phase =
 * "implement.review"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header. The review body is rendered exactly once as formatted
 * markdown (via `<DocMarkdown>`, preserving `kn://` / `repo://` chips),
 * followed by a feedback anchor for each BE-declared review block.
 */

import { Stack } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";

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
    <Stack gap="3">
      <DocMarkdown content={document.body_markdown} />
      <SectionFeedbackList runId={runId} artifactId={document.id} sections={blocks} />
    </Stack>
  );
}
