"use client";

/**
 * FilmStage — the landing film: one feature crossing the whole org.
 *
 * A tall scroll track pins a full-screen stage. Inside it, a WORLD eight
 * screens wide travels horizontally as you scroll — every pixel of scroll
 * scrubs the timeline, forwards and backwards. Along the bottom runs the
 * WORKLINE: human stations (the seats around the viewer deciding) connected
 * by AI spans (Sophia working). The feature card is the baton — born at the
 * product station, it rides the playhead down the line collecting status
 * and cost until it ships. Captions and scenes travel with their segment.
 *
 * Motion is applied through refs inside the scrub's rAF (world transform,
 * baton/Sophia position, line fill, progress bar) — React re-renders only
 * when the active segment or its quantized progress changes. Reduced
 * motion renders <StaticFilm> instead: the same eight frames, stacked,
 * settled, no pinning.
 */

import { useCallback, useEffect, useRef } from "react";
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";

import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { cn } from "@/lib/cn";
import { useFilmScrub, useReducedMotion, clamp01, cameraAt } from "./kit";
import { ROLES, SEGMENTS, type Segment } from "./data";
import { FilmScene } from "./scenes";

const N = SEGMENTS.length;
/** Scroll heights per segment — higher = slower, more cinematic. */
const SEG_VH = 115;
/** Station x inside its segment (fraction of one screen width). */
const STATION_AT = 0.78;
/** The baton is born where the question becomes a feature — the product
 *  station at the end of the "ask" segment. */
const ASK_IDX = Math.max(0, SEGMENTS.findIndex((s) => s.id === "ask"));
const BIRTH_FRAC = (ASK_IDX + STATION_AT) / N;
/** Autoplay pace — one segment plays in about this many seconds. */
const SEG_SECONDS = 9;
/** Autoplay resumes after this much input silence. */
const IDLE_MS = 1800;

const stationFrac = (i: number) => (i + STATION_AT) / N;

export function FilmStage({ onJumpToSignIn }: { onJumpToSignIn: () => void }) {
  const reduced = useReducedMotion();
  return reduced ? <StaticFilm onJumpToSignIn={onJumpToSignIn} /> : <ScrubFilm onJumpToSignIn={onJumpToSignIn} />;
}

/* ============================================================== scrub film */

