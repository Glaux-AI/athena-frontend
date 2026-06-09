"use client";

import { Gauge, ArrowRight } from "lucide-react";

import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/cn";
import {
  useBeatTrack, useAutoplayOnChange, useReducedMotion, useDivRef, lerp,
} from "../scroll-kit";
import { BEATS, GATE_STYLES, BEAT_RUNNING_USD, type Beat } from "./beats";
import { StageSurface } from "./surfaces";

const COUNT = BEATS.length;
const BRANDABLE = new Set([
  "GitHub", "GitLab", "Bitbucket", "Jira", "Linear", "Slack", "Microsoft Teams",
  "Notion", "Confluence", "Anthropic", "AWS Bedrock", "Azure OpenAI",
  "Datadog", "Sentry", "PagerDuty", "Figma", "Salesforce", "Zendesk",
]);

/** The label half of a "01 / LABEL" kicker. */
const kickerLabel = (kicker: string) => kicker.split("/").slice(1).join("/").trim();

export function BuildFloorScroll({ onJumpToSignIn }: { onJumpToSignIn: () => void }) {
  const reduced = useReducedMotion();

  // Desktop track — scroll SELECTS the active beat; the surface then plays on
  // its own (time-based autoplay keyed on `beat`) instead of scrubbing.
  const trackRef = useDivRef();
  const { beat } = useBeatTrack(trackRef, COUNT);
  const t = useAutoplayOnChange(beat, 1300);

  // Mobile track — its own beat tracker. Only one track is ever visible
  // (`hidden lg:block` vs `lg:hidden`), so each useBeatTrack measures the
  // track that is actually laid out.
  const mTrack = useDivRef();
  const { beat: mBeat } = useBeatTrack(mTrack, COUNT);
  const mT = useAutoplayOnChange(mBeat, 1300);

  const active = BEATS[beat] ?? BEATS[0]!;
  const mActive = BEATS[mBeat] ?? BEATS[0]!;
  const prevUsd = BEAT_RUNNING_USD[beat] ?? 0;
  const nextUsd = BEAT_RUNNING_USD[Math.min(COUNT - 1, beat + 1)] ?? prevUsd;
  const runningUsd = lerp(prevUsd, nextUsd, t);

  // Scroll a track's pinned device to the i-th beat. Whichever track is
  // hidden (`display:none`) reports offsetHeight 0, so each rail only ever
  // drives its own visible track.
  const jumpIn = (ref: typeof trackRef, i: number) => {
    const el = ref.current;
    if (!el || el.offsetHeight === 0) return;
    const top = el.offsetTop + (el.offsetHeight - window.innerHeight) * (i / COUNT) + 8;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };
  const jumpTo = (i: number) => jumpIn(trackRef, i);
  const mJumpTo = (i: number) => jumpIn(mTrack, i);

  return (
    <>
      {/* ===== Desktop: jump-to-act rail + running cost ===== */}
      <nav
        aria-label="Jump to act"
        className="fixed right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2.5 lg:flex"
      >
        <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-[var(--border)]" aria-hidden />
        {BEATS.map((b, i) => {
          const on = i === beat;
          return (
            <button
              key={b.id}
              onClick={() => jumpTo(i)}
              aria-label={`Act ${i + 1}: ${b.headline}`}
              aria-current={on ? "true" : undefined}
              className="relative grid size-3 place-items-center"
            >
              <span className={cn(
                "rounded-full transition-all duration-200",
                on ? "size-2.5 bg-[var(--primary)] shadow-[var(--shadow-glow)]" : "size-1.5 bg-[var(--text-subtle)] hover:bg-[var(--text-muted)]",
              )} />
            </button>
          );
        })}
      </nav>

      <div className="pointer-events-none fixed right-14 top-[4.25rem] z-20 hidden lg:block">
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/90 px-2.5 py-1 text-[11px] font-medium tabular-nums text-[var(--text-muted)] shadow-[var(--shadow-1)] backdrop-blur-sm"
          aria-label="Running cost so far"
          title="Metered — illustrative, not quoted"
        >
          <Gauge className="size-3.5 text-[var(--primary)]" />
          ${runningUsd.toFixed(2)}
        </span>
      </div>

      {/* ===== Desktop: pinned device, surface plays on land ===== */}
      <div ref={trackRef} className="relative hidden lg:block" style={{ height: `${COUNT * 100}vh` }}>
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-12 items-center gap-16 px-10">
            <div className="col-span-7">
              <ProductStage beat={active} t={t} />
            </div>
            <div className="col-span-5">
              <CaptionRail beat={active} {...(active.surface === "cta" ? { onCta: onJumpToSignIn } : {})} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Mobile: same pinned device, stacked vertical scrollytelling ===== */}
      <div className="lg:hidden">
        <div ref={mTrack} className="relative" style={{ height: `${COUNT * 90}svh` }}>
          <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-4 px-4">
            <ProductStage beat={mActive} t={mT} />
            <MobileCaption
              beat={mActive}
              index={mBeat}
              {...(mActive.surface === "cta" ? { onCta: onJumpToSignIn } : {})}
            />
            <MobileProgress active={mBeat} onJump={mJumpTo} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ===================================================== Responsive device ===== */

/**
 * The one persistent product device. Portrait on mobile (4/5, max 440px),
 * landscape on desktop (16/10, max 640px). Interior is a pure function of `t`
 * and cross-fades on beat change via the keyed `bf-rise`.
 */
function ProductStage({ beat, t }: { beat: Beat; t: number }) {
  return (
    <div className="relative mx-auto w-full max-w-[440px] lg:max-w-[640px]">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-[var(--glow-accent)] blur-2xl" aria-hidden />
      <div
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]"
        style={{ boxShadow: "var(--shadow-3), var(--inner-highlight)" }}
      >
        <div className="flex h-7 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-3">
          <span className="flex gap-1" aria-hidden>
            <span className="size-1.5 rounded-full bg-[var(--text-subtle)]" />
            <span className="size-1.5 rounded-full bg-[var(--text-subtle)]" />
            <span className="size-1.5 rounded-full bg-[var(--text-subtle)]" />
          </span>
          <span className="mx-auto truncate font-mono text-[10px] text-[var(--text-muted)]">{beat.breadcrumb}</span>
          <OwlAvatar size={18} mood={beat.mood} />
        </div>
        <div className="relative aspect-[4/5] w-full lg:aspect-[16/10]">
          {/* keyed by surface → the interior cross-fades as scroll changes the step */}
          <div key={beat.surface} className="bf-rise absolute inset-0 p-3.5 lg:p-5">
            <StageSurface surface={beat.surface} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================================================== Desktop caption ===== */

function CaptionRail({ beat, onCta }: { beat: Beat; onCta?: () => void }) {
  return (
    <div className="max-w-[420px]">
      <p className="bf-rise text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]" style={{ "--d": "0ms" } as React.CSSProperties}>
        <span className="tabular-nums text-[var(--text-subtle)]">{beat.kicker.split("/")[0]?.trim()} /</span>{" "}
        {kickerLabel(beat.kicker)}
      </p>
      <h2 className="ff-word mt-3 text-balance text-[clamp(1.5rem,1.2rem+1.1vw,2.1rem)] font-bold leading-[1.1] tracking-tight text-[var(--text)]">
        {beat.headline}
      </h2>
      <p className="bf-rise mt-4 text-[15px] leading-relaxed text-[var(--text-muted)]" style={{ "--d": "80ms" } as React.CSSProperties}>
        {beat.sub}
      </p>
      <div className="bf-rise mt-3" style={{ "--d": "120ms" } as React.CSSProperties}>
        <p className="text-[12px] italic leading-snug text-[var(--text-subtle)]">{beat.microcopy}</p>
      </div>
      <div className="bf-rise mt-8" style={{ "--d": "160ms" } as React.CSSProperties}>
        <MetaStrip beat={beat} />
      </div>
      {onCta && (
        <button
          type="button"
          onClick={onCta}
          className="bf-rise mt-6 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-fg)] shadow-[var(--shadow-glow)]"
          style={{ "--d": "200ms" } as React.CSSProperties}
        >
          Sign in to get started <ArrowRight className="size-4" />
        </button>
      )}
    </div>
  );
}

function MetaStrip({ beat }: { beat: Beat }) {
  const gs = GATE_STYLES[beat.gate.kind];
  const marks = beat.integrations.filter((n) => BRANDABLE.has(n));
  const shown = marks.slice(0, 4);
  const overflow = marks.length - shown.length;
  return (
    <dl className="space-y-2.5 border-t border-[var(--border-soft)] pt-3">
      <div className="flex flex-col gap-1">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">Integration</dt>
        <dd className="flex min-h-6 flex-wrap items-center gap-1.5">
          {shown.length === 0 ? (
            <span className="text-[12px] font-medium text-[var(--text-muted)]">None required</span>
          ) : (
            <>
              {shown.map((n) => <BrandLogo key={n} name={n} size={18} />)}
              {overflow > 0 && <span className="text-[11px] font-medium text-[var(--text-subtle)]">+{overflow}</span>}
            </>
          )}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">Gate</dt>
        <dd>
          <span
            className={cn(
              "inline-flex max-w-full items-start gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium leading-snug",
              gs.cls,
            )}
          >
            <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", gs.dot)} aria-hidden />
            <span className="min-w-0 break-words">{beat.gate.label}</span>
          </span>
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">Cost</dt>
        <dd className="text-[12px] font-medium leading-snug text-[var(--acc-mint-ink)]">{beat.cost}</dd>
      </div>
    </dl>
  );
}

/* ===================================================== Mobile caption ===== */

/**
 * Compact caption beneath the portrait device. Same information as the desktop
 * CaptionRail (step counter, kicker, headline, sub, integration/gate/cost
 * meta) but condensed for a single column. Re-keyed on `index` so the copy
 * cross-fades in step with the device as scroll selects each beat.
 */
function MobileCaption({ beat, index, onCta }: { beat: Beat; index: number; onCta?: () => void }) {
  const gs = GATE_STYLES[beat.gate.kind];
  const marks = beat.integrations.filter((n) => BRANDABLE.has(n)).slice(0, 4);

  return (
    <div key={beat.id} className="w-full max-w-[440px]">
      <p className="bf-rise flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]" style={{ "--d": "0ms" } as React.CSSProperties}>
        <span className="shrink-0 tabular-nums text-[var(--text-subtle)]">
          {String(index + 1).padStart(2, "0")} / {COUNT}
        </span>
        <span className="min-w-0 truncate">{kickerLabel(beat.kicker)}</span>
      </p>
      <h2 className="ff-word mt-1.5 text-balance text-[clamp(1.25rem,1.05rem+2.2vw,1.6rem)] font-bold leading-snug tracking-tight text-[var(--text)]">
        {beat.headline}
      </h2>
      <p className="bf-rise mt-1.5 line-clamp-2 text-[13px] leading-snug text-[var(--text-muted)]" style={{ "--d": "80ms" } as React.CSSProperties}>
        {beat.sub}
      </p>

      {/* meta row — wraps; every chip is max-w-full with an inner truncate so nothing overflows */}
      <div className="bf-rise mt-3 flex flex-wrap items-center gap-1.5" style={{ "--d": "120ms" } as React.CSSProperties}>
        {marks.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1">
            {marks.map((n) => <BrandLogo key={n} name={n} size={16} />)}
          </span>
        )}
        <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", gs.cls)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", gs.dot)} aria-hidden />
          <span className="min-w-0 truncate">{beat.gate.label}</span>
        </span>
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--acc-mint-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--acc-mint-ink)]">
          <Gauge className="size-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{beat.cost}</span>
        </span>
      </div>

      {onCta && (
        <button
          type="button"
          onClick={onCta}
          className="bf-rise mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] shadow-[var(--shadow-glow)]"
          style={{ "--d": "160ms" } as React.CSSProperties}
        >
          Sign in to get started <ArrowRight className="size-4" />
        </button>
      )}
    </div>
  );
}

/* A thin dot row tracking the mobile beat; tapping a dot jumps to that act. */
function MobileProgress({ active, onJump }: { active: number; onJump: (i: number) => void }) {
  return (
    <div className="flex w-full max-w-[440px] items-center justify-center gap-1.5" role="presentation">
      {BEATS.map((b, i) => {
        const on = i === active;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Act ${i + 1}: ${b.headline}`}
            aria-current={on ? "true" : undefined}
            className="grid h-3 place-items-center px-0.5"
          >
            <span className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              on ? "w-5 bg-[var(--primary)] shadow-[var(--shadow-glow)]" : "w-1.5 bg-[var(--text-subtle)]",
            )} />
          </button>
        );
      })}
    </div>
  );
}
