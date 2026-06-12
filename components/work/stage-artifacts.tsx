"use client";

/**
 * StageArtifacts — the selected stage's artifact area with subphase tabs.
 *
 * Stage-merge redesign: a merged stage produces ONE primary artifact (the
 * reviewable deliverable) plus distinct subphase outputs saved mid-run as
 * working artifacts (grounding pack, framing note, research brief, repro
 * note, root cause…). This wrapper renders a small tab row — primary first,
 * then each saved working artifact — and mounts the existing `ArtifactCard`
 * for whichever is selected (versions / provenance / refine all keep
 * working, scoped to that document).
 *
 * With nothing saved yet it renders the same "no artifact yet" hint the
 * cockpit always had; with only the primary it renders the card without a
 * tab row (no chrome when there's no choice).
 */

import { useEffect, useState } from "react";

import type { StageRefineInput, TaskStage } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { ArtifactCard } from "@/components/work/artifact-card";
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
}: {
  taskId: string;
  stage: TaskStage;
  refreshKey?: number | undefined;
  /** Passed through to the PRIMARY design artifact only (DSGN-1 refine). */
  onRefine?: (req: StageRefineInput) => Promise<void>;
}) {
  const tabs = tabsOf(stage);
  const [tabKey, setTabKey] = useState<string>(tabs[0]?.key ?? "primary");
  useEffect(() => {
    // Stage switch (or the primary landing) resets to the deliverable tab.
    setTabKey(tabs[0]?.key ?? "primary");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.stage_key, stage.artifact_id]);

  if (tabs.length === 0) {
    return (
      <Card variant="elevated">
        <p className="text-sm text-[var(--text-muted)]">
          No artifact yet for{" "}
          <span className="font-medium text-[var(--text)]">{stage.title}</span>. Run it with
          Athena or author it yourself below.
        </p>
      </Card>
    );
  }

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
                "rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                t.key === active.key
                  ? "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
              {t.isPrimary && (
                <span className="ml-1 text-[9px] uppercase tracking-wider text-[var(--text-subtle)]">
                  deliverable
                </span>
              )}
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
        {...(refinable ? { onRefine } : {})}
      />
    </div>
  );
}
