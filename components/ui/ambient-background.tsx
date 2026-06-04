/**
 * AmbientBackground — the signature layered light system (UX standard §3.4).
 *
 * Renders slowly-floating, heavily-blurred gradient "light pools" + fine noise
 * + an optional masked grid. Every color is token-driven (`--ambient-*`,
 * `--grid-line`) so it adapts to light + dark automatically. All motion is
 * neutralized by the global `prefers-reduced-motion` rule in tokens.css.
 *
 * Decorative only (`aria-hidden`). Drop it as the first child of a
 * `relative` (or `relative overflow-hidden`) container and place real content
 * above it. Reserved for "moment" surfaces — hero, marketing, login,
 * onboarding, key empty states / page headers. Do NOT use behind dense data
 * surfaces (tables, run timelines): the intensity rule keeps those calm.
 */

import { cn } from "@/lib/cn";

type Variant = "hero" | "default" | "subtle";

export function AmbientBackground({
  variant = "default",
  grid = true,
  className,
}: {
  /** `hero` = all four pools + grid; `default` = three pools + grid;
   *  `subtle` = two pools, no grid (for quieter headers). */
  variant?: Variant;
  grid?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("ambient-root -z-10", className)} aria-hidden="true">
      <div className="ambient-blob ambient-blob-1" />
      {variant !== "subtle" && <div className="ambient-blob ambient-blob-2" />}
      <div className="ambient-blob ambient-blob-3" />
      {variant === "hero" && <div className="ambient-blob ambient-blob-4" />}
      <div className="ambient-noise" />
      {grid && variant !== "subtle" && <div className="ambient-grid" />}
    </div>
  );
}
