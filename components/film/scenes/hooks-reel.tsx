"use client";

/**
 * Opening-hooks REEL (dev-only, separate from the shipping film).
 *
 * A comparison clip: the 7 strongest opening hooks. Each hook is ONE
 * continuous shot - the 3 problem lines play over a drifting field of
 * scattered "knowledge" shards, then the shards collapse into a single point
 * that BLOOMS into Athena (owl + "Meet Athena" + the shared-brain lines). The
 * convergence IS the reveal, so it reads as Athena pulling the scattered mess
 * into one place - Athena solving, not a hard cut.
 *
 * Rendered by athena-demo/_render_film.cjs at FILM_URL=/film/hooks. Scripts
 * live in athena-demo/HOOKS-REEL-SCRIPT.md. Everything is a pure function of
 * scene-local time. On-screen lines are dash-free per the repo copy rule; the
 * spoken (ElevenLabs) versions are in the script doc.
 */

import { OwlGlyph } from "@/components/mascot/owl-glyph";
import { ease, easeOut, ev, evo, lerp, rand, seg, type SceneDef } from "../engine";
import { Statement } from "../language";

/* Where the scattered shards collapse and Athena blooms (stage 1920x1080). */
const CX = 960;
const CY = 430;

/* ----------------------------------------------------------- shard field */
/* Deterministic field of 64 scattered "knowledge" shards - the same visual
 * language as the film cold-open, so the convergence reads as "one place". */
const SHARDS = Array.from({ length: 64 }, (_, i) => ({
  x: rand(i * 3 + 1) * 1920,
  y: rand(i * 3 + 2) * 1080,
  w: 26 + rand(i * 3 + 3) * 54,
  h: 18 + rand(i * 7 + 4) * 30,
  rot: (rand(i * 5 + 5) - 0.5) * 30,
  drift: (rand(i * 11 + 6) - 0.5) * 60,
}));

