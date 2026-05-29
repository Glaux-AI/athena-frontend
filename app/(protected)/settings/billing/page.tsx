"use client";

/**
 * /settings/billing — Stripe subscription, invoices, and payment methods.
 *
 * Three modes:
 *   1. **Live + Stripe configured** — renders real subscription / invoices /
 *      payment-methods + "Manage in Stripe" + per-tier upgrade CTAs.
 *   2. **Live + dev-unrestricted mode** — backend returns the synthetic
 *      `dev_unrestricted` subscription. We render a banner explaining
 *      billing is free + grey out the Stripe CTAs (they would 503).
 *   3. **Mock mode** — uses the mock-mode synthetic subscription so the
 *      page renders something sensible for UI-only dev.
 *
 * Reads use the BE shape from `athena/api/routers/billing.py`. Decimal
 * fields arrive as strings (Pydantic v2 default) — we coerce only at the
 * leaf via `Number(str)`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  ExternalLink,
  HelpCircle,
  Loader2,
  MoreHorizontal,
  Receipt,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError } from "@/lib/api/client";
import type {
  CreditBalance,
  Invoice,
  PaymentMethod,
  PriceCatalog,
  Subscription,
} from "@/lib/api/client";
import { formatUsd } from "@/lib/utils/format";
import { PRICE_CATALOG_FALLBACK } from "@/lib/billing/price-catalog";
import { SeatsCard } from "@/components/billing/seats-card";
import { CreditMeter } from "@/components/billing/credit-meter";
import { SpendCapCard } from "@/components/billing/spend-cap-card";
import { OverageToggleCard } from "@/components/billing/overage-toggle-card";
import { FreeOnboardingCard } from "@/components/billing/free-onboarding-card";

const DEV_TIER = "dev_unrestricted";

export default function BillingPage() {
  const { me, activeOrgId } = useSession();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalPending, setPortalPending] = useState(false);

  const myMembership = me?.memberships.find((mm) => mm.orgId === activeOrgId);
  const isOwner = !!myMembership?.isOwner;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch — none of these depend on each other. Credits
      // call is `Promise.allSettled`-style: a 404 from older BE builds
      // shouldn't blank the whole page.
      const [s, i, m, c] = await Promise.all([
        api.billing.subscription(),
        api.billing.invoices(),
        api.billing.paymentMethods(),
        activeOrgId
          ? api.credits.getBalance(activeOrgId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setSub(s);
      setInvoices(i);
      setMethods(m);
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
      // Endpoint not landed yet — leave the meter as-is.
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const isDevMode = sub?.tier === DEV_TIER || me?.devUnrestrictedAccess === true;
  const isFreeTier = creditBalance?.tier === "free";

  const onOpenPortal = async () => {
    setPortalPending(true);
    try {
      const { url } = await api.billing.portalSession();
      window.location.assign(url);
    } catch (e) {
      if (e instanceof ApiError && e.code === "dev_mode_active") {
        toast.info("Stripe is disabled in dev mode. Flip ATHENA_DEV_UNRESTRICTED_ACCESS=false to enable.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't open billing portal.");
      }
    } finally {
      setPortalPending(false);
    }
  };

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Subscription, invoices, and payment methods. Real cost is always
          measured in <Link href="/cost" className="underline">Cost</Link> regardless of billing mode.
        </p>
      </Stack>

      {isDevMode && <DevModeBanner />}

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
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
            onManage={() => void onOpenPortal()}
            portalPending={portalPending}
            orgId={activeOrgId}
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

          {!isDevMode && <UpgradeTiersCard currentTier={sub?.tier ?? null} />}

          <PaymentMethodsCard methods={methods} devMode={isDevMode} />

          <InvoicesCard invoices={invoices} devMode={isDevMode} />
        </Stack>
      )}
    </Stack>
  );
}

function DevModeBanner() {
  return (
    <Card className="border-[var(--warning)] bg-[var(--warning-soft)]">
      <Cluster gap="2" align="start">
        <Sparkles className="size-5 shrink-0 text-[var(--warning)]" />
        <Stack gap="0">
          <span className="text-sm font-semibold text-[var(--warning)]">
            Billing is free in dev mode
          </span>
          <span className="text-xs text-[var(--warning)]">
            Athena is running with <code className="font-mono">ATHENA_DEV_UNRESTRICTED_ACCESS=true</code>.
            Every feature is unlocked, no real charges. To enable Stripe, set
            <code className="font-mono"> ATHENA_DEV_UNRESTRICTED_ACCESS=false</code> + populate
            <code className="font-mono"> STRIPE_API_KEY</code> + <code className="font-mono">STRIPE_PRICE_ID_*</code>,
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
  onManage,
  portalPending,
  orgId,
}: {
  sub: Subscription | null;
  devMode: boolean;
  onManage: () => void;
  portalPending: boolean;
  orgId: string | null;
}) {
  if (!sub) {
    return (
      <Card>
        <Stack gap="3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Subscription</h2>
          <p className="text-sm text-[var(--text-muted)]">No active subscription. Choose a tier below.</p>
        </Stack>
      </Card>
    );
  }
  const tierLabel = sub.tier === DEV_TIER ? "Dev unrestricted" : sub.tier;
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="start">
          <Stack gap="0">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Subscription</h2>
            <Cluster gap="2" align="center" className="mt-1">
              <span className="text-2xl font-semibold capitalize">{tierLabel}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                sub.status === "active"
                  ? "bg-[var(--success-soft)] text-[var(--success)]"
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
              <Button variant="outline" size="sm" onClick={onManage} disabled={portalPending}>
                {portalPending ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
                Manage in Stripe
              </Button>
              {sub.tier === "pro" && orgId && (
                <SubscriptionOverflowMenu orgId={orgId} />
              )}
            </Cluster>
          )}
        </Cluster>
      </Stack>
    </Card>
  );
}

/**
 * §7.9.5 row 2465 — Overflow menu surfacing "Downgrade to Solo" for
 * pro-tier orgs. Owner-only would be a server-side check; here the
 * BE refuses with `code: "downgrade_blocked_active_members"` when
 * `active_seats > 1`, which we surface as a friendly toast.
 */
