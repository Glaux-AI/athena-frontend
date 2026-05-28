"use client";

/**
 * Integration data hook — mirrors `use-mcp-servers.ts`.
 *
 * The project does not have SWR / React Query installed for these
 * surfaces — we follow the existing `useEffect + useState` pattern. The
 * hook returns the canonical `{integrations, isLoading, error, mutate}`
 * shape so consumers can render skeleton + content + error states + force
 * a refetch after a mutation (Connect / Disconnect / Acknowledge drift).
 *
 * Wire field names stay snake_case per ADR-032.
 */
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { listIntegrations, type IntegrationOut } from "@/lib/api/integrations";

export interface UseIntegrationsResult {
  integrations: readonly IntegrationOut[];
  isLoading: boolean;
  error: string | null;
  /** Re-run the list query. Used after a Connect / Disconnect /
   *  Acknowledge mutation to refresh the cards. */
  mutate: () => Promise<void>;
}

export function useIntegrations(orgId: string | null): UseIntegrationsResult {
  const [integrations, setIntegrations] = useState<readonly IntegrationOut[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  const mutate = useCallback(async () => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (orgId === null) {
      // No active org resolved yet — leave the skeleton up rather than
      // firing a request that would 404 on the missing path segment.
      setIsLoading(true);
      return () => {
        cancelled = true;
      };
    }
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await listIntegrations(orgId);
        if (!cancelled) setIntegrations(result);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.message : "Failed to load integrations",
        );
        setIntegrations([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, version]);

  return { integrations, isLoading, error, mutate };
}
