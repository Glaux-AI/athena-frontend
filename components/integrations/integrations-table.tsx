"use client";

/**
 * IntegrationsTable — grid of cards, one per known provider (Agent EEE).
 *
 * Source of truth for "what providers exist" is the closed
 * `PROVIDER_CATALOG` from `@/lib/api/integrations` (8 providers per
 * ADR-027 #22 — no Jenkins / CircleCI; CI ships through git platform
 * only). We left-join the org's installed integrations onto the catalog
 * so providers the org has never connected still surface as
 * `disconnected` cards.
 *
 * Cross-org isolation lives one layer down: `apiFetch` injects the
 * `X-Athena-Org-Id` header, so the BE only returns the active-org's
 * integration rows. This component renders whatever the hook gives it.
 */

import { useMemo } from "react";

import { Grid } from "@/components/layout/primitives";
import { IntegrationCard } from "@/components/integrations/integration-card";
import {
  PROVIDER_CATALOG,
  type IntegrationOut,
  type ProviderAvailability,
  type ProviderSlug,
} from "@/lib/api/integrations";

interface MergedRow {
  provider: ProviderSlug;
  providerName: string;
  blurb: string;
  status: IntegrationOut["status"];
  integrationId: string | null;
  lastVerifiedAt: string | null;
  pendingDrift: boolean;
  /** §6.6 / F-10.1 — paired MCP server id when the BE provisioner has
   *  created it (only set when `provides_mcp=true`). Drives the card's
   *  deep-link to `/mcp/{server_id}`. */
  mcpServerId: string | null;
  /** False when the deployment lacks OAuth client creds — card renders
   *  "Setup required" instead of a Connect button that 503s. */
  configured: boolean;
  /** GitHub App installation id for the "Manage on GitHub" link. */
  installationId: string | null;
}

function mergeCatalogAndRows(
  rows: readonly IntegrationOut[],
  availability: ReadonlyMap<ProviderSlug, boolean>,
): readonly MergedRow[] {
  // Index installed integrations by provider so the join is O(catalog).
  const byProvider = new Map<ProviderSlug, IntegrationOut>();
  for (const row of rows) {
    byProvider.set(row.provider, row);
  }
  return PROVIDER_CATALOG.map((entry) => {
    const row = byProvider.get(entry.provider);
    // Unknown availability (endpoint failed / older BE) → assume
    // configured so the page degrades to the previous behaviour.
    const configured = availability.get(entry.provider) ?? true;
    if (row) {
      const installRaw = row.config?.["installation_id"];
      return {
        provider: entry.provider,
        providerName: entry.name,
        blurb: entry.blurb,
        status: row.status,
        integrationId: row.id,
        lastVerifiedAt: row.last_verified_at,
        pendingDrift: row.pending_drift ?? false,
        mcpServerId: row.mcp_server_id ?? null,
        configured,
        installationId:
          typeof installRaw === "string" || typeof installRaw === "number"
            ? String(installRaw)
            : null,
      } satisfies MergedRow;
    }
    return {
      provider: entry.provider,
      providerName: entry.name,
      blurb: entry.blurb,
      status: "disconnected",
      integrationId: null,
      lastVerifiedAt: null,
      pendingDrift: false,
      mcpServerId: null,
      configured,
      installationId: null,
    } satisfies MergedRow;
  });
}

export function IntegrationsTable({
  orgId,
  integrations,
  providers,
  onMutate,
}: {
  /** Active org id — threaded into the canonical
   *  `/v1/orgs/{orgId}/integrations/{provider}/{kind}/oauth/initiate`
   *  shape via `<ConnectButton>`. */
  orgId: string;
  integrations: readonly IntegrationOut[];
  /** Per-deployment OAuth readiness rows (may be empty on fetch
   *  failure — cards then assume configured). */
  providers?: readonly ProviderAvailability[];
  onMutate: () => void;
}) {
  const rows = useMemo(() => {
    const availability = new Map<ProviderSlug, boolean>(
      (providers ?? []).map((p) => [p.provider, p.configured]),
    );
    return mergeCatalogAndRows(integrations, availability);
  }, [integrations, providers]);

  return (
    <div
      role="list"
      aria-label="Available integrations"
      data-testid="integrations-table"
    >
      <Grid cols="auto-fit-280" gap="3">
        {rows.map((row) => (
          <div role="listitem" key={row.provider}>
            <IntegrationCard
              orgId={orgId}
              provider={row.provider}
              providerName={row.providerName}
              blurb={row.blurb}
              status={row.status}
              integrationId={row.integrationId}
              lastVerifiedAt={row.lastVerifiedAt}
              pendingDrift={row.pendingDrift}
              mcpServerId={row.mcpServerId}
              configured={row.configured}
              installationId={row.installationId}
              onMutate={onMutate}
            />
          </div>
        ))}
      </Grid>
    </div>
  );
}
