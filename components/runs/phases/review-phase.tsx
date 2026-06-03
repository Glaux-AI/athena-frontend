"use client";

/**
 * ReviewPhase — body of the latest `documents` row for `phase =
 * "implement.review"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header. When the BE has attached a `ReviewStructured` payload
 * we render the reviewed-file list + spec-compliance coverage + critic-
 * iteration count above a divider, then the review body as formatted markdown
 * (via `<DocMarkdown>`, preserving `kn://` / `repo://` chips), followed by a
 * feedback anchor for each BE-declared review block.
 *
 * The structured payload is null until the critic finishes — in that case we
 * degrade to exactly the prior behaviour (markdown body + feedback).
 */

import { Stack } from "@/components/layout/primitives";
import type { ReviewStructured, RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";
import { ReviewFilesPanel } from "./structured/implement-track-panels";

interface ReviewPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

/** `structured` is the review payload only on the review tab; narrow by the
 *  `critic_iterations` discriminant (unique to `ReviewStructured`). */
function asReview(s: RunPhaseDocument["structured"]): ReviewStructured | null {
  if (s && "critic_iterations" in s) return s;
  return null;
}

export function ReviewPhase({ runId, document }: ReviewPhaseProps) {
  const structured = asReview(document.structured);
  const blocks =
    document.sections.length > 0
      ? document.sections
      : [{ id: "review.body", label: "Review summary" }];
  return (
    <Stack gap="3">
      {structured && (
        <>
          <ReviewFilesPanel s={structured} />
          <hr className="border-[var(--border)]" />
        </>
      )}
      <DocMarkdown content={document.body_markdown} />
      <SectionFeedbackList runId={runId} artifactId={document.id} sections={blocks} />
    </Stack>
  );
}
