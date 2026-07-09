"use client";

/**
 * Saved views (`/v1/views`) - the data source for the /work SavedViewBar.
 * Mirrors the `useTasks` `{ ..., isLoading, error, reload }` shape. A saved
 * view is a named bundle of /work URL params; the URL stays the single source
 * of truth, so "applying" a view is just a router.replace.
 *
 * The active-chip matching lives here as pure functions so it's testable
 * without the component: a view is active when its params are a SUBSET of the
 * current URL's (extra live filters don't un-highlight the view you started
 * from), and when several views match, the most specific one wins the chip.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError, api, type SavedView } from "@/lib/api/client";

/** Subset match: every non-empty param the view pins must equal the current
 *  URL's value (missing on the URL counts as ""). */
export function viewIsActive(
  viewParams: Record<string, string>,
  current: Record<string, string>,
): boolean {
  return Object.entries(viewParams)
    .filter(([, v]) => v !== "")
    .every(([k, v]) => (current[k] ?? "") === v);
}

/** The chip to highlight: among subset-matching views, the one pinning the
 *  most params (ties keep the first in the given order). Null = none match. */
export function bestMatchingViewId(
  views: Pick<SavedView, "id" | "params">[],
  current: Record<string, string>,
): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const v of views) {
    if (!viewIsActive(v.params, current)) continue;
    const count = Object.values(v.params).filter((x) => x !== "").length;
    if (count > bestCount) {
      best = v.id;
      bestCount = count;
    }
  }
  return best;
}

interface UseViewsResult {
  views: SavedView[];
  isLoading: boolean;
  /** Non-null = the endpoint failed; the bar soft-fails (hides) on it. */
  error: string | null;
  reload: () => void;
}

export function useViews(enabled = true): UseViewsResult {
  const [views, setViews] = useState<SavedView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await api.views.list();
        if (!cancelled) setViews(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load saved views");
        setViews([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce, enabled]);

  return { views, isLoading, error, reload };
}
