"use client";

/**
 * FilmStage - the landing "film", told as a self-paced CAROUSEL.
 *
 * One feature crossing the whole org, in nine frames. Each frame pairs a
 * caption (what happens here + the human gate that owns it) with a live scene
 * (a miniature of the real product surface). Sophia narrates; the human stamp
 * and the feature card's running cost ride along.
 *
 * The carousel sits in the normal page flow - it never pins the viewport or
 * hijacks the wheel, so the page scrolls straight past it. Move between frames
 * with the side arrows, the dots, or the Left/Right arrow keys; the active
 * scene plays its own choreography once each time it becomes active.
 *
 * Reduced motion: the scene renders settled (t=1) with no auto-play, and the
 * per-frame entrance is neutralized by the global prefers-reduced-motion rule.
 * The carousel itself is just buttons - always available.
 */

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";

import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { cn } from "@/lib/cn";
import { useReducedMotion, easeInOut } from "./kit";
import { ROLES, SEGMENTS } from "./data";
import { FilmScene } from "./scenes";

const N = SEGMENTS.length;
/** How long the active scene takes to play its choreography (0 -> 1). */
const PLAY_MS = 1900;

export function FilmStage({ onJumpToSignIn }: { onJumpToSignIn: () => void }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  // Local scene progress 0..1. Tweens 0 -> 1 each time a frame becomes
  // active so the scene plays itself; reduced motion shows it settled.
  const [t, setT] = useState(0);

  const prev = useCallback(() => setActive((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setActive((i) => Math.min(N - 1, i + 1)), []);

  // Replay the scene's choreography whenever the active frame changes.
  useEffect(() => {
    if (reduced) {
      setT(1);
      return;
    }
    setT(0);
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const k = Math.min(1, (now - start) / PLAY_MS);
      // Quantize so the scene redraws ~50 steps, not once per display frame.
      setT(Math.round(easeInOut(k) * 50) / 50);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
  };

  const s = SEGMENTS[active]!;
  const role = s.station.role ? ROLES[s.station.role] : null;
  const stampGo = s.station.tone === "go";

  return (
    <div
      className="mx-auto w-full max-w-[1200px] px-4 pb-6 pt-4 reveal-on-scroll lg:px-10"
      role="group"
      aria-roledescription="carousel"
      aria-label="Feature walkthrough - one feature, end to end"
      onKeyDown={onKeyDown}
    >
      <div className="relative">
        {/* the frame */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-2)]">
          <div
            key={active}
            className="bf-slide-in grid gap-6 px-5 py-7 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-12 lg:py-10"
            aria-roledescription="slide"
            aria-label={`${active + 1} of ${N}: ${s.headline}`}
          >
            {/* caption - the story leads */}
            <div className="lg:col-span-5">
              <span className="inline-flex rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                {s.kicker}
              </span>
              <h3 className="mt-3 text-balance text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] font-bold leading-[1.08] tracking-tight text-[var(--text)]">
                {s.headline}
              </h3>
              <p className="mt-3 max-w-[34rem] text-[clamp(0.9rem,0.85rem+0.2vw,1rem)] leading-relaxed text-[var(--text-muted)]">
                {s.sub}
              </p>
              <p className="mt-3 flex items-start gap-1.5 text-[12.5px] font-medium leading-snug text-[var(--text)]">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
                {s.boundary}
              </p>

              {/* Sophia narrates · the human stamp · the feature card's cost */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5">
                  <OwlAvatar size={32} mood={s.mood} />
                  <span className="bf-bubble max-w-[230px] truncate rounded-xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)] shadow-[var(--shadow-1)]">
                    {s.says}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-semibold leading-none",
                    stampGo
                      ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
                  )}
                >
                  {role && (
                    <span className="rounded-[3px] bg-[var(--surface-3)] px-1 py-px text-[8px] font-bold text-[var(--text-muted)]">
                      {role.tag}
                    </span>
                  )}
                  {stampGo ? <Sparkles className="size-2.5 shrink-0" /> : <Check className="size-2.5 shrink-0" />}
                  <span className="min-w-0 truncate">{s.station.stamp}</span>
                </span>
                {s.baton.status && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10.5px] font-medium text-[var(--text-muted)]">
                    <span className="rounded-[3px] bg-[var(--acc-violet-soft)] px-1 py-px text-[8px] font-semibold text-[var(--acc-violet-ink)]">feature</span>
                    {s.baton.status}
                    <span className="font-mono tabular-nums text-[var(--text-subtle)]">{s.baton.cost}</span>
                  </span>
                )}
              </div>

              {s.id === "cta" && (
                <button
                  type="button"
                  data-signin-cta
                  onClick={onJumpToSignIn}
                  className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] shadow-[var(--shadow-cta)]"
                >
                  Sign in - start free <ArrowRight className="size-4" />
                </button>
              )}
            </div>

            {/* scene - the real product surface for this moment */}
            <div className="lg:col-span-7 lg:flex lg:justify-end">
              <div className="mx-auto h-[clamp(300px,40svh,420px)] w-full max-w-[560px] lg:mx-0">
                <FilmScene scene={s.id} t={t} />
              </div>
            </div>
          </div>
        </div>

        {/* side arrows - outside the clipped frame, desktop only */}
        <CarouselArrow
          dir="prev"
          onClick={prev}
          disabled={active === 0}
          className="absolute left-0 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:grid"
        />
        <CarouselArrow
          dir="next"
          onClick={next}
          disabled={active === N - 1}
          className="absolute right-0 top-1/2 hidden translate-x-1/2 -translate-y-1/2 lg:grid"
        />
      </div>

      {/* controls - inline arrows (mobile) + dots + counter */}
      <div className="mt-5 flex items-center justify-center gap-3">
        <CarouselArrow dir="prev" onClick={prev} disabled={active === 0} className="grid lg:hidden" />
        <nav aria-label="Walkthrough frames" className="flex items-center gap-1.5">
          {SEGMENTS.map((seg, i) => {
            const on = i === active;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${seg.kicker} - ${seg.headline}`}
                aria-current={on ? "true" : undefined}
                className="grid h-4 place-items-center px-0.5"
              >
                <span className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  on ? "w-6 bg-[var(--primary)] shadow-[var(--shadow-glow)]" : "w-1.5 bg-[var(--text-subtle)] hover:bg-[var(--text-muted)]",
                )} />
              </button>
            );
          })}
        </nav>
        <CarouselArrow dir="next" onClick={next} disabled={active === N - 1} className="grid lg:hidden" />
        <span className="ml-1 hidden text-[11px] font-semibold uppercase tracking-wider tabular-nums text-[var(--text-subtle)] sm:inline">
          {active + 1} / {N}
        </span>
      </div>
    </div>
  );
}

function CarouselArrow({
  dir, onClick, disabled, className,
}: {
  dir: "prev" | "next";
  onClick: () => void;
  disabled: boolean;
  className?: string;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous frame" : "Next frame"}
      className={cn(
        // Subtle: a muted ghost chevron, no border/shadow - it only gains a
        // faint surface + fuller ink on hover.
        "z-10 size-9 place-items-center rounded-full text-[var(--text-subtle)] transition-colors duration-150",
        "hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-subtle)]",
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
