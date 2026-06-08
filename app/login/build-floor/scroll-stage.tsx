"use client";

import { useRef } from "react";
import { Gauge } from "lucide-react";

import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/cn";
import { useBeatTrack, useInView, useReducedMotion, useDivRef, lerp } from "../scroll-kit";
import { BEATS, GATE_STYLES, BEAT_RUNNING_USD, type Beat } from "./beats";
import { StageSurface } from "./surfaces";

const COUNT = BEATS.length;
const BRANDABLE = new Set([
  "GitHub", "GitLab", "Bitbucket", "Jira", "Linear", "Slack", "Microsoft Teams",
  "Notion", "Confluence", "Anthropic", "AWS Bedrock", "Azure OpenAI",
  "Datadog", "Sentry", "PagerDuty", "Figma", "Salesforce", "Zendesk",
]);

export function BuildFloorScroll({ onJumpToSignIn }: { onJumpToSignIn: () => void }) {
  const reduced = useReducedMotion();
  const trackRef = useDivRef();
  const { beat, t } = useBeatTrack(trackRef, COUNT);

  const active = BEATS[beat] ?? BEATS[0]!;
  const prevUsd = BEAT_RUNNING_USD[beat] ?? 0;
  const nextUsd = BEAT_RUNNING_USD[Math.min(COUNT - 1, beat + 1)] ?? prevUsd;
  const runningUsd = lerp(prevUsd, nextUsd, t);

  const jumpTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const top = el.offsetTop + (el.offsetHeight - window.innerHeight) * (i / COUNT) + 8;
    window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <>
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

      {/* Running cost chip — desktop, below nav */}
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

      <div className="lg:hidden">
        {BEATS.map((b) => (
          <MobileBeat key={b.id} beat={b} {...(b.surface === "cta" ? { onCta: onJumpToSignIn } : {})} />
        ))}
      </div>
    </>
  );
}

function ProductStage({ beat, t }: { beat: Beat; t: number }) {
  return (
    <div className="relative mx-auto w-full max-w-[640px]">
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
        <div className="relative aspect-[16/10] w-full">
          <div className="absolute inset-0 p-4 lg:p-5">
            <StageSurface surface={beat.surface} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptionRail({ beat, onCta }: { beat: Beat; onCta?: () => void }) {
  return (
    <div className="max-w-[420px]">
      <p className="bf-rise text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--primary)]" style={{ "--d": "0ms" } as React.CSSProperties}>
        <span className="tabular-nums text-[var(--text-subtle)]">{beat.kicker.split("/")[0]?.trim()} /</span>{" "}
        {beat.kicker.split("/").slice(1).join("/").trim()}
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
          Sign in to get started
        </button>
      )}
    </div>
  );
}

function MetaStrip({ beat }: { beat: Beat }) {
  const gs = GATE_STYLES[beat.gate.kind];
  const marks = beat.integrations.filter((n) => BRANDABLE.has(n));
  const shown = marks.slice(0, 4);
  const overflow = beat.integrations.length - shown.length;
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
            title={beat.gate.label}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-medium leading-snug",
              gs.cls,
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", gs.dot)} aria-hidden />
            <span className="min-w-0">{beat.gate.label}</span>
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

function MobileBeat({ beat, onCta }: { beat: Beat; onCta?: () => void }) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { threshold: 0.25 });
  return (
    <section ref={ref} className="flex min-h-[100svh] flex-col justify-center gap-6 px-4 py-16">
      <ProductStage beat={beat} t={inView ? 1 : 0} />
      <CaptionRail beat={beat} {...(onCta ? { onCta } : {})} />
    </section>
  );
}
