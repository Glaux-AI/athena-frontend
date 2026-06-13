"use client";

/**
 * Button - the single button primitive.
 * Variants: primary | secondary | ghost | destructive.
 * Sizes: sm | md | lg.
 * Loading state built in.
 *
 * `glow` (opt-in) applies the cinematic CTA treatment - accent glow ring +
 * hover shine sweep (UX standard §3.4). Reserve it for the one hero/marketing
 * CTA on "moment" surfaces; per the intensity rule, dense product surfaces use
 * the plain primary button (which already carries a subtle inner highlight).
 */

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium",
    "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
    "active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
    "whitespace-nowrap select-none",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--primary)] text-[var(--primary-fg)] shadow-[var(--inner-highlight)] hover:opacity-90 active:opacity-80",
        // `default` is an alias for `primary` (shadcn convention) so call
        // sites can use either.
        default:
          "bg-[var(--primary)] text-[var(--primary-fg)] shadow-[var(--inner-highlight)] hover:opacity-90 active:opacity-80",
        secondary:
          "border bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)] border-[var(--border)]",
        // `outline` is an alias for `secondary` (shadcn convention).
        outline:
          "border bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)] border-[var(--border)]",
        ghost:
          "bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)]",
        destructive:
          "bg-[var(--danger)] text-[var(--danger-fg)] hover:opacity-90 active:opacity-80",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
  /** Cinematic CTA treatment: accent glow + hover shine. Use sparingly. */
  glow?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, glow = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // When asChild is true, Radix Slot requires exactly one child element.
    // The {loading && <Loader/>} pattern produces an extra (false) child;
    // collapse to a single child in that branch by wrapping in a Fragment.
    const content =
      loading
        ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {children}
          </>
        )
        : children;
    return (
      <Comp
        ref={ref}
        className={cn(
          button({ variant, size }),
          glow && "btn-shine shadow-[var(--shadow-cta)] hover:opacity-100 hover:shadow-[var(--shadow-glow)]",
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);
Button.displayName = "Button";
