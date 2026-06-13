"use client";

/**
 * /settings/billing - Razorpay subscription, tiers, seats, and credits.
 *
 * Three modes (ADR-081):
 *   1. **Live + Razorpay configured** - renders the real subscription +
 *      per-tier change CTAs that open Razorpay Checkout.js, plus an
 *      in-app "Cancel subscription" + "Downgrade to Solo" (Razorpay has
 *      no hosted customer portal).
 *   2. **Live + dev-unrestricted mode** - backend returns the synthetic
 *      `dev_unrestricted` subscription. We render a banner explaining
 *      billing is free + grey out the write CTAs (they would 503).
 *   3. **Mock mode** - uses the mock-mode synthetic subscription so the
 *      page renders something sensible for UI-only dev.
 *
 * Reads use the BE shape from `athena/api/routers/billing.py`. Tier
 * prices come from `priceCatalog()` as whole INR ints and render via
 * `formatInr`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HelpCircle,
  Loader2,
  MoreHorizontal,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api/client";
import type {
  CreditBalance,
  PriceCatalog,
  Subscription,
} from "@/lib/api/client";
import { formatInr } from "@/lib/utils/format";
import { PRICE_CATALOG_FALLBACK } from "@/lib/billing/price-catalog";
import { TIER_REPO_LIMITS } from "@/lib/billing/tier-limits";
import { openRazorpayCheckout } from "@/lib/billing/razorpay-checkout";
import { SeatsCard } from "@/components/billing/seats-card";
import { CreditMeter } from "@/components/billing/credit-meter";
import { SpendCapCard } from "@/components/billing/spend-cap-card";
import { OverageToggleCard } from "@/components/billing/overage-toggle-card";
import { FreeOnboardingCard } from "@/components/billing/free-onboarding-card";

const DEV_TIER = "dev_unrestricted";

/** Format an optional INR catalog price; falls back to a dash. */
function inrOrDash(value: number | null): string {
  return value === null ? "-" : formatInr(value);
}

export default function BillingPage() {
  const { me, activeOrgId } = useSession();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelPending, setCancelPending] = useState(false);

  const myMembership = me?.memberships.find((mm) => mm.orgId === activeOrgId);
  const isOwner = !!myMembership?.isOwner;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch - the subscription and credit balance don't depend
      // on each other. The credits call is best-effort: a 404 from older
      // BE builds shouldn't blank the whole page.
      const [s, c] = await Promise.all([
        api.billing.subscription(),
        activeOrgId
          ? api.credits.getBalance(activeOrgId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setSub(s);
      setCreditBalance(c);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load billing.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  const refreshCredits = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const c = await api.credits.getBalance(activeOrgId);
      setCreditBalance(c);
    } catch {
      // Endpoint not landed yet - leave the meter as-is.
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const isDevMode = sub?.tier === DEV_TIER || me?.devUnrestrictedAccess === true;
  const isFreeTier = creditBalance?.tier === "free";

  // ADR-081 - Razorpay has no hosted customer portal, so cancellation is an
  // in-app POST. The org keeps its tier until the period ends
  // (`cancel_at_period_end`); a future re-pay re-activates it.
  const onCancelSubscription = async () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Cancel your subscription? You'll keep your current plan until the end of the billing period, then drop to Free.",
      );
      if (!ok) return;
    }
    setCancelPending(true);
    try {
      const res = await api.billing.cancel();
      toast.success(
        res.cancel_at_period_end
          ? "Subscription will cancel at the end of the billing period."
          : "Subscription cancelled.",
      );
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "dev_mode_active") {
        toast.info("Billing is disabled in dev mode. Flip ATHENA_DEV_UNRESTRICTED_ACCESS=false to enable.");
      } else if (e instanceof ApiError && e.code === "no_active_subscription") {
        toast.info("No active subscription to cancel.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't cancel the subscription.");
      }
    } finally {
      setCancelPending(false);
    }
  };

  return (
    <Stack gap="6">
      <div className="-mx-4 -mt-4 rounded-xl bg-gradient-to-b from-[var(--surface-2)] to-transparent px-4 py-4 shadow-[var(--inner-highlight)] sm:-mx-6 sm:px-6">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Subscription, seats, and credits. Real cost is always
            measured in <Link href="/cost" className="underline">Cost</Link> regardless of billing mode.
          </p>
        </Stack>
      </div>

      {isDevMode && <DevModeBanner />}

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <BillingSkeleton />
      ) : (
        <Stack gap="6">
          {!isDevMode && isFreeTier && activeOrgId && (
            <FreeOnboardingCard orgId={activeOrgId} onTopupReturn={() => void refreshCredits()} />
          )}

          <SubscriptionCard
            sub={sub}
            devMode={isDevMode}
            onCancel={() => void onCancelSubscription()}
            cancelPending={cancelPending}
            orgId={activeOrgId}
            onChanged={() => void refresh()}
          />

          {!isDevMode && <SeatsCard orgId={activeOrgId} />}

          {!isDevMode && creditBalance && activeOrgId && (
            <CreditMeter
              balance={creditBalance}
              orgId={activeOrgId}
              onRefresh={() => void refreshCredits()}
            />
          )}

          {!isDevMode && creditBalance && activeOrgId && (
            <SpendCapCard
              balance={creditBalance}
              orgId={activeOrgId}
              isOwner={isOwner}
              onUpdated={() => void refreshCredits()}
            />
          )}

          {!isDevMode && creditBalance && activeOrgId && (
            <OverageToggleCard
              balance={creditBalance}
              orgId={activeOrgId}
              isOwner={isOwner}
              onUpdated={() => void refreshCredits()}
            />
          )}

          {!isDevMode && <UpgradeTiersCard currentTier={sub?.tier ?? null} onChanged={() => void refresh()} />}
        </Stack>
      )}
    </Stack>
  );
}

