"use client";

/**
 * Onboarding step 2 of 3 — choose a plan.
 *
 * The org was just created on Free (BE-seeded free-tier subscription).
 * This screen lets the owner stay on Free (one click → setup) or upgrade
 * to Solo / Pro, which mints a one-time Razorpay Order and opens
 * Checkout.js inline. The webhook is the entitlement source of truth, so
 * after a verified payment we proceed to setup and let the new tier land
 * asynchronously (the user can manage it any time in Settings → Billing).
 *
 * Enterprise is contact-sales. Prices come from the public price catalog
 * (INR ints) with a constant fallback so the cards never render blank.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Check, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { Stack, Cluster } from "@/components/layout/primitives";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { AiAccessChoice } from "@/components/onboarding/ai-access-choice";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type PriceCatalog } from "@/lib/api/client";
import { PRICE_CATALOG_FALLBACK } from "@/lib/billing/price-catalog";
import { TIER_REPO_LIMITS, type DisplayTier } from "@/lib/billing/tier-limits";
import { openRazorpayCheckout } from "@/lib/billing/razorpay-checkout";
import { formatInr } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

type PaidTier = "solo" | "pro";

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanContent />
    </Suspense>
  );
}

function PlanContent() {
  const params = useParams<{ org_slug: string }>();
  const orgSlug = params?.org_slug ?? "";
  const router = useRouter();
  const { me, activeOrgId, setActiveOrgId } = useSession();

  const [catalog, setCatalog] = useState<PriceCatalog>(PRICE_CATALOG_FALLBACK);
  const [currentTier, setCurrentTier] = useState<string>("free");
  const [pendingTier, setPendingTier] = useState<PaidTier | null>(null);
  // Free path opens the in-flow AI-access choice before setup, so a
  // Free workspace never lands in setup with no way to run AI.
  const [showAiAccess, setShowAiAccess] = useState(false);

  // Resolve org from slug → id; make it active so api.* targets it.
  const targetOrg = useMemo(
    () => me?.memberships.find((m) => m.orgSlug === orgSlug) ?? null,
    [me, orgSlug],
  );
  useEffect(() => {
    if (targetOrg && activeOrgId !== targetOrg.orgId) setActiveOrgId(targetOrg.orgId);
  }, [targetOrg, activeOrgId, setActiveOrgId]);

  // Live prices (fallback constants keep the cards populated if unreachable).
  useEffect(() => {
    let cancelled = false;
    api.billing
      .priceCatalog()
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Best-effort current tier so a returning owner sees "Current plan".
  useEffect(() => {
    let cancelled = false;
    api.billing
      .subscription()
      .then((s) => { if (!cancelled && s) setCurrentTier(s.tier); })
      .catch(() => { /* default "free" */ });
    return () => { cancelled = true; };
  }, [targetOrg]);

  const goSetup = useCallback(() => {
    router.replace(`/onboarding/${encodeURIComponent(orgSlug)}`);
  }, [router, orgSlug]);

  const onChoosePaid = useCallback(
    async (tier: PaidTier) => {
      setPendingTier(tier);
      try {
        const order = await api.billing.checkoutOrder({ tier, requested_extra_seats: 0 });
        const outcome = await openRazorpayCheckout({ order, prefillEmail: me?.email ?? null });
        if (outcome.status === "dismissed") return; // stay; let them retry / pick another
        if (outcome.status === "error") {
          toast.error(outcome.message);
          return;
        }
        // verified | unverified — webhook applies the tier; proceed to setup.
        toast.success("Payment received — your plan is activating. Let's finish setup.");
        goSetup();
      } catch (e) {
        if (e instanceof ApiError && e.code === "dev_mode_active") {
          toast.info("Billing is free in dev mode — continuing on Free.");
          goSetup();
        } else if (e instanceof ApiError && e.code === "billing_not_configured") {
          toast.error("Payments aren't configured yet. You can continue on Free for now.");
        } else {
          toast.error(e instanceof ApiError ? e.message : "Couldn't start checkout.");
        }
      } finally {
        setPendingTier(null);
      }
    },
    [me?.email, goSetup],
  );

  if (!targetOrg) {
    return (
      <Center>
        <Card className="w-[min(520px,calc(100%-2rem))] p-6">
          <Stack gap="3">
            <h1 className="text-lg font-semibold">Workspace not found</h1>
            <p className="text-sm text-[var(--text-muted)]">
              We couldn&apos;t find a workspace with slug{" "}
              <code className="font-mono">{orgSlug}</code>.
            </p>
            <Cluster gap="2">
              <Button asChild variant="outline"><Link href="/orgs/new">Create one</Link></Button>
              <Button asChild><Link href="/dashboard">Go to dashboard</Link></Button>
            </Cluster>
          </Stack>
        </Card>
      </Center>
    );
  }

  const solo = catalog.solo_base ?? PRICE_CATALOG_FALLBACK.solo_base;
  const soloExtra = catalog.solo_extra_seat ?? PRICE_CATALOG_FALLBACK.solo_extra_seat;
  const pro = catalog.pro_base ?? PRICE_CATALOG_FALLBACK.pro_base;
  const proExtra = catalog.pro_extra_seat ?? PRICE_CATALOG_FALLBACK.pro_extra_seat;

  const plans: PlanCardData[] = [
    {
      id: "free",
      name: "Free",
      price: "₹0",
      priceSuffix: "forever",
      seats: "1 seat",
      ai: "Bring your own AI key — or buy credits / upgrade to use Athena's models.",
      highlight: false,
    },
    {
      id: "solo",
      name: "Solo",
      price: solo === null ? "—" : formatInr(solo),
      priceSuffix: "/month",
      seats: soloExtra === null ? "1 seat" : `1 seat · +${formatInr(soloExtra)}/seat/mo`,
      ai: "Athena AI credit included every month — no key needed.",
      highlight: false,
    },
    {
      id: "pro",
      name: "Pro",
      price: pro === null ? "—" : formatInr(pro),
      priceSuffix: "/month",
      seats: proExtra === null ? "5 seats" : `5 seats · +${formatInr(proExtra)}/seat/mo`,
      ai: "More monthly Athena AI credit — built for teams.",
      highlight: true,
    },
  ];

  return (
    <Stack gap="6" className="mx-auto w-full max-w-5xl py-2">
      <OnboardingProgress current={2} />

      <div className="relative isolate overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 shadow-[var(--shadow-1)]">
        <AmbientBackground variant="subtle" />
        <Stack gap="1" className="items-center text-center">
          <GradientText as="h1" className="text-2xl font-semibold tracking-tight">
            Choose your plan
          </GradientText>
          <p className="max-w-xl text-sm text-[var(--text-muted)]">
            Start free — upgrade whenever you outgrow it. Your setup carries
            over either way. Every plan includes <strong>unlimited
            domains</strong>; you only scale on repos.
          </p>
        </Stack>
      </div>

      {showAiAccess ? (
        <AiAccessChoice
          orgId={targetOrg.orgId}
          usdToInr={catalog.usd_to_inr}
          onContinue={goSetup}
          onBack={() => setShowAiAccess(false)}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <PlanCard
                key={p.id}
                data={p}
                isCurrent={currentTier === p.id}
                pending={pendingTier === p.id}
                disabled={pendingTier !== null}
                onFree={() => setShowAiAccess(true)}
                onChoosePaid={onChoosePaid}
              />
            ))}

            {/* Enterprise — contact sales */}
            <Card
              data-testid="plan-card-enterprise"
              className="flex flex-col transition-[box-shadow,border-color,transform] duration-300 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]"
            >
              <Stack gap="3" className="flex-1">
                <Stack gap="0">
                  <span className="text-sm font-bold uppercase tracking-wider">Enterprise</span>
                  <Cluster gap="1" align="baseline" className="mt-2">
                    <span className="text-2xl font-bold">Custom</span>
                  </Cluster>
                  <span className="mt-1 text-xs text-[var(--text-muted)]">SSO · SCIM · audit export</span>
                </Stack>
                <Feature>{TIER_REPO_LIMITS.enterprise.reposLabel}</Feature>
                <Feature>Unlimited domains</Feature>
                <Feature>Volume AI credit, negotiated</Feature>
                <div className="flex-1" />
                <Button asChild variant="outline" className="w-full">
                  <a href="mailto:sales@athena.ai?subject=Athena%20Enterprise">Contact sales</a>
                </Button>
              </Stack>
            </Card>
          </div>

          <Cluster justify="between" align="center" className="flex-wrap gap-3">
            <p className="text-xs text-[var(--text-subtle)]">
              You can change your plan any time in Settings → Billing.
            </p>
            <Button variant="ghost" onClick={() => setShowAiAccess(true)} data-testid="plan-skip">
              Skip for now — continue on Free
              <ArrowRight className="size-4" />
            </Button>
          </Cluster>
        </>
      )}
    </Stack>
  );
}

