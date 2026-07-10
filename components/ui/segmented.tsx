"use client";

/**
 * Segmented - the one segmented control (Nightglass §5.4; previously lived in
 * components/cost/). Frosted track, raised active chip; robust to
 * variable-width labels (no sliding-pill measurement). Plain buttons with
 * `aria-pressed` + visible focus ring.
 */

import { cn } from "@/lib/cn";
import { focusRing } from "./focus";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "sm",
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "glass-chrome inline-flex items-center gap-0.5 rounded-lg border border-[var(--border-soft)] p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors",
              focusRing,
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
