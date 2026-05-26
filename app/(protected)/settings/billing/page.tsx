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

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, ExternalLink, Loader2, Receipt, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError } from "@/lib/api/client";
import type { Invoice, PaymentMethod, Subscription } from "@/lib/api/client";
import { formatUsd } from "@/lib/utils/format";

const DEV_TIER = "dev_unrestricted";

export default function BillingPage() {
  const { me } = useSession();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalPending, setPortalPending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch — none of these depend on each other.
      const [s, i, m] = await Promise.all([
        api.billing.subscription(),
        api.billing.invoices(),
        api.billing.paymentMethods(),
      ]);
      setSub(s);
      setInvoices(i);
      setMethods(m);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load billing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const isDevMode = sub?.tier === DEV_TIER || me?.devUnrestrictedAccess === true;

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
          <SubscriptionCard
            sub={sub}
            devMode={isDevMode}
            onManage={() => void onOpenPortal()}
            portalPending={portalPending}
          />

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
}: {
  sub: Subscription | null;
  devMode: boolean;
  onManage: () => void;
  portalPending: boolean;
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
            <Button variant="outline" size="sm" onClick={onManage} disabled={portalPending}>
              {portalPending ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
              Manage in Stripe
            </Button>
          )}
        </Cluster>
      </Stack>
    </Card>
  );
}

function UpgradeTiersCard({ currentTier }: { currentTier: string | null }) {
  // Three real BE tiers per `cost-and-budgets.md`. CTAs only meaningful
  // when not already on that tier; lower tiers grey out.
  const tiers: Array<{ id: "solo" | "pro" | "enterprise"; price: string; blurb: string }> = [
    { id: "solo", price: "$0", blurb: "Single seat. PRD + 1 capability." },
    { id: "pro", price: "$50/mo", blurb: "Up to 10 seats. All features." },
    { id: "enterprise", price: "Custom", blurb: "SSO + SCIM + audit export." },
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
    <Card>
      <Stack gap="3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Change tier</h2>
        <Grid cols="auto-fit-220" gap="3">
          {tiers.map((t) => (
            <Card key={t.id} className={currentTier === t.id ? "border-[var(--primary)]" : ""}>
              <Stack gap="2">
                <span className="text-sm font-semibold capitalize">{t.id}</span>
                <span className="text-lg font-semibold">{t.price}</span>
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
    <Card>
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
