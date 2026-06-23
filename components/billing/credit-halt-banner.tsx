"use client";

/**
 * CreditHaltBanner - §7.10.5 row 2.
 *
 * App-shell-level banner that warns or hard-stops the user based on
 * the org's credit state. Three states:
 *
 *   - 80%-warning  - yellow
 *   - exhausted    - red
 *   - spend_cap    - red
 *
 * All three are dismissible (keyed by kind in localStorage) so the banner
 * is never a fixed, unclosable wall - closing it only hides the notice; the
 * underlying credit gate is still enforced server-side. The dismissal is
 * remembered by the browser, so a refresh keeps it closed (localStorage,
 * not sessionStorage). Two escapes keep it from hiding a real problem
 * forever: a *different* kind (warning → exhausted) re-appears, and once
 * the condition clears (back to healthy) the stored dismissal is forgotten
 * so a later relapse surfaces again. Reads `api.credits.getBalance` once on
 * mount + on focus-resume; a 5-minute in-memory cache prevents hammering
 * the endpoint. The hard-stop variants render with `role="alert"` for AT
 * parity.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

import { Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, type CreditBalance } from "@/lib/api/client";
import { formatUsdPrecise } from "@/lib/utils/format";

type BannerKind = "warning" | "exhausted" | "spend_cap";

interface BannerState {
  kind: BannerKind;
  headline: string;
}

const CACHE_MS = 5 * 60 * 1000;
const DISMISSED_STORAGE_KEY = "athena.creditHaltBannerDismissed";

interface CachedBalance {
  balance: CreditBalance;
  fetchedAt: number;
  orgId: string;
}

let cached: CachedBalance | null = null;

function deriveBanner(balance: CreditBalance): BannerState | null {
  const remaining = Number(balance.credits_remaining_usd);
  const mtd = Number(balance.mtd_spend_usd);

  if (
    balance.hard_cap_usd !== null &&
    Number.isFinite(mtd) &&
    mtd >= balance.hard_cap_usd
  ) {
    return {
      kind: "spend_cap",
      headline: `Spend cap reached: ${formatUsdPrecise(balance.hard_cap_usd)}. Raise the cap to continue using AI features.`,
    };
  }
  if (remaining <= 0 && !balance.overage_enabled) {
    return {
      kind: "exhausted",
      headline:
        "AI services paused - credits exhausted. Top up or enable overage to continue.",
    };
  }
  if (balance.over_80_pct_threshold) {
    return {
      kind: "warning",
      headline:
        "Warning: 80% of your monthly credit is used. Top up to avoid interruption.",
    };
  }
  return null;
}

export function CreditHaltBanner() {
  const { activeOrgId } = useSession();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [dismissedKind, setDismissedKind] = useState<BannerKind | null>(() => {
    if (typeof window === "undefined") return null;
    return (window.localStorage.getItem(DISMISSED_STORAGE_KEY) as BannerKind) || null;
  });

  // Apply a freshly-derived banner. When the condition has cleared (back to
  // healthy → `next` is null), forget any remembered dismissal so a future
  // relapse of the same kind surfaces again instead of staying silenced.
  const applyBanner = useCallback((next: BannerState | null) => {
    setBanner(next);
    if (next === null) {
      setDismissedKind(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DISMISSED_STORAGE_KEY);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!activeOrgId) {
      applyBanner(null);
      return;
    }
    if (
      cached &&
      cached.orgId === activeOrgId &&
      Date.now() - cached.fetchedAt < CACHE_MS
    ) {
      applyBanner(deriveBanner(cached.balance));
      return;
    }
    try {
      const balance = await api.credits.getBalance(activeOrgId);
      cached = { balance, fetchedAt: Date.now(), orgId: activeOrgId };
      applyBanner(deriveBanner(balance));
    } catch {
      // Endpoint not landed yet (mock fallback or 404) - render nothing.
      applyBanner(null);
    }
  }, [activeOrgId, applyBanner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Focus-resume re-check - long sessions catch the 80% / exhausted
  // transition once the tab returns to the foreground.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      if (cached) cached = null; // invalidate cache on focus return
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const onDismiss = () => {
    if (!banner) return;
    setDismissedKind(banner.kind);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, banner.kind);
    }
  };

  if (!banner) return null;
  // Per-kind dismissal, remembered across refreshes - closing one state
  // still lets a different state (warning → exhausted) surface later.
  if (dismissedKind === banner.kind) return null;

  const isDanger = banner.kind !== "warning";

  return (
    <div
      data-testid={`credit-halt-banner-${banner.kind}`}
      role={isDanger ? "alert" : "status"}
      className={
        "w-full border-b px-4 py-2 text-sm " +
        (isDanger
          ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
          : "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]")
      }
    >
      <Cluster gap="3" align="center" justify="between" className="mx-auto max-w-screen-2xl">
        <Cluster gap="2" align="center" className="flex-wrap">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="font-medium">{banner.headline}</span>
          <Link
            href="/settings/billing"
            className="underline"
            data-testid="credit-halt-banner-cta"
          >
            {banner.kind === "spend_cap" ? "Adjust cap" : "Top up"}
          </Link>
          {/* On a hard stop (credits exhausted), the user can also bring
              their own LLM key - free - to keep working immediately. */}
          {banner.kind === "exhausted" && (
            <Link
              href="/settings/models"
              className="underline"
              data-testid="credit-halt-banner-byo"
            >
              Use your own AI key
            </Link>
          )}
        </Cluster>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          data-testid="credit-halt-banner-dismiss"
          className={
            "shrink-0 hover:opacity-80 " +
            (isDanger ? "text-[var(--danger-ink)]" : "text-[var(--warning-ink)]")
          }
        >
          <X className="size-4" />
        </button>
      </Cluster>
    </div>
  );
}

/** Test-only helper to reset the module-local cache between specs. */
export const __testing = {
  resetCache: () => {
    cached = null;
  },
};
