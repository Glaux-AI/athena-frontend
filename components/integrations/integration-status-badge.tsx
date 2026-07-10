/**
 * IntegrationStatusBadge - closed-enum status pill for the provider
 * catalog (Agent EEE), expressed as the shared <Pill> grammar.
 *
 * The enum mirrors `IntegrationLifecycleStatus` from
 * `@/lib/api/integrations`:
 *
 *   disconnected → neutral        (never connected - marketplace default)
 *   pending      → info, live dot (OAuth handshake in flight)
 *   connected    → success, live  (credentials stored, verify() not yet run)
 *   active       → success, live  (last verify() succeeded - synced + healthy)
 *   degraded     → warning, dot   (verify() failing - needs reauth / re-scope)
 *   revoked      → danger, dot    (admin or provider revocation; terminal)
 *
 * Any value outside this set renders an "Unknown" muted fallback so the
 * UI never throws on a BE shape drift (ADR-032).
 */
import type { IntegrationLifecycleStatus } from "@/lib/api/integrations";
import { Pill, type PillTone } from "@/components/ui/pill";

interface BadgeStyle {
  label: string;
  tone: PillTone;
  dot?: boolean;
  live?: boolean;
}

const STYLES: Record<IntegrationLifecycleStatus, BadgeStyle> = {
  disconnected: { label: "Disconnected", tone: "neutral" },
  pending:      { label: "Pending",      tone: "info", live: true },
  connected:    { label: "Connected",    tone: "success", live: true },
  active:       { label: "Active",       tone: "success", live: true },
  degraded:     { label: "Degraded",     tone: "warning", dot: true },
  revoked:      { label: "Revoked",      tone: "danger", dot: true },
};

const FALLBACK: BadgeStyle = { label: "Unknown", tone: "neutral" };

export function IntegrationStatusBadge({
  status,
  className,
}: {
  status: IntegrationLifecycleStatus | string;
  className?: string;
}) {
  const style = STYLES[status as IntegrationLifecycleStatus] ?? FALLBACK;
  return (
    <Pill
      role="status"
      aria-label={`Integration status: ${style.label}`}
      tone={style.tone}
      size="sm"
      dot={style.dot ?? false}
      live={style.live ?? false}
      className={className ?? ""}
    >
      {style.label}
    </Pill>
  );
}
