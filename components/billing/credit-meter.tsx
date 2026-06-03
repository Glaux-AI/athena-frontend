"use client";

/**
 * CreditMeter — §7.10.5 row 1.
 *
 * Sits next to <SeatsCard> on `/settings/billing`. Renders one of five
 * states from the org's `CreditBalance` shape:
 *
 *   - healthy        — remaining >= 20% of monthly_credit_usd (green/neutral)
 *   - warning        — over_80_pct_threshold === true (yellow)
 *   - exhausted      — remaining <= 0 AND !overage_enabled (red)
 *   - in_overage     — remaining < 0 AND overage_enabled (orange)
 *   - free_zero      — tier === 'free' AND remaining === 0 (neutral)
 *
 * The 5-state derivation lives in `deriveCreditState()` so the halt
 * banner + tests can reuse the same logic.
 */

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatUsdAsInr } from "@/lib/utils/format";
import type { CreditBalance } from "@/lib/api/client";
import { CreditsTopupModal } from "@/components/billing/credits-topup-modal";

type CreditMeterState =
  | "healthy"
  | "warning"
  | "exhausted"
  | "in_overage"
  | "free_zero";

/** Pure derivation — same logic the halt banner reads to decide
 *  whether (and which) to render. */
export function deriveCreditState(balance: CreditBalance): CreditMeterState {
  const remaining = Number(balance.credits_remaining_usd);
  if (balance.tier === "free" && remaining === 0) return "free_zero";
  if (remaining < 0 && balance.overage_enabled) return "in_overage";
  if (remaining <= 0 && !balance.overage_enabled) return "exhausted";
  if (balance.over_80_pct_threshold) return "warning";
  return "healthy";
}

function formatPeriodEnd(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "next period";
  }
}

interface MeterCopy {
  border: string;
  headlineTone: string;
  headline: string;
  subline: string;
  secondary?: { href: string; label: string; testId: string };
}

function copyForState(balance: CreditBalance, state: CreditMeterState): MeterCopy {
  const remaining = Number(balance.credits_remaining_usd);
  const monthly = balance.monthly_credit_usd;
  // The ledger is USD; display the customer-facing credit figures in INR.
  const rate = balance.usd_to_inr;
  switch (state) {
    case "free_zero":
      return {
        border: "",
        headlineTone: "",
        headline: "No credit included on Free plan.",
        subline: "Top up to use platform models — or configure a BYO API key.",
        secondary: {
          href: "/settings/models",
          label: "Configure BYO key",
          testId: "credit-meter-configure-byo",
        },
      };
    case "exhausted":
      return {
        border: "border-[var(--danger)]",
        headlineTone: "text-[var(--danger)]",
        headline: "AI credits exhausted",
        subline: "Top up or enable overage to resume.",
        secondary: {
          href: "#overage-toggle",
          label: "Enable overage",
          testId: "credit-meter-enable-overage",
        },
      };
    case "in_overage":
      return {
        border: "border-[var(--warning)]",
        headlineTone: "text-[var(--warning)]",
        headline: `On overage: ${formatUsdAsInr(Math.abs(remaining), rate)} consumed past plan`,
        subline: "You'll be billed for the overage at end of period.",
        secondary: {
          href: "#overage-toggle",
          label: "Manage overage",
          testId: "credit-meter-manage-overage",
        },
      };
    case "warning":
      return {
        border: "border-[var(--warning)]",
        headlineTone: "text-[var(--warning)]",
        headline: `${formatUsdAsInr(remaining, rate)} of ${formatUsdAsInr(monthly, rate)} available — 80% consumed`,
        subline: "Top up to avoid interruption.",
      };
    default:
      return {
        border: "",
        headlineTone: "",
        headline: `${formatUsdAsInr(remaining, rate)} of ${formatUsdAsInr(monthly, rate)} available`,
        subline: `Refreshes ${formatPeriodEnd(balance.period_end)}`,
      };
  }
}

export function CreditMeter({
  balance,
  orgId,
  onRefresh,
}: {
  balance: CreditBalance;
  orgId: string;
  onRefresh: () => void;
}) {
  const [topupOpen, setTopupOpen] = useState(false);
  const state = deriveCreditState(balance);
  const c = copyForState(balance, state);

  return (
    <>
      <Card data-testid="credit-meter" aria-label="AI credits" className={c.border}>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <Sparkles className="size-4 text-[var(--text-muted)]" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              AI credits
            </h2>
          </Cluster>
          <Stack gap="1">
            <p
              className={`text-lg font-semibold ${c.headlineTone}`}
              data-testid="credit-meter-headline"
            >
              {c.headline}
            </p>
            <p
              className="text-xs text-[var(--text-muted)]"
              data-testid="credit-meter-subline"
            >
              {c.subline}
            </p>
          </Stack>
          <Cluster gap="2" align="center">
            <Button
              type="button"
              size="sm"
              data-testid="credit-meter-topup"
              onClick={() => setTopupOpen(true)}
            >
              <CreditCard className="size-3" aria-hidden /> Top up
            </Button>
            {c.secondary && (
              <Link
                href={c.secondary.href}
                className="text-xs text-[var(--primary)] underline"
                data-testid={c.secondary.testId}
              >
                {c.secondary.label}
              </Link>
            )}
          </Cluster>
        </Stack>
      </Card>
      <CreditsTopupModal
        open={topupOpen}
        onOpenChange={setTopupOpen}
        orgId={orgId}
        tier={balance.tier}
        usdToInr={balance.usd_to_inr}
        onTopupReturn={onRefresh}
      />
    </>
  );
}
