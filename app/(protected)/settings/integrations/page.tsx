"use client";

/**
 * Settings → Integrations (Agent EEE).
 *
 * Closed 8-provider catalog (`github`, `gitlab`, `bitbucket`, `jira`,
 * `linear`, `asana`, `azure_devops`, `slack` per ADR-027 #22 — no
 * Jenkins / CircleCI). Each card surfaces the org's lifecycle status
 * (`disconnected`, `pending`, `connected`, `active`, `degraded`,
 * `revoked`) and the matching action cluster.
 *
 * Wire fields stay snake_case per ADR-032 (BE bends to FE). Data flows:
 *
 *   1. `useIntegrations()` GETs `/v1/integrations` for the active org.
 *   2. `<IntegrationsTable>` left-joins the rows onto `PROVIDER_CATALOG`
 *      so providers the org has never connected still render.
 *   3. `<ConnectButton>` / `<DisconnectConfirmModal>` / acknowledge-drift
 *      mutations fire from the per-card cluster and call `mutate()` to
 *      refresh.
 *
 * Loading state: page-level skeletons (per CLAUDE.md — never spinners on
 * page load). Mirrors the per-card chrome so the layout doesn't jump.
 */

import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { IntegrationsTable } from "@/components/integrations/integrations-table";
import { useIntegrations } from "@/hooks/use-integrations";
import { PROVIDER_CATALOG } from "@/lib/api/integrations";

export default function IntegrationsPage() {
  const { integrations, isLoading, error, mutate } = useIntegrations();

  // Readiness §5.28 row 1804 — deep-link from the dashboard CTA arrives at
  // `/settings/integrations#github` (and the other 7 providers map the same
  // way). The browser's built-in hash-scroll fires before the integration
  // cards render (they wait on the async fetch), so re-scroll once the
  // skeletons flip to real cards carrying `id="provider-<slug>"`.
  useEffect(() => {
    if (isLoading) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const target = document.getElementById(`provider-${hash}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isLoading]);

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Connect Athena to your source control, work-management, and comms
          tools. Each provider uses OAuth — credentials are stored
          server-side, never in your browser. Athena reads only what each
          provider&apos;s adapter declares; revoke any time below.
        </p>
      </Stack>

      {error && (
        <Card
          role="alert"
          className="border-[var(--danger)] bg-[var(--danger-soft)]"
        >
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      {isLoading ? (
        <IntegrationsTableSkeleton />
      ) : (
        <IntegrationsTable integrations={integrations} onMutate={() => void mutate()} />
      )}
    </Stack>
  );
}

/**
 * Page-level skeleton — content-shaped placeholders that match the card
 * grid the page renders post-load. Per CLAUDE.md, page loads use
 * skeletons, never spinners.
 */
function IntegrationsTableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading integrations">
      <Grid cols="auto-fit-280" gap="3">
        {PROVIDER_CATALOG.map((entry) => (
          <Card key={entry.provider}>
            <Stack gap="3">
              <Cluster justify="between" align="start">
                <Cluster gap="2" align="center">
                  <div className="size-10 animate-pulse rounded-lg bg-[var(--surface-2)]" />
                  <Stack gap="1">
                    <div className="h-4 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
                    <div className="h-3 w-20 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  </Stack>
                </Cluster>
                <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
              </Cluster>
              <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
              <div className="h-3 w-5/6 animate-pulse rounded-md bg-[var(--surface-2)]" />
              <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
            </Stack>
          </Card>
        ))}
      </Grid>
    </div>
  );
}
