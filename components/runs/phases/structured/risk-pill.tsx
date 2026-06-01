/**
 * RiskPill — a tiny uppercase chip for a `low | medium | high` risk or
 * severity value. Shared by every structured spec/plan panel so the colour
 * mapping lives in one place:
 *   low    → success token pair
 *   medium → warning token pair
 *   high   → danger token pair
 */

import { cn } from "@/lib/cn";
import type { StructuredRiskLevel } from "@/lib/api/client";

const RISK_CLASS: Record<StructuredRiskLevel, string> = {
  low: "bg-[var(--success-soft)] text-[var(--success)]",
  medium: "bg-[var(--warning-soft)] text-[var(--warning)]",
  high: "bg-[var(--danger-soft)] text-[var(--danger)]",
};

export function RiskPill({ level }: { level: StructuredRiskLevel }) {
  return (
    <span
      data-testid="risk-pill"
      data-level={level}
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        RISK_CLASS[level],
      )}
    >
      {level}
    </span>
  );
}
