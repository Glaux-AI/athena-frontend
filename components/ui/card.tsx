/**
 * Card - the standard surface, expressed as the Nightglass altitude ladder
 * (UX standard §3.4-§3.5): depth = altitude in a night sky.
 *
 *   - flat     · no border, no shadow - rows INSIDE a card (max-2-borders law)
 *   - default  · calm raised surface (dense surfaces)
 *   - elevated · floating panel, deeper multi-layer shadow
 *   - glass    · frosted instrument (.glass-panel: blur + glint + shadow-3)
 *   - moment   · faint starfield + accent wash - heroes / featured / empties only
 *
 * Hover elevation is OPT-IN via `interactive` - static cards must not imply
 * clickability (the old unconditional hover-lift taught false affordances).
 */

import { cn } from "@/lib/cn";
import { type HTMLAttributes, forwardRef } from "react";

type CardVariant = "flat" | "default" | "elevated" | "glass" | "moment";

const CARD_VARIANTS: Record<CardVariant, string> = {
  flat: "rounded-lg bg-[var(--surface)]",
  default:
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-1)]",
  elevated:
    "rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-2)]",
  glass: "glass-panel rounded-xl",
  moment:
    "card-moment rounded-xl border border-[var(--border)] shadow-[var(--shadow-2)]",
};

const CARD_HOVER: Record<CardVariant, string> = {
  flat: "hover:bg-[var(--surface-2)]",
  default: "hover:shadow-[var(--shadow-2)] hover:border-[var(--border-strong)]",
  elevated: "hover:shadow-[var(--shadow-3)]",
  glass: "hover:bg-[var(--surface-glass-hover)]",
  moment: "hover:shadow-[var(--shadow-glow)] hover:border-[var(--border-accent)]",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** Card is a click target: adds hover elevation feedback. */
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "p-4 transition-shadow duration-200 ease-out",
        CARD_VARIANTS[variant],
        interactive && CARD_HOVER[variant],
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Close the header with a horizon hairline (replaces bespoke border-b rules). */
  rule?: boolean;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, rule = false, children, ...props }, ref) => (
    <div ref={ref} className={cn("mb-3 flex flex-col gap-1", className)} {...props}>
      {children}
      {rule && <hr className="hr-horizon mt-2.5" aria-hidden="true" />}
    </div>
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold leading-snug", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-[var(--text-muted)]", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-4 flex items-center gap-2", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";
