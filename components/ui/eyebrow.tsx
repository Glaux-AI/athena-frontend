/**
 * Eyebrow - the ONLY sanctioned sub-xs uppercase micro-label (Nightglass
 * type law: 5 sizes + text-micro). One per card max; never a section's actual
 * title - sections use sentence-case text-sm font-semibold.
 */

import { cn } from "@/lib/cn";
import { type HTMLAttributes } from "react";

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]",
        className,
      )}
      {...props}
    />
  );
}
