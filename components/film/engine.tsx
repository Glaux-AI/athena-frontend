"use client";

/**
 * Film engine - deterministic timeline for the Athena demo film.
 *
 * Dev-only. Mounted by app/film/page.tsx (never linked from the product).
 * Contract with the offline renderer (athena-demo/_render_film.cjs):
 *
 *   window.FILM.TOTAL          - film length in seconds
 *   window.FILM.RENDER(t)      - seek the film to absolute time t and
 *                                resolve when the frame is settled
 *   window.FILM.SCENES         - [{ id, start, dur }] for scene-chunked work
 *
 * Determinism rules:
 *   - Every visual is a pure function of t (scene-local seconds).
 *   - Scenes may hold DOM side effects (iframes) but must express them as
 *     idempotent "apply(t)" channels so RENDER(t) is repeatable.
 *   - No Date.now()/Math.random() at render time; seeded helpers only.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ types */

export interface SceneDef {
  id: string;
  /** Authored duration in seconds (the scene's internal timeline). */
  dur: number;
  /** Playback rate: 1.25 plays the authored timeline 25% faster. The scene
   * still receives authored-scale local time, so captions, steps and cursor
   * paths stay in sync - everything just runs brisker on the film clock. */
  rate?: number;
  /** The scene surface. Receives scene-local (authored-scale) time. */
  Comp: (props: { t: number; dur: number }) => ReactNode;
  /** Optional async warmup (iframe load, image decode). Called once when the
   * scene becomes active; RENDER() awaits it before capturing. */
  warm?: () => Promise<void>;
}

interface FilmApi {
  TOTAL: number;
  SCENES: { id: string; start: number; dur: number }[];
  RENDER: (t: number) => Promise<void>;
  PLAY: () => void;
  PAUSE: () => void;
  SEEK: (t: number) => void;
}

declare global {
  interface Window {
    FILM?: FilmApi;
  }
}

/* ------------------------------------------------------------- time utils */

