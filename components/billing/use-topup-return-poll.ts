/**
 * §7.10.5 — Watches for `?topup_succeeded=true` on the current URL
 * after a Stripe-Checkout new-tab return, then polls
 * `api.credits.getBalance` every 5s until the balance ticks up
 * (max 12 attempts = 1 minute). Triggers a Sonner toast with the new
 * balance and calls `onTopupReturn` so the parent can refresh its
 * `CreditBalance` snapshot.
 */

"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import { formatUsd } from "@/lib/utils/format";

const TOPUP_QUERY_PARAM = "topup_succeeded";
const MAX_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 5000;

export function useTopupReturnPoll(
  orgId: string,
  onTopupReturn: () => void,
): void {
  const ranRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ranRef.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(TOPUP_QUERY_PARAM) !== "true") return;
    ranRef.current = true;

    // Clean the query param so a refresh doesn't re-trigger the poll.
    url.searchParams.delete(TOPUP_QUERY_PARAM);
    window.history.replaceState({}, "", url.toString());

    let cancelled = false;
    let attempts = 0;
    let priorBalance: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const balance = await api.credits.getBalance(orgId);
        const remaining = Number(balance.credits_remaining_usd);
        if (priorBalance === null) {
          priorBalance = remaining;
        } else if (remaining > priorBalance) {
          const delta = remaining - priorBalance;
          toast.success(
            `Credit added — ${formatUsd(remaining)} now available.`,
            { description: `+${formatUsd(delta)}` },
          );
          onTopupReturn();
          return;
        }
      } catch {
        // Swallow — the next poll will retry. A flapping network
        // shouldn't spam toasts.
      }
      if (attempts < MAX_ATTEMPTS && !cancelled) {
        setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [orgId, onTopupReturn]);
}
