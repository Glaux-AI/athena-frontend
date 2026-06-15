"use client";

/**
 * Film kit - shared helpers for the /login landing film.
 *
 * The film is a self-paced carousel (see <FilmStage>): each scene is a pure
 * function of a local progress `t` in [0,1] that plays 0 -> 1 when its frame
 * becomes active. These are the small math helpers the scenes and the
 * carousel share, plus the reduced-motion hook.
 */

import { useEffect, useState } from "react";

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
/** Sub-progress of the [lo,hi] window of t, clamped to 0..1. */
export const win = (t: number, lo: number, hi: number) => clamp01((t - lo) / (hi - lo));

export const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}
