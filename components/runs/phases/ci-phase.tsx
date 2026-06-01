"use client";

/**
 * CiPhase — body of the latest `documents` row for `phase = "ci.state"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header (the gate badge mirrors the CI verdict the BE keeps in
 * sync). This surfaces the heal-attempts counter if present in the body, the
 * CI body as formatted markdown, and a per-failure feedback block for each
 * section the BE has surfaced.
 */

import { Stack, Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";

interface CiPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

/** Pull a `heal_attempts: N` line out of the body for the heal chip.
 *  Best-effort — the BE may emit a richer machine-readable sidecar later,
 *  but the body markdown is the canonical source today. */
function extractHealAttempts(body: string): number | null {
  const match = /heal[_ ]attempts?[:=]\s*(\d+)/i.exec(body);
  if (!match) return null;
  return Number(match[1]);
}

export function CiPhase({ runId, document }: CiPhaseProps) {
  const failures =
    document.sections.length > 0
      ? document.sections
      : [{ id: "ci.body", label: "CI summary" }];
  const healAttempts = extractHealAttempts(document.body_markdown);
  return (
    <Stack gap="3">
      {healAttempts !== null && (
        <Cluster gap="2" align="center">
          <span
            className="rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--info)]"
            data-testid="ci-heal-attempts"
          >
            Heal × {healAttempts}
          </span>
        </Cluster>
      )}
      <DocMarkdown content={document.body_markdown} />
      <SectionFeedbackList runId={runId} artifactId={document.id} sections={failures} />
    </Stack>
  );
}
