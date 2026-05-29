"use client";

/**
 * PrPhase — renders the latest `documents` row for `phase = "pr.authored"`.
 * Surfaces the PR title (from `document.title`) + the PR body as markdown.
 * Per-section feedback widgets attach to each BE-declared section anchor.
 */

import { GitPullRequest } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { CitationRenderer } from "../citations/citation-renderer";
import { SectionFeedback } from "../feedback/section-feedback";
import { PhaseGateBadge } from "./phase-gate-badge";

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
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <GitPullRequest className="size-4 text-[var(--text-muted)]" />
              <Stack gap="0" className="min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Pull request title
                </span>
                <span className="text-sm font-semibold">{document.title}</span>
              </Stack>
            </Cluster>
            <PhaseGateBadge gateState={document.gate_state} />
          </Cluster>
        </Stack>
      </Card>
      {sections.map((s) => (
        <Card key={s.id}>
          <Stack gap="3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {s.label}
            </span>
            <div className="text-sm leading-relaxed text-[var(--text)]">
              <CitationRenderer text={document.body_markdown} />
            </div>
            <SectionFeedback runId={runId} sectionId={s.id} artifactId={document.id} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
