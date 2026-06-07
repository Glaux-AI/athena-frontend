"use client";

/**
 * /login — Athena's landing page + sign-in.
 *
 * Layout:
 *   1. Slim top nav (no duplicate CTAs).
 *   2. Hero — headline + sub + animated phase-flow demo side-by-side with sign-in card.
 *   3. "Different from existing tools" — 3-column comparison.
 *   4. "Two ways to use Athena" — PRD-track + Implement-track.
 *   5. Integrations — single clean grid.
 *   6. Trust strip — what enterprises actually care about.
 *   7. Footer.
 *
 * Honors `?returnTo=` so accept-invite + protected routes return here when
 * unauthenticated and bounce back after sign-in.
 */

import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2, Github, Loader2, Sparkles, ArrowRight, X,
  Lock, Eye, Hammer, ShieldCheck, Key,
  FileText, ListTree, GitPullRequest, CheckCircle2,
  Cpu, Boxes, ScanLine, Microscope, PenLine, BadgeCheck, Search,
  Brain, Bot, Rocket, Network, Gauge,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { OwlAvatar, type OwlMood } from "@/components/mascot/owl-avatar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { config } from "@/lib/config";
import { api, ApiError, type PriceCatalog } from "@/lib/api/client";
import { PRICE_CATALOG_FALLBACK } from "@/lib/billing/price-catalog";
import { TIER_REPO_LIMITS, TIER_MONTHLY_CREDIT_USD, type DisplayTier } from "@/lib/billing/tier-limits";
import { formatInr, formatUsdAsInr } from "@/lib/utils/format";
import { useSession, writeMockSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

const IMPLEMENT_PHASES = [
  { num: "01", name: "Spec",         icon: FileText,        desc: "A clear spec from your idea." },
  { num: "02", name: "Plan",         icon: ListTree,        desc: "Subtasks across the right repos." },
  { num: "03", name: "Implement",    icon: Hammer,          desc: "Code + tests in scratch space." },
  { num: "04", name: "Review",       icon: Eye,             desc: "Human-readable diff." },
  { num: "05", name: "CI Gate",      icon: ShieldCheck,     desc: "Tests, lint, security pass." },
  { num: "06", name: "Pull request", icon: GitPullRequest,  desc: "Draft PR. Your team merges." },
];

const PRD_PHASES = [
  { num: "01", name: "Frame",     icon: PenLine,      desc: "Sharpen the problem with you." },
  { num: "02", name: "Research",  icon: Microscope,   desc: "Read existing docs, tickets, chats." },
  { num: "03", name: "Draft",     icon: FileText,     desc: "A clean PRD, sourced + linked." },
  { num: "04", name: "Sign-off",  icon: BadgeCheck,   desc: "Stakeholders approve. Done — or hand off to ship it." },
];

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

const COMPARISON = [
  {
    title: "Autocomplete tools",
    examples: "Copilot, Cursor",
    icon: ScanLine,
    accent: "muted",
    rows: [
      { label: "Scope",    value: "Next line of code" },
      { label: "Oversight", value: "None — keystroke-level" },
      { label: "Audit",    value: "What it suggested? Long gone." },
      { label: "PRDs",     value: "Not the job" },
    ],
  },
  {
    title: "Black-box agents",
    examples: "Generic agentic IDEs",
    icon: Bot,
    accent: "muted",
    rows: [
      { label: "Scope",    value: "Whatever the agent decides" },
      { label: "Oversight", value: "Approve at the end (if at all)" },
      { label: "Audit",    value: "Opaque — chain of thought, hidden" },
      { label: "PRDs",     value: "Not really" },
    ],
  },
  {
    title: "Athena",
    examples: "PDLC engine",
    icon: Brain,
    accent: "primary",
    rows: [
      { label: "Scope",    value: "A whole feature — spec to PR" },
      { label: "Oversight", value: "Six human-approved gates" },
      { label: "Audit",    value: "Every prompt, decision, cost — saved" },
      { label: "PRDs",     value: "Yes — Frame → Sign-off, end-to-end" },
    ],
  },
];

export default function LandingAndLogin() {
  // useSearchParams must be wrapped in Suspense for Next 15 static prerender;
  // the inner component reads the query, the outer one provides the boundary.
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

  const returnTo = params.get("returnTo") ?? "/dashboard";

  /* §5.31 — when a soft-deleted-org non-owner gets bounced out by
   * `<ProtectedClientGuard>`, the redirect carries `?error=org_deleted`.
   * Surface a persistent banner here so the user understands why they
   * landed on /login instead of silently dropping them. The mapping is
   * a small closed set; unknown codes fall back to a generic message. */
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

  /* SSO modal state (§5.29.7 surface). Login-only — signup never goes
   * through SSO. The entry surface is wired but the OIDC/SAML handshake
   * is deferred: every submit returns "Enterprise not found" until the
   * org-side admin config + BE handshake land in a follow-up. */
  const [ssoOpen, setSsoOpen] = useState(false);
  const [ssoSlug, setSsoSlug] = useState("");
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoPending, setSsoPending] = useState(false);

  const onSsoSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const slug = ssoSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) {
      setSsoError("Enter a company slug.");
      return;
    }
    setSsoError(null);
    setSsoPending(true);
    // Simulate the lookup latency, then fail with the canonical message —
    // there is no SSO-discovery endpoint yet (follow-up phase wires it).
    await new Promise((r) => setTimeout(r, 400));
    setSsoError(`Enterprise not found for "${slug}.athena.com". Ask your admin to enable SSO, or sign in with GitHub.`);
    setSsoPending(false);
  };

  useEffect(() => {
    if (status === "authenticated") router.replace(returnTo);
  }, [status, router, returnTo]);

  /* Scroll reveal — fade + lift each section as it enters the viewport. */
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

  /* ---------- auth handlers ---------- */
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
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* ============ Nav — wordmark + sign-in only ============ */}
      <nav className="glass sticky top-0 z-30 shadow-[var(--shadow-1)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/login" className="flex items-center gap-2">
            <OwlAvatar size={28} mood="happy" />
            <span className="flex flex-col items-start leading-none">
              <span className="text-lg font-bold tracking-tight">Athena</span>
              <span className="mt-0.5 rounded-full bg-[var(--primary-soft)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]">
                Beta
              </span>
            </span>
          </Link>
          <Button asChild size="sm" variant="ghost">
            <a href="#signin">
              Sign in <ArrowRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </nav>

      {/* ============ Hero ============ */}
      <section className="relative isolate overflow-hidden">
        {/* Signature layered light system — a "moment" surface. Decorative,
            aria-hidden, and motion-neutralized under prefers-reduced-motion. */}
        <AmbientBackground variant="hero" />

        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pt-14">
          {/* Left — the animation, free-standing (no card) */}
          <div className="flex items-center justify-center">
            <FeatureFlow />
          </div>

          {/* Right — value prop + sign-in, together in one box */}
          <div id="signin" className="flex justify-center lg:justify-end">
            <Card variant="elevated" className="w-full max-w-md p-6 lg:p-7">
              <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Sparkles className="size-3 text-[var(--primary)]" />
                One AI across your whole product lifecycle
              </span>
              <GradientText as="h1" className="text-[clamp(1.5rem,1.2rem+1.1vw,2.05rem)] font-bold leading-[1.08] tracking-tight text-balance">
                Your org&rsquo;s <GradientText accent as="span">AI teammate</GradientText> - Don&rsquo;t just measure tokens, measure features per token
              </GradientText>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                Product, design, support, leadership or engineering — describe what you want in plain words.
                Grounded in your org&rsquo;s ever-updating knowledge engine, Athena&rsquo;s AI turns it into the PRD,
                the design, the tickets and the code — and shows the cost at every step. Your team approves every gate.
              </p>
              <div className="my-5 h-px w-full bg-[var(--border)]" />
              {notice && (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning-ink)]"
                >
                  {notice}
                </div>
              )}
              <div className="mb-5 flex items-center gap-3">
                <OwlAvatar size={32} mood="happy" />
                <div>
                  <h2 className="text-base font-semibold">Sign in to Athena</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {config.isMock ? "Mock mode — any email works." : "We use your verified GitHub email."}
                  </p>
                </div>
              </div>

              {config.isMock ? (
                <div className="space-y-4">
                  <form onSubmit={onMockSubmit} className="space-y-3">
                    <label className="block text-sm">
                      <span className="text-[var(--text-muted)]">Work email</span>
                      <input
                        type="email" required autoComplete="email"
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-[var(--text-muted)]">Password</span>
                      <input
                        type="password" autoComplete="current-password"
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="(mock — any value)"
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      />
                    </label>
                    <Button type="submit" glow disabled={pending || !email} size="lg" className="w-full">
                      {pending && <Loader2 className="size-4 animate-spin" />}
                      Sign in
                    </Button>
                  </form>
                  <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <span>or</span>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <Button onClick={oneClickDemo} disabled={pending} variant="outline" size="lg" className="w-full">
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Continue as Demo User
                  </Button>
                  {config.enterpriseSsoEnabled && (
                    <Button onClick={() => setSsoOpen(true)} disabled={pending} variant="outline" size="lg" className="w-full">
                      <Building2 className="size-4" />
                      Sign in with SSO
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Button onClick={signInOAuth} glow disabled={pending} size="lg" className="w-full">
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
                    Continue with GitHub
                  </Button>
                  {config.enterpriseSsoEnabled && (
                    <Button onClick={() => setSsoOpen(true)} disabled={pending} variant="outline" size="lg" className="w-full">
                      <Building2 className="size-4" />
                      Sign in with SSO
                    </Button>
                  )}
                  <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[11px] text-[var(--text-muted)]">
                    <ShieldCheck className="mr-1 inline size-3 text-[var(--success)]" />
                    SSO inherited from your GitHub organization (Okta · Entra ID · Google Workspace · Auth0)
                    {config.enterpriseSsoEnabled ? " — or use direct SSO above." : "."}
                  </div>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-3 text-center text-sm text-[var(--danger)]">{error}</p>
              )}

              {!config.isMock && (
                <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
                  New to Athena?{" "}
                  <Link href={`/signup${params.toString() ? `?${params.toString()}` : ""}`} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
                    Create an account
                  </Link>
                </p>
              )}
              <p className="mt-2 text-center text-[10px] text-[var(--text-subtle)]">
                By continuing you agree to our <a className="underline hover:text-[var(--text)]" href="/legal/terms">Terms</a> and <a className="underline hover:text-[var(--text)]" href="/legal/privacy">Privacy Policy</a>.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============ Different from existing tools ============ */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-2)]/40">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 reveal-on-scroll">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Vs. the field</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight text-balance">Other AI tools work in your editor. Athena works in your process.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              Whole features, not tokens. Six approval gates, not one. Every decision logged, not lost.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {COMPARISON.map((col) => (
              <SpotlightCard key={col.title} featured={col.accent === "primary"}>
                <div className="mb-4 flex items-center justify-between">
                  <div className={cn(
                    "inline-flex size-9 items-center justify-center rounded-lg",
                    col.accent === "primary"
                      ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                      : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                  )}>
                    <col.icon className="size-[18px]" strokeWidth={2.25} />
                  </div>
                  {col.accent === "primary" && (
                    <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
                      Athena
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold tracking-tight text-[var(--text)]">{col.title}</h3>
                <p className="text-xs text-[var(--text-subtle)]">{col.examples}</p>
                <dl className="mt-5 space-y-3">
                  {col.rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-[80px_1fr] items-baseline gap-2">
                      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-subtle)]">{r.label}</dt>
                      <dd className={cn(
                        "text-sm",
                        col.accent === "primary" ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"
                      )}>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </SpotlightCard>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Two ways to use Athena ============ */}
      <section className="border-t border-[var(--border)]">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 reveal-on-scroll">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Two ways to start</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">Draft a PRD. Or ship the whole feature.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              Start by aligning on a signed-off PRD — or keep going all the way to a reviewed PR and a deploy plan. Same engine; you choose where the work ends.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <TrackCard
              kind="prd"
              title="Draft a PRD"
              subtitle="When the work is to align — not yet to build."
              phases={PRD_PHASES}
              bullets={[
                "Bring a sentence, an idea, a customer-call note.",
                "Athena reads the relevant docs, ADRs, and old tickets.",
                "Produces a PRD with linked sources.",
                "Stakeholders sign off — or hand it to the Implement track.",
              ]}
            />
            <TrackCard
              kind="implement"
              title="Ship a feature"
              subtitle="When the spec is clear and the work is to land a PR."
              phases={IMPLEMENT_PHASES}
              bullets={[
                "Spec → Plan → Implement, each gate human-approved.",
                "Diffs are human-readable, with rationale per file.",
                "CI must pass before the PR opens.",
                "Athena commits to your branch; your team merges.",
              ]}
              primary
            />
          </div>
        </div>
      </section>

      {/* ============ Pricing ============ */}
      <PricingSection />

      {/* ============ Integrations — one clean grid ============ */}
      <section id="integrations" className="border-t border-[var(--border)] bg-[var(--surface-2)]/40">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 reveal-on-scroll">
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Plays well with your stack</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">Drop in next to the tools you already use.</h2>
            <p className="mt-3 text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              Connect with a token or OAuth — no custom adapters, no IT tickets.
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

      {/* ============ Trust strip ============ */}
      <section className="border-t border-[var(--border)]">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 reveal-on-scroll">
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

      {/* ============ SSO entry modal (§5.29.7) ============ */}
      <SsoSlugModal
        open={ssoOpen}
        onOpenChange={(o) => { setSsoOpen(o); if (!o) { setSsoError(null); setSsoSlug(""); } }}
        slug={ssoSlug}
        onSlugChange={setSsoSlug}
        pending={ssoPending}
        error={ssoError}
        onSubmit={onSsoSubmit}
      />

      {/* ============ Footer ============ */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <OwlAvatar size={22} mood="happy" />
            <span className="font-semibold text-[var(--text)]">Athena</span>
            <span>·</span>
            <span>Enterprise PDLC engine</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#" className="hover:text-[var(--text)]">Docs</a>
            <a href="#pricing" className="hover:text-[var(--text)]">Pricing</a>
            <a href="#" className="hover:text-[var(--text)]">Security</a>
            <a href="#" className="hover:text-[var(--text)]">Privacy</a>
            <a href="#" className="hover:text-[var(--text)]">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ================================================== PricingSection
 * Public pricing card on the landing page (ADR-081). Shows Free / Solo /
 * Pro with their repo limits + INR prices and a "start free" CTA that
 * routes to signup on the Free tier. Capabilities are unlimited on every
 * tier, so no capability count is shown. Prices come from the public
 * `price-catalog` endpoint (no auth); falls back to constants when the API
 * is unreachable so the card never renders blank. Enterprise is a
 * contact-sales card. */
function PricingSection() {
  const [catalog, setCatalog] = useState<PriceCatalog>(PRICE_CATALOG_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .priceCatalog()
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch(() => { /* unreachable — keep the fallback */ });
    return () => { cancelled = true; };
  }, []);

  const priceLabel = (v: number | null) => (v === null ? "—" : `${formatInr(v)}`);

  // Included monthly AI credit per tier, rendered in ₹ to match the prices on
  // the same card (Free has none — BYO key or top up; Enterprise is negotiated).
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
    <section id="pricing" className="border-t border-[var(--border)]">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 reveal-on-scroll">
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
                  <PricingFeature>Unlimited capabilities</PricingFeature>
                </ul>
                <Button asChild className="mt-5 w-full" variant={p.featured ? "default" : "outline"} data-testid={`pricing-cta-${p.id}`}>
                  <Link href={p.cta.href}>{p.cta.label}</Link>
                </Button>
              </SpotlightCard>
            );
          })}

          {/* Enterprise — contact sales */}
          <SpotlightCard data-testid="pricing-card-enterprise">
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--text)]">Enterprise</span>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-bold">Custom</span>
            </div>
            <span className="mt-1 text-xs text-[var(--text-muted)]">SSO · SCIM · audit export</span>
            <ul className="mt-4 space-y-2.5">
              <PricingFeature highlight testid="pricing-repos-enterprise">{TIER_REPO_LIMITS.enterprise.reposLabel}</PricingFeature>
              <PricingFeature testid="pricing-credit-enterprise">{creditLabel("enterprise")}</PricingFeature>
              <PricingFeature>Unlimited capabilities</PricingFeature>
            </ul>
            <Button asChild className="mt-5 w-full" variant="outline">
              <a href="mailto:sales@athena.ai?subject=Athena%20Enterprise">Contact sales</a>
            </Button>
          </SpotlightCard>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Login for free — no credit card. Bring your own AI key, or top up Athena credit anytime.
        </p>
      </div>
    </section>
  );
}

