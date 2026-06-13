"use client";

/**
 * OwlGlyph - the single source of truth for Sophia, the Athena owl.
 *
 * ONE design, drawn once, used everywhere:
 *   - <Sophia>      - store-driven, lives beside the wordmark in the TopBar.
 *   - <OwlAvatar>   - prop-driven, the "Athena acted here" actor avatar in
 *                     activity / decisions / chat / runs, plus the marketing,
 *                     login, signup and onboarding hero placements.
 *
 * Eight moods, all neutral-to-positive (no sad emotions ever - see UX design
 * standard §7 and CLAUDE.md). The SVG is inline and fully token-driven
 * (`--sophia-*` in styles/tokens.css), so it adapts to light + dark with no
 * hardcoded colors.
 *
 * Each mood has a bespoke, character-animated performance (defined in
 * app/globals.css; see the `.animate-sophia-*` block there):
 *   - idle     - calm breathing + natural double-blink
 *   - reading  - leans into the page, eyes saccade across the line, book bobs
 *   - thinking - holds a pondering head-tilt, thought bubbles rise & fade
 *   - writing  - rhythmic writing-nod, quill scribbles, blinks
 *   - working  - busy energetic bounce, wings beating
 *   - waiting  - patient sway, eyes glancing around, halo pulsing
 *   - happy    - joyful squash-&-stretch hop, ears bounce, wings flutter, sparkles
 *   - focused  - intent lock-on lean + pulse, alert badge
 *
 * Motion:
 *   - `interactive` (default) runs the ambient performance above.
 *   - `interactive={false}` (static, for dense lists) freezes the loops so a
 *     screen full of owls stays calm - the hover wing-flap still works.
 *   - **Hover always flaps both wings**, in every mood. All motion is
 *     neutralized under `prefers-reduced-motion` (global rule in tokens.css).
 *
 * Visual reference: steel-blue plumage, cream facial discs, big kawaii eyes
 * with sparkle highlights, soft pink cheeks, small downward beak, rounded
 * ear tufts, plump body with feather chevrons, Y-shaped talons.
 */

import type { ReactNode } from "react";

import type { Mood } from "@/lib/stores/mascot";

interface OwlGlyphProps {
  mood: Mood;
  /** When false, the looping ambient animations are suppressed (hover-flap still works). */
  interactive?: boolean;
}

