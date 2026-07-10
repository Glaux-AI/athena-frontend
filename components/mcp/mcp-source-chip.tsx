/**
 * McpSourceChip - closed-enum source chip for MCP servers, rendered with the
 * shared <Pill> grammar (Nightglass §5.1, sentence-case labels).
 *
 * Mirrors the FE-canonical `McpServer["source"]` from
 * `@/lib/api/client`: `"integration" | "custom"`. The handoff also
 * referenced a `"discovery"` lobe (auto-discovered, not yet enabled);
 * accept it here so a future BE shape addition doesn't require a UI
 * change. Anything else falls through to a neutral "Unknown" chip.
 */
import { Plug, Link2, Compass } from "lucide-react";
import type { McpServer } from "@/lib/api/client";
import { Pill, type PillTone } from "@/components/ui/pill";
import { cn } from "@/lib/cn";

type McpSource = McpServer["source"] | "discovery";

interface ChipStyle {
  label: string;
  tone: PillTone;
  icon: typeof Plug;
}

const STYLES: Record<McpSource, ChipStyle> = {
  custom: { label: "Custom", tone: "neutral", icon: Plug },
  integration: { label: "Integration", tone: "primary", icon: Link2 },
  discovery: { label: "Discovered", tone: "info", icon: Compass },
};

const FALLBACK: ChipStyle = { label: "Unknown", tone: "neutral", icon: Plug };

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
    <Pill
      aria-label={`MCP server source: ${style.label}`}
      tone={style.tone}
      size="sm"
      className={cn("[&>span]:inline-flex [&>span]:items-center [&>span]:gap-1", className)}
    >
      <Icon className="size-3" aria-hidden="true" />
      {style.label}
    </Pill>
  );
}
