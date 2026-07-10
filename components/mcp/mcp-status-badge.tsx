/**
 * McpStatusBadge - closed-enum status pill for MCP servers, rendered with the
 * shared <Pill> grammar (Nightglass §5.1): star-dot status, `live` twinkle
 * while connected/healthy.
 *
 * The enum mirrors the FE-canonical `McpStatus` from
 * `@/lib/api/client` (ADR-032 - wire fields stay snake_case, BE bends
 * to FE):
 *
 *   connected      → success, live  (server responding healthily)
 *   healthy        → success, live  (BE `/test` probe passed - synonym)
 *   degraded       → warning        (responding but high latency / errors)
 *   error          → danger         (last heartbeat failed)
 *   disconnected   → neutral        (user paused or token expired)
 *   pending_review → info           (auto-provisioned, awaiting tool review)
 *   unknown        → neutral        (auto-provisioned, not yet health-checked)
 *
 * Any value outside this set renders an "Unknown" neutral fallback so the
 * UI never throws on a BE shape drift.
 */
import type { McpStatus } from "@/lib/api/client";
import { Pill, type PillTone } from "@/components/ui/pill";

interface BadgeStyle {
  label: string;
  tone: PillTone;
  live?: boolean;
}

const STYLES: Record<McpStatus, BadgeStyle> = {
  connected:      { label: "Connected",      tone: "success", live: true },
  healthy:        { label: "Healthy",        tone: "success", live: true },
  degraded:       { label: "Degraded",       tone: "warning" },
  error:          { label: "Error",          tone: "danger" },
  disconnected:   { label: "Disconnected",   tone: "neutral" },
  pending_review: { label: "Pending review", tone: "info" },
  unknown:        { label: "Not checked",    tone: "neutral" },
};

const FALLBACK: BadgeStyle = { label: "Unknown", tone: "neutral" };

export function McpStatusBadge({
  status,
  className,
}: {
  status: McpStatus | string;
  className?: string;
}) {
  const style = STYLES[status as McpStatus] ?? FALLBACK;
  return (
    <Pill
      role="status"
      aria-label={`MCP server status: ${style.label}`}
      tone={style.tone}
      size="sm"
      dot
      live={style.live ?? false}
      className={className}
    >
      {style.label}
    </Pill>
  );
}
