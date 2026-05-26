"use client";

/**
 * OwlAvatar — compact inline owl glyph used wherever Athena acts as an
 * actor (activity feed, decisions rail, inbox, chat, comments).
 *
 * Ported pixel-accurate from mock-v2/index.html, plus the eye-blink +
 * pupil-look animation defined in app/globals.css.
 *
 * Mood is the canonical ``Mood`` from ``lib/stores/mascot.ts`` (closed
 * 8-value set — `idle | reading | thinking | writing | working |
 * waiting | happy | focused`). The owl renders three explicit SVG
 * accent treatments; the remaining 5 moods render the neutral glyph:
 *   - happy     — open eyes + sparkle dots
 *   - thinking  — slightly narrowed eyes + thinking dot
 *   - focused   — wide pupils, no sparkle
 *   - others    — neutral default
 *
 * Defaults to "happy". The mood set is closed by design (no sad
 * emotions) — see athena-docs UX standard §7 and CLAUDE.md.
 */

import { cn } from "@/lib/cn";
import type { Mood } from "@/lib/stores/mascot";

/** Re-exported as ``OwlMood`` for callers that imported the old name. */
export type OwlMood = Mood;

interface OwlAvatarProps {
  size?: number | undefined;
  mood?: OwlMood | undefined;
  className?: string | undefined;
  /** When true, suppresses the auto eye-blink + look animation (useful inside lists with many owls). */
  static?: boolean | undefined;
}

export function OwlAvatar({ size = 24, mood = "happy", className, static: isStatic = false }: OwlAvatarProps) {
  // Each instance needs unique gradient ids so multiple owls don't share a fill.
  const uid = `${size}-${mood}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <span
      aria-hidden="true"
      data-mood={mood}
      className={cn("athena-owl inline-flex shrink-0 select-none items-center justify-center", isStatic && "athena-owl-static", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 60 60" width={size} height={size}>
        <defs>
          <linearGradient id={`owlBody-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand-1, var(--primary))" />
            <stop offset="1" stopColor="var(--brand-2, var(--ring))" />
          </linearGradient>
          <linearGradient id={`owlChest-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(98% 0.02 280)" />
            <stop offset="1" stopColor="oklch(94% 0.04 270)" />
          </linearGradient>
        </defs>
        {/* ear tufts */}
        <path d="M14 16 L18 6 L23 16 Z" fill={`url(#owlBody-${uid})`} />
        <path d="M46 16 L42 6 L37 16 Z" fill={`url(#owlBody-${uid})`} />
        {/* body */}
        <ellipse cx="30" cy="34" rx="22" ry="22" fill={`url(#owlBody-${uid})`} />
        {/* chest */}
        <ellipse cx="30" cy="40" rx="14" ry="14" fill={`url(#owlChest-${uid})`} />
        {/* eye whites */}
        <circle className="owl-eye-white" cx="21" cy="28" r="7" fill="#fff" />
        <circle className="owl-eye-white" cx="39" cy="28" r="7" fill="#fff" />
        {/* pupils */}
        <circle className="owl-pupil owl-pupil-l" cx={mood === "focused" ? 21 : 22} cy="28" r={mood === "focused" ? 3.5 : 3} fill="#1a1a3e" />
        <circle className="owl-pupil owl-pupil-r" cx={mood === "focused" ? 39 : 40} cy="28" r={mood === "focused" ? 3.5 : 3} fill="#1a1a3e" />
        {/* eye sparkle */}
        {mood !== "focused" && <>
          <circle cx="23" cy="27" r="1" fill="#fff" />
          <circle cx="41" cy="27" r="1" fill="#fff" />
        </>}
        {/* beak */}
        <path d="M27 35 L30 41 L33 35 Z" fill="oklch(72% 0.18 50)" />
        {/* cheeks */}
        <circle cx="17" cy="36" r="2.5" fill="oklch(75% 0.15 10)" opacity="0.6" />
        <circle cx="43" cy="36" r="2.5" fill="oklch(75% 0.15 10)" opacity="0.6" />
        {/* wings */}
        <path d="M9 38 Q5 45 11 52" stroke={`url(#owlBody-${uid})`} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M51 38 Q55 45 49 52" stroke={`url(#owlBody-${uid})`} strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* feet */}
        <path d="M24 55 L24 57 M27 55 L27 57 M30 55 L30 57 M33 55 L33 57 M36 55 L36 57" stroke="oklch(72% 0.18 50)" strokeWidth="1.4" strokeLinecap="round" />
        {/* mood accents — explicit treatments for happy / thinking /
         * focused. Other canonical moods (idle / reading / writing /
         * working / waiting) render the neutral default glyph above. */}
        {mood === "thinking" && (
          <g>
            <circle cx="50" cy="14" r="1.5" fill="var(--text-muted)" />
            <circle cx="54" cy="11" r="1"   fill="var(--text-muted)" />
            <circle cx="57" cy="9"  r="0.7" fill="var(--text-muted)" />
          </g>
        )}
        {mood === "happy" && (
          <>
            <circle cx="6"  cy="20" r="1" fill="oklch(85% 0.18 80)" />
            <circle cx="54" cy="20" r="1" fill="oklch(85% 0.18 80)" />
          </>
        )}
      </svg>
    </span>
  );
}