export function OwlGlyph({ mood, interactive = true }: OwlGlyphProps) {
  // Gate every looping animation behind `interactive` so dense lists stay calm.
  // The hover wing-flap is CSS-only (`.owl:hover`) and intentionally NOT gated.
  const on = (cls: string) => (interactive ? cls : "");

  // Whole-body performance - one bespoke animation per mood.
  const bodyAnim = on(
    mood === "happy"
      ? "animate-sophia-hop"
      : mood === "thinking"
      ? "animate-sophia-think"
      : mood === "working"
      ? "animate-sophia-work"
      : mood === "waiting"
      ? "animate-sophia-wait"
      : mood === "focused"
      ? "animate-sophia-focus"
      : mood === "reading"
      ? "animate-sophia-read"
      : mood === "writing"
      ? "animate-sophia-write"
      : "animate-sophia-idle",
  );

  // Ear tufts get a little excited bounce on happy (secondary motion).
  const earL = mood === "happy" ? on("animate-sophia-ear-l") : "";
  const earR = mood === "happy" ? on("animate-sophia-ear-r") : "";

  return (
    <svg
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      {/* Waiting halo - sits behind everything, pulsing about its own centre */}
      {mood === "waiting" && (
        <circle
          cx="32"
          cy="34"
          r="29"
          fill="none"
          stroke="var(--sophia-halo)"
          strokeWidth="2"
          className={on("animate-sophia-halo")}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        />
      )}

      {/* Body group carries the whole-body performance; pivots at the feet
          (50% 100%) so rocks/squash read naturally. */}
      <g className={bodyAnim} style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}>
        {/* Ear tufts (rounded - cute, not pointy), each hinged at its base. */}
        <g className={earL} style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}>
          <path d="M 14 14 Q 12 5 17 3 Q 20 8 20 13 Z" fill="var(--sophia-body)" />
        </g>
        <g className={earR} style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}>
          <path d="M 50 14 Q 52 5 47 3 Q 44 8 44 13 Z" fill="var(--sophia-body)" />
        </g>

        {/* Main body - single rounded "egg" shape (head merged with torso) */}
        <ellipse cx="32" cy="34" rx="22" ry="24" fill="var(--sophia-body)" />

        {/* Wings - always flap-ready groups, hinged at the shoulder. Flutter on
            happy; flap on hover / while working. Drawn before the belly + discs
            so the face stays on top. */}
        <Wings mood={mood} interactive={interactive} />

        {/* Belly with feather chevrons */}
        <ellipse cx="32" cy="44" rx="14" ry="13" fill="var(--sophia-disc)" />
        {mood !== "happy" && (
          <>
            <path
              d="M 28 42 L 30 44 L 32 42"
              stroke="var(--sophia-belly-mark)"
              strokeWidth="0.7"
              fill="none"
              opacity="0.55"
            />
            <path
              d="M 32 46 L 34 48 L 36 46"
              stroke="var(--sophia-belly-mark)"
              strokeWidth="0.7"
              fill="none"
              opacity="0.55"
            />
          </>
        )}

        {/* Facial discs - signature owl feature */}
        <circle cx="22" cy="26" r="11" fill="var(--sophia-disc)" />
        <circle cx="42" cy="26" r="11" fill="var(--sophia-disc)" />
        <circle cx="22" cy="26" r="11" fill="none" stroke="var(--sophia-disc-rim)" strokeWidth="0.5" opacity="0.45" />
        <circle cx="42" cy="26" r="11" fill="none" stroke="var(--sophia-disc-rim)" strokeWidth="0.5" opacity="0.45" />

        {/* Eyes - shape + animation vary by mood */}
        <Eyes mood={mood} interactive={interactive} />

        {/* Glasses - focused mood studies through specs (sits over the eyes) */}
        {mood === "focused" && <Glasses />}

        {/* Beak - small downward triangle between the discs */}
        <path
          d="M 30 32 L 34 32 L 32 36 Z"
          fill="var(--sophia-beak)"
          stroke="var(--sophia-beak-deep)"
          strokeWidth="0.4"
          strokeLinejoin="round"
        />

        {/* Cheeks - extra blushy on happy */}
        <Cheeks mood={mood} />

        {/* Talons - small Y-shapes at the bottom */}
        <g stroke="var(--sophia-beak)" strokeWidth="1.4" strokeLinecap="round" fill="none">
          <line x1="26" y1="57" x2="26" y2="60" />
          <line x1="24" y1="60" x2="26" y2="60" />
          <line x1="26" y1="60" x2="28" y2="60" />
          <line x1="38" y1="57" x2="38" y2="60" />
          <line x1="36" y1="60" x2="38" y2="60" />
          <line x1="38" y1="60" x2="40" y2="60" />
        </g>
      </g>

      {/* Floating accents (outside the body group so the body performance
          doesn't drag them around) */}
      <Accent mood={mood} interactive={interactive} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Mood-specific parts                                                         */
/* -------------------------------------------------------------------------- */

function Wings({ mood, interactive }: { mood: Mood; interactive: boolean }) {
  const leftPath = "M 15 31 Q 5 35 7 47 Q 11 49 14 44 Q 15 38 15 31 Z";
  const rightPath = "M 49 31 Q 59 35 57 47 Q 53 49 50 44 Q 49 38 49 31 Z";
  const flutter = interactive && mood === "happy";
  return (
    <>
      <g
        className={`owl-wing owl-wing-l ${flutter ? "animate-sophia-flutter-l" : ""}`}
        style={{ transformBox: "fill-box", transformOrigin: "100% 0%" }}
      >
        <path d={leftPath} fill="var(--sophia-body-deep)" />
      </g>
      <g
        className={`owl-wing owl-wing-r ${flutter ? "animate-sophia-flutter-r" : ""}`}
        style={{ transformBox: "fill-box", transformOrigin: "0% 0%" }}
      >
        <path d={rightPath} fill="var(--sophia-body-deep)" />
      </g>
    </>
  );
}

