"use client";

/**
 * PhaseContent — switch component that routes the active phase tab to
 * the matching `Phase*` renderer. Owns the document fetch via
 * `useRunDocuments` so each child renderer stays purely presentational.
 *
 * Loading + empty + error states are owned here so the per-phase
 * components don't repeat the same skeleton in six places.
 */

import { AlertTriangle, FileX2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useRunDocuments } from "@/hooks/use-run-documents";

import { CiPhase } from "./ci-phase";
import { ImplementPhase } from "./implement-phase";
import { PlanPhase } from "./plan-phase";
import { PrPhase } from "./pr-phase";
import { ReviewPhase } from "./review-phase";
import { SpecPhase } from "./spec-phase";

export interface PhaseContentProps {
  runId: string;
  /** Active phase key — one of `spec | plan | implement | review | ci | pr`
   *  for the Implement track. The hook fetches the latest document for the
   *  raw key. */
  activePhase: string;
}

export function PhaseContent({ runId, activePhase }: PhaseContentProps) {
  const { document, isLoading, error } = useRunDocuments(runId, activePhase);

  if (isLoading) {
    return (
      <Card aria-busy="true" aria-label={`Loading ${activePhase} phase`}>
        <Stack gap="3">
          <div className="h-5 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-3 w-11/12 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <Cluster gap="2" align="center">
          <AlertTriangle className="size-4 text-[var(--danger)]" />
          <span className="text-sm text-[var(--danger)]">{error}</span>
        </Cluster>
      </Card>
    );
  }

  if (!document) {
    return (
      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <FileX2 className="size-4 text-[var(--text-muted)]" />
            <span className="text-sm font-semibold">No artifact yet</span>
          </Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            Athena hasn&apos;t produced a document for this phase yet. It will appear here once the agent completes the step.
          </p>
        </Stack>
      </Card>
    );
  }

  // Map the tab key to the right renderer. The `implement` tab covers
  // every `implement.*` family except `implement.review` which the
  // Review tab handles.
  switch (activePhase) {
    case "spec":
      return <SpecPhase runId={runId} document={document} />;
    case "plan":
      return <PlanPhase runId={runId} document={document} />;
    case "implement":
      return <ImplementPhase runId={runId} document={document} />;
    case "review":
      return <ReviewPhase runId={runId} document={document} />;
    case "ci":
      return <CiPhase runId={runId} document={document} />;
    case "pr":
      return <PrPhase runId={runId} document={document} />;
    default:
      return (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">
            No renderer registered for phase {activePhase}.
          </p>
        </Card>
      );
  }
}
