"use client";

/**
 * Enabled-models hook - the data source for `<ModelSelector>`.
 *
 * Returns the org's enabled models (`api.models.enabled`) in the canonical
 * `{ models, isLoading, error }` shape. Follows the repo's `useEffect` +
 * `useState` fetch pattern (see `hooks/use-integrations.ts`); React Query is not
 * used on these surfaces. Wire field names stay snake_case per ADR-032.
 */
import { useEffect, useState } from "react";

import { ApiError, api, type EnabledModel } from "@/lib/api/client";

interface UseEnabledModelsResult {
  models: EnabledModel[];
  isLoading: boolean;
  error: string | null;
}

export function useEnabledModels(): UseEnabledModelsResult {
  const [models, setModels] = useState<EnabledModel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await api.models.enabled();
        if (!cancelled) setModels(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load models");
        setModels([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { models, isLoading, error };
}
