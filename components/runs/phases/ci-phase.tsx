"use client";

/**
 * CiPhase — renders the latest `documents` row for `phase = "ci.state"`.
 * Surfaces the CI gate state badge (mirrors the phase's `gate_state` —
 * which the BE keeps in sync with the CI verdict), the heal-attempts
 * counter if present in the body, and a per-failure feedback block for
 * each section the BE has surfaced.
 */

import { ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { RunPhaseDocument } from "@/lib/api/client";

import { CitationRenderer } from "../citations/citation-renderer";
import { SectionFeedback } from "../feedback/section-feedback";
import { PhaseGateBadge } from "./phase-gate-badge";

interface CiPhaseProps {
  runId: string;
  document: RunPhaseDocument;
}

/** Pull a `heal_attempts: N` line out of the body for the top-card chip.
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
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <ShieldCheck className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">{document.title}</span>
            </Cluster>
            <Cluster gap="2" align="center">
              {healAttempts !== null && (
                <span
                  className="rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--info)]"
                  data-testid="ci-heal-attempts"
                >
                  Heal × {healAttempts}
                </span>
              )}
              <PhaseGateBadge gateState={document.gate_state} />
            </Cluster>
          </Cluster>
        </Stack>
      </Card>
      {failures.map((f) => (
        <Card key={f.id}>
          <Stack gap="3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {f.label}
            </span>
            <div className="text-sm leading-relaxed text-[var(--text)]">
              <CitationRenderer text={document.body_markdown} />
            </div>
            <SectionFeedback runId={runId} sectionId={f.id} artifactId={document.id} />
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
