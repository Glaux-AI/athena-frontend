"use client";

/**
 * §3.6 r6 — useOpenGate(runId, sseSignal?) — read-side hook for the
 * approval-gate banner.
 *
 * SWR is not in `package.json` (see ADR-032: no new deps without a
 * load-bearing reason); this is a hand-rolled equivalent with the same
 * surface (`data` / `loading` / `error` / `mutate`). The hook fetches
 *
 *   GET /v1/runs/{run_id}/gates?status=open
 *
 * and returns the topmost open gate, or null when none is open.
 *
 * Re-validates whenever:
 *   - `runId` changes (mount + new run)
 *   - `mutate()` is called (post-action invalidation)
 *   - `sseSignal` changes (callers pass a value that increments on
 *     `gate_opened` / `gate_closed` SSE events — see `use-run-stream.ts`)
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api/client";
import type { OpenGate } from "@/lib/api/gates";

export interface UseOpenGateResult {
  /** Topmost open gate, or null when none is open. */
  gate: OpenGate | null;
  /** True until the first fetch settles. Stays false on re-validation. */
  loading: boolean;
  /** Last fetch error, or null. */
  error: ApiError | null;
  /** Trigger an immediate re-fetch. */
  mutate: () => void;
}

export function useOpenGate(runId: string, sseSignal: number = 0): UseOpenGateResult {
  const [gate, setGate] = useState<OpenGate | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);
  /** Bumped by `mutate()` to force a re-fetch independent of `sseSignal`. */
  const [refetchTick, setRefetchTick] = useState<number>(0);
  /** Tracks the current in-flight request so a stale resolution doesn't
   * clobber a newer one (race on rapid runId/sseSignal changes). */
  const requestIdRef = useRef<number>(0);

  const mutate = useCallback(() => {
    setRefetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    const myRequestId = requestIdRef.current;
    let cancelled = false;

    (async () => {
      try {
        const rows = await apiFetch<OpenGate[]>(
          `/v1/runs/${encodeURIComponent(runId)}/gates?status=open`,
        );
        if (cancelled || myRequestId !== requestIdRef.current) return;
        const top = rows.find((r) => r.status === "pending") ?? null;
        setGate(top);
        setError(null);
      } catch (e) {
        if (cancelled || myRequestId !== requestIdRef.current) return;
        // Soft-fail on missing endpoint — older BE builds return 404 here
        // and the banner should silently render nothing rather than break
        // the page. Hard errors (5xx) still surface to the consumer.
        if (e instanceof ApiError) {
          if (e.status === 404) {
            setGate(null);
            setError(null);
          } else {
            setError(e);
          }
        } else {
          setError(new ApiError(0, "internal", "Failed to load gate state."));
        }
      } finally {
        if (!cancelled && myRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, sseSignal, refetchTick]);

  return { gate, loading, error, mutate };
}
