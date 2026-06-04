"use client";

/**
 * OwlAvatar — prop-driven Sophia, used wherever Athena acts as an actor
 * (activity feed, decisions rail, inbox, chat, comments) and on the
 * marketing / login / signup / onboarding heroes.
 *
 * This renders the exact same <OwlGlyph> as the TopBar <Sophia>, so there is
 * a single owl design across the whole app. Mood is the canonical `Mood`
 * (closed 8-value set — `idle | reading | thinking | writing | working |
 * waiting | happy | focused`); every mood renders its full treatment here,
 * identical to the TopBar.
 *
 * `static` freezes the ambient animation loops (for dense lists of owls) —
 * the hover wing-flap still works. The mood set is closed by design (no sad
 * emotions) — see athena-docs UX standard §7 and CLAUDE.md.
 */

import { cn } from "@/lib/cn";
import { OwlGlyph } from "@/components/mascot/owl-glyph";
import type { Mood } from "@/lib/stores/mascot";

/** Re-exported as ``OwlMood`` for callers that imported the old name. */
export type OwlMood = Mood;

interface OwlAvatarProps {
  size?: number | undefined;
  mood?: OwlMood | undefined;
  className?: string | undefined;
  /** When true, suppresses the ambient animation loops (useful inside lists with many owls). The hover wing-flap still works. */
  static?: boolean | undefined;
}

export function OwlAvatar({ size = 24, mood = "happy", className, static: isStatic = false }: OwlAvatarProps) {
  return (
    <span
      aria-hidden="true"
      data-mood={mood}
      data-flap={!isStatic && mood === "working" ? "always" : undefined}
      className={cn("owl inline-flex shrink-0 select-none items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <OwlGlyph mood={mood} interactive={!isStatic} />
    </span>
  );
}