function Shard({
  s,
  t,
  converge,
}: {
  s: (typeof SHARDS)[number];
  t: number;
  converge: number;
}) {
  const dx = Math.sin(t * 0.25 + s.rot) * s.drift;
  const x = lerp(s.x + dx, CX, converge);
  const y = lerp(s.y + Math.cos(t * 0.2 + s.x) * 10, CY, converge);
  // Stay visible while streaming in (so you SEE the gather), then shrink to a
  // fleck at the centre where Athena blooms over them.
  const scale = lerp(1, 0.12, converge);
  const opacity = (0.25 + rand(s.x) * 0.35) * (1 - converge * 0.55);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: s.w,
        height: s.h,
        transform: `translate(-50%, -50%) rotate(${s.rot * (1 - converge)}deg) scale(${scale})`,
        opacity,
        borderRadius: 5,
        border: "1.5px solid oklch(20% 0.02 250 / 0.5)",
        background: "oklch(100% 0 0 / 0.75)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: "60%",
          height: 2.5,
          borderRadius: 2,
          background: "oklch(20% 0.02 250 / 0.35)",
          boxShadow: "0 6px 0 oklch(20% 0.02 250 / 0.22), 0 -6px 0 oklch(20% 0.02 250 / 0.22)",
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------- the 7 hooks */

interface Hook {
  key: string;
  /** Three dash-free on-screen lines; last line is the shared "scattered" pivot. */
  lines: [string, string, string];
}

const HOOKS: Hook[] = [
  {
    key: "uber",
    lines: [
      "Uber burned its entire 2026 AI budget by April.",
      "A full year of spend. Gone in four months.",
      "No single place could see it happening.",
    ],
  },
  {
    key: "roi",
    lines: [
      "Everyone is racing to buy more AI.",
      "Ninety-five percent of it shows no return.",
      "The proof is scattered across a hundred tools.",
    ],
  },
  {
    key: "question",
    lines: [
      "Can you say what your AI actually cost last month?",
      "Which team? Which feature? Which person?",
      "It's all there. Just scattered across a dozen tools.",
    ],
  },
  {
    key: "engineer",
    lines: [
      "One engineer spent $40,000 on AI in one month.",
      "Brilliant, or reckless? Nobody could tell.",
      "Nothing connected the spend to the work.",
    ],
  },
  {
    key: "runaway",
    lines: [
      "One AI agent looped out of control.",
      "It drained a five-hour limit in five minutes.",
      "No single place was watching, or holding the gate.",
    ],
  },
  {
    key: "trillion",
    lines: [
      "This year, the world will spend $2.5 trillion on AI.",
      "Most of it, no one can measure or explain.",
      "It's everywhere. And nothing brings it together.",
    ],
  },
  {
    key: "budget",
    lines: [
      "In early 2026, finance teams started to panic.",
      "Companies ran three times over their AI budget.",
      "Scattered across tools no one was tracking.",
    ],
  },
];

/* Auto-fit statement size so long lines never clip the 1920 stage. */
function stSize(s: string): number {
  if (s.length > 46) return 50;
  if (s.length > 34) return 58;
  return 66;
}

/* ------------------------------------------------------ the continuous shot */

/**
 * One hook, end to end: problem lines -> shards collapse to (CX,CY) -> Athena
 * blooms out of the collapse point with an energy ring -> shared-brain lines.
 */
function HookScene({ t, hook }: { t: number; hook: Hook }) {
  // Beats overlap so there is never an empty frame: the shards are still
  // streaming into the point as Athena blooms out of it - the gather BECOMES
  // Athena. No limbo between problem and reveal.
  const converge = ev(t, 6.7, 8.7);
  const glow = evo(t, 7.6, 8.9) * (1 - ev(t, 10.6, 12.8));
  const bloom = evo(t, 8.5, 9.6);
  const pulse = seg(t, 8.7, 10.5);
  const wordP = evo(t, 9.4, 10.3);
  const sub1 = evo(t, 10.4, 11.2);
  const sub2 = evo(t, 11.7, 12.5);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {SHARDS.map((s, i) => (
        <Shard key={i} s={s} t={t} converge={converge} />
      ))}

      {/* the point of light everything gathers into, that Athena emerges from */}
      <div
        style={{
          position: "absolute",
          left: CX,
          top: CY,
          transform: "translate(-50%, -50%)",
          width: 560,
          height: 560,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, oklch(72% 0.15 265 / 0.30), transparent 60%)",
          opacity: glow,
          filter: "blur(4px)",
          pointerEvents: "none",
        }}
      />

      <Statement t={t} a={0.3} b={2.9} size={stSize(hook.lines[0])}>
        {hook.lines[0]}
      </Statement>
      <Statement t={t} a={3.2} b={5.5} size={stSize(hook.lines[1])}>
        {hook.lines[1]}
      </Statement>
      <Statement t={t} a={5.8} b={8.4} size={stSize(hook.lines[2])}>
        {hook.lines[2]}
      </Statement>

      {bloom > 0 && (
        <>
          {pulse > 0 && pulse < 1 && (
            <div
              style={{
                position: "absolute",
                left: CX,
                top: CY,
                width: 300,
                height: 300,
                borderRadius: "50%",
                border: "3px solid oklch(52% 0.17 265)",
                transform: `translate(-50%, -50%) scale(${lerp(0.35, 2.0, easeOut(pulse))})`,
                opacity: 1 - pulse,
                pointerEvents: "none",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              left: CX,
              top: CY,
              width: 220,
              height: 220,
              transform: `translate(-50%, -50%) scale(${bloom})`,
              opacity: bloom,
              transformOrigin: "50% 50%",
            }}
          >
            <OwlGlyph mood={t > 10.2 ? "happy" : "idle"} />
          </div>

          <div
            style={{
              position: "absolute",
              left: CX,
              top: CY + 168,
              transform: "translateX(-50%)",
              width: 1500,
              display: "grid",
              justifyItems: "center",
              gap: 22,
            }}
          >
            <span className="film-lineclip">
              <span
                style={{
                  display: "block",
                  fontSize: 104,
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  transform: `translateY(${(1 - wordP) * 110}%)`,
                }}
              >
                Meet Athena
              </span>
            </span>
            <span
              style={{
                fontSize: 34,
                fontWeight: 500,
                color: "oklch(20% 0.02 250 / 0.64)",
                opacity: sub1,
                transform: `translateY(${(1 - sub1) * 16}px)`,
              }}
            >
              One shared brain for your whole company.
            </span>
            <span
              style={{
                fontSize: 27,
                fontWeight: 500,
                color: "oklch(52% 0.17 265)",
                opacity: sub2,
                transform: `translateY(${(1 - sub2) * 14}px)`,
              }}
            >
              One place for everything you know, build, and spend.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Lead-in card so the clip reads as a deliberate comparison. */
function ReelIntro({ t }: { t: number }) {
  const inP = evo(t, 0.2, 1.0);
  const out = ev(t, 2.4, 3.0);
  const sub = evo(t, 0.9, 1.7);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        opacity: 1 - out,
      }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 20 }}>
        <span className="film-lineclip">
          <span
            style={{
              display: "block",
              fontSize: 92,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              transform: `translateY(${(1 - inP) * 110}%)`,
            }}
          >
            Seven ways in.
          </span>
        </span>
        <span
          style={{
            fontSize: 33,
            fontWeight: 500,
            color: "oklch(20% 0.02 250 / 0.6)",
            opacity: sub,
            transform: `translateY(${(1 - sub) * 16}px)`,
          }}
        >
          Seven openings. One place they all lead.
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- assembly */

const HOOK_DUR = 13.2;

export const HOOKS_REEL: SceneDef[] = [
  {
    id: "reel-intro",
    dur: 3.0,
    rate: 1.15,
    Comp: ({ t }) => <ReelIntro t={t} />,
  },
  ...HOOKS.map(
    (hook): SceneDef => ({
      id: `hook-${hook.key}`,
      dur: HOOK_DUR,
      rate: 1.15,
      Comp: ({ t }) => <HookScene t={t} hook={hook} />,
    }),
  ),
];
