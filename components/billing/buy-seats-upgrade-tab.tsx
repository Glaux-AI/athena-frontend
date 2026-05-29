"use client";

/**
 * BuySeatsUpgradeTab — §7.9.9 rows 2497..2498.
 *
 * Tab body for "Upgrade to Pro" (only visible on solo tier — the parent
 * modal hides the whole tab strip otherwise). Renders the side-by-side
 * Solo-vs-Pro math comparison, the breakeven highlight from the BE
 * `pro_upgrade_quote`, and a submit button that opens the Stripe Checkout
 * upgrade URL.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type SeatsOut,
  type ProUpgradeQuote,
} from "@/lib/api/client";
import { formatUsd } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

const SOLO_BASE_USD = 50;
const PRO_BASE_USD = 150;

export function BuySeatsUpgradeTab({
  orgId,
  seats,
  quote,
  onError,
  onSuccess,
}: {
  orgId: string;
  seats: SeatsOut;
  quote: ProUpgradeQuote;
  onError: (msg: string | null) => void;
  onSuccess: (checkoutUrl: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const nTotal = seats.total_seats;
  const nExtrasOnSolo = Math.max(0, nTotal - seats.included_seats);
  const proExtras = Math.max(0, nTotal - quote.pro_included_seats);
  const soloPerSeat = seats.extra_seat_price_per_month_usd;
  const proPerSeat = quote.pro_extra_seat_price_per_month_usd;
  const soloTotal = SOLO_BASE_USD + nExtrasOnSolo * soloPerSeat;
  const proTotal = PRO_BASE_USD + proExtras * proPerSeat;

  const onSubmit = async () => {
    onError(null);
    setSubmitting(true);
    try {
      const res = await api.billing.upgradeToPro(orgId, {
        additional_seats: proExtras,
      });
      onSuccess(res.checkout_url);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Couldn't start upgrade.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="3">
      <p
        className="text-sm font-medium"
        data-testid="buy-seats-upgrade-headline"
      >
        Pro includes {quote.pro_included_seats} seats at the same per-seat
        rate, more capabilities, and $75/mo AI credit included.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PlanCard
          label="Stay on Solo"
          formula={`${formatUsd(SOLO_BASE_USD)} + ${nExtrasOnSolo} × ${formatUsd(soloPerSeat)}`}
          total={soloTotal}
          testId="buy-seats-solo-total"
          dim
        />
        <PlanCard
          label="Upgrade to Pro"
          formula={`${formatUsd(PRO_BASE_USD)} + ${proExtras} × ${formatUsd(proPerSeat)}`}
          total={proTotal}
          testId="buy-seats-pro-total"
        />
      </div>
      <p
        className="rounded-md border border-[var(--border)] bg-[var(--primary-soft)] px-3 py-2 text-xs text-[var(--primary)]"
        data-testid="buy-seats-breakeven"
      >
        Breakeven at {quote.breakeven_seats} seats — Pro becomes cheaper once
        you reach that count.
      </p>
      <Cluster justify="end">
        <Button
          onClick={() => void onSubmit()}
          disabled={submitting}
          data-testid="buy-seats-upgrade-submit"
        >
          {submitting && <Loader2 className="size-3 animate-spin" aria-hidden />}
          Upgrade to Pro for {formatUsd(proTotal)}/mo
        </Button>
      </Cluster>
    </Stack>
  );
}

function PlanCard({
  label,
  formula,
  total,
  testId,
  dim = false,
}: {
  label: string;
  formula: string;
  total: number;
  testId: string;
  dim?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-md border border-[var(--border)] bg-[var(--surface)] p-3",
        dim && "opacity-80",
      )}
    >
      <p className="text-xs uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{formula}</p>
      <p className="mt-1 text-base font-semibold">{formatUsd(total)}/mo</p>
    </div>
  );
}
