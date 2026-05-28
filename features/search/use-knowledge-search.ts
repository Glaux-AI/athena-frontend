"use client";

/**
 * useKnowledgeSearch — debounced + cancellable fetch wrapper around
 * `api.knowledge.search`. Caches results in-memory keyed by the
 * normalised `(q, mode, scope, capability_id, repo_id, kind[], layer[],
 * limit)` tuple so re-running an identical query is free.
 *
 * Cache is per-hook-instance (so it lives only as long as the palette
 * is open); we intentionally don't share it across mounts to avoid
 * leaking stale results when the user's active org changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type KnowledgeSearchOut, type KnowledgeSearchParams } from "@/lib/api/client";

export interface UseKnowledgeSearchState {
  data: KnowledgeSearchOut | null;
  loading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 300;
/** Hard ceiling on the in-memory cache to keep memory bounded. The
 *  cache is purged FIFO once it crosses this. */
const MAX_CACHE_ENTRIES = 50;

function cacheKey(params: KnowledgeSearchParams): string {
  // Sort filter arrays so logically equivalent calls hit the same key.
  const norm = {
    q: params.q.trim().toLowerCase(),
    scope: params.scope ?? "org",
    capability_id: params.capability_id ?? null,
    repo_id: params.repo_id ?? null,
    kind: [...(params.kind ?? [])].sort(),
    layer: [...(params.layer ?? [])].sort(),
    mode: params.mode ?? "hybrid",
    limit: params.limit ?? 20,
  };
  return JSON.stringify(norm);
}

export function useKnowledgeSearch(
  params: KnowledgeSearchParams | null,
): UseKnowledgeSearchState {
  const [state, setState] = useState<UseKnowledgeSearchState>({
    data: null,
    loading: false,
    error: null,
  });
  const cacheRef = useRef<Map<string, KnowledgeSearchOut>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  // Latest-request guard: ignore stale resolves so a slow earlier query
  // doesn't overwrite the result of a faster later one.
  const reqIdRef = useRef(0);

  const key = useMemo(() => (params ? cacheKey(params) : null), [params]);

  const flush = useCallback(async (k: string, p: KnowledgeSearchParams) => {
    // Cache hit — return synchronously, no fetch.
    const cached = cacheRef.current.get(k);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    // Cancel any in-flight request before issuing a new one.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const myReqId = ++reqIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const out = await api.knowledge.search(p);
      if (ac.signal.aborted || reqIdRef.current !== myReqId) return;
      // FIFO purge if we're over the ceiling.
      if (cacheRef.current.size >= MAX_CACHE_ENTRIES) {
        const oldest = cacheRef.current.keys().next().value;
        if (oldest) cacheRef.current.delete(oldest);
      }
      cacheRef.current.set(k, out);
      setState({ data: out, loading: false, error: null });
    } catch (e) {
      if (ac.signal.aborted || reqIdRef.current !== myReqId) return;
      const msg = e instanceof Error ? e.message : "Search failed";
      setState({ data: null, loading: false, error: msg });
    }
  }, []);

  useEffect(() => {
    if (!params || !key) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    // Short-circuit if the query is too short — show empty state, no fetch.
    if (params.q.trim().length < 2) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    // Debounce: clear any pending timer + schedule a new one.
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void flush(key, params);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [params, key, flush]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return state;
}