/* One feature row inside a pricing card — checkmark + label. `highlight`
 * gives the primary scaling axis (repos) stronger emphasis. */
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

/* ================================================== FeatureFlow
 * Hero animation. One feature travels the full PDLC — PRD → Design → Tickets →
 * Code → Review → Deploy — clockwise around Athena's knowledge engine (the
 * centre that powers it). Each stage lights up in sequence with the integration
 * tool(s) it touches and its AI cost; a progress arc fills as it goes. At the
 * end it shows the total cost of the task, pauses, then starts again. Honors
 * prefers-reduced-motion (freezes on the shipped frame). */
const FLOW_STAGES = [
  { n: 1, key: "PRD",     icon: FileText,    tools: ["Notion"],           action: "drafts the PRD from your goal",  usd: 0.62, mood: "reading"  },
  { n: 2, key: "Design",  icon: PenLine,     tools: ["Figma"],            action: "writes the design spec",         usd: 0.48, mood: "thinking" },
  { n: 3, key: "Tickets", icon: ListTree,    tools: ["Jira", "Linear"],   action: "breaks it into tickets",         usd: 0.21, mood: "writing"  },
  { n: 4, key: "Code",    icon: Hammer,      tools: ["GitHub"],           action: "writes the code, opens a PR",    usd: 1.40, mood: "working"  },
  { n: 5, key: "Review",  icon: ShieldCheck, tools: ["GitHub", "Sentry"], action: "self-reviews for style & risk",  usd: 0.55, mood: "focused"  },
  { n: 6, key: "Deploy",  icon: Rocket,      tools: ["Datadog", "Slack"], action: "plans the safe rollout",         usd: 0.24, mood: "happy"    },
] as const;

