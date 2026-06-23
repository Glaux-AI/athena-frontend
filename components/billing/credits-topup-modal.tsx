"use client";

/**
 * CreditsTopupModal - §7.10.5 row 5 (ADR-081).
 *
 * Radix Dialog that takes an `amount_usd` (10..1000), mints a one-time
 * Razorpay top-up Order, and opens Razorpay Checkout.js inline. On a
 * verified payment it polls the credit balance until the webhook-applied
 * grant lands, then toasts the new balance.
 *
 * The post-payment balance poll lives in `pollCreditBalanceIncrease`
 * (`use-topup-return-poll.ts`) so this file stays focused on the dialog
 * chrome.
 *
 * Tier-aware copy:
 *   - free tier sees "Topup credit lets you use platform models on Free
 *     without upgrading."
 *   - solo/pro see "Credit rolls over month-to-month."
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError } from "@/lib/api/client";
import { formatUsdPrecise } from "@/lib/utils/format";
import { openRazorpayCheckout } from "@/lib/billing/razorpay-checkout";
import { pollCreditBalanceIncrease } from "@/components/billing/use-topup-return-poll";

// The top-up `amount_usd` the API charges is a whole USD int (10..1000).
// The ledger and this input are both USD; the server converts to the INR
// Razorpay order at charge time.
const MIN_AMOUNT = 10;
const MAX_AMOUNT = 1000;
const DEFAULT_AMOUNT = 25;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return MIN_AMOUNT;
  return Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.round(n)));
}

function isValidAmount(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_AMOUNT && n <= MAX_AMOUNT;
}

export function CreditsTopupModal({
  open,
  onOpenChange,
  orgId,
  tier,
  onTopupReturn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  tier: string;
  /** Called after a successful poll detects the balance increased.
   *  Parent uses this to refresh its `CreditBalance` state. */
  onTopupReturn: () => void;
}) {
  // `amount` is the USD figure sent to the API (source of truth); the
  // input is a separate string so typing stays smooth.
  const [amount, setAmount] = useState<number>(DEFAULT_AMOUNT);
  const [input, setInput] = useState<string>(String(DEFAULT_AMOUNT));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAmount(DEFAULT_AMOUNT);
      setInput(String(DEFAULT_AMOUNT));
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const onSubmit = async () => {
    setError(null);
    const trimmed = clamp(amount);
    if (trimmed !== amount) {
      setAmount(trimmed);
      setInput(String(trimmed));
    }
    setSubmitting(true);
    try {
      // Capture the pre-payment balance so the post-payment poll detects
      // a webhook grant that lands before its first read (null = fall back
      // to the poll's own first-read seeding).
      const baseline = await api.credits
        .getBalance(orgId)
        .then((b) => Number(b.credits_remaining_usd))
        .catch(() => null);
      const order = await api.credits.topup(orgId, { amount_usd: trimmed });
      const outcome = await openRazorpayCheckout({ order });
      if (outcome.status === "dismissed") {
        // User closed the Razorpay modal without paying - leave the
        // top-up dialog open so they can retry.
        return;
      }
      if (outcome.status === "error") {
        setError(outcome.message);
        return;
      }
      // verified | unverified - the webhook is the source of truth, so we
      // poll the balance for the applied grant regardless. Close the dialog
      // and surface the toast from the poll.
      onOpenChange(false);
      void pollCreditBalanceIncrease(orgId, onTopupReturn, baseline).then((applied) => {
        if (!applied && outcome.status === "unverified") {
          toast.message(
            "Payment received - credit will appear shortly.",
            { description: "We're confirming with the payment gateway." },
          );
        }
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start top-up.");
    } finally {
      setSubmitting(false);
    }
  };

  const copy =
    tier === "free"
      ? "Topup credit lets you use platform models on Free without upgrading."
      : "Credit rolls over month-to-month.";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content
          className="glass fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 shadow-[var(--shadow-3)] focus:outline-none"
          aria-describedby="topup-desc"
          data-testid="credits-topup-modal"
        >
          <Stack gap="4">
            <Cluster justify="between" align="center" className="-mx-5 -mt-5 border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-5 py-3 shadow-[var(--inner-highlight)]">
              <Dialog.Title className="text-lg font-semibold">
                Top up AI credits
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <X className="size-4" />
              </Dialog.Close>
            </Cluster>
            <Dialog.Description id="topup-desc" className="text-sm text-[var(--text-muted)]">
              {copy}
            </Dialog.Description>
            <Stack gap="2">
              <label
                htmlFor="topup-amount"
                className="text-xs font-medium uppercase tracking-wider text-[var(--text-subtle)]"
              >
                Amount ($)
              </label>
              <input
                id="topup-amount"
                data-testid="credits-topup-amount"
                type="number"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                step={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const usd = Number(e.target.value);
                  setAmount(Number.isNaN(usd) ? MIN_AMOUNT : Math.round(usd));
                }}
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <p
                className="text-xs text-[var(--text-muted)]"
                data-testid="credits-topup-preview"
              >
                Adding {formatUsdPrecise(clamp(amount))} to your balance.
              </p>
              <p className="text-[10px] text-[var(--text-subtle)]">
                Min {formatUsdPrecise(MIN_AMOUNT)} · Max {formatUsdPrecise(MAX_AMOUNT)}.
              </p>
            </Stack>
            {error && (
              <p
                className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
                data-testid="credits-topup-error"
                role="alert"
              >
                {error}
              </p>
            )}
            <Cluster justify="end" gap="2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={() => void onSubmit()}
                disabled={submitting || !isValidAmount(amount)}
                data-testid="credits-topup-submit"
              >
                {submitting && <Loader2 className="size-3 animate-spin" aria-hidden />}
                Continue to payment
              </Button>
            </Cluster>
          </Stack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
