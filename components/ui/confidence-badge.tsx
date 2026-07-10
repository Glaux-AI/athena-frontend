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

import { useId, type CSSProperties } from "react";
import * as Popover from "@radix-ui/react-popover";

import { Pill, type PillTone } from "@/components/ui/pill";
import { cn } from "@/lib/cn";

type Level = "high" | "medium" | "low";

function levelFor(score: number): Level {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

const LEVEL: Record<Level, { text: string; tone: PillTone; label: string }> = {
  high: {
    text: "text-[var(--success-ink)]",
    tone: "success",
    label: "High confidence",
  },
  medium: {
    text: "text-[var(--warning-ink)]",
    tone: "warning",
    label: "Medium confidence",
  },
  low: {
    text: "text-[var(--danger-ink)]",
    tone: "danger",
    label: "Low confidence",
  },
};

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
          <span
            aria-hidden
            className="orbit-ring absolute inset-0"
            style={{ "--orbit-value": pct } as CSSProperties}
          />
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-micro font-semibold leading-none tabular-nums",
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
          collisionPadding={12}
          aria-labelledby={labelId}
          className={cn(
            "glass-panel animate-pop-in z-[var(--z-popover)] flex w-[15rem] flex-col gap-1.5 p-3",
            // Never let a long reason overflow the viewport and get clipped:
            // cap to the collision-aware space Radix computes and scroll inside.
            "max-h-[var(--radix-popover-content-available-height)]",
          )}
        >
          <Pill id={labelId} tone={styles.tone} size="sm" className="w-fit shrink-0">
            {styles.label} · {pct}%
          </Pill>
          <p className="overflow-y-auto text-xs leading-relaxed text-[var(--text-muted)]">
            {detail}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