function ScrubFilm({ onJumpToSignIn }: { onJumpToSignIn: () => void }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const batonRef = useRef<HTMLDivElement | null>(null);
  const sophiaRef = useRef<HTMLDivElement | null>(null);
  const lineFillRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const onFrame = useCallback(({ p }: { p: number }) => {
    const vw = window.innerWidth || 1;
    const worldW = N * vw;
    // Hold-then-glide camera: dwell on each segment while its scene plays,
    // travel one screen during the segment's tail.
    const shift = cameraAt(p, N) * vw;
    if (worldRef.current) {
      worldRef.current.style.transform = `translate3d(${(-shift).toFixed(2)}px,0,0)`;
    }
    // The playhead — the point of the world under the screen's focus.
    const ph = shift + vw * 0.5;
    const birth = BIRTH_FRAC * worldW;
    if (batonRef.current) {
      const x = Math.max(ph, birth);
      const vis = clamp01((ph - (birth - vw * 0.18)) / (vw * 0.18));
      batonRef.current.style.left = `${x.toFixed(2)}px`;
      batonRef.current.style.opacity = vis.toFixed(3);
    }
    if (sophiaRef.current) {
      // Sophia walks the line just ahead of the camera the whole film.
      sophiaRef.current.style.left = `${ph.toFixed(2)}px`;
    }
    if (lineFillRef.current) {
      lineFillRef.current.style.width = `${ph.toFixed(2)}px`;
    }
    if (progressRef.current) {
      progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
    }
  }, []);

  const { seg, t } = useFilmScrub(trackRef, N, onFrame);
  const active = SEGMENTS[seg] ?? SEGMENTS[0]!;

  // Autoplay — once the viewer has scrolled into the film, it doesn't stop:
  // when input goes quiet the page glides forward on its own at watching
  // pace, segment after segment, until the story ends. Any wheel / touch /
  // key — or grabbing the scrollbar — hands control straight back.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastUser = performance.now();
    let expected = -1; // scrollY we last set ourselves (-1 = not us)
    let carry = 0; // sub-pixel remainder between frames

    const markUser = () => { lastUser = performance.now(); };
    const onScroll = () => {
      // A scroll we didn't issue (scrollbar drag, jump-dot glide, browser
      // restore) means a human is steering — yield.
      if (expected < 0 || Math.abs(window.scrollY - expected) > 6) markUser();
    };

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      const el = trackRef.current;
      if (!el || dt <= 0 || document.hidden) return;
      if (ts - lastUser < IDLE_MS) { expected = -1; carry = 0; return; }
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const scrollable = Math.max(1, r.height - vh);
      const p = -r.top / scrollable;
      // Engage only while the story is actually under the playhead, and let
      // go at the end — the rest of the page is the viewer's to browse.
      if (p < 0.002 || p > 0.985) { expected = -1; return; }
      carry += ((SEG_VH / 100) * vh / SEG_SECONDS) * dt;
      const step = Math.floor(carry);
      if (step > 0) {
        carry -= step;
        expected = Math.round(window.scrollY) + step;
        window.scrollBy(0, step);
      }
    };

    window.addEventListener("wheel", markUser, { passive: true });
    window.addEventListener("touchstart", markUser, { passive: true });
    window.addEventListener("touchmove", markUser, { passive: true });
    window.addEventListener("keydown", markUser);
    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", markUser);
      window.removeEventListener("touchstart", markUser);
      window.removeEventListener("touchmove", markUser);
      window.removeEventListener("keydown", markUser);
      window.removeEventListener("scroll", onScroll);
    };
  }, [trackRef]);

  const jumpTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const vh = window.innerHeight || 1;
    const target = el.offsetTop + (el.offsetHeight - vh) * ((i + 0.55) / N);
    window.scrollTo({ top: target, behavior: "smooth" });
  };

  return (
    <div ref={trackRef} className="relative" style={{ height: `${N * SEG_VH}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* film progress — a hairline across the very top of the stage */}
        <div className="absolute inset-x-0 top-0 z-30 h-0.5 bg-[var(--border-soft)]">
          <div ref={progressRef} className="h-full w-full origin-left bg-[var(--primary)]" style={{ transform: "scaleX(0)" }} />
        </div>

        {/* the world — eight screens, travelling */}
        <div
          ref={worldRef}
          className="absolute inset-y-0 left-0 flex will-change-transform"
          style={{ width: `${N * 100}vw` }}
        >
          {SEGMENTS.map((s, i) => (
            <FilmSegment
              key={s.id}
              segment={s}
              t={i === seg ? t : i < seg ? 1 : 0}
              {...(s.id === "cta" ? { onCta: onJumpToSignIn } : {})}
            />
          ))}

          {/* the workline — base + filled-to-playhead */}
          <div className="absolute inset-x-0 bottom-[15svh] z-0 h-px bg-[var(--border)]" aria-hidden />
          <div ref={lineFillRef} className="absolute bottom-[15svh] left-0 z-0 h-px bg-[var(--primary)]" style={{ width: 0 }} aria-hidden />

          {/* stations — the humans deciding */}
          {SEGMENTS.map((s, i) => (
            <Station
              key={s.id}
              segment={s}
              stamped={seg > i || (seg === i && t >= 0.98)}
              style={{ left: `${stationFrac(i) * 100}%` }}
            />
          ))}

          {/* the baton — the feature card riding the playhead */}
          <div
            ref={batonRef}
            className="absolute bottom-[15svh] z-10 -translate-x-1/2 translate-y-1/2"
            style={{ left: 0, opacity: 0 }}
            aria-hidden
          >
            <BatonCard segment={active} />
          </div>

          {/* Sophia — the one mascot on stage, working the spans between humans */}
          <div
            ref={sophiaRef}
            className="absolute bottom-[15svh] z-20 -translate-x-[110%]"
            style={{ left: 0 }}
            aria-hidden
          >
            <div className="flex items-end gap-1.5 pb-3">
              <OwlAvatar size={44} mood={active.mood} className="lg:[&_svg]:scale-100" />
              <span
                key={active.id}
                className="bf-bubble glass relative mb-5 hidden max-w-[230px] truncate rounded-xl rounded-bl-sm px-2.5 py-1 text-[11px] font-medium text-[var(--text)] shadow-[var(--shadow-1)] sm:block"
              >
                {active.says}
              </span>
            </div>
          </div>
        </div>

        {/* segment dots — jump anywhere in the film */}
        <nav aria-label="Film segments" className="absolute inset-x-0 bottom-4 z-30 flex items-center justify-center gap-1.5">
          {SEGMENTS.map((s, i) => {
            const on = i === seg;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(i)}
                aria-label={`${s.kicker} — ${s.headline}`}
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
          <span className="ml-2 hidden text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] sm:inline">
            {active.kicker}
          </span>
        </nav>
      </div>
    </div>
  );
}

/* ============================================================ one segment */

function FilmSegment({ segment, t, onCta }: { segment: Segment; t: number; onCta?: () => void }) {
  return (
    <section
      aria-label={`${segment.kicker} — ${segment.headline}`}
      className="relative h-full w-screen shrink-0"
    >
      <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col justify-center gap-4 px-5 pb-[18svh] pt-16 lg:grid lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-10 lg:pb-20 lg:pt-16">
        {/* caption — typography leads the film */}
        <div className="lg:col-span-5">
          <p className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">{segment.kicker}</span>
          </p>
          <h3 className="mt-3 text-balance text-[clamp(1.7rem,1.2rem+2.2vw,2.8rem)] font-bold leading-[1.06] tracking-tight text-[var(--text)]">
            {segment.headline}
          </h3>
          <p className="mt-3 max-w-[34rem] text-[clamp(0.85rem,0.8rem+0.25vw,0.95rem)] leading-relaxed text-[var(--text-muted)] lg:mt-4">
            {segment.sub}
          </p>
          <p className="mt-2.5 flex items-start gap-1.5 text-[12px] font-medium leading-snug text-[var(--text)] lg:mt-3.5">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
            {segment.boundary}
          </p>
          {onCta && (
            <button
              type="button"
              onClick={onCta}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] shadow-[var(--shadow-cta)]"
            >
              Sign in — start free <ArrowRight className="size-4" />
            </button>
          )}
        </div>
        {/* scene — the real product surface for this moment */}
        <div className="min-h-0 flex-1 lg:col-span-7 lg:flex lg:justify-end">
          <div className="mx-auto h-full max-h-[44svh] w-full max-w-[560px] lg:mx-0 lg:max-h-none lg:h-[min(52svh,430px)]">
            <FilmScene scene={segment.id} t={t} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================== station ==== */

function Station({
  segment, stamped, style,
}: {
  segment: Segment;
  stamped: boolean;
  style: React.CSSProperties;
}) {
  const role = segment.station.role ? ROLES[segment.station.role] : null;
  const tone = segment.station.tone;
  const isYou = segment.station.role === "you";
  return (
    <div className="absolute bottom-[15svh] z-[5] -translate-x-1/2" style={style}>
      {/* the dot on the line */}
      <span
        className={cn(
          "absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-300",
          stamped ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border-strong)] bg-[var(--surface)]",
        )}
        aria-hidden
      />
      {/* the seat that acts here */}
      <div className="absolute left-1/2 top-3 w-32 -translate-x-1/2 text-center">
        {role ? (
          <>
            <span
              className={cn(
                "mx-auto flex h-8 min-w-8 items-center justify-center rounded-full border px-1.5 text-[9px] font-bold tracking-wide transition-colors duration-300 sm:h-9 sm:min-w-9 sm:text-[10px]",
                isYou && "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
                !isYou && stamped && "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
                !isYou && !stamped && "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-muted)]",
              )}
            >
              {role.tag}
            </span>
            <p className="mt-1 hidden text-[10px] font-semibold leading-tight text-[var(--text)] sm:block">
              {role.label}
            </p>
          </>
        ) : (
          <span className="mx-auto flex size-2 items-center justify-center" aria-hidden />
        )}
        <span
          className={cn(
            "mt-1 inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold leading-tight transition-opacity duration-200",
            tone === "go" && "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]",
            tone === "ok" && "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
            stamped ? "ff-pop opacity-100" : "opacity-0",
          )}
        >
          {tone === "go" ? <Sparkles className="size-2.5 shrink-0" /> : <Check className="size-2.5 shrink-0" />}
          <span className="min-w-0 truncate">{segment.station.stamp}</span>
        </span>
      </div>
    </div>
  );
}

/* ================================================================ baton ==== */

function BatonCard({ segment }: { segment: Segment }) {
  if (!segment.baton.status) return null;
  const pill = segment.baton.pill;
  return (
    <div className="w-[170px] rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-2)] sm:w-[190px]">
      <div className="flex items-center justify-between gap-1">
        <span className="rounded-[3px] bg-[var(--acc-violet-soft)] px-1 py-px text-[8px] font-semibold text-[var(--acc-violet-ink)]">feature</span>
        <span className="font-mono text-[8.5px] tabular-nums text-[var(--text-subtle)]">{segment.baton.cost}</span>
      </div>
      <p className="mt-1 truncate text-[10px] font-semibold leading-tight text-[var(--text)]">
        Retry billing webhooks safely
      </p>
      <span
        className={cn(
          "mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[8.5px] font-semibold",
          pill === "running" && "bg-[var(--info-soft)] text-[var(--info-ink)]",
          pill === "review" && "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
          pill === "done" && "bg-[var(--success-soft)] text-[var(--success-ink)]",
          pill === "idle" && "bg-[var(--surface-2)] text-[var(--text-subtle)]",
        )}
      >
        {pill === "running" && <Sparkles className="size-2.5" />}
        {pill === "done" && <Check className="size-2.5" />}
        {segment.baton.status}
      </span>
    </div>
  );
}

/* ========================================================== static film ==== */

/** prefers-reduced-motion: the same eight frames, stacked and settled —
 *  no pinning, no travel, full copy. */
function StaticFilm({ onJumpToSignIn }: { onJumpToSignIn: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-5 py-16 lg:px-10">
      {SEGMENTS.map((s) => {
        const role = s.station.role ? ROLES[s.station.role] : null;
        return (
          <section key={s.id} aria-label={`${s.kicker} — ${s.headline}`} className="grid gap-6 lg:grid-cols-12 lg:items-center lg:gap-10">
            <div className="lg:col-span-5">
              <p className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">{s.kicker}</span>
              </p>
              <h3 className="mt-3 text-balance text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] font-bold leading-tight tracking-tight">{s.headline}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">{s.sub}</p>
              <p className="mt-3 flex items-start gap-1.5 text-[12.5px] font-medium leading-snug text-[var(--text)]">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
                {s.boundary}
              </p>
              {role && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--surface-3)] px-1 text-[7.5px] font-bold text-[var(--text-muted)]">{role.tag}</span>
                  {role.label} · {s.station.stamp}
                </p>
              )}
              {s.id === "cta" && (
                <button
                  type="button"
                  onClick={onJumpToSignIn}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] shadow-[var(--shadow-cta)]"
                >
                  Sign in — start free <ArrowRight className="size-4" />
                </button>
              )}
            </div>
            <div className="lg:col-span-7">
              <div className="mx-auto h-[380px] w-full max-w-[560px]">
                <FilmScene scene={s.id} t={1} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
