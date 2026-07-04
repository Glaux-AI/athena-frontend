"use client";

/**
 * Film language primitives - captions, chapter cards, statement type,
 * callouts and the synthetic cursor. All pure functions of time.
 */

import type { CSSProperties, ReactNode } from "react";
import { ease, easeOut, lerp, seg } from "./engine";

/* ---------------------------------------------------------------- Caption */

/** Global switch: the film is now voiceover-driven, so the lower-third
 *  caption pills are suppressed and the narration lives in the VO track
 *  (see athena-demo/VO.md). Flip to true to restore on-screen captions.
 *  Chapter cards, opening/closing statements, callouts and the end card
 *  are separate primitives and stay on. */
const CAPTIONS_ENABLED = false;

/** Lower-third caption. Rises in at [a], sinks out at [b]. */
export function Caption({
  t,
  a,
  b,
  children,
  style,
}: {
  t: number;
  a: number;
  b: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  if (!CAPTIONS_ENABLED) return null;
  if (t < a || t > b + 0.4) return null;
  const inP = easeOut(seg(t, a, a + 0.45));
  const outP = ease(seg(t, b, b + 0.4));
  return (
    <div
      className="film-caption"
      style={{
        opacity: inP * (1 - outP),
        transform: `translateY(${(1 - inP) * 26 + outP * 18}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------- ChapterCard */

/** Kinetic chapter interstitial: giant ghost numeral + kicker + title. */
export function ChapterCard({
  t,
  dur,
  num,
  title,
  kicker,
}: {
  t: number;
  dur: number;
  num: string;
  title: string;
  kicker?: string;
}) {
  const inP = easeOut(seg(t, 0.1, 0.75));
  const outP = ease(seg(t, dur - 0.45, dur));
  const numDrift = lerp(60, -60, seg(t, 0, dur));
  return (
    <div className="film-chapter" style={{ opacity: 1 - outP }}>
      <div
        className="film-chapter-num"
        style={{ transform: `translateX(${numDrift}px)`, opacity: inP }}
      >
        {num}
      </div>
      <div style={{ display: "grid", gap: 18, justifyItems: "center", zIndex: 1 }}>
        {kicker && (
          <span className="film-lineclip">
            <span
              className="film-chapter-kicker"
              style={{
                display: "block",
                transform: `translateY(${(1 - easeOut(seg(t, 0.05, 0.6))) * 110}%)`,
              }}
            >
              {kicker}
            </span>
          </span>
        )}
        <span className="film-lineclip">
          <span
            className="film-chapter-title"
            style={{
              display: "block",
              transform: `translateY(${(1 - easeOut(seg(t, 0.18, 0.85))) * 110}%)`,
            }}
          >
            {title}
          </span>
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Statement */

/** Full-screen statement line with masked rise + settle, then exit upward. */
export function Statement({
  t,
  a,
  b,
  children,
  size = 76,
}: {
  t: number;
  a: number;
  b: number;
  children: ReactNode;
  size?: number;
}) {
  if (t < a || t > b + 0.5) return null;
  const inP = easeOut(seg(t, a, a + 0.7));
  const outP = ease(seg(t, b, b + 0.5));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        zIndex: 30,
      }}
    >
      <span className="film-lineclip">
        <span
          className="film-statement"
          style={{
            display: "block",
            fontSize: size,
            transform: `translateY(${(1 - inP) * 110 - outP * 120}%)`,
            opacity: 1 - outP,
          }}
        >
          {children}
        </span>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- Callout */

/** Small chip with a dot, anchored at (x, y) stage px, pointing at UI. */
export function Callout({
  t,
  a,
  b,
  x,
  y,
  children,
}: {
  t: number;
  a: number;
  b: number;
  x: number;
  y: number;
  children: ReactNode;
}) {
  if (t < a || t > b + 0.35) return null;
  const inP = easeOut(seg(t, a, a + 0.4));
  const outP = ease(seg(t, b, b + 0.35));
  return (
    <div
      className="film-callout"
      style={{
        left: x,
        top: y,
        opacity: inP * (1 - outP),
        transform: `translateY(${(1 - inP) * 14}px) scale(${lerp(0.92, 1, inP)})`,
      }}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- Cursor */

export interface CursorKey {
  /** Scene-local time of arrival at this point. */
  at: number;
  x: number;
  y: number;
  /** Click on arrival. */
  click?: boolean;
}

/** Synthetic cursor following keyframes, with click ripples.
 * Motion is dwell-then-dart: the cursor rests at the previous point and
 * travels only during the last DART seconds before each arrival, so moves
 * read at human mousing speed and clicks land exactly on arrival. */
const DART = 0.55;

export function Cursor({ t, path }: { t: number; path: CursorKey[] }) {
  const first = path[0];
  if (!first) return null;
  if (t < first.at - 0.6) return null;

  let x = first.x;
  let y = first.y;
  for (let i = 0; i < path.length - 1; i++) {
    const k0 = path[i];
    const k1 = path[i + 1];
    if (!k0 || !k1) continue;
    if (t >= k0.at && t <= k1.at) {
      const travel = Math.min(DART, Math.max(0.15, k1.at - k0.at));
      const p = ease(seg(t, k1.at - travel, k1.at));
      x = lerp(k0.x, k1.x, p);
      y = lerp(k0.y, k1.y, p) - Math.sin(p * Math.PI) * 12;
    } else if (t > k1.at) {
      x = k1.x;
      y = k1.y;
    }
  }

  const fadeIn = easeOut(seg(t, first.at - 0.4, first.at));

  return (
    <>
      {path
        .filter((k) => k.click && t >= k.at && t <= k.at + 0.55)
        .map((k, i) => {
          const p = seg(t, k.at, k.at + 0.55);
          return (
            <div
              key={i}
              className="film-cursor-ripple"
              style={{
                left: k.x,
                top: k.y,
                transform: `scale(${lerp(0.25, 1.35, easeOut(p))})`,
                opacity: 1 - p,
              }}
            />
          );
        })}
      <div className="film-cursor" style={{ left: x, top: y, opacity: fadeIn }}>
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path
            d="M5.5 3.2 L18.6 12.2 L12.9 13.4 L16.2 20.2 L13.6 21.4 L10.4 14.6 L5.5 18.6 Z"
            fill="oklch(100% 0 0)"
            stroke="oklch(20% 0.02 250)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- AppFrame */

/** The floating product window every Athena scene lives in. */
export function AppFrame({
  children,
  pose,
  frameStyle,
}: {
  children: ReactNode;
  pose?: CSSProperties;
  frameStyle?: CSSProperties;
}) {
  return (
    <>
      <div className="film-frame-floor" style={pose} />
      <div className="film-frame" style={{ ...pose, ...frameStyle }}>
        {children}
      </div>
    </>
  );
}