function Eyes({ mood, interactive }: { mood: Mood; interactive: boolean }) {
  // The whole eye cluster animates as a group: blink (squish), scan (saccade)
  // or look-around (dart), depending on mood. fill-box + "center" keeps the
  // blink squishing in place.
  const eyeAnim = !interactive
    ? ""
    : mood === "idle"
    ? "animate-sophia-blink-double"
    : mood === "writing" || mood === "working"
    ? "animate-sophia-blink"
    : mood === "reading"
    ? "animate-sophia-scan"
    : mood === "waiting"
    ? "animate-sophia-look"
    : "";

  const wrap = (children: ReactNode) => (
    <g className={eyeAnim} style={{ transformOrigin: "center", transformBox: "fill-box" }}>
      {children}
    </g>
  );

  switch (mood) {
    case "happy":
      return wrap(
        <>
          <path d="M 16 28 Q 22 22 28 28" stroke="var(--sophia-eye)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M 36 28 Q 42 22 48 28" stroke="var(--sophia-eye)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>,
      );

    case "thinking":
      return wrap(
        <>
          <path d="M 16 27 Q 22 23 28 27" stroke="var(--sophia-eye)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M 36 27 Q 42 23 48 27" stroke="var(--sophia-eye)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>,
      );

    case "reading":
      return wrap(
        <>
          <ellipse cx="22" cy="29" rx="5.5" ry="4" fill="var(--sophia-eye)" />
          <ellipse cx="42" cy="29" rx="5.5" ry="4" fill="var(--sophia-eye)" />
          <circle cx="23" cy="28" r="1.6" fill="var(--sophia-eye-shine)" />
          <circle cx="43" cy="28" r="1.6" fill="var(--sophia-eye-shine)" />
        </>,
      );

    case "waiting":
      return wrap(
        <>
          <circle cx="22" cy="24" r="6" fill="var(--sophia-eye)" />
          <circle cx="42" cy="24" r="6" fill="var(--sophia-eye)" />
          <circle cx="24" cy="22" r="2.3" fill="var(--sophia-eye-shine)" />
          <circle cx="44" cy="22" r="2.3" fill="var(--sophia-eye-shine)" />
          <circle cx="20" cy="26" r="1" fill="var(--sophia-eye-shine)" opacity="0.8" />
          <circle cx="40" cy="26" r="1" fill="var(--sophia-eye-shine)" opacity="0.8" />
        </>,
      );

    case "focused":
      return wrap(
        <>
          <circle cx="22" cy="27" r="7.5" fill="var(--sophia-eye)" />
          <circle cx="42" cy="27" r="7.5" fill="var(--sophia-eye)" />
          <circle cx="24.5" cy="24.5" r="2.6" fill="var(--sophia-eye-shine)" />
          <circle cx="44.5" cy="24.5" r="2.6" fill="var(--sophia-eye-shine)" />
          <circle cx="19" cy="29" r="1.2" fill="var(--sophia-eye-shine)" opacity="0.85" />
          <circle cx="39" cy="29" r="1.2" fill="var(--sophia-eye-shine)" opacity="0.85" />
        </>,
      );

    case "working":
    case "idle":
    case "writing":
    default:
      return wrap(
        <>
          <circle cx="22" cy="27" r="6" fill="var(--sophia-eye)" />
          <circle cx="42" cy="27" r="6" fill="var(--sophia-eye)" />
          <circle cx="24" cy="25" r="2" fill="var(--sophia-eye-shine)" />
          <circle cx="44" cy="25" r="2" fill="var(--sophia-eye-shine)" />
          <circle cx="20" cy="29" r="0.9" fill="var(--sophia-eye-shine)" opacity="0.7" />
          <circle cx="40" cy="29" r="0.9" fill="var(--sophia-eye-shine)" opacity="0.7" />
        </>,
      );
  }
}

