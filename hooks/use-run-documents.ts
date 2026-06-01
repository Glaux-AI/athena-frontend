"use client";

/**
 * useRunDocuments(runId, phase) — fetch the latest `documents` row for a
 * given phase on `/runs/[id]`. Backs the Implement-track phase tabs
 * (§3.6 r5 + §4.x r2) and the PRD phase tabs that consume citations +
 * inline feedback.
 *
 * The project does not have SWR / React Query installed — we follow the
 * existing useEffect+useState pattern (see `LiveActivityStrip`,
 * `PhaseContent` on the run page). Wire field names stay snake_case per
 * ADR-032 (BE bends to FE).
 *
 * Returns `{document, isLoading, error}`. `document === null` when no
 * artifact has been emitted yet for that phase — callers render an empty
 * state rather than treating it as an error.
 */

import { useCallback, useEffect, useState } from "react";

import { api, ApiError, type RunPhaseDocument } from "@/lib/api/client";

interface UseRunDocumentsResult {
  document: RunPhaseDocument | null;
  isLoading: boolean;
  error: string | null;
  /** Re-fetch the latest document for the current (runId, phase). Used after
   *  a manual Save or an Improve so the new version replaces the read view. */
  refetch: () => Promise<void>;
}

export function useRunDocuments(
  runId: string,
  phase: string,
): UseRunDocumentsResult {
  const [document, setDocument] = useState<RunPhaseDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await api.runs.runDocuments.latest(runId, phase);
        if (!signal?.cancelled) setDocument(result);
      } catch (e) {
        if (signal?.cancelled) return;
        // Soft-fail: a 404 on the documents endpoint (BE not yet shipped, or
        // the run hasn't produced this phase yet) leaves us with no document
        // and no error toast — the caller renders an empty state.
        if (e instanceof ApiError && e.status === 404) {
          setDocument(null);
        } else {
          setError(
            e instanceof ApiError ? e.message : "Failed to load document",
          );
          setDocument(null);
        }
      } finally {
        if (!signal?.cancelled) setIsLoading(false);
      }
    },
    [runId, phase],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const refetch = useCallback(() => load(), [load]);

  return { document, isLoading, error, refetch };
}
