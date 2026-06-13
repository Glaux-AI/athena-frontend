"use client";

/**
 * useActiveOrgTier - the active org's REAL billing tier for display.
 *
 * The TopBar used to show `org.edition` (a legacy feature-gate field that
 * defaults to "pro" at create time) as if it were the plan, so a brand-new
 * Free org rendered a misleading "Pro" chip. The truth is the subscription
 * tier (`free | solo | pro | enterprise`, plus the `dev_unrestricted`
 * sentinel), which this hook reads from `GET /v1/billing/subscription`
 * (org-scoped via the `X-Athena-Org-Id` header).
 *
 * Returns `null` while loading or when the subscription is unreadable
 * (caller without `billing_read`, offline, older BE) - callers should omit
 * the plan chip rather than fall back to the misleading edition. Cached
 * 5 minutes per org and re-fetched when the active org changes, mirroring
 * the credit-halt banner's caching so an org switch always re-resolves.
 */

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

const CACHE_MS = 5 * 60 * 1000;

interface CachedTier {
  orgId: string;
  tier: string | null;
  fetchedAt: number;
}

let cached: CachedTier | null = null;

export function useActiveOrgTier(): string | null {
  const { activeOrgId } = useSession();
  const [tier, setTier] = useState<string | null>(() =>
    cached && cached.orgId === activeOrgId ? cached.tier : null,
  );

  useEffect(() => {
    if (!activeOrgId) {
      setTier(null);
      return;
    }
    if (
      cached &&
      cached.orgId === activeOrgId &&
      Date.now() - cached.fetchedAt < CACHE_MS
    ) {
      setTier(cached.tier);
      return;
    }
    let cancelled = false;
    api.billing
      .subscription()
      .then((s) => {
        // A free org still has a seeded free-tier subscription row, so a
        // null response means "no subscription surface" → treat as free.
        const resolved = s?.tier ?? "free";
        cached = { orgId: activeOrgId, tier: resolved, fetchedAt: Date.now() };
        if (!cancelled) setTier(resolved);
      })
      .catch(() => {
        // Unreadable (no billing_read / offline) - show nothing, not a lie.
        if (!cancelled) setTier(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  return tier;
}

/** Human label for a billing-tier string (incl. the dev sentinel). */
export function planLabel(tier: string): string {
  switch (tier) {
    case "free":
      return "Free";
    case "solo":
      return "Solo";
    case "pro":
      return "Pro";
    case "enterprise":
      return "Enterprise";
    case "dev_unrestricted":
      return "Dev";
    default:
      return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "";
  }
}
