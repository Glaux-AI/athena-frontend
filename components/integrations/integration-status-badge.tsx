/**
 * IntegrationStatusBadge — closed-enum status pill for the 8-provider
 * catalog (Agent EEE).
 *
 * The enum mirrors `IntegrationLifecycleStatus` from
 * `@/lib/api/integrations`:
 *
 *   disconnected → muted     (never connected — marketplace default)
 *   pending      → info-blue (OAuth handshake in flight)
 *   connected    → green     (credentials stored, verify() not yet run)
 *   active       → green     (last verify() succeeded — synced + healthy)
 *   degraded     → amber     (verify() failing — needs reauth / re-scope)
 *   revoked      → red       (admin or provider revocation; terminal)
 *
 * Any value outside this set renders an "Unknown" muted fallback so the
 * UI never throws on a BE shape drift (ADR-032).
 */
import type { IntegrationLifecycleStatus } from "@/lib/api/integrations";
import { cn } from "@/lib/cn";

interface BadgeStyle {
  label: string;
  cls: string;
}

const STYLES: Record<IntegrationLifecycleStatus, BadgeStyle> = {
  disconnected: { label: "Disconnected", cls: "bg-[var(--surface-3)] text-[var(--text-muted)]" },
  pending:      { label: "Pending",      cls: "bg-[var(--info-soft)] text-[var(--info-ink)]" },
  connected:    { label: "Connected",    cls: "bg-[var(--success-soft)] text-[var(--success-ink)]" },
  active:       { label: "Active",       cls: "bg-[var(--success-soft)] text-[var(--success-ink)]" },
  degraded:     { label: "Degraded",     cls: "bg-[var(--warning-soft)] text-[var(--warning-ink)]" },
  revoked:      { label: "Revoked",      cls: "bg-[var(--danger-soft)] text-[var(--danger-ink)]" },
};

const FALLBACK: BadgeStyle = {
  label: "Unknown",
  cls: "bg-[var(--surface-3)] text-[var(--text-muted)]",
};

export function IntegrationStatusBadge({
  status,
  className,
}: {
  status: IntegrationLifecycleStatus | string;
  className?: string;
}) {
  const style = STYLES[status as IntegrationLifecycleStatus] ?? FALLBACK;
  return (
    <span
      role="status"
      aria-label={`Integration status: ${style.label}`}
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
