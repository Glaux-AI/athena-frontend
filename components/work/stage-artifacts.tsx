"use client";

/**
 * StageArtifacts - the selected stage's artifact area with subphase tabs.
 *
 * Stage-merge redesign: a merged stage produces ONE primary artifact (the
 * reviewable deliverable) plus distinct subphase outputs saved mid-run as
 * working artifacts (grounding pack, framing note, research brief, repro
 * note, root cause…). This wrapper renders a small tab row - primary first,
 * then each saved working artifact - and mounts the existing `ArtifactCard`
 * for whichever is selected (versions / provenance / refine all keep
 * working, scoped to that document).
 *
 * With nothing saved yet it renders nothing (the composer below is the single
 * "what to do next"); with only the primary it renders the card without a tab
 * row (no chrome when there's no choice).
 */

import { useEffect, useState } from "react";

import type { StageRefineInput, TaskStage } from "@/lib/api/client";
import { ArtifactCard } from "@/components/work/artifact-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";

interface ArtifactTab {
  key: string;
  label: string;
  artifactId: string;
  kind: string | null;
  isPrimary: boolean;
}

function tabsOf(stage: TaskStage): ArtifactTab[] {
  const tabs: ArtifactTab[] = [];
  if (stage.artifact_id) {
    tabs.push({
      key: "primary",
      label: (stage.artifact_kind ?? "artifact").replace(/_/g, " "),
      artifactId: stage.artifact_id,
      kind: stage.artifact_kind,
      isPrimary: true,
    });
  }
  for (const w of stage.working_artifacts ?? []) {
    // The primary pointer can lag the kind-keyed documents (manual author);
    // don't show the same document twice.
    if (w.artifact_id === stage.artifact_id) continue;
    tabs.push({
      key: w.kind,
      label: w.kind.replace(/_/g, " "),
      artifactId: w.artifact_id,
      kind: w.kind,
      isPrimary: false,
    });
  }
  return tabs;
}

export function StageArtifacts({
  taskId,
  stage,
  refreshKey,
  onRefine,
  designTokenSetIds,
  /** Downstream stages re-derived when this approved artifact is edited inline -
   *  drives the cascade warning in the editor. */
  downstreamCount = 0,
  /** Called after a successful inline edit so the page re-fetches the stage. */
  onEdited,
}: {
  taskId: string;
  stage: TaskStage;
  refreshKey?: number | undefined;
  /** Passed through to the PRIMARY design artifact only (DSGN-1 refine). */
  onRefine?: (req: StageRefineInput) => Promise<void>;
  /** The design task's assigned design systems (threaded to the studio knobs). */
  designTokenSetIds?: string[];
  downstreamCount?: number;
  onEdited?: () => void | Promise<void>;
}) {
  const tabs = tabsOf(stage);
  const [tabKey, setTabKey] = useState<string>(tabs[0]?.key ?? "primary");
  useEffect(() => {
    // Stage switch (or the primary landing) resets to the deliverable tab.
    setTabKey(tabs[0]?.key ?? "primary");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.stage_key, stage.artifact_id]);

  // No artifact yet → render nothing. The composer below is the single, clear
  // "run it or do it yourself" - no filler hint competing with it.
  if (tabs.length === 0) return null;

  const active = tabs.find((t) => t.key === tabKey) ?? tabs[0]!;
  const refinable =
    active.isPrimary && Boolean(active.kind?.startsWith("design")) && onRefine;

  return (
    <div className="min-w-0">
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label={`${stage.title} artifacts`}
          className="mb-2 flex flex-wrap items-center gap-1"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === active.key}
              onClick={() => setTabKey(t.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-micro font-medium capitalize transition-colors",
                focusRing,
                t.key === active.key
                  ? "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
              {t.isPrimary && <Eyebrow className="ml-1">deliverable</Eyebrow>}
            </button>
          ))}
        </div>
      )}
      <ArtifactCard
        key={active.artifactId}
        taskId={taskId}
        artifactId={active.artifactId}
        artifactKind={active.kind}
        stageTitle={active.isPrimary ? stage.title : active.label}
        refreshKey={refreshKey}
        designTokenSetIds={designTokenSetIds ?? []}
        {...(refinable ? { onRefine } : {})}
        {...(active.isPrimary
          ? {
              stageKey: stage.stage_key,
              approved: stage.status === "approved",
              downstreamCount,
              ...(onEdited ? { onEdited } : {}),
            }
          : {})}
      />
    </div>
  );
}
