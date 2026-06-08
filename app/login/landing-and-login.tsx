"use client";

/**
 * /login — Athena landing page + sign-in.
 *
 * Layout (Build Floor direction):
 *   1. Fixed nav — wordmark + sign-in anchor.
 *   2. Hero — what Athena is + sign-in card (front page).
 *   3. Pinned scrollytelling — connect → ingest → graph → stack → chat →
 *      task → stages → gate → PR → cost → ready.
 *   4. Integrations grid + trust strip.
 *   5. Pricing — public tier cards.
 *   6. Footer.
 *
 * Honors `?returnTo=` for accept-invite + protected routes.
 */

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2, Loader2, ArrowRight, X, Lock, Eye, ShieldCheck, Key,
  CheckCircle2, ChevronDown, Gauge, Cpu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { config } from "@/lib/config";
import { api, ApiError, type PriceCatalog } from "@/lib/api/client";
import { PRICE_CATALOG_FALLBACK } from "@/lib/billing/price-catalog";
import { TIER_REPO_LIMITS, TIER_MONTHLY_CREDIT_USD, type DisplayTier } from "@/lib/billing/tier-limits";
import { formatInr, formatUsdAsInr } from "@/lib/utils/format";
import { useSession, writeMockSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

import { ThemeToggle } from "@/components/theme/theme-toggle";

import { ACT0 } from "./build-floor/beats";
import { BuildFloorScroll } from "./build-floor/scroll-stage";
import { SignInCard } from "./sign-in-card";

const INTEGRATIONS = [
  { group: "Source control",      items: ["GitHub", "GitLab", "Bitbucket"] },
  { group: "Work management",     items: ["Jira", "Linear"] },
  { group: "Comms",               items: ["Slack", "Microsoft Teams"] },
  { group: "Knowledge",           items: ["Notion", "Confluence"] },
  { group: "Models",              items: ["Anthropic", "AWS Bedrock", "Azure OpenAI"] },
  { group: "Observability",       items: ["Datadog", "Sentry", "PagerDuty"] },
  { group: "Design + CRM",        items: ["Figma", "Salesforce", "Zendesk"] },
];

const TRUST = [
  { icon: Lock,        label: "Your code stays yours",  sub: "Generated diffs land in your repo, on your branch." },
  { icon: Eye,         label: "Audit every gate",       sub: "Decisions, prompts, costs — recorded per task." },
  { icon: Cpu,         label: "Bring your own model",   sub: "Anthropic · Bedrock · Azure OpenAI." },
  { icon: ShieldCheck, label: "SSO via GitHub",         sub: "Inherits Okta, Entra ID, Google Workspace, Auth0." },
  { icon: Key,         label: "BYOK encryption",        sub: "Bring your own KMS key for data at rest." },
];

export default function LandingAndLogin() {
  return (
    <Suspense fallback={null}>
      <LandingAndLoginContent />
    </Suspense>
  );
}

function LandingAndLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [scrolled, setScrolled] = useState(false);

  const returnTo = params.get("returnTo") ?? "/dashboard";
  const signupQuery = params.toString() ? `?${params.toString()}` : "";

  const errorCode = params.get("error");
  const notice = (() => {
    switch (errorCode) {
      case "org_deleted":
        return "Your organization was deleted. Sign in to a different organization, or contact an owner if this was a mistake.";
      case "session_expired":
        return "Your session expired. Sign in again to continue.";
      case null:
      case "":
        return null;
      default:
        return "We signed you out. Please sign in to continue.";
    }
  })();

  const [ssoOpen, setSsoOpen] = useState(false);
  const [ssoSlug, setSsoSlug] = useState("");
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoPending, setSsoPending] = useState(false);

  const jumpToSignIn = () => {
    document.getElementById("signin")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onSsoSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const slug = ssoSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) {
      setSsoError("Enter a company slug.");
      return;
    }
    setSsoError(null);
    setSsoPending(true);
    await new Promise((r) => setTimeout(r, 400));
    setSsoError(`Enterprise not found for "${slug}.athena.com". Ask your admin to enable SSO, or sign in with GitHub.`);
    setSsoPending(false);
  };

  useEffect(() => {
    if (status === "authenticated") router.replace(returnTo);
  }, [status, router, returnTo]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = document.querySelectorAll<HTMLElement>(".reveal-on-scroll");
    if (reduce) {
      els.forEach((el) => el.classList.add("is-revealed"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-revealed");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const onMockSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await api.mockAuth.signIn({ email, password });
      writeMockSession(result);
      router.replace(returnTo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  };

  const oneClickDemo = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await api.mockAuth.signIn({ email: "maya@lumen.dev" });
      writeMockSession(result);
      router.replace(returnTo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  };

  const signInOAuth = async () => {
    setError(null);
    setPending(true);
    try {
      if (!config.supabase.isConfigured()) {
        setError("Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local.");
        return;
      }
      const supabase = getBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo, scopes: "read:user user:email" },
      });
      if (err) setError(err.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative bg-[var(--bg)] text-[var(--text)]">
      {/* Fixed nav */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 lg:px-10">
        <Link
          href="/login"
          className={cn(
            "flex items-center gap-2 rounded-full px-2.5 py-1.5 transition-all duration-300",
            scrolled ? "glass shadow-[var(--shadow-1)]" : "border border-transparent",
          )}
        >
          <OwlAvatar size={28} mood="happy" />
          <span className="flex items-center gap-1.5 leading-none">
            <span className="text-base font-bold tracking-tight">Athena</span>
            <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]">Beta</span>
          </span>
        </Link>
        <div className={cn(
          "flex items-center gap-1 rounded-full px-1 py-1 transition-all duration-300",
          scrolled ? "glass shadow-[var(--shadow-1)]" : "border border-transparent",
        )}>
          <a
            href="#pricing"
            className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:inline-flex"
          >
            Pricing
          </a>
          <ThemeToggle className="rounded-full hover:bg-[var(--surface-2)]" />
          <button
            type="button"
            onClick={jumpToSignIn}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
          >
            Sign in <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Hero — Act 0 + sign-in on the front page */}
      <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden px-4 pt-16 lg:px-10">
        <AmbientBackground variant="hero" />
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="max-w-[46rem]">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
              <span className="tabular-nums text-[var(--text-subtle)]">00 /</span> WHAT ATHENA IS
            </span>
            <GradientText as="h1" className="ff-word mt-4 text-balance text-[clamp(2rem,1.4rem+2.8vw,3.5rem)] font-bold leading-[1.04] tracking-tight">
              {ACT0.headline_pre}
              <GradientText accent as="span">{ACT0.headline_accent}</GradientText>
              {ACT0.headline_post}
            </GradientText>
            <p className="mt-5 max-w-[40rem] text-[15px] leading-relaxed text-[var(--text-muted)]">
              {ACT0.sub}
            </p>
            <div className="mt-8 flex items-center gap-3">
              <OwlAvatar size={40} mood="idle" />
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)]">
                <ChevronDown className="bf-breathe size-4 text-[var(--primary)]" aria-hidden /> {ACT0.microcopy}
              </span>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <SignInCard
              email={email}
              password={password}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onMockSubmit={onMockSubmit}
              onOneClickDemo={oneClickDemo}
              onSignInOAuth={signInOAuth}
              onSsoOpen={() => setSsoOpen(true)}
              pending={pending}
              error={error}
              notice={notice}
              signupQuery={signupQuery}
            />
          </div>
        </div>
      </section>

      {/* Scrollytelling product demo */}
      <section aria-label="How Athena works">
        <BuildFloorScroll onJumpToSignIn={jumpToSignIn} />
      </section>

      {/* Integrations */}
      <section id="integrations" className="border-t border-[var(--border)] bg-[var(--surface-2)]/40">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 reveal-on-scroll lg:px-10">
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Plays well with your stack</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">Drop in next to the tools you already use.</h2>
            <p className="mt-3 text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              Connect with OAuth — source control first, then tickets, comms, knowledge, and your AI models.
            </p>
          </div>
          <div className="space-y-8">
            {INTEGRATIONS.map((g) => (
              <div key={g.group} className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  {g.group}
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((name) => (
                    <div
                      key={name}
                      className="integration-tile group inline-flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-[var(--shadow-2)]"
                    >
                      <BrandLogo name={name} size={20} />
                      <span className="text-sm font-medium text-[var(--text)]">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-xs text-[var(--text-muted)]">
            Also on the roadmap: Azure DevOps · Vertex AI · CircleCI · ClickUp.
          </p>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-[var(--border)]">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 reveal-on-scroll lg:px-10">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Built for enterprise</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">Security your IT team can actually sign off on.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {TRUST.map((t) => (
              <div key={t.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-1)]">
                <t.icon className="mb-2 size-5 text-[var(--success)]" />
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{t.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      <SsoSlugModal
        open={ssoOpen}
        onOpenChange={(o) => { setSsoOpen(o); if (!o) { setSsoError(null); setSsoSlug(""); } }}
        slug={ssoSlug}
        onSlugChange={setSsoSlug}
        pending={ssoPending}
        error={ssoError}
        onSubmit={onSsoSubmit}
      />

      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-[var(--text-muted)] lg:px-10">
          <div className="flex items-center gap-2">
            <OwlAvatar size={22} mood="happy" />
            <span className="font-semibold text-[var(--text)]">Athena</span>
            <span>·</span>
            <span>Opens pull requests. Never merges or deploys.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={jumpToSignIn} className="hover:text-[var(--text)]">Sign in</button>
            <a href="#integrations" className="hover:text-[var(--text)]">Integrations</a>
            <a href="#pricing" className="hover:text-[var(--text)]">Pricing</a>
            <a href="/legal/privacy" className="hover:text-[var(--text)]">Privacy</a>
            <a href="/legal/terms" className="hover:text-[var(--text)]">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PricingSection() {
  const [catalog, setCatalog] = useState<PriceCatalog>(PRICE_CATALOG_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .priceCatalog()
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, []);

  const priceLabel = (v: number | null) => (v === null ? "—" : `${formatInr(v)}`);

  const creditLabel = (tier: DisplayTier) => {
    const usd = TIER_MONTHLY_CREDIT_USD[tier];
    if (usd === null) return "Volume AI credit, negotiated";
    if (usd === 0) return "No included credit — bring your own key or top up";
    return `${formatUsdAsInr(usd, catalog.usd_to_inr)}/mo AI credit included`;
  };

  const plans: Array<{
    id: "free" | "solo" | "pro";
    name: string;
    price: string;
    priceSuffix: string;
    seats: string;
    cta: { label: string; href: string };
    featured?: boolean;
  }> = [
    {
      id: "free",
      name: "Free",
      price: "₹0",
      priceSuffix: "forever",
      seats: "1 seat",
      cta: { label: "Start free", href: "/signup" },
    },
    {
      id: "solo",
      name: "Solo",
      price: priceLabel(catalog.solo_base),
      priceSuffix: "/month",
      seats: `1 seat · ${priceLabel(catalog.solo_extra_seat)}/seat/mo extras`,
      cta: { label: "Start free", href: "/signup" },
    },
    {
      id: "pro",
      name: "Pro",
      price: priceLabel(catalog.pro_base),
      priceSuffix: "/month",
      seats: `5 seats · ${priceLabel(catalog.pro_extra_seat)}/seat/mo extras`,
      cta: { label: "Start free", href: "/signup" },
      featured: true,
    },
  ];

  return (
    <section id="pricing" className="border-t border-[var(--border)] bg-[var(--surface-2)]/30">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-16 reveal-on-scroll lg:px-10">
        <div className="mb-10 text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Pricing</span>
          <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">Start free. Grow when you outgrow it.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
            Every plan runs the full Athena engine — the same knowledge graph,
            agents, and codebase chat. You scale on repos, seats, and included
            AI credit.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const limit = TIER_REPO_LIMITS[p.id];
            return (
              <SpotlightCard
                key={p.id}
                data-testid={`pricing-card-${p.id}`}
                featured={p.featured ?? false}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-wider text-[var(--text)]">{p.name}</span>
                  {p.featured && (
                    <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
                      Popular
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-bold" data-testid={`pricing-price-${p.id}`}>{p.price}</span>
                  <span className="text-xs text-[var(--text-muted)]">{p.priceSuffix}</span>
                </div>
                <span className="mt-1 text-xs text-[var(--text-muted)]">{p.seats}</span>
                <ul className="mt-4 space-y-2.5">
                  <PricingFeature highlight testid={`pricing-repos-${p.id}`}>{limit.reposLabel}</PricingFeature>
                  <PricingFeature testid={`pricing-credit-${p.id}`}>{creditLabel(p.id)}</PricingFeature>
                  <PricingFeature>Unlimited domains</PricingFeature>
                </ul>
                <Button asChild className="mt-5 w-full" variant={p.featured ? "default" : "outline"} data-testid={`pricing-cta-${p.id}`}>
                  <Link href={p.cta.href}>{p.cta.label}</Link>
                </Button>
              </SpotlightCard>
            );
          })}

          <SpotlightCard data-testid="pricing-card-enterprise">
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--text)]">Enterprise</span>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-bold">Custom</span>
            </div>
            <span className="mt-1 text-xs text-[var(--text-muted)]">SSO · SCIM · audit export · BYOC</span>
            <ul className="mt-4 space-y-2.5">
              <PricingFeature highlight testid="pricing-repos-enterprise">{TIER_REPO_LIMITS.enterprise.reposLabel}</PricingFeature>
              <PricingFeature testid="pricing-credit-enterprise">{creditLabel("enterprise")}</PricingFeature>
              <PricingFeature>Unlimited domains</PricingFeature>
            </ul>
            <Button asChild className="mt-5 w-full" variant="outline">
              <a href="mailto:sales@athena.ai?subject=Athena%20Enterprise">Contact sales</a>
            </Button>
          </SpotlightCard>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          <Gauge className="mr-1 inline size-3.5 text-[var(--primary)]" />
          Login for free — no credit card. Bring your own AI key, or top up Athena credit anytime.
        </p>
      </div>
    </section>
  );
}

function PricingFeature({
  children,
  highlight = false,
  testid,
}: {
  children: ReactNode;
  highlight?: boolean;
  testid?: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
      <span
        className={cn("text-sm", highlight ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]")}
        data-testid={testid}
      >
        {children}
      </span>
    </li>
  );
}

function SsoSlugModal({
  open,
  onOpenChange,
  slug,
  onSlugChange,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  onSlugChange: (slug: string) => void;
  pending: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
}) {
  const sanitized = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="glass fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 shadow-[var(--shadow-3)] focus:outline-none"
          aria-describedby="sso-modal-desc"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Sign in with SSO</Dialog.Title>
            <Dialog.Close className="text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description id="sso-modal-desc" className="mb-4 text-sm text-[var(--text-muted)]">
            Enter your company slug. We&apos;ll redirect you to your team&apos;s identity provider.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Company slug</span>
              <div className="mt-1 flex overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                <input
                  type="text"
                  required
                  autoFocus
                  value={slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  placeholder="acme"
                  pattern="[a-zA-Z0-9-]+"
                  className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none"
                />
                <span className="select-none border-l border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
                  .athena.com
                </span>
              </div>
              {sanitized && (
                <span className="mt-1 inline-block text-[10px] text-[var(--text-subtle)]">
                  Redirecting to <code className="font-mono">{sanitized}.athena.com/sso/start</code>
                </span>
              )}
            </label>
            {error && (
              <div role="alert" className="rounded-md border border-[var(--border-strong)] bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger-ink)]">
                {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !sanitized}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
                Continue
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
