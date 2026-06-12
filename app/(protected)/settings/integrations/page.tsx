"use client";

/**
 * Settings → Integrations (Agent EEE).
 *
 * Closed 11-provider catalog (`github`, `gitlab`, `bitbucket`, `jira`,
 * `linear`, `asana`, `azure_devops`, `slack`, `figma`, `notion`,
 * `confluence` per ADR-027 #22 — no Jenkins / CircleCI). Each card
 * surfaces the org's lifecycle status (`disconnected`, `pending`,
 * `connected`, `active`, `degraded`, `revoked`), the deployment's
 * OAuth readiness ("Setup required" when client creds are missing),
 * and the matching action cluster incl. Reauthenticate.
 *
 * Wire fields stay snake_case per ADR-032 (BE bends to FE). Data flows:
 *
 *   1. `useIntegrations(activeOrgId)` GETs `/v1/orgs/{orgId}/integrations`.
 *   2. `<IntegrationsTable>` left-joins the rows onto `PROVIDER_CATALOG`
 *      so providers the org has never connected still render.
 *   3. `<ConnectButton>` / `<DisconnectConfirmModal>` / acknowledge-drift
 *      mutations fire from the per-card cluster and call `mutate()` to
 *      refresh.
 *
 * Loading state: page-level skeletons (per CLAUDE.md — never spinners on
 * page load). Mirrors the per-card chrome so the layout doesn't jump.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { IntegrationsTable } from "@/components/integrations/integrations-table";
import { AiSubscriptionsSection } from "@/components/integrations/ai-subscriptions-section";
import { CodingAgentsSection } from "@/components/integrations/coding-agents-section";
import { useIntegrations } from "@/hooks/use-integrations";
import {
  PROVIDER_CATALOG,
  listProviders,
  type ProviderAvailability,
} from "@/lib/api/integrations";
import { useSession } from "@/lib/session/SessionProvider";

export default function IntegrationsPage() {
  const { activeOrgId } = useSession();
  const { integrations, isLoading, error, mutate } = useIntegrations(activeOrgId);

  // Per-deployment OAuth readiness — drives the cards' "Setup required"
  // state. Best-effort: a fetch failure leaves this empty and the table
  // assumes every provider is configured (previous behaviour).
  const [providers, setProviders] = useState<readonly ProviderAvailability[]>([]);
  useEffect(() => {
    if (activeOrgId === null) return;
    let cancelled = false;
    listProviders(activeOrgId)
      .then((rows) => {
        if (!cancelled) setProviders(rows);
      })
      .catch(() => {
        /* degrade to assume-configured */
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  // The server-side OAuth flows (GitHub user-token + generic callback)
  // land back on this page with `?connected=<provider>` / `?error=<code>`
  // — surface those as toasts once, then strip the params so a refresh
  // doesn't re-toast.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");
    const errorCode = url.searchParams.get("error");
    if (!connected && !errorCode) return;
    if (connected) toast.success(`${connected} connected.`);
    if (errorCode) {
      toast.error(
        errorCode === "oauth_failed"
          ? "Authorization failed — the provider rejected the handshake. Try again."
          : `Connect flow failed (${errorCode.replaceAll("_", " ")}). Try again.`,
      );
    }
    url.searchParams.delete("connected");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url.toString());
  }, []);

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
      <SettingsPageHeader
        title="Integrations"
        subtitle="Connect Athena to your source control, work-management, and comms tools. Each provider uses OAuth — credentials are stored server-side, never in your browser. Athena reads only what each provider's adapter declares; revoke any time below."
      />

      {error && (
        <Card
          role="alert"
          className="border-[var(--danger)] bg-[var(--danger-soft)]"
        >
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {isLoading || activeOrgId === null ? (
        <IntegrationsTableSkeleton />
      ) : (
        <IntegrationsTable
          orgId={activeOrgId}
          integrations={integrations}
          providers={providers}
          onMutate={() => void mutate()}
        />
      )}

      {/* Personal AI-subscription connections (Claude Pro/Max, ChatGPT
          Codex) — per-user, chat-only; distinct from the org-scoped tool
          integrations above, so it carries its own heading + caveats. */}
      <AiSubscriptionsSection />

      {/* Coding agents over MCP — per-user tokens that let Claude Code /
          Codex / Gemini / Copilot drive Athena's knowledge + task spine
          on the user's own subscription. Third sibling rung. */}
      <CodingAgentsSection />
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
