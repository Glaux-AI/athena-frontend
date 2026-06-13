/**
 * Card - the standard surface for content. See UX standard §16 for the
 * reference composition.
 *
 * `variant` (default `"default"`) selects the depth treatment (UX standard
 * §3.4–§3.5). The default variant is unchanged from the original Card so
 * every existing call site renders identically:
 *   - default  · flat surface, 1-layer → 2-layer shadow on hover (calm; for dense surfaces)
 *   - elevated · raised surface, deeper multi-layer shadow (panels, mock UIs)
 *   - glass    · frosted translucent surface + backdrop blur (overlays, "moments")
 *   - gradient · faint accent wash + glow-on-hover (featured / hero cards)
 */

import { cn } from "@/lib/cn";
import { type HTMLAttributes, forwardRef } from "react";

type CardVariant = "default" | "elevated" | "glass" | "gradient";

const CARD_VARIANTS: Record<CardVariant, string> = {
  default:
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)]",
  elevated:
    "rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-2)] hover:shadow-[var(--shadow-3)]",
  glass:
    "glass rounded-xl shadow-[var(--shadow-2)]",
  gradient:
    "card-gradient rounded-xl border border-[var(--border)] shadow-[var(--shadow-2)] hover:shadow-[var(--shadow-glow)] hover:border-[var(--border-accent)]",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "p-4 transition-shadow duration-200 ease-out",
        CARD_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mb-3 flex flex-col gap-1", className)} {...props} />
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
