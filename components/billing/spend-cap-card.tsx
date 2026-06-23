"use client";

/**
 * SpendCapCard - §7.10.5 row 3.
 *
 * Owner-only ceiling that halts AI calls once MTD spend hits the
 * configured dollar amount, regardless of credit balance or overage
 * setting. Lives on `/settings/billing` below <CreditMeter>.
 */

import { useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type CreditBalance } from "@/lib/api/client";
import { formatUsdPrecise } from "@/lib/utils/format";

export function SpendCapCard({
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
  // The cap is stored and entered in USD (the ledger's unit).
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState<string>(
    balance.hard_cap_usd !== null ? String(balance.hard_cap_usd) : "",
  );
  const [pending, setPending] = useState(false);

  const current = balance.hard_cap_usd;

  const save = async () => {
    const trimmed = input.trim();
    const usd: number | null = trimmed === "" ? null : Number(trimmed);
    if (usd !== null && (!Number.isFinite(usd) || usd <= 0)) {
      toast.error("Cap must be a positive dollar amount.");
      return;
    }
    const next: number | null = usd === null ? null : Math.round(usd);
    setPending(true);
    try {
      await api.credits.setSpendCap(orgId, { cap_usd: next });
      toast.success(next !== null ? `Spend cap set to ${formatUsdPrecise(next)}.` : "Spend cap cleared.");
      setEditing(false);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update spend cap.");
    } finally {
      setPending(false);
    }
  };

  const clear = async () => {
    setPending(true);
    try {
      await api.credits.setSpendCap(orgId, { cap_usd: null });
      toast.success("Spend cap cleared.");
      setInput("");
      setEditing(false);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't clear spend cap.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card data-testid="spend-cap-card" aria-label="Spend cap">
      <Stack gap="3">
        <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2.5">
          <ShieldAlert className="size-4 text-[var(--text-muted)]" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Spend cap
          </h2>
        </Cluster>
        <p className="text-sm text-[var(--text-muted)]">
          Stop all AI calls once this month&apos;s spend reaches a set dollar
          amount. You set the ceiling - we stop the meter.
        </p>

        {!editing && (
          <Cluster gap="3" align="center" justify="between">
            <p
              className="text-base font-semibold"
              data-testid="spend-cap-current"
            >
              {current !== null ? `Cap: ${formatUsdPrecise(current)}` : "No cap set"}
            </p>
            <Cluster gap="2" align="center">
              {!isOwner && (
                <span
                  className="text-xs text-[var(--text-muted)]"
                  title="Only the org owner can set spend caps."
                >
                  Owner-only
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                disabled={!isOwner}
                data-testid="spend-cap-edit"
              >
                {current !== null ? "Edit" : "Set cap"}
              </Button>
              {current !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void clear()}
                  disabled={!isOwner || pending}
                  data-testid="spend-cap-clear"
                >
                  Clear
                </Button>
              )}
            </Cluster>
          </Cluster>
        )}

        {editing && (
          <Stack gap="2">
            <label
              htmlFor="spend-cap-input"
              className="text-xs font-medium uppercase tracking-wider text-[var(--text-subtle)]"
            >
              Cap ($)
            </label>
            <input
              id="spend-cap-input"
              data-testid="spend-cap-input"
              type="number"
              min={1}
              step={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isOwner || pending}
              placeholder="e.g. 100"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            />
            <Cluster gap="2" justify="end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setInput(current !== null ? String(current) : "");
                }}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={!isOwner || pending}
                data-testid="spend-cap-save"
              >
                {pending && <Loader2 className="size-3 animate-spin" aria-hidden />}
                Save
              </Button>
            </Cluster>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
