import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/utils/format";

export function CostPill({ usd, className }: { usd: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums",
        "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]",
        className
      )}
      aria-label={`Cost: ${formatUsd(usd, 4)}`}
    >
      {formatUsd(usd)}
    </span>
  );
}
