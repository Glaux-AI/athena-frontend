"use client";

/**
 * CreditHaltGuidance — §7.10.5 (ADR-081).
 *
 * Inline three-path guidance rendered when a run (or any action) is blocked
 * because the org's Athena AI credit is exhausted / spend-capped / overage
 * is off. The user is on the Free tier (or out of credit) and has three
 * ways forward, surfaced as explicit CTAs:
 *
 *   1. **Bring your own LLM key (BYO)** — free; routes to /settings/models.
 *   2. **Buy credits** — top up Athena credit; routes to billing top-up.
 *   3. **Upgrade** — move to a paid tier; routes to the tier cards.
 *
 * Companion to `credit-halt-banner.tsx` (the app-shell banner) + the
 * `limit-error-toast.ts` mapper (transient toasts). This is the *blocking*
 * surface shown next to the action the user just tried to take, so the
 * three options are always visible (not hidden behind a single toast
 * action button).
 */

import Link from "next/link";
import { AlertTriangle, KeyRound, CreditCard, ArrowUpCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";

/** BE error codes (NNNN's LLM/ingest enforcement) that mean "out of credit"
 *  — the set the three-path guidance answers. Kept in sync with the
 *  credit-halt subset of `lib/billing/limit-error-toast.ts`. */
export const CREDIT_HALT_CODES = new Set<string>([
  "credits_exhausted",
  "spend_cap_reached",
  "overage_not_enabled",
  "credit_halt",
]);

function headlineFor(code: string, message: string): string {
  switch (code) {
    case "spend_cap_reached":
      return "Your workspace hit its spend cap.";
    case "overage_not_enabled":
      return "Out of AI credit and overage is off.";
    case "credits_exhausted":
    case "credit_halt":
      return "Your workspace is out of AI credit.";
    default:
      return message || "AI services are paused.";
  }
}

export function CreditHaltGuidance({
  code,
  message,
}: {
  code: string;
  message: string;
}) {
  return (
    <Card
      data-testid="credit-halt-guidance"
      role="alert"
      className="border-[var(--danger)] bg-[var(--danger-soft)]"
    >
      <Stack gap="3">
        <Cluster gap="2" align="start">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger-ink)]" aria-hidden />
          <Stack gap="0">
            <span className="text-sm font-semibold text-[var(--danger-ink)]">
              {headlineFor(code, message)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Pick one of these to keep going:
            </span>
          </Stack>
        </Cluster>
        <Cluster gap="2" align="center" justify="start" className="flex-wrap">
          <Button asChild size="sm" variant="outline" data-testid="credit-halt-byo">
            <Link href="/settings/models">
              <KeyRound className="size-3.5" aria-hidden />
              Use your own AI key — free
            </Link>
          </Button>
          <Button asChild size="sm" data-testid="credit-halt-buy-credits">
            <Link href="/settings/billing#upgrade-tiers">
              <CreditCard className="size-3.5" aria-hidden />
              Buy credits
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" data-testid="credit-halt-upgrade">
            <Link href="/settings/billing#upgrade-tiers">
              <ArrowUpCircle className="size-3.5" aria-hidden />
              Upgrade plan
            </Link>
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}
