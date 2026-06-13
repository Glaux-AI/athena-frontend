/**
 * GradientText - dimensional headline type (UX standard §2, §3.4).
 *
 * `accent={false}` (default): a vertical white→translucent fill derived from
 * `--text` for a subtle dimensional headline.
 * `accent`: an animated indigo→violet shimmer using `--primary`/`--acc-violet`
 * for a key phrase. Both are token-driven (light + dark) and the shimmer is
 * neutralized under `prefers-reduced-motion`.
 *
 * Use sparingly - for hero / section headlines and the one phrase you want to
 * pop. Body text never uses this.
 */

import { cn } from "@/lib/cn";
import { type ReactNode } from "react";

type Tag = "span" | "h1" | "h2" | "h3" | "p" | "strong";

export function GradientText({
  as = "span",
  accent = false,
  className,
  children,
}: {
  as?: Tag;
  accent?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Component = as;
  return (
    <Component className={cn(accent ? "text-gradient-accent" : "text-gradient", className)}>
      {children}
    </Component>
  );
}
