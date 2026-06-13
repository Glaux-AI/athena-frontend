"use client";

/**
 * StageRail - the horizontal stage track at the top of the cockpit.
 *
 * Renders the task's `TaskStage[]` (registry order + each stage's stored FSM
 * state) using the `.phase-rail` / `.phase` / `.phase-status-pill` CSS
 * (globals.css). Status lives in the small ink-coloured label - settled chips
 * are neutral containers so the rail reads as one calm strip; only `current`
 * (live head-of-work) and `needsyou` (hard gate awaiting sign-off, amber
 * border) carry colour. A `hard` gate sitting `in_review` reads "Needs your
 * review" and carries a shield marker.
 *
 * Clicking a stage selects it (controlled `selectedStage` / `onSelect`). Locked
 * stages are inert (Athena works each step in order; you gate every one).
 */

import { useRef } from "react";
import {
  CheckCircle2,
  Circle,
  Eye,
  Lock,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

import type { TaskStage } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/** The id the cockpit's stage panel carries - the tablist's tabs point at it
 *  via aria-controls, and the panel is aria-labelledby the selected tab. */
export const STAGE_PANEL_ID = "stage-cockpit-panel";

/** Stable per-tab id so aria-controls / aria-labelledby can pair tab↔panel. */
export function stageTabId(stageKey: string): string {
  return `stage-tab-${stageKey}`;
}

/** The `.phase-status-pill` variants the rail renders (a closed set mirrored in
 *  globals.css). The FSM `TaskStage["status"]` maps onto one of these. */
type RailPillStatus = "idle" | "running" | "needs-review" | "approved" | "blocked";

/** Visual class on the `.phase` chip itself (mirrors the closed set in
 *  globals.css). Exactly one chip is "loud" at a time (VIS-3 focal rule). */
type RailVisual = "done" | "current" | "needsyou" | "blocked" | "ready" | "locked";

const PILL_LABEL: Record<RailPillStatus, string> = {
  idle: "Ready",
  running: "Athena working",
  "needs-review": "Needs your review",
  approved: "Approved",
  blocked: "Blocked",
};

/** Map the stored FSM status onto the rail pill variant. `waiting` (the
 *  clarify checkpoint) rides the needs-review pill styling - same "your
 *  turn" colour - with its own label + question icon. */
function toPillStatus(status: TaskStage["status"]): RailPillStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "running":
      return "running";
    case "in_review":
    case "waiting":
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

/** Map the stored FSM status (+ whether this is the live head-of-work stage)
 *  onto the chip's visual treatment. Only the head-of-work stage - the running
 *  one, or the first ready one - gets the focal `current` look; a hard gate
 *  awaiting sign-off gets the loud `needsyou` look; everything else stays calm. */
function toVisual(status: TaskStage["status"], isHead: boolean): RailVisual {
  switch (status) {
    case "approved":
      return "done";
    case "locked":
      return "locked";
    case "in_review":
    case "waiting":
      return "needsyou";
    case "failed":
    case "rejected":
      return "blocked";
    case "running":
      return "current";
    case "ready":
      return isHead ? "current" : "ready";
    default:
      return "ready";
  }
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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Arrow-key roving across SELECTABLE (non-locked) tabs, per the ARIA tabs
  // pattern - locked stages are announced (aria-disabled) but skipped in nav.
  const selectableKeys = stages
    .filter((s) => s.status !== "locked")
    .map((s) => s.stage_key);
  // The head-of-work stage - the first one not yet approved (registry order).
  // Only this chip wears the focal `current` look so the rail answers "which
  // step is live, right now" with a single glance.
  const headKey = stages.find((s) => s.status !== "approved")?.stage_key ?? null;
  const moveFocus = (currentKey: string, key: string) => {
    if (selectableKeys.length === 0) return;
    const i = selectableKeys.indexOf(currentKey);
    let next = i;
    if (key === "ArrowRight" || key === "ArrowDown") next = (i + 1) % selectableKeys.length;
    else if (key === "ArrowLeft" || key === "ArrowUp") next = (i - 1 + selectableKeys.length) % selectableKeys.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = selectableKeys.length - 1;
    else return;
    const nextKey = selectableKeys[next];
    if (nextKey) {
      onSelect(nextKey);
      tabRefs.current[nextKey]?.focus();
    }
  };

  return (
    <div className="phase-rail" role="tablist" aria-label="Task stages">
      {stages.map((stage) => {
        const pill = toPillStatus(stage.status);
        const visual = toVisual(stage.status, stage.stage_key === headKey);
        const isSelected = stage.stage_key === selectedStage;
        const isLocked = stage.status === "locked";
        // A hard gate awaiting human sign-off is the attention state.
        const needsSignoff = stage.gate === "hard" && stage.status === "in_review";
        // The clarify checkpoint - Athena paused on batched questions.
        const isWaiting = stage.status === "waiting";
        // External executor (a coding agent over MCP) - name it instead of
        // "Athena working" so the user sees WHO is on the stage, live.
        const runningLabel =
          stage.executor_kind === "external" && stage.executor_label
            ? `${stage.executor_label} working`
            : PILL_LABEL.running;

        return (
          <button
            key={stage.stage_key}
            ref={(el) => {
              tabRefs.current[stage.stage_key] = el;
            }}
            type="button"
            role="tab"
            id={stageTabId(stage.stage_key)}
            aria-controls={STAGE_PANEL_ID}
            aria-selected={isSelected}
            aria-disabled={isLocked || undefined}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => !isLocked && onSelect(stage.stage_key)}
            onKeyDown={(e) => {
              if (
                ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
              ) {
                e.preventDefault();
                moveFocus(stage.stage_key, e.key);
              }
            }}
            className={cn("phase", visual, isSelected && "selected", isLocked && "cursor-not-allowed")}
            title={
              needsSignoff
                ? `${stage.title} - a human gate is open; your sign-off is needed`
                : isWaiting
                  ? `${stage.title} - Athena asked you questions; answer to resume`
                  : stage.title
            }
          >
            <div className="phase-num">{String(stage.ordinal).padStart(2, "0")}</div>
            <div className="phase-name">{stage.title}</div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={cn("phase-status-pill", `s-${pill}`)}>
                {pill === "approved" && <CheckCircle2 className="size-3" />}
                {pill === "running" && <Sparkles className="size-3" />}
                {pill === "needs-review" &&
                  (isWaiting ? (
                    <MessageCircleQuestion className="size-3" />
                  ) : (
                    <Eye className="size-3" />
                  ))}
                {pill === "blocked" && <XCircle className="size-3" />}
                {pill === "idle" && (isLocked ? <Lock className="size-3" /> : <Circle className="size-3" />)}
                {isLocked
                  ? "Locked"
                  : isWaiting
                    ? "Needs your answers"
                    : pill === "running"
                      ? runningLabel
                      : PILL_LABEL[pill]}
              </span>
              {needsSignoff && (
                <ShieldCheck
                  className="size-3.5 text-[var(--warning-ink)]"
                  aria-hidden
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
