"use client";

/**
 * CiPhase — body of the latest `documents` row for `phase = "ci.state"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header (the gate badge mirrors the CI verdict the BE keeps in
 * sync). When the BE has attached a `CiStructured` payload we render the CI
 * checks panel (per-check status pills + the autofix attempts used/cap, which
 * is now the machine-readable source for the heal counter) above a divider,
 * then the CI body as formatted markdown, and a per-failure feedback block for
 * each section the BE has surfaced.
 *
 * When the structured payload is null we degrade to the prior behaviour: a
 * best-effort heal-attempts chip scraped from the body markdown + the body +
 * feedback.
 */

import { Stack, Cluster } from "@/components/layout/primitives";
import type { CiStructured, RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";
import { CiChecksPanel } from "./structured/implement-track-panels";

interface CiPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

/** `structured` is the CI payload only on the ci tab; narrow by the
 *  `autofix_cap` discriminant (unique to `CiStructured`). */
function asCi(s: RunPhaseDocument["structured"]): CiStructured | null {
  if (s && "autofix_cap" in s) return s;
  return null;
}

/** Pull a `heal_attempts: N` line out of the body for the heal chip. Used only
 *  as the legacy fallback when no `CiStructured` payload is attached — once the
 *  structured payload lands, `autofix_attempts_used` is the canonical source
 *  (surfaced by `CiChecksPanel`). */
function extractHealAttempts(body: string): number | null {
  const match = /heal[_ ]attempts?[:=]\s*(\d+)/i.exec(body);
  if (!match) return null;
  return Number(match[1]);
}

export function CiPhase({ runId, document }: CiPhaseProps) {
  const structured = asCi(document.structured);
  const failures =
    document.sections.length > 0
      ? document.sections
      : [{ id: "ci.body", label: "CI summary" }];
  // Legacy fallback only — when structured is present the panel owns the count.
  const healAttempts = structured ? null : extractHealAttempts(document.body_markdown);
  return (
    <Stack gap="3">
      {structured && (
        <>
          <CiChecksPanel s={structured} />
          <hr className="border-[var(--border)]" />
        </>
      )}
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
