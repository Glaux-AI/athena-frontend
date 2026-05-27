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

import { useEffect, useState } from "react";

import { api, ApiError, type RunPhaseDocument } from "@/lib/api/client";

export interface UseRunDocumentsResult {
  document: RunPhaseDocument | null;
  isLoading: boolean;
  error: string | null;
}

export function useRunDocuments(
  runId: string,
  phase: string,
): UseRunDocumentsResult {
  const [document, setDocument] = useState<RunPhaseDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await api.runs.runDocuments.latest(runId, phase);
        if (!cancelled) {
          setDocument(result);
        }
      } catch (e) {
        if (cancelled) return;
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
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, phase]);

  return { document, isLoading, error };
}
