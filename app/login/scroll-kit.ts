"use client";

/**
 * Scroll-choreography hooks for the /login Build Floor scrollytelling.
 * rAF-throttled; honors prefers-reduced-motion by snapping to settled state.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
export const countTo = (target: number, p: number) => target * clamp01(p);

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

export function useBeatTrack(
  ref: RefObject<HTMLElement | null>,
  count: number,
): { beat: number; t: number } {
  const reduced = useReducedMotion();
  const [state, setState] = useState<{ beat: number; t: number }>({ beat: 0, t: 0 });
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const scrollable = Math.max(1, r.height - vh);
      const scrolled = clamp01(-r.top / scrollable);
      const raw = scrolled * count;
      let beat = Math.floor(raw);
      if (beat >= count) beat = count - 1;
      if (beat < 0) beat = 0;
      const t = reduced ? 1 : clamp01(raw - beat);
      setState((prev) =>
        prev.beat === beat && Math.abs(prev.t - t) < 0.008 ? prev : { beat, t },
      );
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, count, reduced]);
  return state;
}

/**
 * Time-based autoplay that replays a 0→1 ramp every time `dep` changes (and on
 * mount). Scroll does NOT scrub it: landing on a step (a new `beat`) plays that
 * step's surface once, on its own. Reduced motion → settles at 1 immediately.
 */
export function useAutoplayOnChange(dep: unknown, durationMs = 1300): number {
  const reduced = useReducedMotion();
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { setP(1); return; }
    let raf = 0;
    let start = 0;
    setP(0);
    const step = (ts: number) => {
      if (!start) start = ts;
      const k = clamp01((ts - start) / durationMs);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [dep, durationMs, reduced]);
  return p;
}

export function useDivRef() {
  return useRef<HTMLDivElement | null>(null);
}
