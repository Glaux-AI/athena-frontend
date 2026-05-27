"use client";

/**
 * BuySeatsAlaCarteTab — §7.9.9 row 2496.
 *
 * Tab body for "Add seats à la carte". Number input (1..50) + live price
 * preview + a submit button whose label reflects the chosen count. Calls
 * `api.billing.buySeats({orgId, count})` on submit and lifts the result
 * back through `onSuccess` so the parent modal can open the Stripe URL
 * + toast + close.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type SeatsOut } from "@/lib/api/client";
import { formatUsd } from "@/lib/utils/format";

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
  onSuccess: (additionalSeats: number, stripeInvoiceUrl: string) => void;
}) {
  const [count, setCount] = useState<number>(defaultCount);
  const [submitting, setSubmitting] = useState(false);

  const clamped = clampCount(count);
  const price = seats.extra_seat_price_per_month_usd;
  const total = clamped * price;
  const valid = isValidCount(count);

  const onSubmit = async () => {
    onError(null);
    setSubmitting(true);
    try {
      const res = await api.billing.buySeats(orgId, { count: clamped });
      onSuccess(res.additional_seats, res.stripe_invoice_url);
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
          className="text-xs font-medium uppercase tracking-wider text-[var(--text-subtle)]"
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
          Total: {clamped} × {formatUsd(price)} = {formatUsd(total)}/mo
        </p>
        <p className="text-[10px] text-[var(--text-subtle)]">
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
          Add {clamped} seat{clamped > 1 ? "s" : ""} for {formatUsd(total)}/mo
        </Button>
      </Cluster>
    </Stack>
  );
}
