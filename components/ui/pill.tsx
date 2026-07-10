/**
 * Pill - THE chip/badge primitive (Nightglass §5.1). One recipe replaces the
 * previous parallel systems (globals .pill, bespoke rounded-full chips,
 * per-page status pills).
 *
 * - tone  · semantic color pair (-soft tint + -ink text, AA-guarded)
 * - kind  · soft (default tint) | outline (hairline, transparent) | ink (text only)
 * - size  · sm (20px, 11px text) | md (24px, 12px text) - the ONLY two sizes
 * - dot   · a star-dot in the tone's solid color; `live` makes it twinkle
 *
 * Labels are sentence-case. The uppercase micro-label job belongs to
 * <Eyebrow>, never to a Pill.
 */

import { cva, type VariantProps } from "class-variance-authority";
import { type CSSProperties, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Tone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

const DOT_COLOR: Record<Tone, string> = {
  neutral: "var(--text-muted)",
  primary: "var(--primary)",
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

const pill = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "",
        primary: "",
        info: "",
        success: "",
        warning: "",
        danger: "",
      },
      kind: {
        soft: "",
        outline: "border border-[var(--border)] bg-transparent text-[var(--text-muted)]",
        ink: "px-0",
      },
      size: {
        /* Quiet adornment chip (Beta, plan, Deleted, kind kickers). */
        sm: "h-[18px] gap-1 px-1.5 text-micro",
        /* Standard status chip - matches the old TaskStatusPill footprint. */
        md: "h-[22px] px-2 text-xs",
      },
    },
    compoundVariants: [
      { tone: "neutral", kind: "soft", class: "bg-[var(--surface-2)] text-[var(--text-muted)]" },
      { tone: "primary", kind: "soft", class: "bg-[var(--primary-soft)] text-[var(--primary)]" },
      { tone: "info", kind: "soft", class: "bg-[var(--info-soft)] text-[var(--info-ink)]" },
      { tone: "success", kind: "soft", class: "bg-[var(--success-soft)] text-[var(--success-ink)]" },
      { tone: "warning", kind: "soft", class: "bg-[var(--warning-soft)] text-[var(--warning-ink)]" },
      { tone: "danger", kind: "soft", class: "bg-[var(--danger-soft)] text-[var(--danger-ink)]" },
      { tone: "neutral", kind: "ink", class: "text-[var(--text-subtle)]" },
      { tone: "primary", kind: "ink", class: "text-[var(--primary)]" },
      { tone: "info", kind: "ink", class: "text-[var(--info-ink)]" },
      { tone: "success", kind: "ink", class: "text-[var(--success-ink)]" },
      { tone: "warning", kind: "ink", class: "text-[var(--warning-ink)]" },
      { tone: "danger", kind: "ink", class: "text-[var(--danger-ink)]" },
    ],
    defaultVariants: { tone: "neutral", kind: "soft", size: "md" },
  },
);

export interface PillProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pill> {
  /** Render a star-dot in the tone's solid color. */
  dot?: boolean;
  /** Twinkle the dot (live/running states). Implies `dot`. */
  live?: boolean;
}

export function Pill({
  tone,
  kind,
  size,
  dot,
  live,
  className,
  children,
  ...props
}: PillProps) {
  const showDot = dot || live;
  return (
    <span className={cn(pill({ tone, kind, size }), className)} {...props}>
      {showDot && (
        <span
          className={cn("star-dot", live && "is-live")}
          style={{ "--dot-color": DOT_COLOR[tone ?? "neutral"] } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export type { Tone as PillTone };
