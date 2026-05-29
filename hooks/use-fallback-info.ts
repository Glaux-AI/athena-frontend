"use client";

/**
 * useFallbackInfo(runId) — surfaces the LLM provider routing trail for a
 * run, so the run-page UI can transparently flag "this answer came from a
 * fallback model, not the primary route" (readiness §3.1 row 812).
 *
 * Mirrors the useEffect+useState pattern in `use-run-documents.ts` (no SWR
 * in this project). Wire field names stay snake_case per ADR-032.
 *
 * Reads from `api.runs.get(runId)` and narrows the optional
 * `provider_routes` / `fallback_count` fields off the returned `RunDetail`.
 * The BE wire shape does not yet carry these fields (see report) so today
 * the hook gracefully returns `{routes: [], fallback_count: 0}` — the
 * caller renders null in that case. The hook lights up automatically when
 * the BE adds the fields under the same snake_case names.
 */

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api/client";

/** One row in the provider-routing trail — model + role on this run. */
export interface ProviderRoute {
  /** Concrete model id LiteLLM resolved to (e.g. `claude-sonnet-4`). */
  model: string;
  /** True for the primary route, false when this row is a fallback hop. */
  primary: boolean;
  /** Set on a fallback row — the model id that failed before LiteLLM
   *  rolled over to `model`. Absent on the primary row. */
  fallback_from?: string;
  /** ISO timestamp of the most recent call on this route. */
  ts: string;
  /** How many LLM calls have landed on this route during this run. */
  calls: number;
}

interface FallbackInfo {
  routes: ProviderRoute[];
  fallback_count: number;
}

interface UseFallbackInfoResult extends FallbackInfo {
  isLoading: boolean;
  error: string | null;
}

/** Narrow the optional fields off `RunDetail` without mutating the shared
 *  type. The BE will add these fields under these snake_case names; until
 *  then the hook quietly returns the no-fallback default. */
function extractFallbackInfo(run: unknown): FallbackInfo {
  const r = run as { provider_routes?: unknown; fallback_count?: unknown };
  const routes = Array.isArray(r.provider_routes)
    ? (r.provider_routes as ProviderRoute[])
    : [];
  const fallback_count =
    typeof r.fallback_count === "number" ? r.fallback_count : 0;
  return { routes, fallback_count };
}

export function useFallbackInfo(runId: string): UseFallbackInfoResult {
  const [info, setInfo] = useState<FallbackInfo>({
    routes: [],
    fallback_count: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const run = await api.runs.get(runId);
        if (!cancelled) setInfo(extractFallbackInfo(run));
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setInfo({ routes: [], fallback_count: 0 });
        } else {
          setError(
            e instanceof ApiError ? e.message : "Failed to load provider info",
          );
          setInfo({ routes: [], fallback_count: 0 });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return { ...info, isLoading, error };
}