function Cheeks({ mood }: { mood: Mood }) {
  // Happy = extra blushy. Working = slightly lower on the face.
  const blushy = mood === "happy";
  const lower = mood === "working";
  const rx = blushy ? 3.2 : 2.6;
  const ry = blushy ? 2.2 : 1.9;
  const opacity = blushy ? 0.85 : 0.6;
  const cy = lower ? 35 : 33;
  return (
    <>
      <ellipse cx="12" cy={cy} rx={rx} ry={ry} fill="var(--sophia-cheek)" opacity={opacity} />
      <ellipse cx="52" cy={cy} rx={rx} ry={ry} fill="var(--sophia-cheek)" opacity={opacity} />
    </>
  );
}

function Accent({ mood, interactive }: { mood: Mood; interactive: boolean }) {
  const on = (cls: string) => (interactive ? cls : "");
  switch (mood) {
    case "thinking":
      // Thought bubbles rise + fade in sequence - "thinking…".
      return (
        <>
          <circle cx="50" cy="14" r="1.8" fill="var(--sophia-dot)" className={on("animate-sophia-thought-1")} style={{ transformOrigin: "center", transformBox: "fill-box" }} />
          <circle cx="55" cy="10" r="1.6" fill="var(--sophia-dot)" className={on("animate-sophia-thought-2")} style={{ transformOrigin: "center", transformBox: "fill-box" }} />
          <circle cx="60" cy="6" r="1.4" fill="var(--sophia-dot)" className={on("animate-sophia-thought-3")} style={{ transformOrigin: "center", transformBox: "fill-box" }} />
        </>
      );

    case "writing":
      // A little notepad + a scribbling quill in the lower-right. The notepad
      // sits still; the quill's outer group positions it (SVG transform attr)
      // while the inner group runs the scribble (CSS transform) so the two
      // don't fight.
      return (
        <>
          <g transform="translate(45, 52) rotate(-7)">
            <rect x="-7" y="-6" width="14" height="12" rx="1.2" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="0.6" />
            <line x1="-4.5" y1="-2.8" x2="4.5" y2="-2.8" stroke="var(--text-muted)" strokeWidth="0.7" opacity="0.7" />
            <line x1="-4.5" y1="-0.2" x2="4.5" y2="-0.2" stroke="var(--text-muted)" strokeWidth="0.7" opacity="0.7" />
            <line x1="-4.5" y1="2.4" x2="1.5" y2="2.4" stroke="var(--text-muted)" strokeWidth="0.7" opacity="0.7" />
          </g>
          <g transform="translate(50, 47) rotate(33)">
            <g className={on("animate-sophia-quill")} style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}>
              <path
                d="M 0 0 L -2 -12 Q -3 -16 -1 -18 Q 1 -16 2 -12 L 0 0 Z"
                fill="var(--sophia-cheek)"
                stroke="var(--sophia-beak-deep)"
                strokeWidth="0.4"
              />
              <line x1="0" y1="0" x2="-1" y2="-12" stroke="var(--sophia-beak-deep)" strokeWidth="0.3" opacity="0.6" />
            </g>
          </g>
        </>
      );

    case "reading":
      return (
        <g transform="translate(46, 48) rotate(-10)">
          <g className={on("animate-sophia-book")} style={{ transformOrigin: "center", transformBox: "fill-box" }}>
            <rect x="-6" y="-3" width="12" height="8" rx="0.8" fill="var(--surface-3)" stroke="var(--text-muted)" strokeWidth="0.4" />
            <line x1="0" y1="-3" x2="0" y2="5" stroke="var(--text-muted)" strokeWidth="0.3" />
            <line x1="-4" y1="-0.5" x2="-1" y2="-0.5" stroke="var(--text-muted)" strokeWidth="0.3" />
            <line x1="-4" y1="1.5" x2="-1" y2="1.5" stroke="var(--text-muted)" strokeWidth="0.3" />
            <line x1="1" y1="-0.5" x2="4" y2="-0.5" stroke="var(--text-muted)" strokeWidth="0.3" />
            <line x1="1" y1="1.5" x2="4" y2="1.5" stroke="var(--text-muted)" strokeWidth="0.3" />
          </g>
        </g>
      );

    case "happy":
      // A generous scatter of twinkling glitter around a joyful Sophia.
      return (
        <>
          <Star cx={56} cy={9} s={4.2} fill="var(--sophia-sparkle)" cls={on("animate-sophia-sparkle-1")} />
          <Star cx={8} cy={20} s={2.8} fill="var(--sophia-sparkle)" cls={on("animate-sophia-sparkle-2")} />
          <Star cx={60} cy={38} s={3} fill="var(--sophia-cheek)" cls={on("animate-sophia-sparkle-3")} />
          <Star cx={14} cy={7} s={3.4} fill="var(--sophia-sparkle)" cls={on("animate-sophia-sparkle-4")} />
          <Star cx={50} cy={47} s={2.6} fill="var(--sophia-cheek)" cls={on("animate-sophia-sparkle-5")} />
          <Star cx={32} cy={2} s={2.4} fill="var(--sophia-sparkle)" cls={on("animate-sophia-sparkle-6")} />
          <Star cx={4} cy={36} s={2.4} fill="var(--sophia-cheek)" cls={on("animate-sophia-sparkle-2")} />
          <Star cx={62} cy={22} s={2.2} fill="var(--sophia-sparkle)" cls={on("animate-sophia-sparkle-5")} />
        </>
      );

    case "focused":
      return (
        <g className={on("animate-sophia-alert")} style={{ transformOrigin: "center", transformBox: "fill-box" }}>
          <circle cx="55" cy="11" r="6" fill="var(--sophia-alert-bg)" stroke="var(--sophia-alert-fg)" strokeWidth="1" />
          <line x1="55" y1="8" x2="55" y2="12" stroke="var(--sophia-alert-fg)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="55" cy="14.5" r="0.9" fill="var(--sophia-alert-fg)" />
        </g>
      );

    default:
      return null;
  }
}