function SubscriptionOverflowMenu({ orgId }: { orgId: string }) {
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
      const res = await api.billing.downgradeToSolo(orgId);
      window.location.assign(res.checkout_url);
    } catch (e) {
      if (e instanceof ApiError && e.code === "downgrade_blocked_active_members") {
        const active = (e.metadata?.active_seats as number | undefined);
        const detail = typeof active === "number"
          ? `currently ${active} active`
          : "remove other members first";
        toast.error(
          `Remove all other members before downgrading to Solo (${detail}).`,
        );
      } else {
        toast.error(
          e instanceof ApiError ? e.message : "Couldn't start downgrade.",
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
          className="absolute right-0 top-full z-40 mt-1 w-[200px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
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
 * §7.9.5 row 2464 — Pricing labels read from `api.billing.priceCatalog`
 * so the FE stops hard-coding USD amounts. Falls back to the constants
 * file in `lib/billing/price-catalog.ts` when the BE endpoint is 404 (the
 * BE side is pending IIII).
 */
function UpgradeTiersCard({ currentTier }: { currentTier: string | null }) {
  const [catalog, setCatalog] = useState<PriceCatalog>(PRICE_CATALOG_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .priceCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        // Endpoint pending — leave the fallback in place.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fmt = (n: number) => `$${n}`;

  const tiers: Array<{
    id: "solo" | "pro" | "enterprise";
    label: string;
    sub: string;
    blurb: string;
    tooltip: string | null;
  }> = [
    {
      id: "solo",
      label: `${fmt(catalog.solo_base_usd)}/month`,
      sub: `(1 seat included) + ${fmt(catalog.solo_extra_seat_usd)}/seat/mo extras`,
      blurb: "Single seat. PRD + 1 capability.",
      tooltip: `Extra seats: ${fmt(catalog.solo_extra_seat_usd)}/seat/mo each.`,
    },
    {
      id: "pro",
      label: `${fmt(catalog.pro_base_usd)}/month`,
      sub: `(5 seats included) + ${fmt(catalog.pro_extra_seat_usd)}/seat/mo extras`,
      blurb: "Up to 10 seats. All features.",
      tooltip: `Extra seats: ${fmt(catalog.pro_extra_seat_usd)}/seat/mo each — cheaper per seat than Solo's extras.`,
    },
    { id: "enterprise", label: "Custom", sub: "", blurb: "SSO + SCIM + audit export.", tooltip: null },
  ];

  const onUpgrade = async (tier: "solo" | "pro" | "enterprise") => {
    try {
      const { url } = await api.billing.checkoutSession({
        tier,
        success_url: `${window.location.origin}/settings/billing?upgraded=1`,
        cancel_url: `${window.location.origin}/settings/billing?upgrade_cancelled=1`,
      });
      window.location.assign(url);
    } catch (e) {
      if (e instanceof ApiError && e.code === "dev_mode_active") {
        toast.info("Stripe is disabled in dev mode.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't start checkout.");
      }
    }
  };

  return (
    <Card id="upgrade-tiers">
      <Stack gap="3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Change tier</h2>
        <Grid cols="auto-fit-220" gap="3">
          {tiers.map((t) => (
            <Card key={t.id} className={currentTier === t.id ? "border-[var(--primary)]" : ""}>
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
                    {t.label}
                  </span>
                  {t.sub && (
                    <span className="text-xs text-[var(--text-muted)]" data-testid={`tier-sub-${t.id}`}>
                      {t.sub}
                    </span>
                  )}
                </Stack>
                <span className="text-xs text-[var(--text-muted)]">{t.blurb}</span>
                {currentTier === t.id ? (
                  <Button size="sm" variant="ghost" disabled>Current plan</Button>
                ) : (
                  <Button size="sm" onClick={() => void onUpgrade(t.id)}>
                    {currentTier ? "Switch" : "Choose"} {t.id}
                  </Button>
                )}
              </Stack>
            </Card>
          ))}
        </Grid>
      </Stack>
    </Card>
  );
}

function PaymentMethodsCard({ methods, devMode }: { methods: PaymentMethod[]; devMode: boolean }) {
  return (
    <Card id="payment-methods">
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <CreditCard className="size-4 text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Payment methods</h2>
        </Cluster>
        {methods.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {devMode
              ? "No payment methods needed in dev mode."
              : "No payment methods on file. Add one through the Stripe billing portal above."}
          </p>
        ) : (
          <Stack gap="2">
            {methods.map((m) => (
              <Cluster key={m.id} gap="2" align="center" justify="between" className="rounded-md border border-[var(--border)] p-3">
                <Cluster gap="2" align="center">
                  <span className="rounded bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">
                    {m.brand ?? m.kind}
                  </span>
                  <span className="font-mono text-sm">
                    {m.last4 ? `•••• ${m.last4}` : "—"}
                  </span>
                  {m.exp_month && m.exp_year && (
                    <span className="text-xs text-[var(--text-muted)]">
                      exp {String(m.exp_month).padStart(2, "0")}/{String(m.exp_year).slice(-2)}
                    </span>
                  )}
                </Cluster>
                {m.is_default && (
                  <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]">
                    Default
                  </span>
                )}
              </Cluster>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function InvoicesCard({ invoices, devMode }: { invoices: Invoice[]; devMode: boolean }) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <Receipt className="size-4 text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Invoices</h2>
        </Cluster>
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {devMode ? "No invoices in dev mode — billing is bypassed." : "No invoices yet."}
          </p>
        ) : (
          <Stack gap="2">
            {invoices.map((inv) => (
              <Cluster key={inv.id} gap="2" align="center" justify="between" className="rounded-md border border-[var(--border)] p-3">
                <Stack gap="0">
                  <span className="text-sm font-medium">{formatUsd(Number(inv.amount_paid_usd))}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : "—"} · {inv.status}
                  </span>
                </Stack>
                {inv.hosted_invoice_url && (
                  <a
                    href={inv.hosted_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--primary)] underline"
                  >
                    View invoice
                  </a>
                )}
              </Cluster>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function BillingSkeleton() {
  return (
    <Stack gap="6" aria-busy="true" aria-label="Loading billing">
      <Card>
        <Stack gap="3">
          <div className="h-3 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-7 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
      </Card>
      <Card>
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
