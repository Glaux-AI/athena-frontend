"use client";

/**
 * Billing-source segmented control for the /cost screen. Thin wrapper over the
 * shared <Segmented> (Nightglass §5.4). Maps 1:1 to the API's
 * `CostBillingSource`:
 *   - All            → every call, both billing sources
 *   - Your keys      → spend on the org's own BYO provider keys
 *   - Athena credits → spend on Athena's shared credential
 *
 * Guarded while a refetch is in flight so a double-click can't race two
 * requests.
 */

import { Segmented } from "@/components/ui/segmented";
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
  return (
    <Segmented<CostBillingSource>
      ariaLabel="Billing source"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        if (!busy) onChange(next);
      }}
      className={cn(busy && "opacity-60")}
    />
  );
}
