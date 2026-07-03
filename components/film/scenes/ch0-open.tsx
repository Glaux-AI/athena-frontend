"use client";

/**
 * Cold open + title.
 * S1: three statement lines while a field of scattered "knowledge" glyphs
 *     drifts, then feels gravity and converges.
 * S2: the constellation blooms into Sophia (the real OwlGlyph) + wordmark.
 */

import { OwlGlyph } from "@/components/mascot/owl-glyph";
import { ev, evo, lerp, rand, seg, type SceneDef } from "../engine";
import { Statement } from "../language";

/* Deterministic glyph field: 64 scattered knowledge shards. */
const SHARDS = Array.from({ length: 64 }, (_, i) => ({
  x: rand(i * 3 + 1) * 1920,
  y: rand(i * 3 + 2) * 1080,
  w: 26 + rand(i * 3 + 3) * 54,
  h: 18 + rand(i * 7 + 4) * 30,
  rot: (rand(i * 5 + 5) - 0.5) * 30,
  drift: (rand(i * 11 + 6) - 0.5) * 60,
  kind: i % 4, // repo / doc / chat / ticket
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
  // Drift phase, then pull toward centre (960, 540) as `converge` -> 1.
  const dx = Math.sin(t * 0.25 + s.rot) * s.drift;
  const x = lerp(s.x + dx, 960, converge);
  const y = lerp(s.y + Math.cos(t * 0.2 + s.x) * 10, 540, converge);
  const scale = lerp(1, 0.08, converge);
  const opacity = (0.25 + rand(s.x) * 0.35) * (1 - converge * 0.35);
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

const S1: SceneDef = {
  id: "s1-cold-open",
  dur: 10,
  Comp: ({ t }) => {
    const converge = ev(t, 7.2, 10);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {SHARDS.map((s, i) => (
          <Shard key={i} s={s} t={t} converge={converge} />
        ))}
        <Statement t={t} a={0.4} b={3.4}>
          Your company&apos;s knowledge lives in a hundred tools.
        </Statement>
        <Statement t={t} a={3.8} b={6.4}>
          And in people&apos;s heads.
        </Statement>
        <Statement t={t} a={6.8} b={9.6}>
          What if it lived in one place, and could act?
        </Statement>
      </div>
    );
  },
};

const S2: SceneDef = {
  id: "s2-title",
  dur: 6,
  Comp: ({ t }) => {
    const bloom = evo(t, 0.1, 1.1);
    const wordP = evo(t, 0.9, 1.7);
    const subP = evo(t, 1.5, 2.3);
    const pulse = seg(t, 1.2, 2.6);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", gap: 26 }}>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            {pulse > 0 && pulse < 1 && (
              <div
                style={{
                  position: "absolute",
                  inset: -40,
                  borderRadius: "50%",
                  border: "3px solid oklch(50% 0.18 260)",
                  transform: `scale(${lerp(0.5, 1.6, 1 - Math.pow(1 - pulse, 3))})`,
                  opacity: 1 - pulse,
                }}
              />
            )}
            <div
              style={{
                width: 240,
                height: 240,
                transform: `scale(${bloom})`,
                opacity: bloom,
                transformOrigin: "50% 100%",
              }}
            >
              <OwlGlyph mood={t > 2.2 ? "happy" : "idle"} />
            </div>
          </div>
          <span className="film-lineclip">
            <span
              style={{
                display: "block",
                fontSize: 110,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                transform: `translateY(${(1 - wordP) * 110}%)`,
              }}
            >
              Athena
            </span>
          </span>
          <span
            style={{
              fontSize: 34,
              fontWeight: 500,
              color: "oklch(20% 0.02 250 / 0.62)",
              opacity: subP,
              transform: `translateY(${(1 - subP) * 18}px)`,
            }}
          >
            One brain for your whole company.
          </span>
        </div>
      </div>
    );
  },
};

export const CH0: SceneDef[] = [S1, S2];