interface PlanCardData {
  id: DisplayTier;
  name: string;
  price: string;
  priceSuffix: string;
  seats: string;
  ai: string;
  highlight: boolean;
}

function PlanCard({
  data,
  isCurrent,
  pending,
  disabled,
  onFree,
  onChoosePaid,
}: {
  data: PlanCardData;
  isCurrent: boolean;
  pending: boolean;
  disabled: boolean;
  onFree: () => void;
  onChoosePaid: (tier: PaidTier) => void;
}) {
  const limit = TIER_REPO_LIMITS[data.id];
  return (
    <Card
      data-testid={`plan-card-${data.id}`}
      className={cn(
        "flex flex-col transition-[box-shadow,border-color,transform] duration-300 ease-out hover:-translate-y-0.5",
        data.highlight && "border-[var(--border-accent)] shadow-[var(--shadow-glow)]",
        isCurrent && !data.highlight && "border-[var(--primary)]",
      )}
    >
      <Stack gap="3" className="flex-1">
        <Cluster justify="between" align="center">
          <span className="text-sm font-bold uppercase tracking-wider">{data.name}</span>
          {isCurrent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--success-ink)]">
              <Check className="size-3" aria-hidden /> Current
            </span>
          ) : data.highlight ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
              <Sparkles className="size-3" aria-hidden /> Popular
            </span>
          ) : null}
        </Cluster>

        <Stack gap="0">
          <Cluster gap="1" align="baseline">
            <span className="text-2xl font-bold" data-testid={`plan-price-${data.id}`}>{data.price}</span>
            <span className="text-xs text-[var(--text-muted)]">{data.priceSuffix}</span>
          </Cluster>
          <span className="mt-1 text-xs text-[var(--text-muted)]">{data.seats}</span>
        </Stack>

        <Stack gap="1.5">
          <Feature highlight>{limit.reposLabel}</Feature>
          <Feature>Unlimited domains</Feature>
          <Feature>{data.ai}</Feature>
        </Stack>

        <div className="flex-1" />

        {data.id === "free" ? (
          <Button
            variant={isCurrent ? "default" : "outline"}
            className="w-full"
            onClick={onFree}
            disabled={disabled}
            data-testid="plan-choose-free"
          >
            {isCurrent ? "Continue on Free" : "Start free"}
          </Button>
        ) : isCurrent ? (
          <Button variant="ghost" className="w-full" disabled>
            Current plan
          </Button>
        ) : (
          <Button
            variant={data.highlight ? "default" : "outline"}
            className="w-full"
            onClick={() => onChoosePaid(data.id as PaidTier)}
            disabled={disabled}
            data-testid={`plan-choose-${data.id}`}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {pending ? "Opening checkout…" : `Choose ${data.name}`}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

function Feature({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
      <span className={cn("text-sm", highlight ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]")}>
        {children}
      </span>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[60vh] place-items-center">{children}</div>;
}
