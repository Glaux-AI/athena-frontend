"use client";

/**
 * ConfidenceBadge - a small, subtle ring showing how confident Athena is in the
 * artifact it produced (a task-stage deliverable or a chat answer). The AI
 * self-assesses a 0-1 score + a one-line reason when it finalizes; this renders
 * the score as a percentage inside a thin colored ring in the corner, and
 * reveals the reason in a popover on click.
 *
 * Kept deliberately quiet (70% opacity until hover/focus) so it reads as a
 * glance-able signal, not a callout. Renders NOTHING when there is no score
 * (human-authored artifacts, older messages) - absence is honest.
 *
 * Tokens-only: high/medium/low map to the semantic success/warning/danger
 * `-soft`/`-ink` pairs (never a bare solid on a soft tint - see the AA token
 * rule), so it's correct in both themes.
 */

import { useId } from "react";
import * as Popover from "@radix-ui/react-popover";

import { cn } from "@/lib/cn";

type Level = "high" | "medium" | "low";

function levelFor(score: number): Level {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

const LEVEL: Record<Level, { stroke: string; text: string; chip: string; label: string }> = {
  high: {
    stroke: "stroke-[var(--success-ink)]",
    text: "text-[var(--success-ink)]",
    chip: "bg-[var(--success-soft)] text-[var(--success-ink)]",
    label: "High confidence",
  },
  medium: {
    stroke: "stroke-[var(--warning-ink)]",
    text: "text-[var(--warning-ink)]",
    chip: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    label: "Medium confidence",
  },
  low: {
    stroke: "stroke-[var(--danger-ink)]",
    text: "text-[var(--danger-ink)]",
    chip: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    label: "Low confidence",
  },
};

// SVG ring geometry (36x36 viewBox, scaled to `size`); r picked so a 3-wide
// stroke sits fully inside the box.
const RING_R = 15.5;
const RING_C = 2 * Math.PI * RING_R;

export function ConfidenceBadge({
  score,
  reason,
  size = 26,
  className,
}: {
  /** 0-1; renders nothing when null/undefined/NaN. */
  score: number | null | undefined;
  /** One-line explanation revealed on click. */
  reason?: string | null | undefined;
  /** Outer diameter in px. */
  size?: number;
  className?: string;
}) {
  const labelId = useId();
  if (score == null || Number.isNaN(score)) return null;

  const clamped = Math.max(0, Math.min(1, score));
  const pct = Math.round(clamped * 100);
  const styles = LEVEL[levelFor(clamped)];
  const detail = reason?.trim()
    ? reason
    : "Athena's self-assessed certainty in this result.";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${styles.label}, ${pct} percent. Open for the reason.`}
          className={cn(
            "group relative inline-flex shrink-0 items-center justify-center rounded-full",
            "opacity-70 transition-opacity duration-150 hover:opacity-100",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            "data-[state=open]:opacity-100",
            className,
          )}
          style={{ width: size, height: size }}
        >
          <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden className="-rotate-90">
            <circle cx="18" cy="18" r={RING_R} fill="none" strokeWidth="3" className="stroke-[var(--border)]" />
            <circle
              cx="18"
              cy="18"
              r={RING_R}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(RING_C * clamped).toFixed(2)} ${RING_C.toFixed(2)}`}
              className={styles.stroke}
            />
          </svg>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-[9px] font-semibold leading-none tabular-nums",
              styles.text,
            )}
          >
            {pct}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          aria-labelledby={labelId}
          className="glass animate-pop-in z-50 w-[15rem] rounded-xl p-3 shadow-[var(--shadow-3)]"
        >
          <div className="flex flex-col gap-1.5">
            <span
              id={labelId}
              className={cn(
                "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                styles.chip,
              )}
            >
              {styles.label} · {pct}%
            </span>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{detail}</p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