/** A 4-point twinkle star centred at (cx, cy) with point-radius `s`. */
function Star({ cx, cy, s, fill, cls }: { cx: number; cy: number; s: number; fill: string; cls: string }) {
  const i = s * 0.32; // inner radius - controls how "pinched" the star is
  const d = `M ${cx} ${cy - s} L ${cx + i} ${cy - i} L ${cx + s} ${cy} L ${cx + i} ${cy + i} L ${cx} ${cy + s} L ${cx - i} ${cy + i} L ${cx - s} ${cy} L ${cx - i} ${cy - i} Z`;
  return <path d={d} fill={fill} className={cls} style={{ transformOrigin: "center", transformBox: "fill-box" }} />;
}

/** Round-framed study glasses for the focused mood - sits over the eyes,
 *  framed in `--sophia-eye` so it contrasts with the disc in both themes. */
function Glasses() {
  return (
    <g fill="none" stroke="var(--sophia-eye)" strokeWidth="1.3" strokeLinecap="round" opacity="0.92">
      <circle cx="22" cy="27" r="9.2" />
      <circle cx="42" cy="27" r="9.2" />
      <path d="M 31 25.5 Q 32 24 33 25.5" />
      <line x1="12.9" y1="25" x2="9" y2="23.5" />
      <line x1="51.1" y1="25" x2="55" y2="23.5" />
    </g>
  );
}
