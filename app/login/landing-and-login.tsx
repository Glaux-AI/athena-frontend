"use client";

/**
 * /login - Athena landing page + sign-in.
 *
 * Layout:
 *   1. Fixed nav - wordmark, anchors, theme, sign-in.
 *   2. Hero - the whole-org promise + the sign-in card (the login CTA
 *      lives on the front page, always).
 *   3. The film (app/login/film/*) - one feature crossing the whole team,
 *      told as a carousel: PM asks, AI drafts, lead approves, lanes build
 *      in parallel, engineer merges, admin reads the ledger. It sits in
 *      normal flow - scrolling passes straight past it.
 *   4. Built for every seat - product, design, engineering, admin.
 *   5. Not another copilot - honest category comparison.
 *   6. Integrations - only connectors that are real today.
 *   7. Pricing - public tier cards off the live price catalog.
 *   8. Footer.
 *
 * Honors `?returnTo=` for accept-invite + protected routes.
 */

import { Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2, Loader2, ArrowRight, ArrowDown, X, Check, CheckCircle2, Gauge,
  ClipboardList, PenTool, GitPullRequest, ShieldCheck, Minus,
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

import { HERO, ROLES } from "./film/data";
import { FilmStage } from "./film/stage";
import { SignInCard } from "./sign-in-card";

/** Only connectors that ship today - the roadmap gets one honest footnote. */
const INTEGRATIONS = [
  { group: "Source control", items: ["GitHub", "GitLab", "Bitbucket"] },
  { group: "Work tracking",  items: ["Jira", "Linear", "Asana", "Azure DevOps"] },
  { group: "Comms",          items: ["Slack"] },
  { group: "Coding agents",  items: ["Claude Code", "Codex CLI", "Cursor", "Gemini CLI", "Antigravity", "Copilot CLI"] },
  { group: "AI models",      items: ["Anthropic", "OpenAI", "Google Gemini", "AWS Bedrock", "Azure OpenAI"] },
];

/** Built for every seat - what each role actually gets, nothing aspirational. */
const SEATS: { icon: typeof ClipboardList; role: string; lines: string[] }[] = [
  {
    icon: ClipboardList,
    role: "Product",
    lines: [
      "Ask anything, get answers with citations - no engineer interrupted",
      "Frame a feature; Athena researches and drafts the PRD",
      "Approve or reject at gates, in plain language",
    ],
  },
  {
    icon: PenTool,
    role: "Design",
    lines: [
      "Design tasks with real stages - concept, critique, handoff",
      "Prototypes and critiques tracked like any other lane",
      "Your sign-off is a hard gate, not a comment",
    ],
  },
  {
    icon: GitPullRequest,
    role: "Engineering",
    lines: [
      "Review the diff line by line - before any PR exists",
      "Draft PRs on your repo, your CI, healed on failure",
      "Bring your own coding agent - same gates, its name on every step",
    ],
  },
  {
    icon: ShieldCheck,
    role: "Leadership & admin",
    lines: [
      "Every AI call on one ledger - stage, model, cost, whose key",
      "Budgets that stop spending hard at the cap",
      "A full audit trail of who decided what, when",
    ],
  },
];

/** Honest category comparison - capability rows × tool families. */
type Mark = { tone: "yes" | "part" | "no"; label: string };
const COMPARE: { capability: string; copilots: Mark; chat: Mark; trackers: Mark; athena: Mark }[] = [
  {
    capability: "Knows every repo in the org",
    copilots: { tone: "part", label: "One workspace at a time" },
    chat: { tone: "no", label: "Not grounded in your code" },
    trackers: { tone: "no", label: "No code at all" },
    athena: { tone: "yes", label: "Org-wide knowledge base" },
  },
  {
    capability: "Cites the file, decision, or PR behind every answer",
    copilots: { tone: "no", label: "-" },
    chat: { tone: "no", label: "-" },
    trackers: { tone: "no", label: "-" },
    athena: { tone: "yes", label: "Citations built in" },
  },
  {
    capability: "Does the work - PRD → plan → code → draft PR",
    copilots: { tone: "part", label: "Code only" },
    chat: { tone: "no", label: "Advice only" },
    trackers: { tone: "no", label: "Tracks it, doesn't do it" },
    athena: { tone: "yes", label: "The full arc" },
  },
  {
    capability: "A human gates every consequential step",
    copilots: { tone: "no", label: "Accept/undo after the fact" },
    chat: { tone: "no", label: "-" },
    trackers: { tone: "part", label: "Statuses, not gates" },
    athena: { tone: "yes", label: "Hard gates, unskippable" },
  },
  {
    capability: "Every AI call metered, budgeted, attributed",
    copilots: { tone: "no", label: "Seat price, no ledger" },
    chat: { tone: "no", label: "-" },
    trackers: { tone: "no", label: "-" },
    athena: { tone: "yes", label: "One ledger, hard caps" },
  },
  {
    capability: "The whole org works in it - not just engineers",
    copilots: { tone: "no", label: "Engineers only" },
    chat: { tone: "part", label: "Anyone, ungrounded" },
    trackers: { tone: "part", label: "Tracking only" },
    athena: { tone: "yes", label: "PM, design, eng, admin" },
  },
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
  // True while any sign-in CTA (hero card, film finale, footer) is in the
  // viewport - the nav's own Sign in collapses so there's never two on screen.
  const [signInCtaOnScreen, setSignInCtaOnScreen] = useState(true);

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

  // Stable identity - it's the memoized film segments' onCta; an inline
  // closure would re-render the finale segment on every landing re-render.
  const jumpToSignIn = useCallback(() => {
    document.getElementById("signin")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

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
    // The film is a scroll-snap "stop". Proximity snapping (not mandatory)
    // only engages near the two snap targets - the film section and the
    // section below it - so the rest of the long page scrolls freely; the
    // film's scroll-snap-stop:always forces the page to land on it once on
    // the way down. Scoped to this page: set on the document scroller while
    // the landing is mounted, restored on unmount so other routes are
    // unaffected. The window stays the scroller, so the scroll listeners
    // above keep working.
    const html = document.documentElement;
    const prev = html.style.scrollSnapType;
    html.style.scrollSnapType = "y proximity";
    return () => { html.style.scrollSnapType = prev; };
  }, []);

  useEffect(() => {
    // One rAF-throttled pass per scroll/resize: the glass-nav threshold plus
    // a live rect check of every [data-signin-cta]. Rects are queried fresh
    // each pass (not an IntersectionObserver) because the film's CTA moves
    // via a transform on the horizontally-travelling world - and it only
    // moves when the page scrolls, so scroll events are exactly the right
    // wake-up signal.
    let raf = 0;
    let lastRectPass = 0;
    let trailing = 0;
    const rectPass = () => {
      lastRectPass = performance.now();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let visible = false;
      for (const el of document.querySelectorAll<HTMLElement>("[data-signin-cta]")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) {
          visible = true;
          break;
        }
      }
      setSignInCtaOnScreen(visible);
    };
    const check = () => {
      raf = 0;
      setScrolled(window.scrollY > 40);
      // The rect pass reads layout - ~7 Hz is plenty for a 300 ms-fade nav
      // button, and it keeps the scroll frames themselves read-free. A
      // trailing pass catches scrolls that end inside the gate window
      // (e.g. an instant jump to the top), so the rest position is never
      // judged by a stale mid-flight reading.
      const now = performance.now();
      if (now - lastRectPass < 150) {
        if (!trailing) {
          trailing = window.setTimeout(() => {
            trailing = 0;
            rectPass();
          }, 160);
        }
        return;
      }
      rectPass();
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (trailing) window.clearTimeout(trailing);
    };
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
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
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

  const seats = [ROLES.pm!, ROLES.design!, ROLES.lead!, ROLES.eng!, ROLES.admin!];

  return (
    // `isolate` matters: it makes <main> a stacking context so the fixed
    // -z-10 ambient layer paints ABOVE main's own background instead of
    // being buried under it (negative-z children otherwise sit below
    // in-flow block backgrounds in the root context).
    <main className="relative isolate bg-[var(--bg)] text-[var(--text)]">
      {/* One ambient light system behind the WHOLE page - the grid and light
          pools ride the viewport (fixed), so every section sits on the same
          backdrop, not just the hero. */}
      <div className="fixed inset-0 -z-10" aria-hidden>
        <AmbientBackground variant="hero" />
      </div>

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
            href="#compare"
            className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] md:inline-flex"
          >
            Why Athena
          </a>
          <a
            href="#pricing"
            className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:inline-flex"
          >
            Pricing
          </a>
          <ThemeToggle className="rounded-full hover:bg-[var(--surface-2)]" />
          <div
            aria-hidden={signInCtaOnScreen}
            className={cn(
              "overflow-hidden transition-[max-width,opacity] duration-300",
              signInCtaOnScreen ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100",
            )}
          >
            <button
              type="button"
              onClick={jumpToSignIn}
              tabIndex={signInCtaOnScreen ? -1 : 0}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              Sign in <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Hero - the whole-org promise + sign-in, on the front page */}
      <section className="relative flex min-h-[100svh] items-center px-4 pb-10 pt-20 lg:px-10">
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="max-w-[46rem]">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
              {HERO.kicker}
            </span>
            <GradientText as="h1" className="mt-4 text-balance text-[clamp(2rem,1.4rem+2.8vw,3.4rem)] font-bold leading-[1.06] tracking-tight">
              {HERO.headline_pre}
              <GradientText accent as="span">{HERO.headline_accent}</GradientText>
              {HERO.headline_post}
            </GradientText>
            <p className="mt-5 max-w-[40rem] text-[15px] leading-relaxed text-[var(--text-muted)]">
              {HERO.sub}
            </p>
            {/* the seats - this page follows one feature through your whole team */}
            <div className="mt-8 flex items-center gap-3">
              <span className="flex -space-x-1.5">
                {seats.map((p) => (
                  <span
                    key={p.tag}
                    title={p.label}
                    className="flex h-7 min-w-7 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-3)] px-1 text-[8px] font-bold text-[var(--text-muted)] ring-2 ring-[var(--bg)]"
                  >
                    {p.tag}
                  </span>
                ))}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)]">
                <ArrowDown className="bf-breathe size-4 text-[var(--primary)]" aria-hidden />
                Follow one feature through your whole team
              </span>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end" data-signin-cta>
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

      {/* The film - one feature, the whole org. A scroll-snap "stop": the page
          sticks here once on the way down (scroll-snap-stop: always), and the
          next scroll carries past the whole carousel to the section below. */}
      <section
        aria-label="How a feature ships with Athena"
        className="flex min-h-[100svh] snap-start snap-always flex-col justify-center py-12"
      >
        <div className="mx-auto w-full max-w-[1200px] px-4 pb-2 text-center reveal-on-scroll lg:px-10">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">The film · one feature, end to end</span>
          <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">
            From a question in chat to a merged PR.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
            Watch one feature ship, end to end. Your team decides at every gate;
            Athena does the work in between. Step through it at your own pace.
          </p>
        </div>
        <FilmStage onJumpToSignIn={jumpToSignIn} />
      </section>

      {/* Built for every seat - the snap target the film releases onto, so one
          scroll past the film lands cleanly here, then scrolling is normal. */}
      <section id="everyone" className="snap-start border-t border-[var(--border)]">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 reveal-on-scroll lg:px-10">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">For the whole org</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">
              Not just for engineers.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              Every surface speaks plain language first - the code stays one click away, never a prerequisite.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SEATS.map((s) => (
              <div key={s.role} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-all duration-150 hover:border-[var(--primary)] hover:shadow-[var(--shadow-2)]">
                <s.icon className="size-5 text-[var(--primary)]" aria-hidden />
                <h3 className="mt-3 text-sm font-bold">{s.role}</h3>
                <ul className="mt-3 space-y-2.5">
                  {s.lines.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Not another copilot - honest category comparison */}
      <section id="compare" className="border-t border-[var(--border)] bg-[var(--surface-2)]/30">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 reveal-on-scroll lg:px-10">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Why Athena</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">
              Not another copilot.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              Code assistants speed up typing. Chat assistants answer from memory.
              Trackers hold the list. Athena is the layer where the work itself
              happens - grounded in your code, gated by your people.
            </p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* header row */}
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr] gap-2 border-b border-[var(--border)] pb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Capability</span>
                <CompareHead title="IDE copilots" sub="Copilot · Cursor" />
                <CompareHead title="Chat AI" sub="General assistants" />
                <CompareHead title="Trackers" sub="Jira · Linear" />
                <CompareHead title="Athena" sub="One engine" accent />
              </div>
              {COMPARE.map((row) => (
                <div key={row.capability} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr] items-center gap-2 border-b border-[var(--border-soft)] py-3">
                  <span className="pr-2 text-[13px] font-medium leading-snug text-[var(--text)]">{row.capability}</span>
                  <CompareCell mark={row.copilots} />
                  <CompareCell mark={row.chat} />
                  <CompareCell mark={row.trackers} />
                  <CompareCell mark={row.athena} accent />
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
            Your coding agents aren&apos;t competition - connect Claude Code, Codex, Cursor,
            Gemini CLI, or Copilot and they work Athena&apos;s tasks under the same gates.
          </p>
        </div>
      </section>

      {/* Integrations - real connectors only */}
      <section id="integrations" className="border-t border-[var(--border)]">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 reveal-on-scroll lg:px-10">
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Plays well with your stack</span>
            <h2 className="mt-2 text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold leading-tight tracking-tight">
              Connects to the tools you already use.
            </h2>
            <p className="mt-3 text-[clamp(0.9375rem,0.875rem+0.15vw,1rem)] text-[var(--text-muted)]">
              OAuth in - source control is the only required connector. Everything below ships today.
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
            AI models route through one catalog of 14 providers - bring your own key, or run on Athena credit.
            <span className="mx-2 text-[var(--text-subtle)]">·</span>
            Next up: Microsoft Teams, Notion, Confluence.
          </p>
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
            <span className="font-semibold text-[var(--text)]">Athena</span>
            <span>·</span>
            <span>From a question in chat to a merged PR.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" data-signin-cta onClick={jumpToSignIn} className="hover:text-[var(--text)]">Sign in</button>
            <a href="#compare" className="hover:text-[var(--text)]">Why Athena</a>
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

function CompareHead({ title, sub, accent }: { title: string; sub: string; accent?: boolean }) {
  return (
    <span className={cn("flex flex-col", accent && "rounded-md bg-[var(--primary-soft)] px-2 py-1")}>
      <span className={cn("text-[12px] font-bold", accent ? "text-[var(--primary)]" : "text-[var(--text)]")}>{title}</span>
      <span className="text-[10px] text-[var(--text-subtle)]">{sub}</span>
    </span>
  );
}

function CompareCell({ mark, accent }: { mark: Mark; accent?: boolean }) {
  return (
    <span className={cn("flex items-start gap-1.5", accent && "rounded-md bg-[var(--primary-soft)]/50 px-2 py-1")}>
      {mark.tone === "yes" && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" aria-hidden />}
      {mark.tone === "part" && <Minus className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-ink)]" aria-hidden />}
      {mark.tone === "no" && <X className="mt-0.5 size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />}
      <span className={cn("text-[12px] leading-snug", accent ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]")}>
        {mark.label}
      </span>
    </span>
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

  const priceLabel = (v: number | null) => (v === null ? "-" : `${formatInr(v)}`);

  const creditLabel = (tier: DisplayTier) => {
    const usd = TIER_MONTHLY_CREDIT_USD[tier];
    if (usd === null) return "Volume AI credit, negotiated";
    if (usd === 0) return "No included credit - bring your own key or top up";
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
            Every plan runs the full engine you just watched - the knowledge base,
            cited chat, gated tasks, and the cost ledger. You scale on repos,
            seats, and included AI credit.
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
          Sign in free - no credit card. Bring your own AI key, or top up Athena credit anytime.
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
