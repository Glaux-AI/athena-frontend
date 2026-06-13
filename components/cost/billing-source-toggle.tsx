"use client";

/**
 * Billing-source segmented control for the /cost screen.
 *
 * Sliding-pill design: a `bg-[var(--surface-2)]` track with a white active chip
 * that animates between the three equal-width segments (grid-cols-3 keeps the
 * cells equal regardless of label length, so the chip lines up). Maps 1:1 to
 * the API's `CostBillingSource`:
 *   - All            → every call, both billing sources
 *   - Your keys      → spend on the org's own BYO provider keys
 *   - Athena credits → spend on Athena's shared credential
 *
 * Motion honours `prefers-reduced-motion` (the slide collapses to an instant
 * swap). Disabled while a refetch is in flight so a double-click can't race two
 * requests.
 */

import { cn } from "@/lib/cn";
import type { CostBillingSource } from "@/lib/api/client";

const OPTIONS: { value: CostBillingSource; label: string }[] = [
  { value: "all", label: "All" },
  { value: "byo", label: "Your keys" },
  { value: "athena", label: "Athena credits" },
];

export function BillingSourceToggle({
  value,
  onChange,
  busy = false,
}: {
  value: CostBillingSource;
  onChange: (next: CostBillingSource) => void;
  busy?: boolean;
}) {
  const activeIndex = Math.max(0, OPTIONS.findIndex((o) => o.value === value));
  return (
    <div
      role="group"
      aria-label="Billing source"
      className="relative grid grid-cols-3 rounded-full bg-[var(--surface-2)] p-1"
    >
      {/* Sliding active chip - width is one equal third of the inner track
          (minus the 8px of p-1), positioned by the active index. */}
      <span
        aria-hidden
        className="absolute inset-y-1 rounded-full bg-[var(--surface)] shadow-sm transition-[left] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: "calc((100% - 0.5rem) / 3)",
          left: `calc(0.25rem + ${activeIndex} * ((100% - 0.5rem) / 3))`,
        }}
      />
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            disabled={busy}
            aria-pressed={active}
            className={cn(
              "relative z-10 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
              busy && "cursor-not-allowed",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
