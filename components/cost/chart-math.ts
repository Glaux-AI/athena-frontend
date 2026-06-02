/** Shared chart-axis helpers for the /cost SVG charts. */

/** Round a max value up to a "nice" axis ceiling (1 / 2 / 5 × 10ⁿ). */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Five evenly-spaced tick values from 0..niceMax(max), inclusive. */
export function axisTicks(max: number): number[] {
  const top = niceMax(max);
  return [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);
}