/** Advance 0..count-1 looping, holding the final ("shipped") frame longer for a
 *  beat before restarting. Freezes on the last frame under reduced motion. */
function useSequence(count: number, stepMs: number, pauseMs: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setI(count - 1); return; }
    const id = window.setTimeout(() => setI((p) => (p + 1) % count), i === count - 1 ? pauseMs : stepMs);
    return () => window.clearTimeout(id);
  }, [i, count, stepMs, pauseMs]);
  return i;
}

/** Position of node i on a 6-point ring (clockwise from the top); radius in viewBox %. */
function flowPos(i: number, r: number, offsetDeg = -90) {
  const a = (offsetDeg + i * 60) * (Math.PI / 180);
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
}

/* The org's knowledge engine: Athena at the centre, real org entities wired
 * around it. The "fresh" entity lights up as the org keeps the engine current —
 * this is the essence that powers every stage of the flow. */
const ENTITIES = ["users", "auth", "billing", "API", "designs", "docs"];

function KnowledgeEngine({ mood, fresh }: { mood: OwlMood; fresh: number }) {
  // Six org-knowledge nodes wired into Athena at the centre. Gaps sit at top +
  // bottom centre so the PRD/Code spokes and the core label get clear lanes.
  const pts = ENTITIES.map((_, i) => flowPos(i, 40, -60));
  const hot = pts[fresh]!;
  return (
    <div className="relative grid size-[164px] place-items-center">
      {/* one soft light — the core's glow (no stacked blurs) */}
      <div className="absolute size-[150px] rounded-full bg-[var(--glow-accent)] blur-[34px]" aria-hidden />
      {/* the contained knowledge core the lifecycle orbits */}
      <div className="absolute size-[164px] rounded-full border border-[var(--border-accent)] bg-[var(--surface)]/45" aria-hidden />

      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none" aria-hidden>
        {/* faint web between neighbouring nodes */}
        {pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length]!;
          return <line key={`w${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.2} />;
        })}
        {/* spokes into Athena; the freshly-updated one flows */}
        {pts.map((p, i) => (
          <line key={`e${i}`} x1={50} y1={50} x2={p.x} y2={p.y}
            stroke={i === fresh ? "var(--primary)" : "var(--border)"}
            strokeWidth={i === fresh ? 1.5 : 1} vectorEffect="non-scaling-stroke"
            opacity={i === fresh ? 0.85 : 0.28} className={i === fresh ? "ff-flow" : undefined} />
        ))}
        {/* nodes — idle ones twinkle softly, the fresh one is lit */}
        {pts.map((p, i) => (
          <circle key={`n${i}`} cx={p.x} cy={p.y} r={i === fresh ? 2.8 : 1.7}
            fill={i === fresh ? "var(--primary)" : "var(--text-subtle)"}
            className={i === fresh ? undefined : "ff-node"}
            style={i === fresh ? undefined : { animationDelay: `${i * 0.35}s` }} />
        ))}
        <circle cx={hot.x} cy={hot.y} r={5} fill="none" stroke="var(--primary)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.45} />
      </svg>

      {/* what the org just taught it — cycles the nodes, pops on change (top gap) */}
      <span key={fresh} className="ff-pop absolute left-1/2 top-[calc(50%-32px)] z-30 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--primary)] bg-[var(--primary-soft)] px-1.5 py-[1px] text-[9px] font-semibold text-[var(--primary)] shadow-[var(--shadow-1)]">
        <span className="size-1 rounded-full bg-[var(--primary)]" />
        {ENTITIES[fresh]}
      </span>

      {/* Athena at the core — one gentle pulse as the org keeps it current */}
      <div className="relative z-20 grid place-items-center">
        <span aria-hidden className="ff-sync absolute size-11 rounded-full border border-[var(--primary)]" />
        <div className="relative grid size-11 place-items-center rounded-full border-2 border-[var(--border-accent)] bg-[var(--surface)] shadow-[var(--shadow-2)]">
          <OwlAvatar size={26} mood={mood} />
        </div>
      </div>
      <span className="absolute left-1/2 top-[calc(50%+30px)] z-20 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold leading-none tracking-tight text-[var(--text)]">Athena</span>

      {/* core label, sitting on the bottom rim */}
      <span className="absolute left-1/2 top-full z-20 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shadow-[var(--shadow-1)]">
        <Network className="size-2.5 text-[var(--primary)]" /> Knowledge engine
      </span>
    </div>
  );
}

function FeatureFlow() {
  const SHIPPED = FLOW_STAGES.length;          // index of the "done / total" frame
  const frame = useSequence(SHIPPED + 1, 1300, 2300);
  const fresh = useSequence(ENTITIES.length, 1500, 1500); // which knowledge node the org just refreshed
  const shipped = frame >= SHIPPED;
  const R = 38;                                 // node-ring radius (viewBox %)
  const C = 2 * Math.PI * R;                    // arc circumference
  const progress = shipped ? 1 : (frame + 1) / SHIPPED;
  const cum = FLOW_STAGES.slice(0, shipped ? SHIPPED : frame + 1).reduce((s, x) => s + x.usd, 0);
  const active = shipped ? null : FLOW_STAGES[frame]!;
  const coreMood = shipped ? "happy" : active!.mood;

  // The orbit is laid out at a fixed 420px design size (cards + core are
  // fixed-px on a %-positioned ring, so below ~420px they collide). Scale the
  // whole orbit as one unit to fit narrower screens — the proportions, and so
  // every clearance, are preserved at any width.
  const orbitRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = orbitRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / 420));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="mx-auto w-full max-w-[440px]">
      {/* status + running cost — moved to the top; per-stage cost on each node, total at the end */}
      <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="min-w-0">
          {shipped ? (
            <p key="done" className="ff-word truncate text-[12.5px] font-semibold text-[var(--success)]">✓ Feature shipped — PR opened, deploy plan ready</p>
          ) : (
            <p key={frame} className="ff-word truncate text-[12.5px]">
              <span className="font-semibold text-[var(--text)]">Athena&rsquo;s AI {active!.action}</span>
              <span className="text-[var(--text-muted)]"> · {active!.tools.join(" + ")}</span>
            </p>
          )}
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
            {shipped ? "PRD → deploy · humans approved every gate" : "Grounded in your knowledge engine · you approve every gate"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Gauge className="size-4 text-[var(--primary)]" />
          <div className="text-right leading-tight">
            <div className={cn("text-sm font-bold tabular-nums", shipped ? "text-[var(--success)]" : "text-[var(--text)]")}>${cum.toFixed(2)}</div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--text-subtle)]">{shipped ? "total / feature" : "cost so far"}</div>
          </div>
        </div>
      </div>

      {/* orbit — scales as one unit so the fixed-size stage cards never collide
          with the core on screens narrower than its ~420px design width */}
      <div ref={orbitRef} className="relative mx-auto w-full max-w-[420px]" style={{ height: 420 * scale }}>
       <div className="absolute top-0 origin-top" style={{ left: "calc(50% - 210px)", width: 420, height: 420, transform: `scale(${scale})` }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none" aria-hidden>
          {FLOW_STAGES.map((_, i) => {
            const p = flowPos(i, R);
            const inner = flowPos(i, 20.5); // stop at the knowledge core's rim, not the centre
            const on = !shipped && i === frame;
            return <line key={`sp${i}`} x1={p.x} y1={p.y} x2={inner.x} y2={inner.y} stroke={on ? "var(--primary)" : "var(--border)"} strokeWidth={on ? 1.6 : 1} vectorEffect="non-scaling-stroke" className={on ? "ff-flow" : undefined} opacity={on ? 0.9 : 0.3} />;
          })}
          <circle cx={50} cy={50} r={R} stroke="var(--border)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.5} />
          <circle cx={50} cy={50} r={R} stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke"
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 50 50)"
            className="transition-[stroke-dashoffset] duration-700 ease-out" />
        </svg>

        {FLOW_STAGES.map((s, i) => {
          const p = flowPos(i, R);
          const done = shipped || i < frame;
          const on = !shipped && i === frame;
          const Icon = s.icon;
          return (
            <div key={s.key} className="absolute z-10" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)" }}>
              <div className={cn(
                "w-[94px] rounded-xl border bg-[var(--surface)] px-2 py-1.5 text-center shadow-[var(--shadow-1)] transition-all duration-300",
                on ? "scale-105 border-[var(--primary)] shadow-[var(--shadow-glow)]"
                  : done ? "border-[var(--border-accent)]"
                  : "border-[var(--border)] opacity-55",
              )}>
                <div className="flex items-center justify-center gap-1">
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded text-[9px] font-bold",
                    done ? "bg-[var(--primary)] text-[var(--primary-fg)]" : on ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--surface-2)] text-[var(--text-subtle)]")}>
                    {done ? <CheckCircle2 className="size-3" strokeWidth={2.5} /> : s.n}
                  </span>
                  <Icon className={cn("size-3.5 shrink-0", on || done ? "text-[var(--primary)]" : "text-[var(--text-muted)]")} strokeWidth={2.25} />
                  <span className="text-[11px] font-bold text-[var(--text)]">{s.key}</span>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1">
                  {s.tools.map((t) => <BrandLogo key={t} name={t} size={12} />)}
                  {(on || done) && <span className="ff-pop rounded bg-[var(--acc-mint-soft)] px-1 text-[9px] font-bold tabular-nums text-[var(--acc-mint-ink)]">${s.usd.toFixed(2)}</span>}
                </div>
              </div>
            </div>
          );
        })}

        {/* the knowledge engine — the essence that powers every stage */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <KnowledgeEngine mood={coreMood} fresh={fresh} />
        </div>
       </div>
      </div>

      {/* headline — moved below the orbit */}
      <div className="mt-4 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="relative mt-1.5 flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--primary)] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--primary)]" />
          </span>
          <span className="text-sm font-semibold leading-snug line-clamp-2">Build anything with confidence — you approve every step</span>
        </div>
        <span className="mt-0.5 shrink-0 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
          {shipped ? "Shipped" : `Step ${frame + 1}/${SHIPPED}`}
        </span>
      </div>
    </div>
  );
}

/* ================================================== TrackCard
 * One column of the "Two ways to use Athena" section. Renders the phase
 * chain + the bullet list of what the track does. */
function TrackCard({
  kind, title, subtitle, phases, bullets, primary,
}: {
  kind: "prd" | "implement";
  title: string;
  subtitle: string;
  phases: typeof IMPLEMENT_PHASES;
  bullets: string[];
  primary?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-[var(--surface)] p-7 transition-[box-shadow,border-color,transform] duration-300 ease-out hover:-translate-y-0.5",
      primary
        ? "border-[var(--border-accent)] shadow-[var(--shadow-glow)]"
        : "border-[var(--border)] shadow-[var(--shadow-2)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-3)]"
    )}>
      <div className="mb-2 flex items-center justify-between">
        <div className={cn(
          "inline-flex size-9 items-center justify-center rounded-lg",
          primary ? "bg-[var(--primary)] text-[var(--primary-fg)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
        )}>
          {kind === "prd" ? <Search className="size-[18px]" strokeWidth={2.25} /> : <Boxes className="size-[18px]" strokeWidth={2.25} />}
        </div>
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
          primary ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
        )}>
          {phases.length} phases
        </span>
      </div>
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>

      {/* Phase chain */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {phases.map((p, i) => (
          <div key={p.num} className="flex items-center gap-1.5">
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold",
              primary
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]"
            )}>
              <p.icon className="size-3" strokeWidth={2.5} />
              {p.name}
            </span>
            {i < phases.length - 1 && (
              <span className="text-[var(--text-subtle)]" aria-hidden="true">→</span>
            )}
          </div>
        ))}
      </div>

      <ul className="mt-6 space-y-2 text-sm text-[var(--text)]">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            <span className="text-[var(--text-muted)]">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================================================== SsoSlugModal
 * Entry surface for SSO login (§5.29.7). Login-only — signup never goes
 * through SSO. Captures the company slug and shows what the redirect
 * would be (`{slug}.athena.com`). Submit currently always returns the
 * canonical "Enterprise not found" inline error — the OIDC/SAML
 * handshake + org-side admin config land in a follow-up phase. */
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
