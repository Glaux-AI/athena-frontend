"use client";

/**
 * CreditsTopupModal — §7.10.5 row 5.
 *
 * Radix Dialog that takes an `amount_usd` (10..1000), opens a Stripe
 * Checkout session in a new tab, then polls the credit balance on the
 * user's return so we can toast the new balance once the webhook lands.
 *
 * The polling loop lives in `use-topup-return-poll.ts` so this file
 * stays focused on the dialog chrome.
 *
 * Tier-aware copy:
 *   - free tier sees "Topup credit lets you use platform models on Free
 *     without upgrading."
 *   - solo/pro see "Credit rolls over month-to-month."
 *     (TODO PPPP: confirm rollover policy — assumed-rolls-over until BE
 *     confirms; swap copy in one place if not.)
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError } from "@/lib/api/client";
import { formatUsd } from "@/lib/utils/format";
import { useTopupReturnPoll } from "@/components/billing/use-topup-return-poll";

const MIN_AMOUNT = 10;
const MAX_AMOUNT = 1000;
const DEFAULT_AMOUNT = 25;
const STEP = 5;

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
  const [amount, setAmount] = useState<number>(DEFAULT_AMOUNT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAmount(DEFAULT_AMOUNT);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  useTopupReturnPoll(orgId, onTopupReturn);

  const onSubmit = async () => {
    setError(null);
    const trimmed = clamp(amount);
    if (trimmed !== amount) setAmount(trimmed);
    setSubmitting(true);
    try {
      const res = await api.credits.topup(orgId, { amount_usd: trimmed });
      window.open(res.checkout_url, "_blank", "noopener,noreferrer");
      onOpenChange(false);
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
          className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl focus:outline-none"
          aria-describedby="topup-desc"
          data-testid="credits-topup-modal"
        >
          <Stack gap="4">
            <Cluster justify="between" align="center">
              <Dialog.Title className="text-lg font-semibold">
                Top up AI credits
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
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
                Amount (USD)
              </label>
              <input
                id="topup-amount"
                data-testid="credits-topup-amount"
                type="number"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                step={STEP}
                value={amount}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setAmount(Number.isNaN(next) ? MIN_AMOUNT : next);
                }}
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <p
                className="text-xs text-[var(--text-muted)]"
                data-testid="credits-topup-preview"
              >
                Adding {formatUsd(clamp(amount))} to your balance.
              </p>
              <p className="text-[10px] text-[var(--text-subtle)]">
                Min {formatUsd(MIN_AMOUNT)} · Max {formatUsd(MAX_AMOUNT)}.
              </p>
            </Stack>
            {error && (
              <p
                className="text-sm text-[var(--danger)]"
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
                Continue to Stripe
              </Button>
            </Cluster>
          </Stack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
