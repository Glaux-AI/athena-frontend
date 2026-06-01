"use client";

/**
 * PlanPhase — body of the latest `documents` row for `phase = "plan"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header. When the BE has attached a structured plan payload we
 * render the polished panels (per-stage subtasks with folded file lists, a
 * layered dependency graph, the change list, and the consequences analysis),
 * a divider, then the canonical plan as formatted markdown (via
 * `<DocMarkdown>`), the revision log, and the per-stage feedback anchors.
 *
 * The structured payload is null until the plan agent finishes — in that case
 * we degrade to the prior behaviour (markdown body + per-stage feedback).
 */

import { Stack, Cluster } from "@/components/layout/primitives";
import type { PlanStructured, RunPhaseDocument } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedback } from "../feedback/section-feedback";
import {
  ChangeListPanel,
  ConsequencesPanel,
  DependencyGraph,
  SubtasksPanel,
} from "./structured/plan-panels";
import { RevisionsPanel } from "./structured/revisions-panel";

interface PlanPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

/** `structured` is the plan payload only on the plan tab; narrow by shape
 *  (plan carries `stages`, spec does not). */
function asPlanStructured(s: RunPhaseDocument["structured"]): PlanStructured | null {
  if (s && "stages" in s) return s;
  return null;
}

export function PlanPhase({ runId, document }: PlanPhaseProps) {
  const structured = asPlanStructured(document.structured);
  const stages =
    document.sections.length > 0
      ? document.sections
      : [{ id: "plan.body", label: "Plan" }];

  return (
    <Stack gap="4">
      {structured && (
        <>
          <SubtasksPanel stages={structured.stages} />
          <DependencyGraph stages={structured.stages} />
          <ChangeListPanel stages={structured.stages} />
          <ConsequencesPanel consequences={structured.consequences} />
          <hr className="border-[var(--border)]" />
        </>
      )}

      <Stack gap="2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Plan
        </span>
        <DocMarkdown content={document.body_markdown} />
      </Stack>

      <RevisionsPanel revisions={document.revisions} />

      <Stack gap="2" className="border-t border-[var(--border)] pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Stage feedback
        </span>
        <ol className="flex flex-col gap-2">
          {stages.map((stage) => (
            <li key={stage.id}>
              <Cluster justify="between" align="center" className="gap-2">
                <span className="text-sm font-medium">{stage.label}</span>
                <SectionFeedback runId={runId} sectionId={stage.id} artifactId={document.id} />
              </Cluster>
            </li>
          ))}
        </ol>
      </Stack>
    </Stack>
  );
}
