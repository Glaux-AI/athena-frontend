/**
 * TaskIdChip — the human-facing task id ("FEAT-12") as quiet mono text. One
 * component so every surface (board card, cockpit header, subtask rows, tree)
 * renders the identifier identically: muted, tabular, copy-friendly — a
 * label, not a button (the row/card owns the navigation).
 */

import { cn } from "@/lib/cn";

export function TaskIdChip({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap font-mono text-[11px] font-medium tracking-tight text-[var(--text-subtle)]",
        className,
      )}
    >
      {id}
    </span>
  );
}
