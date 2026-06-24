"use client";

/**
 * ScreenReadingGlow - the full-viewport edge glow that signals "Athena is
 * reading this screen" while the page-aware chat FAB captures the page and
 * works the turn.
 *
 * A single fixed, non-interactive overlay (the page stays fully usable
 * underneath). `active` fades the glow in for the whole turn; `reading` adds
 * the brief, brighter scan beat at the very start, while the snapshot is being
 * taken. All motion is token-driven and collapses to a calm static glow under
 * `prefers-reduced-motion` (the global rule in styles/tokens.css). The styles
 * live in app/globals.css (`.athena-reading-glow`) per the Tailwind-v4 no-config
 * rule - custom keyframes never load from tailwind.config.ts here.
 */

import { cn } from "@/lib/cn";

export function ScreenReadingGlow({
  active,
  reading = false,
}: {
  active: boolean;
  reading?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "athena-reading-glow",
        active && "is-active",
        reading && "is-reading",
      )}
    />
  );
}
