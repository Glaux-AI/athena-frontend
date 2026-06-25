import Link from "next/link";
import {
  Telescope, Search, Network, ListChecks, Sparkles, Gauge, Plug,
  ArrowRight, type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { cn } from "@/lib/cn";

import { STORY, FEATURE_COUNT } from "./features-data";

const ICONS: Record<string, LucideIcon> = {
  Telescope, Search, Network, ListChecks, Sparkles, Gauge, Plug,
};

/** Split a title around its accent phrase so only the accent gets the gradient. */
function splitAccent(title: string, accent: string): [string, string] {
  const i = title.indexOf(accent);
  if (i === -1) return [title, ""];
  return [title.slice(0, i), title.slice(i + accent.length)];
}

export function FeatureStory() {
  return (
    <main className="bg-[var(--bg)] text-[var(--text)]">
      {/* Hero - sets up the journey, calm and spacious */}
      <section className="relative isolate overflow-hidden px-4 pb-16 pt-20 text-center lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <AmbientBackground variant="hero" />
        </div>
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
            100+ features, one story
          </span>
          <GradientText
            as="h1"
            className="mt-5 text-balance text-[clamp(2rem,1.4rem+2.8vw,3.4rem)] font-bold leading-[1.06] tracking-tight"
          >
            What a living knowledge engine{" "}
            <GradientText accent as="span">unlocks for your org</GradientText>.
          </GradientText>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            Follow the whole journey in seven chapters, from the day Athena learns
            your company to the day your AI agents ship work under your team&apos;s
            control. {FEATURE_COUNT} features, written for everyone.
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
          {/* The arc, previewed - so the reader knows the shape before scrolling */}
          <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {STORY.map((ch) => (
              <a
                key={ch.n}
                href={`#chapter-${ch.n}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                <span className="font-mono text-[var(--primary)]">{ch.n}</span>
                <span>{ch.kicker}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* The seven chapters */}
      {STORY.map((ch, i) => {
        const Icon = ICONS[ch.icon] ?? Sparkles;
        const [pre, post] = splitAccent(ch.title, ch.accent);
        const even = i % 2 === 1;
        const single = ch.sections.length === 1;
        return (
          <section
            key={ch.n}
            id={`chapter-${ch.n}`}
            className={cn(
              "scroll-mt-20 border-t border-[var(--border-soft)] py-20 lg:py-28",
              even && "bg-[var(--surface-2)]/30",
            )}
          >
            <div className="mx-auto w-full max-w-[1080px] px-4 lg:px-8">
              <div className="mx-auto max-w-2xl text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1">
                  <Icon className="size-3.5 text-[var(--primary)]" aria-hidden />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Chapter {ch.n} · {ch.kicker}
                  </span>
                </span>
                <h2 className="mt-5 text-balance text-[clamp(1.6rem,1.2rem+1.6vw,2.5rem)] font-bold leading-[1.1] tracking-tight">
                  {pre}
                  <GradientText accent as="span">{ch.accent}</GradientText>
                  {post}
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
                  {ch.narrative}
                </p>
              </div>

              {single ? (
                <ul className="mx-auto mt-12 grid max-w-3xl gap-x-12 gap-y-3 sm:grid-cols-2">
                  {ch.sections[0]?.features.map((f) => (
                    <FeatureLi key={f} text={f} />
                  ))}
                </ul>
              ) : (
                <div className="mt-12 grid gap-x-12 gap-y-12 md:grid-cols-2">
                  {ch.sections.map((sec) => (
                    <div key={sec.label}>
                      <h3 className="mb-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
                        {sec.label}
                      </h3>
                      <ul className="space-y-2.5">
                        {sec.features.map((f) => (
                          <FeatureLi key={f} text={f} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* Closing CTA */}
      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-20 text-center lg:px-8">
          <h2 className="text-balance text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] font-bold tracking-tight">
            All {FEATURE_COUNT} start with one connected project.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            Connect a project and your knowledge engine builds itself. Free to
            start, no credit card.
          </p>
          <div className="mt-7 flex items-center justify-center">
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

function FeatureLi({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--primary)]"
        aria-hidden
      />
      <span className="text-[14px] leading-relaxed text-[var(--text-muted)]">{text}</span>
    </li>
  );
}
