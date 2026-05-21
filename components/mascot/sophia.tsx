"use client";

/**
 * Sophia — the Athena owl mascot.
 *
 * Sits beside the wordmark in the TopBar. Eight moods, all neutral-to-positive
 * (no sad emotions ever). Mood comes from `useMascotStore`; SVG is inline,
 * themed via CSS variables (--sophia-*), and animated per-mood via Tailwind
 * keyframes declared in `tailwind.config.ts`.
 *
 * See UX design standard §7. Visual reference: blue plumage, cream facial discs,
 * big kawaii eyes with sparkle highlights, soft pink cheeks, downward beak,
 * rounded ear tufts, plump body with feather chevrons, Y-shaped talons.
 */

import { useMascotStore, type Mood } from "@/lib/stores/mascot";
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
      className={cn(
        "sophia inline-flex shrink-0 select-none items-center justify-center transition-all duration-300 ease-out",
        className
      )}
      style={{ width: size, height: size }}
    >
      <OwlSvg mood={mood} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* SVG                                                                         */
/* -------------------------------------------------------------------------- */

function OwlSvg({ mood }: { mood: Mood }) {
  // The whole-body wrapper carries the body-level animation (hop / tilt /
  // breathe). Per-feature animations sit on inner groups.
  const bodyAnim =
    mood === "happy"
      ? "animate-sophia-hop"
      : mood === "thinking"
      ? "animate-sophia-tilt"
      : mood === "working"
      ? "animate-sophia-breathe"
      : "";

  // Animations applied to the floating accent groups (book, quill).
  const accentFloatAnim =
    mood === "reading" || mood === "writing" ? "animate-sophia-float" : "";

  return (
    <svg
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      {/* Waiting halo — sits behind everything */}
      {mood === "waiting" && (
        <circle
          cx="32"
          cy="34"
          r="29"
          fill="none"
          stroke="var(--sophia-halo)"
          strokeWidth="2"
          className="animate-sophia-halo"
          style={{ transformOrigin: "32px 34px", transformBox: "fill-box" }}
        />
      )}

      <g
        className={bodyAnim}
        style={{ transformOrigin: "32px 56px", transformBox: "fill-box" }}
      >
        {/* Ear tufts (rounded — cute, not pointy) */}
        <path d="M 14 14 Q 12 5 17 3 Q 20 8 20 13 Z" fill="var(--sophia-body)" />
        <path d="M 50 14 Q 52 5 47 3 Q 44 8 44 13 Z" fill="var(--sophia-body)" />

        {/* Main body — single rounded "egg" shape (head merged with torso) */}
        <ellipse cx="32" cy="34" rx="22" ry="24" fill="var(--sophia-body)" />

        {/* Wings — left + right. Animate independently in `working`. */}
        <Wings mood={mood} />

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

        {/* Facial discs — signature owl feature */}
        <circle cx="22" cy="26" r="11" fill="var(--sophia-disc)" />
        <circle cx="42" cy="26" r="11" fill="var(--sophia-disc)" />
        <circle
          cx="22"
          cy="26"
          r="11"
          fill="none"
          stroke="var(--sophia-disc-rim)"
          strokeWidth="0.5"
          opacity="0.45"
        />
        <circle
          cx="42"
          cy="26"
          r="11"
          fill="none"
          stroke="var(--sophia-disc-rim)"
          strokeWidth="0.5"
          opacity="0.45"
        />

        {/* Eyes — vary by mood */}
        <Eyes mood={mood} />

        {/* Beak — small downward triangle between the discs */}
        <path
          d="M 30 32 L 34 32 L 32 36 Z"
          fill="var(--sophia-beak)"
          stroke="var(--sophia-beak-deep)"
          strokeWidth="0.4"
          strokeLinejoin="round"
        />

        {/* Cheeks — extra blushy on happy */}
        <Cheeks mood={mood} />

        {/* Talons — small Y-shapes at the bottom */}
        <g
          stroke="var(--sophia-beak)"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        >
          <line x1="26" y1="57" x2="26" y2="60" />
          <line x1="24" y1="60" x2="26" y2="60" />
          <line x1="26" y1="60" x2="28" y2="60" />
          <line x1="38" y1="57" x2="38" y2="60" />
          <line x1="36" y1="60" x2="38" y2="60" />
          <line x1="38" y1="60" x2="40" y2="60" />
        </g>
      </g>

      {/* Floating accents (outside the body group so the body animation
          doesn't drag them around) */}
      <Accent mood={mood} floatClass={accentFloatAnim} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Mood-specific parts                                                         */
/* -------------------------------------------------------------------------- */

function Wings({ mood }: { mood: Mood }) {
  const leftPath = "M 10 32 Q 6 40 9 50 Q 13 50 14 42 Q 13 36 10 32 Z";
  const rightPath = "M 54 32 Q 58 40 55 50 Q 51 50 50 42 Q 51 36 54 32 Z";

  if (mood === "working") {
    return (
      <>
        <g
          className="animate-sophia-wing-l"
          style={{ transformOrigin: "12px 32px", transformBox: "fill-box" }}
        >
          <path d={leftPath} fill="var(--sophia-body-deep)" />
        </g>
        <g
          className="animate-sophia-wing-r"
          style={{ transformOrigin: "52px 32px", transformBox: "fill-box" }}
        >
          <path d={rightPath} fill="var(--sophia-body-deep)" />
        </g>
      </>
    );
  }

  return (
    <>
      <path d={leftPath} fill="var(--sophia-body-deep)" opacity="0.9" />
      <path d={rightPath} fill="var(--sophia-body-deep)" opacity="0.9" />
    </>
  );
}

function Eyes({ mood }: { mood: Mood }) {
  // Eye groups carry the blink animation for moods where it makes sense.
  const blink =
    mood === "idle" || mood === "writing"
      ? "animate-sophia-blink"
      : "";

  const blinkStyle = {
    transformOrigin: "32px 27px",
    transformBox: "fill-box" as const,
  };

  switch (mood) {
    case "happy":
      return (
        <>
          <path
            d="M 16 28 Q 22 22 28 28"
            stroke="var(--sophia-eye)"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 36 28 Q 42 22 48 28"
            stroke="var(--sophia-eye)"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );

    case "thinking":
      return (
        <>
          <path
            d="M 16 27 Q 22 23 28 27"
            stroke="var(--sophia-eye)"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 36 27 Q 42 23 48 27"
            stroke="var(--sophia-eye)"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );

    case "reading":
      return (
        <>
          <ellipse cx="22" cy="29" rx="5.5" ry="4" fill="var(--sophia-eye)" />
          <ellipse cx="42" cy="29" rx="5.5" ry="4" fill="var(--sophia-eye)" />
          <circle cx="23" cy="28" r="1.6" fill="var(--sophia-eye-shine)" />
          <circle cx="43" cy="28" r="1.6" fill="var(--sophia-eye-shine)" />
        </>
      );

    case "waiting":
      return (
        <>
          <circle cx="22" cy="24" r="6" fill="var(--sophia-eye)" />
          <circle cx="42" cy="24" r="6" fill="var(--sophia-eye)" />
          <circle cx="24" cy="22" r="2.3" fill="var(--sophia-eye-shine)" />
          <circle cx="44" cy="22" r="2.3" fill="var(--sophia-eye-shine)" />
          <circle cx="20" cy="26" r="1" fill="var(--sophia-eye-shine)" opacity="0.8" />
          <circle cx="40" cy="26" r="1" fill="var(--sophia-eye-shine)" opacity="0.8" />
        </>
      );

    case "focused":
      return (
        <>
          <circle cx="22" cy="27" r="7.5" fill="var(--sophia-eye)" />
          <circle cx="42" cy="27" r="7.5" fill="var(--sophia-eye)" />
          <circle cx="24.5" cy="24.5" r="2.6" fill="var(--sophia-eye-shine)" />
          <circle cx="44.5" cy="24.5" r="2.6" fill="var(--sophia-eye-shine)" />
          <circle cx="19" cy="29" r="1.2" fill="var(--sophia-eye-shine)" opacity="0.85" />
          <circle cx="39" cy="29" r="1.2" fill="var(--sophia-eye-shine)" opacity="0.85" />
        </>
      );

    case "working":
    case "idle":
    case "writing":
    default:
      return (
        <g className={blink} style={blinkStyle}>
          <circle cx="22" cy="27" r="6" fill="var(--sophia-eye)" />
          <circle cx="42" cy="27" r="6" fill="var(--sophia-eye)" />
          <circle cx="24" cy="25" r="2" fill="var(--sophia-eye-shine)" />
          <circle cx="44" cy="25" r="2" fill="var(--sophia-eye-shine)" />
          <circle cx="20" cy="29" r="0.9" fill="var(--sophia-eye-shine)" opacity="0.7" />
          <circle cx="40" cy="29" r="0.9" fill="var(--sophia-eye-shine)" opacity="0.7" />
        </g>
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

function Accent({ mood, floatClass }: { mood: Mood; floatClass: string }) {
  switch (mood) {
    case "thinking":
      return (
        <>
          <circle
            cx="50"
            cy="14"
            r="1.8"
            fill="var(--sophia-dot)"
            className="animate-sophia-dot-1"
          />
          <circle
            cx="55"
            cy="10"
            r="1.6"
            fill="var(--sophia-dot)"
            className="animate-sophia-dot-2"
          />
          <circle
            cx="60"
            cy="6"
            r="1.4"
            fill="var(--sophia-dot)"
            className="animate-sophia-dot-3"
          />
        </>
      );

    case "writing":
      return (
        <g
          transform="translate(48, 50) rotate(35)"
          className={floatClass}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        >
          <path
            d="M 0 0 L -2 -12 Q -3 -16 -1 -18 Q 1 -16 2 -12 L 0 0 Z"
            fill="var(--sophia-cheek)"
            stroke="var(--sophia-beak-deep)"
            strokeWidth="0.4"
          />
          <line x1="0" y1="0" x2="-1" y2="-12" stroke="var(--sophia-beak-deep)" strokeWidth="0.3" opacity="0.6" />
        </g>
      );

    case "reading":
      return (
        <g
          transform="translate(46, 48) rotate(-10)"
          className={floatClass}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        >
          <rect x="-6" y="-3" width="12" height="8" rx="0.8" fill="var(--surface-3)" stroke="var(--text-muted)" strokeWidth="0.4" />
          <line x1="0" y1="-3" x2="0" y2="5" stroke="var(--text-muted)" strokeWidth="0.3" />
          <line x1="-4" y1="-0.5" x2="-1" y2="-0.5" stroke="var(--text-muted)" strokeWidth="0.3" />
          <line x1="-4" y1="1.5" x2="-1" y2="1.5" stroke="var(--text-muted)" strokeWidth="0.3" />
          <line x1="1" y1="-0.5" x2="4" y2="-0.5" stroke="var(--text-muted)" strokeWidth="0.3" />
          <line x1="1" y1="1.5" x2="4" y2="1.5" stroke="var(--text-muted)" strokeWidth="0.3" />
        </g>
      );

    case "happy":
      return (
        <>
          <path
            d="M 56 8 L 57 11 L 60 12 L 57 13 L 56 16 L 55 13 L 52 12 L 55 11 Z"
            fill="var(--sophia-sparkle)"
            className="animate-sophia-sparkle-1"
            style={{ transformOrigin: "center", transformBox: "fill-box" }}
          />
          <path
            d="M 8 18 L 8.6 19.6 L 10.2 20.2 L 8.6 20.8 L 8 22.4 L 7.4 20.8 L 5.8 20.2 L 7.4 19.6 Z"
            fill="var(--sophia-sparkle)"
            className="animate-sophia-sparkle-2"
            style={{ transformOrigin: "center", transformBox: "fill-box" }}
          />
          <path
            d="M 60 38 L 60.6 39.6 L 62.2 40.2 L 60.6 40.8 L 60 42.4 L 59.4 40.8 L 57.8 40.2 L 59.4 39.6 Z"
            fill="var(--sophia-cheek)"
            className="animate-sophia-sparkle-3"
            style={{ transformOrigin: "center", transformBox: "fill-box" }}
          />
        </>
      );

    case "focused":
      return (
        <g
          className="animate-sophia-alert"
          style={{ transformOrigin: "55px 11px", transformBox: "fill-box" }}
        >
          <circle cx="55" cy="11" r="6" fill="var(--sophia-alert-bg)" stroke="var(--sophia-alert-fg)" strokeWidth="1" />
          <line x1="55" y1="8" x2="55" y2="12" stroke="var(--sophia-alert-fg)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="55" cy="14.5" r="0.9" fill="var(--sophia-alert-fg)" />
        </g>
      );

    default:
      return null;
  }
}
