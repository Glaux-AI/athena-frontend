"use client";

/**
 * PrPhase — body of the latest `documents` row for `phase = "pr.authored"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title (the PR title)
 * + gate badge + Edit/Improve header. When the BE has attached a
 * `PrStructured` payload we render the PR summary panel (title / branch / a
 * real link to the PR url / number / body excerpt / comment responses) above a
 * divider, then emit the PR body once as formatted markdown (via
 * `<DocMarkdown>`, preserving `kn://` / `repo://` chips), followed by a
 * feedback anchor for each BE-declared section.
 *
 * The structured payload is null until the PR is authored — in that case we
 * degrade to exactly the prior behaviour (markdown body + feedback).
 */

import { Stack } from "@/components/layout/primitives";
import type { PrStructured, RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";
import { PrSummaryPanel } from "./structured/implement-track-panels";

interface PrPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

/** `structured` is the PR payload only on the pr tab; narrow by the `pr_url`
 *  discriminant (present on both the implement and quickfix PR shapes, on no
 *  other structured payload). */
function asPr(s: RunPhaseDocument["structured"]): PrStructured | null {
  if (s && "pr_url" in s) return s;
  return null;
}

export function PrPhase({ runId, document }: PrPhaseProps) {
  const structured = asPr(document.structured);
  const sections =
    document.sections.length > 0
      ? document.sections
      : [{ id: "pr.body", label: "PR body" }];
  return (
    <Stack gap="3">
      {structured && (
        <>
          <PrSummaryPanel s={structured} />
          <hr className="border-[var(--border)]" />
        </>
      )}
      <DocMarkdown content={document.body_markdown} />
      <SectionFeedbackList runId={runId} artifactId={document.id} sections={sections} />
    </Stack>
  );
}