function DevModeBanner() {
  return (
    <Card className="border-[var(--warning)] bg-[var(--warning-soft)]">
      <Cluster gap="2" align="start">
        <Sparkles className="size-5 shrink-0 text-[var(--warning-ink)]" />
        <Stack gap="0">
          <span className="text-sm font-semibold text-[var(--warning-ink)]">
            Billing is free in dev mode
          </span>
          <span className="text-xs text-[var(--warning-ink)]">
            Athena is running with <code className="font-mono">ATHENA_DEV_UNRESTRICTED_ACCESS=true</code>.
            Every feature is unlocked, no real charges. To enable Razorpay, set
            <code className="font-mono"> ATHENA_DEV_UNRESTRICTED_ACCESS=false</code> + populate
            <code className="font-mono"> RAZORPAY_KEY_ID</code> + <code className="font-mono">RAZORPAY_KEY_SECRET</code> + <code className="font-mono">RAZORPAY_WEBHOOK_SECRET</code>,
            then restart the API. See <Link href="https://docs.athena/local-dev" className="underline">LOCAL_DEV.md §8</Link>.
          </span>
        </Stack>
      </Cluster>
    </Card>
  );
}

function SubscriptionCard({
  sub,
  devMode,
  onCancel,
  cancelPending,
  orgId,
  onChanged,
}: {
  sub: Subscription | null;
  devMode: boolean;
  onCancel: () => void;
  cancelPending: boolean;
  orgId: string | null;
  onChanged: () => void;
}) {
  if (!sub) {
    return (
      <Card variant="elevated">
        <Stack gap="3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Subscription</h2>
          <p className="text-sm text-[var(--text-muted)]">No active subscription. Choose a tier below.</p>
        </Stack>
      </Card>
    );
  }
  const tierLabel = sub.tier === DEV_TIER ? "Dev unrestricted" : sub.tier;
  const canCancel = !devMode && (sub.tier === "solo" || sub.tier === "pro") && !sub.cancel_at_period_end;
  return (
    <Card variant="elevated" className="transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5">
      <Stack gap="3">
        <Cluster justify="between" align="start">
          <Stack gap="0">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Subscription</h2>
            <Cluster gap="2" align="center" className="mt-1">
              <span className="text-2xl font-semibold capitalize">{tierLabel}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                sub.status === "active"
                  ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                  : "bg-[var(--surface-2)] text-[var(--text-muted)]"
              }`}>{sub.status}</span>
            </Cluster>
            {sub.current_period_end && (
              <span className="mt-1 text-xs text-[var(--text-muted)]">
                Renews {new Date(sub.current_period_end).toLocaleDateString()}
                {sub.cancel_at_period_end && " · will cancel at period end"}
              </span>
            )}
          </Stack>
          {!devMode && (
            <Cluster gap="2" align="center">
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  disabled={cancelPending}
                  data-testid="cancel-subscription"
                >
                  {cancelPending ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
                  Cancel subscription
                </Button>
              )}
              {sub.tier === "pro" && orgId && (
                <SubscriptionOverflowMenu orgId={orgId} onChanged={onChanged} />
              )}
            </Cluster>
          )}
        </Cluster>
      </Stack>
    </Card>
  );
}

/**
 * §7.9.5 row 2465 - Overflow menu surfacing "Downgrade to Solo" for
 * pro-tier orgs. Owner-only would be a server-side check; here the
 * BE refuses with `code: "downgrade_blocked_active_members"` when
 * `active_seats > 1`, which we surface as a friendly toast.
 */
function SubscriptionOverflowMenu({ orgId, onChanged }: { orgId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onDowngrade = async () => {
    setOpen(false);
    setPending(true);
    try {
      // ADR-081 - Standard Checkout has no proration, so the downgrade is an
      // immediate in-app row flip (no charge, no redirect).
      await api.billing.downgradeToSolo(orgId);
      toast.success("Downgraded to Solo.");
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.code === "downgrade_blocked_active_members") {
        const active = (e.metadata?.active_seats as number | undefined);
        const detail = typeof active === "number"
          ? `currently ${active} active`
          : "remove other members first";
        toast.error(
          `Remove all other members before downgrading to Solo (${detail}).`,
        );
      } else if (e instanceof ApiError && e.code === "dev_mode_active") {
        toast.info("Billing is disabled in dev mode.");
      } else {
        toast.error(
          e instanceof ApiError ? e.message : "Couldn't downgrade.",
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Subscription actions"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <MoreHorizontal className="size-4" aria-hidden />
        )}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Subscription actions"
          className="glass absolute right-0 top-full z-40 mt-1 w-[200px] rounded-xl p-1 shadow-[var(--shadow-3)]"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="downgrade-to-solo"
            onClick={() => void onDowngrade()}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:bg-[var(--surface-2)]"
          >
            Downgrade to Solo
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * §7.9.5 row 2464 / ADR-081 - tier cards. Prices read from
 * `api.billing.priceCatalog` (whole INR ints, rendered via `formatInr`);
 * repo limits from `TIER_REPO_LIMITS`. Domains are unlimited on every
 * tier, so no domain count is shown. "Choose / Switch" mints a one-time
 * Razorpay Order via `checkout-order` and opens Checkout.js inline.
 */
function UpgradeTiersCard({
  currentTier,
  onChanged,
}: {
  currentTier: string | null;
  onChanged: () => void;
}) {
  const [catalog, setCatalog] = useState<PriceCatalog>(PRICE_CATALOG_FALLBACK);
  const [pendingTier, setPendingTier] = useState<"solo" | "pro" | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .priceCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        // Endpoint unreachable - leave the fallback in place.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tiers: Array<{
    id: "solo" | "pro" | "enterprise";
    price: string;
    seats: string | null;
    tooltip: string | null;
  }> = [
    {
      id: "solo",
      price: `${inrOrDash(catalog.solo_base)}/month`,
      seats: `1 seat included · ${inrOrDash(catalog.solo_extra_seat)}/seat/mo extras`,
      tooltip: `Extra seats: ${inrOrDash(catalog.solo_extra_seat)}/seat/mo each.`,
    },
    {
      id: "pro",
      price: `${inrOrDash(catalog.pro_base)}/month`,
      seats: `5 seats included · ${inrOrDash(catalog.pro_extra_seat)}/seat/mo extras`,
      tooltip: `Extra seats: ${inrOrDash(catalog.pro_extra_seat)}/seat/mo each - cheaper per seat than Solo's extras.`,
    },
    { id: "enterprise", price: "Custom", seats: null, tooltip: null },
  ];

  const onChoose = async (tier: "solo" | "pro") => {
    setPendingTier(tier);
    try {
      const order = await api.billing.checkoutOrder({ tier, requested_extra_seats: 0 });
      const outcome = await openRazorpayCheckout({ order });
      if (outcome.status === "dismissed") return;
      if (outcome.status === "error") {
        toast.error(outcome.message);
        return;
      }
      // verified | unverified - the webhook upserts the subscription; poll
      // a moment then refresh so the new tier lands without a manual reload.
      toast.success("Payment received - your plan is being activated.");
      window.setTimeout(() => onChanged(), 4000);
    } catch (e) {
      if (e instanceof ApiError && e.code === "dev_mode_active") {
        toast.info("Billing is disabled in dev mode.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't start checkout.");
      }
    } finally {
      setPendingTier(null);
    }
  };

  return (
    <Card variant="elevated" id="upgrade-tiers">
      <Stack gap="3">
        <h2 className="border-b border-[var(--border)] pb-2.5 text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Change tier</h2>
        <Grid cols="auto-fit-220" gap="3">
          {tiers.map((t) => {
            const limit = TIER_REPO_LIMITS[t.id];
            const paidTier: "solo" | "pro" | null = t.id === "enterprise" ? null : t.id;
            return (
              <Card
                key={t.id}
                className={cn(
                  "transition-[box-shadow,transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]",
                  currentTier === t.id && "border-[var(--primary)] shadow-[var(--shadow-2)]",
                )}
              >
                <Stack gap="2">
                  <Cluster gap="1" align="center">
                    <span className="text-sm font-semibold capitalize">{t.id}</span>
                    {t.tooltip && (
                      <span
                        role="img"
                        aria-label={t.tooltip}
                        title={t.tooltip}
                        className="inline-flex"
                      >
                        <HelpCircle className="size-3 text-[var(--text-subtle)]" aria-hidden />
                      </span>
                    )}
                  </Cluster>
                  <Stack gap="0">
                    <span className="text-lg font-semibold" data-testid={`tier-price-${t.id}`}>
                      {t.price}
                    </span>
                    {t.seats && (
                      <span className="text-xs text-[var(--text-muted)]" data-testid={`tier-sub-${t.id}`}>
                        {t.seats}
                      </span>
                    )}
                  </Stack>
                  <span className="text-xs font-medium text-[var(--text)]" data-testid={`tier-repos-${t.id}`}>
                    {limit.reposLabel}
                  </span>
                  {currentTier === t.id ? (
                    <Button size="sm" variant="ghost" disabled>Current plan</Button>
                  ) : paidTier === null ? (
                    <Button asChild size="sm" variant="outline">
                      <a href="mailto:sales@athena.ai?subject=Athena%20Enterprise">Contact sales</a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void onChoose(paidTier)}
                      disabled={pendingTier !== null}
                      data-testid={`tier-choose-${t.id}`}
                    >
                      {pendingTier === t.id && <Loader2 className="size-3 animate-spin" aria-hidden />}
                      {currentTier ? "Switch to" : "Choose"} {t.id}
                    </Button>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Grid>
      </Stack>
    </Card>
  );
}

function BillingSkeleton() {
  return (
    <Stack gap="6" aria-busy="true" aria-label="Loading billing">
      <Card variant="elevated">
        <Stack gap="3">
          <div className="h-3 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-7 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
      </Card>
      <Card variant="elevated">
        <Stack gap="3">
          <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <Grid cols="auto-fit-220" gap="3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <Stack gap="2">
                  <div className="h-4 w-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-6 w-20 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
                </Stack>
              </Card>
            ))}
          </Grid>
        </Stack>
      </Card>
    </Stack>
  );
}
