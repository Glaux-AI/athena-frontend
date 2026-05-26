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

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2, Github, Loader2, Sparkles, ArrowRight, X,
  Lock, Eye, Hammer, ShieldCheck, Key,
  FileText, ListTree, GitPullRequest, CheckCircle2,
  Cpu, Boxes, ScanLine, Microscope, PenLine, BadgeCheck, Search,
  Brain, Bot,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { config } from "@/lib/config";
import { api, ApiError } from "@/lib/api/client";
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
      <nav className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/login" className="flex items-center gap-2">
            <OwlAvatar size={28} mood="happy" />
            <span className="text-lg font-bold tracking-tight">Athena</span>
          </Link>
          <Button asChild size="sm" variant="ghost">
            <a href="#signin">
              Sign in <ArrowRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </nav>

      {/* ============ Hero ============ */}
      <section className="relative overflow-hidden">
        {/* Animated background — subtle, prefers-reduced-motion respected via globals.css */}
        <div className="hero-bg pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-5 pb-12 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:pt-14">
          {/* Left — copy + animated flow */}
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Sparkles className="size-3 text-[var(--primary)]" />
              Enterprise PDLC engine
            </span>
            <h1 className="text-[clamp(1.875rem,1.25rem+2vw,3rem)] font-bold leading-[1.05] tracking-tight text-balance text-[var(--text)]">
              From a product idea to a <span className="text-[var(--primary)]">reviewed pull request</span>.
            </h1>
            <p className="mt-3 max-w-xl text-[clamp(1.125rem,0.875rem+0.6vw,1.375rem)] font-medium leading-snug text-[var(--text-muted)]">
              Or stop earlier with a signed-off PRD.
            </p>
            <p className="mt-5 max-w-xl text-[clamp(0.9375rem,0.875rem+0.15vw,1.0625rem)] leading-relaxed text-[var(--text-muted)]">
              Athena drafts the spec, plans the work, writes the code, and opens the PR — pausing at every gate
              so your team approves. Nothing ships behind your back.
            </p>

            {/* Animated flow demo */}
            <div className="mt-7">
              <PhaseFlowDemo />
            </div>
          </div>

          {/* Right — sign-in card */}
          <div id="signin" className="flex justify-end">
            <Card className="w-full max-w-md p-6 shadow-[var(--shadow-2)]">
              {notice && (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning)]"
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
                    <Button type="submit" disabled={pending || !email} size="lg" className="w-full">
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
                  <Button onClick={signInOAuth} disabled={pending} size="lg" className="w-full">
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
              <div
                key={col.title}
                className={cn(
                  "rounded-xl border bg-[var(--surface)] p-6 transition-all duration-200",
                  col.accent === "primary"
                    ? "border-[var(--primary)] shadow-[0_0_0_3px_var(--primary-soft)]"
                    : "border-[var(--border)]"
                )}
              >
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
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Two ways to use Athena ============ */}
      <section className="border-t border-[var(--border)]">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 reveal-on-scroll">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Two ways to start</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">Ship a feature. Or draft a PRD.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              Go all the way to a reviewed PR — or stop earlier with a signed-off PRD. Athena&apos;s the same engine; you pick where the work ends.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
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
          </div>
        </div>
      </section>

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
            <a href="#" className="hover:text-[var(--text)]">Pricing</a>
            <a href="#" className="hover:text-[var(--text)]">Security</a>
            <a href="#" className="hover:text-[var(--text)]">Privacy</a>
            <a href="#" className="hover:text-[var(--text)]">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ================================================== PhaseFlowDemo
 * Cycles through BOTH tracks in sequence — PRD (Frame → Sign-off) first, then
 * cross-fades to Implement (Spec → PR). At any moment only one track row is
 * shown; the transition between them visualizes "draft a PRD, optionally keep
 * going to ship a PR." Honors prefers-reduced-motion. */
