/**
 * §7.10.5 / ADR-081 - post-payment credit-balance poll.
 *
 * After Razorpay Checkout.js reports a verified payment, the entitlement
 * is applied asynchronously by the `payment.captured` webhook (the source
 * of truth). This helper polls `api.credits.getBalance` every 5s until the
 * remaining balance ticks up (max 12 attempts = 1 minute), toasts the new
 * balance, invokes `onApplied` so the caller can refresh its snapshot, and
 * resolves `true`. Resolves `false` if the increase didn't land within the
 * window (the webhook may still be in flight - the caller may show a
 * "credit will appear shortly" note).
 *
 * The inline Checkout.js flow (ADR-081) replaced the old new-tab redirect,
 * so there is no longer a `?topup_succeeded=true` return URL to watch.
 */

import { toast } from "sonner";

import { api } from "@/lib/api/client";
import { formatUsdAsInr } from "@/lib/utils/format";

const MAX_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 5000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the org credit balance until it increases past its starting value.
 * Resolves `true` once an increase is observed (after toasting it), or
 * `false` if no increase lands within the poll window.
 *
 * `baselineUsd` is the balance captured BEFORE the payment. Without it the
 * baseline is seeded from the first post-payment read - which misses the
 * grant entirely when the webhook lands before that first read (common:
 * verify + render round-trips take seconds). Callers that can read the
 * balance up front should always pass it.
 */
export async function pollCreditBalanceIncrease(
  orgId: string,
  onApplied: () => void,
  baselineUsd?: number | null,
): Promise<boolean> {
  let priorBalance: number | null =
    typeof baselineUsd === "number" && Number.isFinite(baselineUsd)
      ? baselineUsd
      : null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const balance = await api.credits.getBalance(orgId);
      const remaining = Number(balance.credits_remaining_usd);
      if (priorBalance === null) {
        priorBalance = remaining;
      } else if (remaining > priorBalance) {
        const added = remaining - priorBalance;
        // The ledger is USD; display the credit figures in INR (ADR-081).
        const rate = balance.usd_to_inr;
        toast.success(
          `Credit added - ${formatUsdAsInr(remaining, rate)} now available.`,
          { description: `+${formatUsdAsInr(added, rate)}` },
        );
        onApplied();
        return true;
      }
    } catch {
      // Swallow - the next poll will retry. A flapping network shouldn't
      // spam toasts.
    }
    if (attempt < MAX_ATTEMPTS - 1) await delay(POLL_INTERVAL_MS);
  }
  return false;
}
