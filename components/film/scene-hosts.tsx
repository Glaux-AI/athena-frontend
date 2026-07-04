"use client";

/**
 * Scene hosts for the demo film.
 *
 * FilmBoot   - seeds the mock session + film fixture before any scene mounts.
 * ShellScene - the real <AppShell> (TopBar + SidebarNav + FAB) around real
 *              components composed with fixture props, in the film realm.
 * IframeScene- a same-origin iframe of a real product route (mock-backed),
 *              driven deterministically: timed idempotent steps + a
 *              continuous drive(doc, t) channel. Seeking backward reloads.
 *
 * Determinism: inside embedded docs we disable CSS transitions and pause
 * CSS animations; anything that must move is driven from scene code as a
 * function of t.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SessionProvider, writeMockSession, useSession } from "@/lib/session/SessionProvider";

declare global {
  interface Window {
    __filmPending?: number;
  }
}

function pend(delta: number) {
  window.__filmPending = Math.max(0, (window.__filmPending ?? 0) + delta);
}

/* ------------------------------------------------------------- FilmBoot */

const FILM_FLAG = "athena.film";
const SESSION_KEY = "athena.mockSession";

/** Seed localStorage + fixture, then render children. */
export function FilmBoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      localStorage.setItem(FILM_FLAG, "1");
      if (!localStorage.getItem(SESSION_KEY)) {
        writeMockSession({
          access_token: "mock_at_film",
          refresh_token: "mock_rt_film",
          user_id: "u_maya",
          email: "maya@meridian.dev",
          display_name: "Maya Rao",
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        });
        window.dispatchEvent(new Event("athena:mock-session-changed"));
      }
      try {
        const fixture = await import("./fixture");
        fixture.applyFilmFixture();
      } catch {
        // Fixture not written yet - scenes that need it will look thin,
        // but the film shell still boots.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

/* ----------------------------------------------------------- ShellScene */

/** Applies a per-scene acting user (top-bar avatar) via the mock profile. */
function ActAs({ name, email }: { name: string; email: string }) {
  const { me, refreshMe } = useSession();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (me?.displayName === name) return;
      try {
        const fixture = await import("./fixture");
        fixture.setFilmUser(name, email);
        if (!cancelled) await refreshMe();
      } catch {
        /* fixture missing - skip */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email]);
  return null;
}

/**
 * The floating product window with the REAL app shell inside, composed
 * around scene content. Lives in the film realm so scenes can pass fixture
 * props straight into real components.
 */
export function ShellScene({
  children,
  user,
  pose,
  frameStyle,
}: {
  children: ReactNode;
  /** Acting user shown in the TopBar. Defaults to Maya (admin). */
  user?: { name: string; email: string };
  pose?: CSSProperties;
  frameStyle?: CSSProperties;
}) {
  return (
    <>
      <div className="film-frame-floor" style={pose} />
      <div className="film-frame film-shell" style={{ ...pose, ...frameStyle }}>
        <SessionProvider>
          {user && <ActAs name={user.name} email={user.email} />}
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </div>
    </>
  );
}

/* ---------------------------------------------------------- IframeScene */

export interface IframeStep {
  /** Scene-local time at which this step applies. */
  at: number;
  /** Idempotent DOM mutation inside the embedded document. */
  apply: (doc: Document, win: Window) => void;
}

const FREEZE_CSS = `
  *, *::before, *::after {
    transition: none !important;
    animation-play-state: paused !important;
    caret-color: transparent !important;
  }
  html { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }
  nextjs-portal, #nextjs-dev-tools-button, [data-nextjs-toast],
  [data-nextjs-dev-tools-button] { display: none !important; }
`;

/**
 * Same-origin iframe of a real product route. The page fetches from the
 * film-patched mock backend, so what renders is the real app on film data.
 */
export function IframeScene({
  src,
  t,
  steps = [],
  drive,
  width = 1600,
  height = 940,
  pose,
  frameStyle,
  chromeless = false,
}: {
  src: string;
  t: number;
  steps?: IframeStep[];
  /** Continuous channel - runs every frame after steps. */
  drive?: (doc: Document, win: Window, t: number) => void;
  width?: number;
  height?: number;
  pose?: CSSProperties;
  frameStyle?: CSSProperties;
  /** Render without the floating film-frame chrome (caller wraps it). */
  chromeless?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const stepIdxRef = useRef(0);
  const lastTRef = useRef(-1);
  const pendedRef = useRef(false);

  /* Track load as renderer-blocking work. */
  useEffect(() => {
    if (!pendedRef.current) {
      pendedRef.current = true;
      pend(1);
    }
    return () => {
      if (pendedRef.current && !loaded) pend(-1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = () => {
    const win = ref.current?.contentWindow;
    const doc = ref.current?.contentDocument;
    if (!win || !doc) return;
    const style = doc.createElement("style");
    style.textContent = FREEZE_CSS;
    doc.head.appendChild(style);
    doc.documentElement.setAttribute("data-film", "1");
    stepIdxRef.current = 0;
    lastTRef.current = -1;
    // Give the embedded app a moment to settle its first fetches; the
    // engine additionally waits for __filmPending to drain.
    setTimeout(() => {
      setLoaded(true);
      if (pendedRef.current) {
        pendedRef.current = false;
        pend(-1);
      }
    }, 350);
  };

  /* Apply timed steps + continuous drive as pure-ish functions of t. */
  useEffect(() => {
    const doc = ref.current?.contentDocument;
    const win = ref.current?.contentWindow;
    if (!loaded || !doc || !win) return;

    if (t < lastTRef.current - 0.05) {
      // Backward seek: reload and replay (authoring convenience).
      setLoaded(false);
      stepIdxRef.current = 0;
      if (!pendedRef.current) {
        pendedRef.current = true;
        pend(1);
      }
      win.location.reload();
      lastTRef.current = t;
      return;
    }
    lastTRef.current = t;

    while (stepIdxRef.current < steps.length) {
      const step = steps[stepIdxRef.current];
      if (!step || step.at > t) break;
      try {
        step.apply(doc, win);
      } catch {
        /* step target not present this frame - steps are best-effort */
      }
      stepIdxRef.current += 1;
    }
    try {
      drive?.(doc, win, t);
    } catch {
      /* ignore drive errors mid-load */
    }
  }, [t, loaded, steps, drive]);

  const frame = (
    <iframe
      ref={ref}
      src={src}
      onLoad={onLoad}
      style={{
        width,
        height,
        border: "none",
        display: "block",
        background: "var(--surface, #fff)",
        opacity: loaded ? 1 : 0,
      }}
    />
  );

  if (chromeless) return frame;

  return (
    <>
      <div className="film-frame-floor" style={pose} />
      <div
        className="film-frame"
        style={{ width, height, ...pose, ...frameStyle }}
      >
        {frame}
      </div>
    </>
  );
}
