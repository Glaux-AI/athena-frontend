"use client";

/**
 * SpotlightCard — an elevated surface that tracks the cursor with a soft
 * radial accent glow (UX standard §3.4, "mouse-tracking spotlights").
 *
 * The glow color is the `--glow-accent` token, so it adapts to light + dark.
 * Pointer tracking only updates CSS custom properties (`--spotlight-x/y`) —
 * no React re-render per move. On `prefers-reduced-motion` the opacity
 * transition is neutralized globally; the surface still works as a static
 * card. Reserved for "moment" surfaces (pricing, feature/bento grids,
 * marketing) — not dense data lists.
 */

import { cn } from "@/lib/cn";
import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
} from "react";

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Stronger accent ring + glow on hover (for the featured card in a grid). */
  featured?: boolean;
}

export const SpotlightCard = forwardRef<HTMLDivElement, SpotlightCardProps>(
  ({ className, children, featured = false, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const [active, setActive] = useState(false);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
      const el = innerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--spotlight-x", `${e.clientX - rect.left}px`);
      el.style.setProperty("--spotlight-y", `${e.clientY - rect.top}px`);
    }, []);

    return (
      <div
        ref={setRefs}
        data-spotlight={active ? "on" : "off"}
        onPointerMove={onPointerMove}
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => setActive(false)}
        className={cn(
          "spotlight-surface group relative overflow-hidden rounded-xl border p-6",
          "transition-[box-shadow,border-color,transform] duration-300 ease-out",
          "hover:-translate-y-0.5",
          featured
            ? "border-[var(--border-accent)] bg-[var(--surface)] shadow-[var(--shadow-glow)]"
            : "border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-2)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-3)]",
          className,
        )}
        {...props}
      >
        <span className="spotlight-glow" aria-hidden="true" />
        <div className="relative">{children}</div>
      </div>
    );
  },
);
SpotlightCard.displayName = "SpotlightCard";
