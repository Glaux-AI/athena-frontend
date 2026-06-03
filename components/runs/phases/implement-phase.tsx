"use client";

/**
 * ImplementPhase — body of the latest `documents` row for any `implement.*`
 * phase.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header. When the BE has attached an `ImplementStructured`
 * payload we render the implementation rollup panel (stages / touched files /
 * heal attempts, or the quickfix target-file + diff summary) above a divider,
 * then emit the implementation body as formatted markdown (via `<DocMarkdown>`,
 * which keeps embedded `kn://` / `repo://` chips clickable through the
 * renderer-hoisted drawer), followed by a per-section feedback anchor for each
 * BE-declared section.
 *
 * The structured payload is null until the implement agent finishes — in that
 * case we degrade to exactly the prior behaviour (markdown body + feedback).
 */

import { Stack } from "@/components/layout/primitives";
import type { ImplementStructured, RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";
import { StagesPanel } from "./structured/implement-track-panels";

interface ImplementPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

/** `structured` is the implement payload only on the implement tab; narrow by
 *  the `heal_attempts_used` discriminant (present on both the implement and
 *  quickfix implement shapes, on no other structured payload). */
function asImplement(s: RunPhaseDocument["structured"]): ImplementStructured | null {
  if (s && "heal_attempts_used" in s) return s;
  return null;
}

export function ImplementPhase({ runId, document }: ImplementPhaseProps) {
  const structured = asImplement(document.structured);
  const sections =
    document.sections.length > 0
      ? document.sections
      : [{ id: "implement.body", label: "Implementation summary" }];
  return (
    <Stack gap="3">
      {structured && (
        <>
          <StagesPanel s={structured} />
          <hr className="border-[var(--border)]" />
        </>
      )}
      <DocMarkdown content={document.body_markdown} />
      <SectionFeedbackList runId={runId} artifactId={document.id} sections={sections} />
    </Stack>
  );
}
