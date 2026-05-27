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
}

function mergeCatalogAndRows(
  rows: readonly IntegrationOut[],
): readonly MergedRow[] {
  // Index installed integrations by provider so the join is O(catalog).
  const byProvider = new Map<ProviderSlug, IntegrationOut>();
  for (const row of rows) {
    byProvider.set(row.provider, row);
  }
  return PROVIDER_CATALOG.map((entry) => {
    const row = byProvider.get(entry.provider);
    if (row) {
      return {
        provider: entry.provider,
        providerName: entry.name,
        blurb: entry.blurb,
        status: row.status,
        integrationId: row.id,
        lastVerifiedAt: row.last_verified_at,
        pendingDrift: row.pending_drift ?? false,
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
    } satisfies MergedRow;
  });
}

export function IntegrationsTable({
  integrations,
  onMutate,
}: {
  integrations: readonly IntegrationOut[];
  onMutate: () => void;
}) {
  const rows = useMemo(
    () => mergeCatalogAndRows(integrations),
    [integrations],
  );

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
              provider={row.provider}
              providerName={row.providerName}
              blurb={row.blurb}
              status={row.status}
              integrationId={row.integrationId}
              lastVerifiedAt={row.lastVerifiedAt}
              pendingDrift={row.pendingDrift}
              onMutate={onMutate}
            />
          </div>
        ))}
      </Grid>
    </div>
  );
}