function PhaseFlowDemo() {
  const prdLen = PRD_PHASES.length;             // 4
  const impLen = IMPLEMENT_PHASES.length;       // 6
  // Cycle: [prd 0..3] [prd done] [impl 0..5] [impl done] = 12 frames.
  const totalFrames = prdLen + 1 + impLen + 1;

  const [frame, setFrame] = useState(0);
  // Demo only animates when ≥50% scrolled into view. Keeps the hero quiet on
  // first paint so the headline + sign-in card land without competing motion.
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(totalFrames - 1); // show the completed end-state, no animation
      return;
    }
    const node = containerRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setIsVisible(e.isIntersecting);
      },
      { threshold: 0.5 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [totalFrames]);

  useEffect(() => {
    if (!isVisible) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % totalFrames), 900);
    return () => window.clearInterval(id);
  }, [isVisible, totalFrames]);

  // Derive per-track + footer state from the single frame counter.
  let activeTrack: "prd" | "implement" | null;
  let activeStep: number;
  let prdRowDone: boolean;
  let impRowDone: boolean;
  let statusLine1: string;
  let statusLine2: string;
  let statusDone: boolean;

  if (frame < prdLen) {
    activeTrack = "prd";
    activeStep = frame;
    prdRowDone = false;
    impRowDone = false;
    statusLine1 = `Working on ${PRD_PHASES[frame]!.name}`;
    statusLine2 = PRD_PHASES[frame]!.desc;
    statusDone = false;
  } else if (frame === prdLen) {
    activeTrack = null;
    activeStep = -1;
    prdRowDone = true;
    impRowDone = false;
    statusLine1 = "✓ PRD signed off";
    statusLine2 = "Stop here — or hand off to ship it";
    statusDone = true;
  } else if (frame < prdLen + 1 + impLen) {
    activeTrack = "implement";
    activeStep = frame - prdLen - 1;
    prdRowDone = true;
    impRowDone = false;
    statusLine1 = `Working on ${IMPLEMENT_PHASES[activeStep]!.name}`;
    statusLine2 = IMPLEMENT_PHASES[activeStep]!.desc;
    statusDone = false;
  } else {
    activeTrack = null;
    activeStep = -1;
    prdRowDone = true;
    impRowDone = true;
    statusLine1 = "✓ PR opened — your team can merge";
    statusLine2 = "12 files · 487 additions · 3 repos";
    statusDone = true;
  }

  // Which track row is visible right now. PRD stays visible through its
  // "done" frame; Implement takes over from frame (prdLen + 1) onward.
  const showing: "prd" | "implement" = frame <= prdLen ? "prd" : "implement";

  const trackPillLabel =
    activeTrack === "prd" ? "PRD track"
    : activeTrack === "implement" ? "Implement track"
    : prdRowDone && impRowDone ? "Shipped"
    : "PRD signed off";

  return (
    <div ref={containerRef} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <OwlAvatar size={22} mood="thinking" />
          <span className="truncate text-sm font-semibold">Demo task · Add ACH support</span>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)] transition-colors duration-300">
          {trackPillLabel}
        </span>
      </div>

      {/* Cross-fade stack: both chains share one grid cell, opacity gates
        * which is visible. Cell height = max of the two rows so the card
        * never jumps. The PRD row stays visible through the PRD-done frame,
        * then yields to Implement; same on the loop back. */}
      <div className="phase-stack relative grid">
        <div
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-500 ease-out",
            showing === "prd" ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={showing !== "prd"}
        >
          <PhaseChain
            label="PRD"
            phases={PRD_PHASES}
            active={activeTrack === "prd"}
            activeStep={activeTrack === "prd" ? activeStep : -1}
            allDone={prdRowDone}
          />
        </div>
        <div
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-500 ease-out",
            showing === "implement" ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          aria-hidden={showing !== "implement"}
        >
          <PhaseChain
            label="Implement"
            phases={IMPLEMENT_PHASES}
            active={activeTrack === "implement"}
            activeStep={activeTrack === "implement" ? activeStep : -1}
            allDone={impRowDone}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="min-w-0">
          <p className={cn("truncate text-[12.5px] font-semibold", statusDone && "text-[var(--success)]")}>
            {statusDone ? statusLine1 : (
              <>
                <span className="text-[var(--text-muted)]">Working on </span>
                {statusLine1.replace("Working on ", "")}
              </>
            )}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{statusLine2}</p>
        </div>
        <div className="flow-status-dot" data-state={statusDone ? "done" : "working"} />
      </div>
    </div>
  );
}

/* PhaseChain — one row in the demo. Renders a track label + phase chips.
 * When `active`, chips light up step-by-step. When inactive but `allDone`,
 * every chip is in the "done" state. When inactive and not done, every chip
 * is in the muted "idle" state. */
function PhaseChain({
  label, phases, active, activeStep, allDone, className,
}: {
  label: string;
  phases: typeof IMPLEMENT_PHASES;
  active: boolean;
  activeStep: number;
  allDone: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Track marker — a kicker label above the phase chips, deliberately
        * not chip-shaped so it doesn't read as the first step in the row. */}
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full transition-colors duration-300",
            active || allDone ? "bg-[var(--primary)]" : "bg-[var(--surface-3)]",
          )}
        />
        <span
          className={cn(
            "text-[9.5px] font-semibold uppercase tracking-[0.08em] transition-colors duration-300",
            active ? "text-[var(--primary)]"
              : allDone ? "text-[var(--text-muted)]"
              : "text-[var(--text-subtle)]",
          )}
        >
          {label} track
        </span>
      </div>
      <ol className="flex min-w-0 items-center gap-1.5">
        {phases.map((p, i) => {
          const state: "done" | "active" | "idle" =
            allDone || (active && i < activeStep) ? "done"
            : active && i === activeStep ? "active"
            : "idle";
          return (
            <li
              key={p.num}
              className={cn(
                "flow-step relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-all duration-300",
                state === "active" && "flow-step-active border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
                state === "done"   && "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]",
                state === "idle"   && "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
              )}
            >
              {state === "done" ? (
                <CheckCircle2 className="size-3 shrink-0" strokeWidth={2.5} />
              ) : (
                <p.icon className="size-3 shrink-0" strokeWidth={2.25} />
              )}
              <span className="truncate font-semibold">{p.name}</span>
            </li>
          );
        })}
      </ol>
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
      "rounded-2xl border bg-[var(--surface)] p-7 transition-all",
      primary
        ? "border-[var(--primary)] shadow-[0_0_0_3px_var(--primary-soft)]"
        : "border-[var(--border)]"
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
          className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl focus:outline-none"
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
              <div role="alert" className="rounded-md border border-[var(--border-strong)] bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">
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
