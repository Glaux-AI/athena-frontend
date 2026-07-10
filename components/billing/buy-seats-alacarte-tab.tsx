"use client";

/**
 * BuySeatsAlaCarteTab - §7.9.9 row 2496 (ADR-081).
 *
 * Tab body for "Add seats à la carte". Number input (1..50) + live price
 * preview (INR) + a submit button whose label reflects the chosen count.
 * Calls `api.billing.buySeats({orgId, count})` to mint a one-time Razorpay
 * Order, opens Checkout.js inline, and on a verified payment lifts the
 * result back through `onSuccess` so the parent modal can toast + close
 * (the webhook applies the seat increment).
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type SeatsOut } from "@/lib/api/client";
import { formatInr } from "@/lib/utils/format";
import { openRazorpayCheckout } from "@/lib/billing/razorpay-checkout";

const MIN_COUNT = 1;
const MAX_COUNT = 50;

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(n)));
}

function isValidCount(n: number): boolean {
  return Number.isFinite(n) && n >= MIN_COUNT && n <= MAX_COUNT && Number.isInteger(n);
}

export function BuySeatsAlaCarteTab({
  orgId,
  seats,
  defaultCount,
  onError,
  onSuccess,
}: {
  orgId: string;
  seats: SeatsOut;
  defaultCount: number;
  onError: (msg: string | null) => void;
  /** Called once the seat payment is verified (webhook applies it). */
  onSuccess: (requestedSeats: number) => void;
}) {
  const [count, setCount] = useState<number>(defaultCount);
  const [submitting, setSubmitting] = useState(false);

  const clamped = clampCount(count);
  // INR per-seat price (null in dev mode / Enterprise - fall back to 0 so
  // the preview reads "free" rather than NaN; the BE computes the real
  // order amount regardless).
  const price = seats.extra_seat_price_per_month ?? 0;
  const total = clamped * price;
  const valid = isValidCount(count);

  const onSubmit = async () => {
    onError(null);
    setSubmitting(true);
    try {
      const order = await api.billing.buySeats(orgId, { count: clamped });
      const outcome = await openRazorpayCheckout({ order });
      if (outcome.status === "dismissed") return;
      if (outcome.status === "error") {
        onError(outcome.message);
        return;
      }
      onSuccess(order.requested_seats);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Couldn't buy seats.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="3">
      <Stack gap="1">
        <label
          htmlFor="buy-seats-count"
          className="text-xs font-medium text-[var(--text-muted)]"
        >
          How many seats?
        </label>
        <input
          id="buy-seats-count"
          data-testid="buy-seats-count"
          type="number"
          min={MIN_COUNT}
          max={MAX_COUNT}
          step={1}
          value={count}
          onChange={(e) => {
            const next = Number(e.target.value);
            setCount(Number.isNaN(next) ? MIN_COUNT : next);
          }}
          className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
        <p
          className="text-xs text-[var(--text-muted)]"
          data-testid="buy-seats-preview"
        >
          Total: {clamped} × {formatInr(price)} = {formatInr(total)}/mo
        </p>
        <p className="text-micro text-[var(--text-subtle)]">
          Min {MIN_COUNT} · Max {MAX_COUNT}.
        </p>
      </Stack>
      <Cluster justify="end">
        <Button
          onClick={() => void onSubmit()}
          disabled={submitting || !valid}
          data-testid="buy-seats-submit"
        >
          {submitting && <Loader2 className="size-3 animate-spin" aria-hidden />}
          Add {clamped} seat{clamped > 1 ? "s" : ""} for {formatInr(total)}/mo
        </Button>
      </Cluster>
    </Stack>
  );
}
