"use client";

/**
 * useIngestProgress(repoId) — polls
 * ``GET /v1/repos/{repo_id}/ingest-progress`` every 3 s while the
 * repo is in an in-flight stage, then stops once the stage settles
 * at ``completed | failed | cancelled``. Mirrors the
 * `app/(protected)/capabilities/[id]/page.tsx:739-744` pattern used
 * by the Repos tab, factored out so the dedicated repo route can
 * reuse it.
 *
 * Behaviour:
 *   - Initial fetch on mount.
 *   - When `current.stage` is in the in-flight set, schedules a
 *     `setInterval(refetch, 3_000)`. Clears the interval as soon as
 *     the stage transitions out, OR when the component unmounts.
 *   - Returns `null` when the repo has never been ingest-attempted
 *     (BE returns null for that case).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type RepoIngestProgress } from "@/lib/api/client";

const IN_FLIGHT_STAGES: ReadonlySet<RepoIngestProgress["current"]["stage"]> =
  new Set(["queued", "cloning", "parsing", "embedding", "indexing"]);

const POLL_INTERVAL_MS = 3_000;

export interface UseIngestProgressState {
  data: RepoIngestProgress | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useIngestProgress(
  repoId: string | null | undefined,
): UseIngestProgressState {
  const [data, setData] = useState<RepoIngestProgress | null>(null);
  const [loading, setLoading] = useState<boolean>(repoId != null);
  const [error, setError] = useState<string | null>(null);

  // Track in-flight state across renders so we can keep / drop the
  // poll interval without re-creating it on every parent re-render.
  const cancelledRef = useRef<boolean>(false);

  const fetchOnce = useCallback(async () => {
    if (!repoId) return;
    try {
      const next = await api.repos.ingestProgress(repoId);
      if (cancelledRef.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load ingest progress");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    void fetchOnce();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchOnce]);

  // Ambient polling — start when we land on an in-flight stage, stop
  // when the row terminates. The deps key on `data?.current.stage` so
  // we don't churn the interval across unrelated re-renders.
  const stage = data?.current?.stage ?? null;
  useEffect(() => {
    if (stage == null) return;
    if (!IN_FLIGHT_STAGES.has(stage)) return;
    const tick = setInterval(() => {
      void fetchOnce();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [stage, fetchOnce]);

  return { data, loading, error, refetch: fetchOnce };
}
