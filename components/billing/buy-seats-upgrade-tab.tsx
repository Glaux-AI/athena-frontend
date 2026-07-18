"use client";

/**
 * BuySeatsUpgradeTab - §7.9.9 rows 2497..2498 (ADR-081).
 *
 * Tab body for "Upgrade to Pro" (only visible on solo tier - the parent
 * modal hides the whole tab strip otherwise). Renders the side-by-side
 * Solo-vs-Pro math comparison (in INR, base prices from the public price
 * catalog), the breakeven highlight from the BE `pro_upgrade_quote`, and a
 * submit button that mints a one-time Razorpay upgrade Order and opens
 * Checkout.js inline. The webhook upserts the subscription to Pro on
 * `payment.captured`.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type SeatsOut,
  type ProUpgradeQuote,
  type PriceCatalog,
} from "@/lib/api/client";
import { formatInr } from "@/lib/utils/format";
import { PRICE_CATALOG_FALLBACK } from "@/lib/billing/price-catalog";
import { openRazorpayCheckout } from "@/lib/billing/razorpay-checkout";
import { cn } from "@/lib/cn";

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
  /** Called once the upgrade payment is verified (webhook upserts to Pro). */
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [catalog, setCatalog] = useState<PriceCatalog>(PRICE_CATALOG_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .priceCatalog()
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch(() => { /* endpoint unreachable - keep the fallback */ });
    return () => { cancelled = true; };
  }, []);

  const soloBase = catalog.solo_base ?? PRICE_CATALOG_FALLBACK.solo_base ?? 0;
  const proBase = catalog.pro_base ?? PRICE_CATALOG_FALLBACK.pro_base ?? 0;

  const nTotal = seats.total_seats;
  const nExtrasOnSolo = Math.max(0, nTotal - seats.included_seats);
  const proExtras = Math.max(0, nTotal - quote.pro_included_seats);
  const soloPerSeat = seats.extra_seat_price_per_month ?? 0;
  const proPerSeat = quote.pro_extra_seat_price_per_month;
  const soloTotal = soloBase + nExtrasOnSolo * soloPerSeat;
  const proTotal = proBase + proExtras * proPerSeat;

  const onSubmit = async () => {
    onError(null);
    setSubmitting(true);
    try {
      const order = await api.billing.upgradeToPro(orgId, {
        additional_seats: proExtras,
      });
      const outcome = await openRazorpayCheckout({ order });
      if (outcome.status === "dismissed") return;
      if (outcome.status === "error") {
        onError(outcome.message);
        return;
      }
      onSuccess();
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
        Pro includes {quote.pro_included_seats} seats at a lower per-seat
        rate, more repos, and more monthly AI credit.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PlanCard
          label="Stay on Solo"
          formula={`${formatInr(soloBase)} + ${nExtrasOnSolo} × ${formatInr(soloPerSeat)}`}
          total={soloTotal}
          testId="buy-seats-solo-total"
          dim
        />
        <PlanCard
          label="Upgrade to Pro"
          formula={`${formatInr(proBase)} + ${proExtras} × ${formatInr(proPerSeat)}`}
          total={proTotal}
          testId="buy-seats-pro-total"
        />
      </div>
      <p
        className="rounded-lg border border-[var(--border-accent)] bg-[var(--primary-soft)] px-3 py-2 text-xs font-medium text-[var(--primary)]"
        data-testid="buy-seats-breakeven"
      >
        Breakeven at {quote.breakeven_seats} seats - Pro becomes cheaper once
        you reach that count.
      </p>
      <Cluster justify="end">
        <Button
          onClick={() => void onSubmit()}
          disabled={submitting}
          data-testid="buy-seats-upgrade-submit"
        >
          {submitting && <Loader2 className="size-3 animate-spin" aria-hidden />}
          Upgrade to Pro for {formatInr(proTotal)}/mo
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
        "rounded-lg border p-3",
        dim
          ? "border-[var(--border)] bg-[var(--surface-2)]"
          : "border-[var(--border-accent)] bg-[var(--surface)] shadow-[var(--shadow-1)]",
      )}
    >
      <Eyebrow className="block">{label}</Eyebrow>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{formula}</p>
      <p className="mt-1 text-base font-semibold">{formatInr(total)}/mo</p>
    </div>
  );
}
