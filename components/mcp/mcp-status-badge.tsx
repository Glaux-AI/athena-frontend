/**
 * McpStatusBadge — closed-enum status pill for MCP servers.
 *
 * The enum mirrors the FE-canonical `McpStatus` from
 * `@/lib/api/client` (ADR-032 — wire fields stay snake_case, BE bends
 * to FE):
 *
 *   connected      → green     (server responding healthily)
 *   degraded       → amber     (responding but high latency / partial errors)
 *   error          → red       (last heartbeat failed)
 *   disconnected   → muted     (user paused or token expired)
 *   pending_review → info-blue (auto-provisioned, awaiting tool review)
 *
 * Any value outside this set renders an "Unknown" muted fallback so the
 * UI never throws on a BE shape drift.
 */
import type { McpStatus } from "@/lib/api/client";
import { cn } from "@/lib/cn";

interface BadgeStyle {
  label: string;
  cls: string;
}

const STYLES: Record<McpStatus, BadgeStyle> = {
  connected:      { label: "Connected",      cls: "bg-[var(--success-soft)] text-[var(--success)]" },
  degraded:       { label: "Degraded",       cls: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  error:          { label: "Error",          cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  disconnected:   { label: "Disconnected",   cls: "bg-[var(--surface-3)] text-[var(--text-muted)]" },
  pending_review: { label: "Pending review", cls: "bg-[var(--info-soft)] text-[var(--info)]" },
};

const FALLBACK: BadgeStyle = {
  label: "Unknown",
  cls: "bg-[var(--surface-3)] text-[var(--text-muted)]",
};

export function McpStatusBadge({
  status,
  className,
}: {
  status: McpStatus | string;
  className?: string;
}) {
  const style = STYLES[status as McpStatus] ?? FALLBACK;
  return (
    <span
      role="status"
      aria-label={`MCP server status: ${style.label}`}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        style.cls,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
