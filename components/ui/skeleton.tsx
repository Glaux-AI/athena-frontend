/**
 * Skeleton - THE loading material (UX standard §9.1, Nightglass).
 *
 * A quiet surface with a slow starlight sweep (a passing satellite), not a
 * gray pulse. Shapes must still match the final layout - this primitive only
 * standardizes material + motion. The sweep lives in globals.css (`.skeleton`)
 * and is removed under prefers-reduced-motion.
 */

import { cn } from "@/lib/cn";
import { type HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden="true" {...props} />;
}

/** N text-shaped lines; the last line is shorter, like real copy. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton h-3.5"
          style={{ width: i === lines - 1 ? "55%" : "100%" }}
        />
      ))}
    </div>
  );
}
