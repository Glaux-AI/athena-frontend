/**
 * AmbientBackground - the signature layered light system (UX standard §3.4,
 * Nightglass §4.3).
 *
 * Renders slowly-floating, heavily-blurred gradient "light pools" + fine noise
 * + an optional masked grid + (Nightglass) an optional starfield. Every color
 * is token-driven (`--ambient-*`, `--grid-line`, `--star*`) so it adapts to
 * light + dark automatically - in light mode the stars read as fine ink
 * stippling (the "dawn chart"). All motion is neutralized by the global
 * `prefers-reduced-motion` rule in tokens.css.
 *
 * Decorative only (`aria-hidden`). Drop it as the first child of a
 * `relative` (or `relative overflow-hidden`) container and place real content
 * above it. Volume dial: `subtle`/`default`/`hero` are L2-L3 pool mixes;
 * `cosmos` is the full L3 deep field (pools + noise + grid + twinkling
 * starfield) - landing, login, onboarding shell, dashboard hero, planetarium.
 * Do NOT use behind dense data surfaces: those stay calm (L0).
 */

import { cn } from "@/lib/cn";

type Variant = "hero" | "default" | "subtle" | "cosmos";

export function AmbientBackground({
  variant = "default",
  grid = true,
  stars,
  className,
}: {
  /** `cosmos` = full deep field (pools + grid + twinkling stars);
   *  `hero` = all four pools + grid; `default` = three pools + grid;
   *  `subtle` = two pools, no grid (for quieter headers). */
  variant?: Variant;
  grid?: boolean;
  /** Add the static starfield layer to any variant (L2). `cosmos` always has it. */
  stars?: boolean;
  className?: string;
}) {
  const cosmos = variant === "cosmos";
  const showStars = cosmos || stars;
  return (
    <div className={cn("ambient-root -z-10", className)} aria-hidden="true">
      <div className="ambient-blob ambient-blob-1" />
      {variant !== "subtle" && <div className="ambient-blob ambient-blob-2" />}
      <div className="ambient-blob ambient-blob-3" />
      {(variant === "hero" || cosmos) && <div className="ambient-blob ambient-blob-4" />}
      <div className="ambient-noise" />
      {grid && variant !== "subtle" && <div className="ambient-grid" />}
      {showStars && <div className={cn("starfield", cosmos && "starfield-twinkle")} />}
    </div>
  );
}
