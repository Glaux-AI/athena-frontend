"use client";

/**
 * Fetch the org's OWN design tokens for the Design Studio knobs. When the design
 * task has assigned design systems (`designTokenSetIds`), use THOSE saved systems'
 * tokens, MERGED across them (union by name, earlier set wins). With none assigned,
 * fall back to tokens derived from the org's ingested code. Never Athena's palette -
 * on error/empty the grouping layer supplies a NEUTRAL starter (see `groupTokens`).
 */

import { useEffect, useMemo, useState } from "react";

import {
  api,
  type DesignSystemDetail,
  type DesignToken,
  type DesignTokenSet,
} from "@/lib/api/client";

function mergeTokens(lists: DesignToken[][]): DesignToken[] {
  const seen = new Map<string, DesignToken>();
  for (const list of lists) {
    for (const t of list) {
      if (!seen.has(t.name)) seen.set(t.name, t);
    }
  }
  return [...seen.values()];
}

/** Module-level cache of fetched design systems, keyed by system id, so every
 *  ArtifactCard mount doesn't refetch the same sets; a small TTL keeps token
 *  edits reasonably fresh. Caching the PROMISE also dedupes concurrent mounts. */
const SYSTEM_TTL_MS = 5 * 60 * 1000;
const systemCache = new Map<string, { at: number; promise: Promise<DesignSystemDetail> }>();

/** Evict one system (or, with no id, every system) from the module cache.
 *  Called by the /design-tokens editor after any mutation (save / create /
 *  duplicate / delete) so a design task's studio never keeps baking stale
 *  token values into saved artifacts for the rest of the TTL. */
export function invalidateDesignSystemCache(id?: string): void {
  if (id === undefined) systemCache.clear();
  else systemCache.delete(id);
}

function fetchSystem(id: string): Promise<DesignSystemDetail> {
  const hit = systemCache.get(id);
  if (hit && Date.now() - hit.at < SYSTEM_TTL_MS) return hit.promise;
  const promise = api.design.getSystem(id);
  systemCache.set(id, { at: Date.now(), promise });
  // A failed fetch must not poison the cache for the whole TTL - evict so the
  // next mount retries.
  promise.catch(() => {
    if (systemCache.get(id)?.promise === promise) systemCache.delete(id);
  });
  return promise;
}

export function useDesignTokens(
  designTokenSetIds?: string[],
): { set: DesignTokenSet | null; loading: boolean } {
  const [set, setSet] = useState<DesignTokenSet | null>(null);
  const [loading, setLoading] = useState(true);
  // Stable dependency: the set of ids, order-insensitive, as a string key.
  const idsKey = useMemo(
    () => [...(designTokenSetIds ?? [])].sort().join(","),
    [designTokenSetIds],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const ids = idsKey ? idsKey.split(",") : [];
    const fetched: Promise<DesignTokenSet> = ids.length
      ? Promise.allSettled(ids.map((id) => fetchSystem(id))).then((results) => {
          // One failed system fetch must not nuke the whole merge to the
          // neutral starter - keep whatever resolved.
          const systems = results
            .filter(
              (r): r is PromiseFulfilledResult<DesignSystemDetail> => r.status === "fulfilled",
            )
            .map((r) => r.value);
          const tokens = mergeTokens(systems.map((s) => s.tokens));
          return { tokens, origin: tokens.length > 0 ? "derived" : "empty", repo_id: null };
        })
      : api.design.tokens();
    fetched
      .then((s) => {
        if (!cancelled) {
          setSet(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSet(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return { set, loading };
}
