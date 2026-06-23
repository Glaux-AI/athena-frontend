"use client";

/**
 * OverageToggleCard - §7.10.5 row 4.
 *
 * Owner-only toggle that lets AI calls continue once monthly credit
 * runs out by billing the excess to the card on file. Includes an
 * optional cap (`overage_cap_usd`) so the team can keep a ceiling on
 * end-of-period exposure.
 *
 * 409 `payment_method_required` is surfaced inline with a link back to
 * the payment-methods section so the user doesn't have to guess what
 * to do next.
 */

import { useState } from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type CreditBalance } from "@/lib/api/client";
import { formatUsdPrecise } from "@/lib/utils/format";

export function OverageToggleCard({
  balance,
  orgId,
  isOwner,
  onUpdated,
}: {
  balance: CreditBalance;
  orgId: string;
  isOwner: boolean;
  onUpdated: () => void;
}) {
  // The overage cap is stored and entered in USD (the ledger's unit).
  const [enabled, setEnabled] = useState(balance.overage_enabled);
  const [capInput, setCapInput] = useState<string>(
    balance.overage_cap_usd !== null ? String(balance.overage_cap_usd) : "",
  );
  const [pending, setPending] = useState(false);
  const [paymentMethodError, setPaymentMethodError] = useState(false);

  const save = async () => {
    const trimmed = capInput.trim();
    const usd: number | null = trimmed === "" ? null : Number(trimmed);
    if (usd !== null && (!Number.isFinite(usd) || usd <= 0)) {
      toast.error("Cap must be a positive dollar amount.");
      return;
    }
    const cap_usd: number | null = usd === null ? null : Math.round(usd);
    setPending(true);
    setPaymentMethodError(false);
    try {
      await api.credits.configureOverage(orgId, { enabled, cap_usd });
      toast.success(
        enabled
          ? cap_usd !== null
            ? `Overage on (capped at ${formatUsdPrecise(cap_usd)}).`
            : "Overage on (uncapped)."
          : "Overage disabled.",
      );
      onUpdated();
    } catch (e) {
      if (e instanceof ApiError && e.code === "payment_method_required") {
        setPaymentMethodError(true);
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't update overage settings.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Card
      id="overage-toggle"
      data-testid="overage-toggle-card"
      aria-label="Overage billing"
    >
      <Stack gap="3">
        <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Wallet className="size-4 text-[var(--text-muted)]" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Overage billing
          </h2>
        </Cluster>
        <p className="text-sm text-[var(--text-muted)]">
          When credit runs out, allow AI calls to continue and bill the
          overage to your card.
        </p>

        <Cluster gap="3" align="center" justify="between">
          <Cluster gap="2" align="center">
            <label
              htmlFor="overage-enabled"
              className="text-sm font-medium"
            >
              {enabled ? "Enabled" : "Disabled"}
            </label>
            <input
              id="overage-enabled"
              data-testid="overage-toggle"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!isOwner || pending}
              className="size-4 rounded border border-[var(--border)]"
            />
          </Cluster>
          {!isOwner && (
            <span
              className="text-xs text-[var(--text-muted)]"
              title="Only the org owner can configure overage billing."
            >
              Owner-only
            </span>
          )}
        </Cluster>

        {enabled && (
          <Stack gap="2">
            <label
              htmlFor="overage-cap-input"
              className="text-xs font-medium uppercase tracking-wider text-[var(--text-subtle)]"
            >
              Stop overage at ($, optional)
            </label>
            <input
              id="overage-cap-input"
              data-testid="overage-cap-input"
              type="number"
              min={1}
              step={1}
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              disabled={!isOwner || pending}
              placeholder="Leave blank for no cap"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            />
          </Stack>
        )}

        {paymentMethodError && (
          <p
            className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
            data-testid="overage-payment-method-error"
            role="alert"
          >
            Add a payment method first.{" "}
            <Link href="/settings/billing#payment-methods" className="underline">
              Open payment methods
            </Link>
            .
          </p>
        )}

        <Cluster gap="2" justify="end">
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!isOwner || pending}
            data-testid="overage-save"
          >
            {pending && <Loader2 className="size-3 animate-spin" aria-hidden />}
            Save
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}
