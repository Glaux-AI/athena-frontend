"use client";

/**
 * Sophia — the Athena owl mascot, store-driven.
 *
 * Sits beside the wordmark in the TopBar. Mood comes from `useMascotStore`
 * (8 moods, all neutral-to-positive — no sad emotions ever). The owl itself
 * is the shared <OwlGlyph>, so the TopBar mascot and every actor avatar in
 * the app are pixel-for-pixel the same design.
 *
 * See UX design standard §7. Hover flaps both wings (handled by the `.owl`
 * CSS in app/globals.css).
 */

import { useMascotStore } from "@/lib/stores/mascot";
import { OwlGlyph } from "@/components/mascot/owl-glyph";
import { cn } from "@/lib/cn";

interface SophiaProps {
  size?: number;
  className?: string;
}

export function Sophia({ size = 28, className }: SophiaProps) {
  const mood = useMascotStore((s) => s.mood);

  return (
    <span
      aria-hidden="true"
      data-mood={mood}
      data-flap={mood === "working" ? "always" : undefined}
      className={cn(
        "owl inline-flex shrink-0 select-none items-center justify-center transition-all duration-300 ease-out",
        className
      )}
      style={{ width: size, height: size }}
    >
      <OwlGlyph mood={mood} />
    </span>
  );
}
