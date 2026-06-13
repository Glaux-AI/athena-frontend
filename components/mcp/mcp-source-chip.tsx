/**
 * McpSourceChip - closed-enum source chip for MCP servers.
 *
 * Mirrors the FE-canonical `McpServer["source"]` from
 * `@/lib/api/client`: `"integration" | "custom"`. The handoff also
 * referenced a `"discovery"` lobe (auto-discovered, not yet enabled);
 * accept it here so a future BE shape addition doesn't require a UI
 * change. Anything else falls through to a muted "Unknown" chip.
 */
import { Plug, Link2, Compass } from "lucide-react";
import type { McpServer } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type McpSource = McpServer["source"] | "discovery";

interface ChipStyle {
  label: string;
  cls: string;
  icon: typeof Plug;
}

const STYLES: Record<McpSource, ChipStyle> = {
  custom: {
    label: "Custom",
    cls: "bg-[var(--surface-2)] text-[var(--text-muted)]",
    icon: Plug,
  },
  integration: {
    label: "Integration",
    cls: "bg-[var(--primary-soft)] text-[var(--primary)]",
    icon: Link2,
  },
  discovery: {
    label: "Discovered",
    cls: "bg-[var(--info-soft)] text-[var(--info-ink)]",
    icon: Compass,
  },
};

const FALLBACK: ChipStyle = {
  label: "Unknown",
  cls: "bg-[var(--surface-3)] text-[var(--text-muted)]",
  icon: Plug,
};

export function McpSourceChip({
  source,
  className,
}: {
  source: McpSource | string;
  className?: string;
}) {
  const style = STYLES[source as McpSource] ?? FALLBACK;
  const Icon = style.icon;
  return (
    <span
      aria-label={`MCP server source: ${style.label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        style.cls,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {style.label}
    </span>
  );
}
