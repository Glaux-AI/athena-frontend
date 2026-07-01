"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";

export default function AboutPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="relative isolate bg-[var(--bg)] text-[var(--text)]">
      {/* Ambient backdrop — identical to landing page */}
      <div className="fixed inset-0 -z-10" aria-hidden>
        <AmbientBackground variant="hero" />
      </div>

      {/* Fixed nav — mirrors landing page nav, simplified (no sign-in card logic) */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 lg:px-10">
        {/* Wordmark → links to /login (same as landing) */}
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
        {/* Right cluster: anchor + theme toggle + sign-in (always visible) */}
        <div className={cn(
          "flex items-center gap-1 rounded-full px-1 py-1 transition-all duration-300",
          scrolled ? "glass shadow-[var(--shadow-1)]" : "border border-transparent",
        )}>
          <a
            href="#vision"
            className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] md:inline-flex"
          >
            About
          </a>
          <a
            href="#architecture"
            className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:inline-flex"
          >
            Architecture
          </a>
          <ThemeToggle className="rounded-full hover:bg-[var(--surface-2)]" />
          <Link
            href="/login"
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
          >
            Sign in <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* === CONTENT SECTIONS (responsive container) === */}
      {/* Each section uses the same container pattern as the landing hero:
          mx-auto w-full max-w-[1200px] px-4 lg:px-10 */}

      {/* Section 1: Hero / Vision — mounting point for about-page-content copy */}
      <section id="vision" className="relative flex min-h-[100svh] items-center px-4 pb-10 pt-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          {/* about-page-content will fill: kicker, headline, sub-copy */}
          <h1 className="text-[clamp(2rem,1.4rem+2.8vw,3.4rem)] font-bold leading-[1.06] tracking-tight">
            About Athena
          </h1>
          <p className="mt-5 max-w-[40rem] text-[15px] leading-relaxed text-[var(--text-muted)]">
            {/* placeholder — about-page-content replaces */}
            From a question in chat to a merged PR.
          </p>
        </div>
      </section>

      {/* Section 2: Architecture / System Overview — mounting point for about-page-content */}
      <section id="architecture" className="relative px-4 py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <h2 className="text-2xl font-bold tracking-tight">How Athena works</h2>
          <p className="mt-3 max-w-[40rem] text-[15px] leading-relaxed text-[var(--text-muted)]">
            {/* placeholder — about-page-content replaces */}
          </p>
        </div>
      </section>

      {/* Section 3: PDLC Visualization — mounting point for pdlc-visualization sibling task */}
      <section id="pdlc" className="relative px-4 py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          {/* pdlc-visualization will mount its film-narrative component here */}
          <div data-pdlc-mount className="min-h-[400px]" />
        </div>
      </section>

      {/* Section 4: Harness Layers — mounting point for about-page-content */}
      <section id="harness" className="relative px-4 py-20 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <h2 className="text-2xl font-bold tracking-tight">The agentic core</h2>
          <p className="mt-3 max-w-[40rem] text-[15px] leading-relaxed text-[var(--text-muted)]">
            {/* placeholder — about-page-content replaces */}
          </p>
        </div>
      </section>

      {/* Footer — mirrors landing page footer exactly */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-[var(--text-muted)] lg:px-10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text)]">Athena</span>
            <span>·</span>
            <span>From a question in chat to a merged PR.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/login" className="hover:text-[var(--text)]">Sign in</Link>
            <a href="#vision" className="hover:text-[var(--text)]">About</a>
            <a href="#architecture" className="hover:text-[var(--text)]">Architecture</a>
            <a href="/legal/privacy" className="hover:text-[var(--text)]">Privacy</a>
            <a href="/legal/terms" className="hover:text-[var(--text)]">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
