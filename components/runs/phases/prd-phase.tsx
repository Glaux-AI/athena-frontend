"use client";

/**
 * PrdPhase — body of the run's evolving `prd` document on the Frame /
 * Research / Draft / Sign-off tabs of a PRD-track run.
 *
 * All four PRD phases map to the single `prd` Document kind (the sub-agents
 * version-bump it as the PRD evolves); the `documents?phase=…` endpoint
 * returns the latest version carrying the shared `body_markdown`, the
 * `revisions[]` log, AND a per-phase `structured` payload. This renderer
 * dispatches on `activePhase`: when the matching structured payload is
 * present it renders the polished panel, a divider, then the canonical PRD
 * as formatted markdown (via `<DocMarkdown>`, which keeps `kn://` / `repo://`
 * chips clickable), the revision log, and the `<SectionFeedback>` anchor.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header. When `structured` is null (the sub-agent for this
 * phase hasn't run yet) we degrade to exactly the prior behaviour — the
 * markdown body + feedback anchor — and never crash.
 */

import { Stack } from "@/components/layout/primitives";
import type {
  PrdDraftStructured,
  PrdFrameStructured,
  PrdResearchStructured,
  PrdSignoffStructured,
  RunPhaseDocument,
} from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedback } from "../feedback/section-feedback";
import {
  DraftPanel,
  FramePanel,
  ResearchPanel,
  SignoffPanel,
} from "./structured/prd-panels";
import { RevisionsPanel } from "./structured/revisions-panel";

interface PrdPhaseProps {
  runId: string;
  document: RunPhaseDocument;
  /** Active PRD tab — `frame | research | draft | signoff`. Selects which
   *  structured panel to render. Threaded from `PhaseContent`. */
  activePhase: string;
}

type Structured = RunPhaseDocument["structured"];

/* The four PRD payloads share `version: 1` with spec/plan, so we narrow by a
 * field unique to each shape (per the frozen contract): frame has
 * `problem_statement`, research has `findings`, draft has
 * `conli_flags_remaining`, signoff has `approvals`. */
function asFrame(s: Structured): PrdFrameStructured | null {
  return s && "problem_statement" in s ? s : null;
}
function asResearch(s: Structured): PrdResearchStructured | null {
  return s && "findings" in s ? s : null;
}
function asDraft(s: Structured): PrdDraftStructured | null {
  return s && "conli_flags_remaining" in s ? s : null;
}
function asSignoff(s: Structured): PrdSignoffStructured | null {
  return s && "approvals" in s ? s : null;
}

/** Render the structured panel for the active PRD tab, or null when this
 *  document carries no (matching) structured payload yet. */
function renderStructuredPanel(
  activePhase: string,
  structured: Structured,
): React.ReactNode {
  switch (activePhase) {
    case "frame": {
      const frame = asFrame(structured);
      return frame ? <FramePanel frame={frame} /> : null;
    }
    case "research": {
      const research = asResearch(structured);
      return research ? <ResearchPanel research={research} /> : null;
    }
    case "draft": {
      const draft = asDraft(structured);
      return draft ? <DraftPanel draft={draft} /> : null;
    }
    case "signoff": {
      const signoff = asSignoff(structured);
      return signoff ? <SignoffPanel signoff={signoff} /> : null;
    }
    default:
      return null;
  }
}

export function PrdPhase({ runId, document, activePhase }: PrdPhaseProps) {
  const panel = renderStructuredPanel(activePhase, document.structured);

  return (
    <Stack gap="4">
      {panel && (
        <>
          {panel}
          <hr className="border-[var(--border)]" />
        </>
      )}

      <Stack gap="2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          PRD
        </span>
        <DocMarkdown content={document.body_markdown} />
      </Stack>

      <RevisionsPanel revisions={document.revisions} />

      <SectionFeedback runId={runId} sectionId="prd.body" artifactId={document.id} />
    </Stack>
  );
}
