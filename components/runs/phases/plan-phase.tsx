"use client";

/**
 * PlanPhase — renders the latest `documents` row for `phase = "plan"`.
 * The plan body is rendered as an ordered list of stages so the DAG /
 * dependency structure stays scannable. Each stage gets its own
 * feedback widget; chips inside the stage body are clickable.
 *
 * The wire shape uses `document.sections` as the canonical stage list.
 * If the BE has not emitted any stage anchors yet, we fall back to a
 * single "plan" section that wraps the full body.
 */

import { ListTree } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { CitationRenderer } from "../citations/citation-renderer";
import { SectionFeedback } from "../feedback/section-feedback";
import { PhaseGateBadge } from "./phase-gate-badge";

export interface PlanPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

export function PlanPhase({ runId, document }: PlanPhaseProps) {
  const stages =
    document.sections.length > 0
      ? document.sections
      : [{ id: "plan.body", label: "Plan" }];
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <ListTree className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">{document.title}</span>
            </Cluster>
            <PhaseGateBadge gateState={document.gate_state} />
          </Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            Stages execute top-down; chips below open the source they reference.
          </p>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <ol className="flex flex-col gap-3">
            {stages.map((stage, i) => (
              <li key={stage.id} className="rounded-md border border-[var(--border)] p-3">
                <Stack gap="2">
                  <Cluster gap="2" align="center">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[10px] font-semibold text-[var(--primary)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-semibold">{stage.label}</span>
                  </Cluster>
                  <div className="text-sm leading-relaxed text-[var(--text)]">
                    <CitationRenderer text={document.body_markdown} />
                  </div>
                  <SectionFeedback
                    runId={runId}
                    sectionId={stage.id}
                    artifactId={document.id}
                  />
                </Stack>
              </li>
            ))}
          </ol>
        </Stack>
      </Card>
    </Stack>
  );
}
