"use client";

/**
 * StageRail — the horizontal stage track at the top of the cockpit.
 *
 * Renders the task's `TaskStage[]` (registry order + each stage's stored FSM
 * state) using the existing `.phase-rail` / `.phase` / `.phase-status-pill`
 * CSS (ported pixel-accurately from the run phase rail; see globals.css). Each
 * stage's FSM `status` maps onto the chip's visual (`.done/.active/.locked/
 * .selected`) + its status pill (`s-idle/s-running/s-needs-review/s-approved/
 * s-blocked`). A `hard` gate sitting `in_review` is the one that needs your
 * sign-off — it reads "Needs your review" and carries a lock-gate marker.
 *
 * Clicking a stage selects it (controlled `selectedStage` / `onSelect`). Locked
 * stages are inert (Athena works each step in order; you gate every one).
 */

import {
  CheckCircle2,
  Circle,
  Eye,
  Lock,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

import type { TaskStage } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/** The `.phase-status-pill` variants the rail renders (a closed set mirrored in
 *  globals.css). The FSM `TaskStage["status"]` maps onto one of these. */
type RailPillStatus = "idle" | "running" | "needs-review" | "approved" | "blocked";

/** Visual class on the `.phase` chip itself. */
type RailVisual = "done" | "active" | "locked";

const PILL_LABEL: Record<RailPillStatus, string> = {
  idle: "Ready",
  running: "Athena working",
  "needs-review": "Needs your review",
  approved: "Approved",
  blocked: "Blocked",
};

/** Map the stored FSM status onto the rail pill variant. */
function toPillStatus(status: TaskStage["status"]): RailPillStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "running":
      return "running";
    case "in_review":
      return "needs-review";
    case "rejected":
    case "failed":
      return "blocked";
    case "ready":
    case "locked":
    default:
      return "idle";
  }
}

/** Map the stored FSM status onto the chip's visual treatment. */
function toVisual(status: TaskStage["status"]): RailVisual {
  if (status === "approved") return "done";
  if (status === "locked") return "locked";
  return "active";
}

export function StageRail({
  stages,
  selectedStage,
  onSelect,
}: {
  stages: TaskStage[];
  /** The `stage_key` of the currently-selected stage (controlled). */
  selectedStage: string | null;
  onSelect: (stageKey: string) => void;
}) {
  return (
    <div className="phase-rail" role="tablist" aria-label="Task stages">
      {stages.map((stage) => {
        const pill = toPillStatus(stage.status);
        const visual = toVisual(stage.status);
        const isSelected = stage.stage_key === selectedStage;
        const isLocked = stage.status === "locked";
        // A hard gate awaiting human sign-off is the attention state.
        const needsSignoff = stage.gate === "hard" && stage.status === "in_review";

        return (
          <button
            key={stage.stage_key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={isLocked}
            onClick={() => onSelect(stage.stage_key)}
            className={cn("phase", visual, isSelected && "selected")}
            style={{ ["--w" as string]: stage.status === "approved" ? "100%" : "0%" }}
            title={
              needsSignoff
                ? `${stage.title} — a human gate is open; your sign-off is needed`
                : stage.title
            }
          >
            <div className="phase-num">{String(stage.ordinal).padStart(2, "0")}</div>
            <div className="phase-name">{stage.title}</div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={cn("phase-status-pill", `s-${pill}`)}>
                {pill === "approved" && <CheckCircle2 className="size-3" />}
                {pill === "running" && <Sparkles className="size-3" />}
                {pill === "needs-review" && <Eye className="size-3" />}
                {pill === "blocked" && <XCircle className="size-3" />}
                {pill === "idle" && (isLocked ? <Lock className="size-3" /> : <Circle className="size-3" />)}
                {isLocked ? "Locked" : PILL_LABEL[pill]}
              </span>
              {needsSignoff && (
                <ShieldCheck
                  className="size-3.5 text-[var(--warning-ink)]"
                  aria-hidden
                />
              )}
            </div>
            <div className="phase-progress" />
          </button>
        );
      })}
    </div>
  );
}
