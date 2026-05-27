"use client";

/**
 * IntegrationCard — one card per provider (Agent EEE).
 *
 * Action cluster per lifecycle status:
 *   disconnected / revoked → ConnectButton
 *   connected / active     → Disconnect
 *   degraded               → Disconnect + Acknowledge drift (when pending_drift)
 *   pending                → inline "Awaiting authorization..." status
 */

import { useCallback, useState } from "react";
import { Github, GitlabIcon, GitBranch, ListTodo, Slack, CheckCircle2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { ApiError } from "@/lib/api/client";
import { acknowledgeDrift, type IntegrationLifecycleStatus, type ProviderSlug } from "@/lib/api/integrations";
import { ConnectButton } from "@/components/integrations/connect-button";
import { DisconnectConfirmModal } from "@/components/integrations/disconnect-confirm-modal";
import { IntegrationStatusBadge } from "@/components/integrations/integration-status-badge";

/** Per-provider icon. Lucide has direct icons for git platforms + Slack;
 *  work-management providers fall back to a generic ticket icon. */
const PROVIDER_ICONS: Record<ProviderSlug, LucideIcon> = {
  github: Github, gitlab: GitlabIcon, bitbucket: GitBranch,
  jira: ListTodo, linear: ListTodo, asana: ListTodo,
  azure_devops: GitBranch, slack: Slack,
};

export interface IntegrationCardProps {
  provider: ProviderSlug;
  providerName: string;
  blurb: string;
  status: IntegrationLifecycleStatus;
  /** Integration id from the BE row — only present when `status !== "disconnected"`. */
  integrationId: string | null;
  /** ISO timestamp of the last verify() check. NULL when never checked. */
  lastVerifiedAt: string | null;
  /** When true, render the "Acknowledge drift" CTA (only set on `degraded`). */
  pendingDrift: boolean;
  /** Force a refetch of the catalog after a mutation. */
  onMutate: () => void;
}

export function IntegrationCard({
  provider,
  providerName,
  blurb,
  status,
  integrationId,
  lastVerifiedAt,
  pendingDrift,
  onMutate,
}: IntegrationCardProps) {
  const [showDisconnectModal, setShowDisconnectModal] = useState<boolean>(false);
  const [acking, setAcking] = useState<boolean>(false);
  const Icon = PROVIDER_ICONS[provider];

  const hasCredentials =
    status === "connected" || status === "active" || status === "degraded";
  const needsConnect = status === "disconnected" || status === "revoked";

  const handleAck = useCallback(async () => {
    if (!integrationId) return;
    setAcking(true);
    try {
      await acknowledgeDrift(integrationId);
      toast.success(`Drift acknowledged for ${providerName}.`);
      onMutate();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't acknowledge drift.",
      );
    } finally {
      setAcking(false);
    }
  }, [integrationId, providerName, onMutate]);

  return (
    <Card data-testid={`integration-card-${provider}`}>
      <Stack gap="3">
        <Cluster justify="between" align="start">
          <Cluster gap="2" align="center">
            <div
              className="flex size-10 items-center justify-center rounded-lg bg-[var(--surface-2)]"
              aria-hidden
            >
              <Icon className="size-5 text-[var(--text)]" />
            </div>
            <Stack gap="0">
              <span className="text-sm font-semibold">{providerName}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {lastVerifiedAt
                  ? `Last checked ${formatRelative(lastVerifiedAt)}`
                  : "Never checked"}
              </span>
            </Stack>
          </Cluster>
          <IntegrationStatusBadge status={status} />
        </Cluster>

        <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{blurb}</p>

        <Cluster gap="2">
          {needsConnect && (
            <ConnectButton
              provider={provider}
              providerName={providerName}
              onComplete={onMutate}
              label={status === "revoked" ? "Reconnect" : "Connect"}
            />
          )}
          {hasCredentials && integrationId && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDisconnectModal(true)}
                aria-label={`Disconnect ${providerName}`}
                data-action="disconnect"
              >
                Disconnect
              </Button>
              {status === "degraded" && pendingDrift && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleAck()}
                  disabled={acking}
                  loading={acking}
                  aria-label={`Acknowledge drift for ${providerName}`}
                  data-action="acknowledge-drift"
                >
                  <CheckCircle2 className="size-3" aria-hidden />
                  Acknowledge drift
                </Button>
              )}
            </>
          )}
          {status === "pending" && (
            <span
              className="text-xs text-[var(--text-muted)]"
              role="status"
              aria-live="polite"
            >
              Awaiting authorization...
            </span>
          )}
        </Cluster>
      </Stack>

      {showDisconnectModal && integrationId && (
        <DisconnectConfirmModal
          integrationId={integrationId}
          providerName={providerName}
          onClose={() => setShowDisconnectModal(false)}
          onDisconnected={() => {
            setShowDisconnectModal(false);
            toast.success(`Disconnected ${providerName}.`);
            onMutate();
          }}
        />
      )}
    </Card>
  );
}

/** Best-effort relative-time formatter — keeps the card chrome compact
 *  without pulling in a full Intl.RelativeTimeFormat helper. Falls back
 *  to the raw ISO string when parsing fails so the card never throws. */
function formatRelative(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const diffMs = Date.now() - parsed;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(parsed).toISOString().slice(0, 10);
}
