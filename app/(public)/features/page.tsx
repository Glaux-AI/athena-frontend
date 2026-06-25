import type { Metadata } from "next";
import Link from "next/link";
import {
  Search, Compass, Network, Map as MapIcon, BookOpen, Library, ListChecks,
  ShieldCheck, Sparkles, Coins, Lock, Plug, Check, ArrowRight, type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { AmbientBackground } from "@/components/ui/ambient-background";

import { FEATURE_GROUPS, FEATURE_COUNT } from "./features-data";

const ICONS: Record<string, LucideIcon> = {
  Search, Compass, Network, Map: MapIcon, BookOpen, Library, ListChecks,
  ShieldCheck, Sparkles, Coins, Lock, Plug,
};

export const metadata: Metadata = {
  title: "Features - what a living knowledge engine unlocks | Athena",
  description:
    "Over 100 things Athena does for your whole org, in plain language: ask your codebase anything, see how everything connects, keep humans in control of AI, and see every dollar of AI spend.",
};

export default function FeaturesPage() {
  return (
    <main className="bg-[var(--bg)] text-[var(--text)]">
      {/* Hero */}
      <section className="relative isolate overflow-hidden px-4 pb-12 pt-16 text-center lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <AmbientBackground variant="hero" />
        </div>
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
            100+ features
          </span>
          <GradientText
            as="h1"
            className="mt-5 text-balance text-[clamp(2rem,1.4rem+2.8vw,3.4rem)] font-bold leading-[1.06] tracking-tight"
          >
            What a living knowledge engine{" "}
            <GradientText accent as="span">unlocks for your org</GradientText>.
          </GradientText>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            {FEATURE_COUNT} things your whole team can do once every project, decision,
            and conversation lives in one place and stays current on its own.
            Written for everyone, not just engineers.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href="/signup">
                Start free <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">See how it works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature groups - masonry columns so uneven cards pack cleanly */}
      <section className="mx-auto w-full max-w-[1200px] px-4 pb-16 lg:px-8">
        <div className="gap-6 lg:columns-2 [&>*]:mb-6">
          {FEATURE_GROUPS.map((group) => {
            const Icon = ICONS[group.icon] ?? Sparkles;
            return (
              <div
                key={group.name}
                className="break-inside-avoid rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold tracking-tight">{group.name}</h2>
                      <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-px text-[10px] font-semibold text-[var(--text-muted)]">
                        {group.features.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">
                      {group.tagline}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {group.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" aria-hidden />
                      <span className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-2)]/30">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-16 text-center lg:px-8">
          <h2 className="text-balance text-[clamp(1.5rem,1.125rem+1.2vw,2rem)] font-bold tracking-tight">
            Bring all {FEATURE_COUNT} to your org.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            Connect one project and your knowledge engine builds itself.
            Free to start, no credit card.
          </p>
          <div className="mt-6 flex items-center justify-center">
            <Button asChild>
              <Link href="/signup">
                Start free <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
