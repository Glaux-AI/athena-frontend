/**
 * TaskIdChip - the human-facing task id ("FEAT-12") as quiet mono text. One
 * component so every surface (board card, cockpit header, subtask rows, tree)
 * renders the identifier identically: muted, tabular, copy-friendly - a
 * label, not a button (the row/card owns the navigation). Rendered as an
 * ink-kind <Pill> so the chip grammar stays single-source (Nightglass §5.1).
 */

import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/cn";

export function TaskIdChip({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <Pill
      kind="ink"
      size="sm"
      className={cn("shrink-0 font-mono font-medium tracking-tight", className)}
    >
      {id}
    </Pill>
  );
}