/** 0..1 progress of t across [a, b], clamped. */
export function seg(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/** Standard ease (cubic in-out). */
export function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** Ease-out cubic - for settles. */
export function easeOut(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/** Eased 0..1 across [a, b]. */
export function ev(t: number, a: number, b: number): number {
  return ease(seg(t, a, b));
}

/** Eased-out 0..1 across [a, b]. */
export function evo(t: number, a: number, b: number): number {
  return easeOut(seg(t, a, b));
}

/** Linear interpolate. */
export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** Deterministic pseudo-random in [0, 1) from an integer seed. */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Typewriter substring of `text` between film times [a, b]. */
export function typed(text: string, t: number, a: number, b: number): string {
  const p = seg(t, a, b);
  return text.slice(0, Math.round(p * text.length));
}

/* ------------------------------------------------------- camera keyframes */

export interface CamPose {
  x?: number; // px translate of the stage content
  y?: number;
  scale?: number;
  rx?: number; // deg rotateX (parallax tilt)
  ry?: number; // deg rotateY
}

/** Interpolate camera poses over keyframes [time, pose]. */
export function cam(t: number, frames: [number, CamPose][]): CamPose {
  const first = frames[0];
  if (!first) return {};
  if (t <= first[0]) return first[1];
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (!a || !b) continue;
    const [t0, p0] = a;
    const [t1, p1] = b;
    if (t >= t0 && t <= t1) {
      const p = ease(seg(t, t0, t1));
      return {
        x: lerp(p0.x ?? 0, p1.x ?? 0, p),
        y: lerp(p0.y ?? 0, p1.y ?? 0, p),
        scale: lerp(p0.scale ?? 1, p1.scale ?? 1, p),
        rx: lerp(p0.rx ?? 0, p1.rx ?? 0, p),
        ry: lerp(p0.ry ?? 0, p1.ry ?? 0, p),
      };
    }
  }
  const last = frames[frames.length - 1];
  return last ? last[1] : first[1];
}

export function camStyle(pose: CamPose): React.CSSProperties {
  const { x = 0, y = 0, scale = 1, rx = 0, ry = 0 } = pose;
  return {
    transform: `perspective(2400px) translate3d(${x}px, ${y}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`,
    transformOrigin: "50% 50%",
  };
}

/* ------------------------------------------------------------ film context */

const FilmCtx = createContext<{ t: number } | null>(null);

export function useFilmTime(): number {
  const ctx = useContext(FilmCtx);
  return ctx?.t ?? 0;
}

/* --------------------------------------------------------------FilmRoot */

export function FilmRoot({ scenes }: { scenes: SceneDef[] }) {
  const timeline = useMemo(() => {
    let acc = 0;
    return scenes.map((s) => {
      // Film-clock duration shrinks with rate; the scene's internal
      // timeline (captions/steps) still runs on authored-scale time.
      const filmDur = s.dur / (s.rate ?? 1);
      const entry = { id: s.id, start: acc, dur: filmDur };
      acc += filmDur;
      return entry;
    });
  }, [scenes]);
  const TOTAL = useMemo(() => timeline.reduce((a, s) => a + s.dur, 0), [timeline]);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const warmedRef = useRef(new Set<string>());

  const active = useMemo(() => {
    const idx = Math.max(
      0,
      timeline.findIndex((s) => t < s.start + s.dur),
    );
    // idx is clamped into [0, len-1] above and timeline is scenes.map(),
    // so both are in-bounds for the non-empty scene list the film always has.
    const sc = timeline[idx === -1 ? timeline.length - 1 : idx]!;
    const def = scenes[idx === -1 ? scenes.length - 1 : idx]!;
    const rate = def.rate ?? 1;
    return {
      def,
      local: Math.min((t - sc.start) * rate, def.dur),
      start: sc.start,
    };
  }, [t, timeline, scenes]);

  const doSeek = useCallback((next: number) => {
    const clamped = Math.min(Math.max(0, next), TOTAL);
    tRef.current = clamped;
    setT(clamped);
  }, [TOTAL]);

  /* Playback loop for authoring (renderer drives via RENDER instead). */
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      if (!playingRef.current) return;
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      const next = tRef.current + dt;
      if (next >= TOTAL) {
        tRef.current = TOTAL;
        setT(TOTAL);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setT(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, TOTAL]);

  /* Renderer + authoring API. */
  useEffect(() => {
    const api: FilmApi = {
      TOTAL,
      SCENES: timeline,
      RENDER: async (next: number) => {
        setPlaying(false);
        doSeek(next);
        // Let React commit. rAF is throttled/paused in hidden tabs, so race
        // it against a short timeout - the renderer's visible page gets the
        // tight double-rAF path, a background authoring tab falls through.
        const settle = () =>
          Promise.race([
            new Promise<void>((r) =>
              requestAnimationFrame(() => requestAnimationFrame(() => r())),
            ),
            new Promise<void>((r) => setTimeout(r, 90)),
          ]);
        await settle();
        const idx = timeline.findIndex((s) => next < s.start + s.dur);
        const def = scenes[idx === -1 ? scenes.length - 1 : idx];
        if (def?.warm && !warmedRef.current.has(def.id)) {
          warmedRef.current.add(def.id);
          await def.warm();
          await settle();
        }
        // Iframe scenes report in-flight loads via window.__filmPending.
        const deadline = Date.now() + 15000;
        while ((window.__filmPending ?? 0) > 0 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (document.fonts?.status !== "loaded") {
          await document.fonts.ready;
        }
        // Offline render: CSS animations (Sophia's breathing, pulses) are
        // paused via [data-film-render] CSS; seek them to FILM time here so
        // loops advance one frame per frame instead of on the wall clock.
        if (document.documentElement.hasAttribute("data-film-render")) {
          const seekAnims = (doc: Document) => {
            for (const a of doc.getAnimations()) {
              try {
                a.currentTime = next * 1000;
              } catch {
                /* non-seekable animation */
              }
            }
          };
          seekAnims(document);
          document.querySelectorAll("iframe").forEach((el) => {
            const idoc = (el as HTMLIFrameElement).contentDocument;
            if (idoc) seekAnims(idoc);
          });
        }
      },
      PLAY: () => setPlaying(true),
      PAUSE: () => setPlaying(false),
      SEEK: doSeek,
    };
    window.FILM = api;
    return () => {
      if (window.FILM === api) delete window.FILM;
    };
  }, [TOTAL, timeline, scenes, doSeek]);

  /* Authoring keys: space = play/pause, arrows = nudge. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        doSeek(tRef.current + (e.shiftKey ? 5 : 1 / 3));
      } else if (e.key === "ArrowLeft") {
        doSeek(tRef.current - (e.shiftKey ? 5 : 1 / 3));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSeek]);

  /* Fit the fixed 1920x1080 stage into the window for authoring. */
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const onResize = () =>
      setFit(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* HUD visibility resolved client-side only (avoids hydration mismatch). */
  const [hud, setHud] = useState(false);
  useEffect(() => {
    setHud(new URLSearchParams(window.location.search).get("hud") !== "0");
  }, []);

  const { def, local } = active;

  return (
    <FilmCtx.Provider value={{ t }}>
      <div className="film-viewport">
        <div className="film-stage" style={{ transform: `scale(${fit})` }}>
          <def.Comp t={local} dur={def.dur} />
        </div>
        {hud && (
          <div className="film-hud">
            <button onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={TOTAL}
              step={1 / 30}
              value={t}
              onChange={(e) => doSeek(parseFloat(e.target.value))}
            />
            <span className="film-hud-time">
              {t.toFixed(2)}s / {TOTAL.toFixed(0)}s
            </span>
            <select
              value={active.def.id}
              onChange={(e) => {
                const sc = timeline.find((s) => s.id === e.target.value);
                if (sc) doSeek(sc.start + 0.01);
              }}
            >
              {timeline.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} ({s.start.toFixed(1)}s)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </FilmCtx.Provider>
  );
}
