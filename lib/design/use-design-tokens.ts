"use client";

/**
 * Fetch the org's OWN design tokens for the Design Studio knobs. When the design
 * task has assigned design systems (`designTokenSetIds`), use THOSE saved systems'
 * tokens, MERGED across them (union by name, earlier set wins). With none assigned,
 * fall back to tokens derived from the org's ingested code. Never Athena's palette -
 * on error/empty the grouping layer supplies a NEUTRAL starter (see `groupTokens`).
 */

import { useEffect, useMemo, useState } from "react";

import { api, type DesignToken, type DesignTokenSet } from "@/lib/api/client";

function mergeTokens(lists: DesignToken[][]): DesignToken[] {
  const seen = new Map<string, DesignToken>();
  for (const list of lists) {
    for (const t of list) {
      if (!seen.has(t.name)) seen.set(t.name, t);
    }
  }
  return [...seen.values()];
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
      ? Promise.all(ids.map((id) => api.design.getSystem(id))).then((systems) => {
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
