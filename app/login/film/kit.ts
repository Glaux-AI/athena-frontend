"use client";

/**
 * Film kit — the scrub engine for the /login landing film.
 *
 * One tall scroll track drives a horizontally-travelling "world" inside a
 * sticky stage. The engine maps track scroll to a continuous progress P in
 * [0,1], smooths it with an exponential chase (so wheel steps glide instead
 * of snapping), and hands subscribers a per-frame callback. All motion is
 * applied through refs (style.transform / style.left) — React state changes
 * only when the active segment or its quantized local progress moves, so
 * scrolling never re-renders the whole film.
 *
 * Reduced motion: callers should not mount the engine at all — the film
 * renders as a static vertical sequence instead (see <FilmStage>).
 */

import { useEffect, useRef, useState, type RefObject } from "react";

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
/** Sub-progress of the [lo,hi] window of t, clamped to 0..1. */
export const win = (t: number, lo: number, hi: number) => clamp01((t - lo) / (hi - lo));

/**
 * The dwell fraction of each segment's scroll: the camera HOLDS on the
 * segment while its scene plays (local t runs 0→1 across this window),
 * then GLIDES one screen to the next segment in the remainder. Scenes,
 * stamps, and the camera all share this constant so the handoff (stamp
 * popping as the station crosses the playhead) lands mid-glide.
 */
export const HOLD = 0.7;

export const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/** Camera position in screens (0..N-1) for overall progress p — piecewise
 *  hold-then-glide per segment. Continuous and monotonic. */
export function cameraAt(p: number, segments: number): number {
  const raw = clamp01(p) * segments;
  const i = Math.min(segments - 1, Math.floor(raw));
  const f = raw - i;
  const glide = f <= HOLD ? 0 : easeInOut((f - HOLD) / (1 - HOLD));
  return Math.min(segments - 1, i + glide);
}

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

export interface ScrubFrame {
  /** Smoothed overall progress 0..1 across the whole film. */
  p: number;
  /** Index of the segment under the playhead. */
  seg: number;
  /** Local progress 0..1 inside that segment. */
  t: number;
}

/**
 * Scroll-scrub over `trackRef` (the tall track whose sticky child is the
 * stage). `onFrame` fires inside rAF whenever the smoothed progress moves —
 * apply transforms via refs there. The returned state carries the active
 * segment + quantized local t for the (cheap) React side: captions, scene
 * choreography, ARIA.
 */
export function useFilmScrub(
  trackRef: RefObject<HTMLElement | null>,
  segments: number,
  onFrame: (f: ScrubFrame) => void,
): { seg: number; t: number } {
  const [state, setState] = useState({ seg: 0, t: 0 });
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    let raf = 0;
    let target = 0;
    let shown = -1; // force first paint

    const measure = () => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const scrollable = Math.max(1, r.height - vh);
      target = clamp01(-r.top / scrollable);
    };

    const tick = () => {
      raf = 0;
      // Read layout once per FRAME (not per scroll event), and before any
      // styles are written — keeps the whole frame reflow-free.
      measure();
      // Exponential chase — wheel steps glide, trackpads stay 1:1-ish.
      const next = shown < 0 ? target : shown + (target - shown) * 0.16;
      const settled = Math.abs(next - target) < 0.0004;
      shown = settled ? target : next;

      const raw = shown * segments;
      const seg = Math.min(segments - 1, Math.max(0, Math.floor(raw)));
      // Local t completes across the HOLD window — the scene finishes its
      // choreography before the camera starts gliding to the next segment.
      const t = clamp01((raw - seg) / HOLD);
      onFrameRef.current({ p: shown, seg, t });
      // Quantize the React-visible t so scenes redraw ~50 steps per segment.
      const qt = Math.round(t * 50) / 50;
      setState((prev) => (prev.seg === seg && prev.t === qt ? prev : { seg, t: qt }));

      if (!settled) raf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [trackRef, segments]);

  return state;
}
