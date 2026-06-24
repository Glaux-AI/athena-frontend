"use client";

// TerminalDock - the embedded integrated terminal. One xterm.js Terminal per tab id, kept
// alive across tab switches so the WebGL context survives; the Electron main process owns the
// node-pty behind the `terminal:*` IPC channels. cwd = the bound task's worktree (or workspace
// root for the scratch tab). The human terminal is NEVER policy-checked - what the user types
// is ungated; the gate only ever fronts the AI's own tools.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, SquareTerminal, X } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

import { athena } from "@/lib/desktop/bridge";
import type { CreateTerminalReq, TerminalData, TerminalExit } from "@/lib/desktop/types";
import { useTerminalsStore, type TerminalTab } from "@/lib/desktop/terminals-store";

interface Session {
  term: Terminal;
  fit: FitAddon;
  webgl: WebglAddon | null;
  ptyId: string | null;
  exited: boolean;
}

const SCRATCH_TITLE = "scratch";

// A SYSTEM monospace stack, not the Next-loaded web font. xterm (especially the WebGL renderer)
// measures glyph cell width synchronously when the terminal is created; if it measures before an
// async @font-face web font has loaded, every cell is sized to the fallback's metrics and the
// glyphs render thin, dim, and widely gapped ("c l a u d e"). Consolas / Cascadia ship with
// Windows and are available immediately, so the metrics are correct on first paint.
const MONO_FONT =
  'Consolas, "Cascadia Mono", "Cascadia Code", "JetBrains Mono", "Courier New", ui-monospace, monospace';
const DEFAULT_FONT_SIZE = 14;

function readThemeFromTokens(): ITheme {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);

  const resolve = (cssVar: string, fallback: string): string => {
    probe.style.color = "";
    probe.style.color = `var(${cssVar})`;
    const c = getComputedStyle(probe).color;
    return c && c !== "rgba(0, 0, 0, 0)" ? c : fallback;
  };

  const theme: ITheme = {
    background: resolve("--surface", "#0b0d12"),
    foreground: resolve("--text", "#e6e8ee"),
    cursor: resolve("--primary", "#7aa2f7"),
    cursorAccent: resolve("--surface", "#0b0d12"),
    selectionBackground: resolve("--primary", "#7aa2f7"),
    black: "#15161e",
    red: resolve("--danger", "#f7768e"),
    green: resolve("--success", "#9ece6a"),
    yellow: resolve("--warning", "#e0af68"),
    blue: resolve("--primary", "#7aa2f7"),
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: resolve("--text-muted", "#a9b1d6"),
    brightBlack: "#414868",
    brightRed: resolve("--danger", "#f7768e"),
    brightGreen: resolve("--success", "#9ece6a"),
    brightYellow: resolve("--warning", "#e0af68"),
    brightBlue: resolve("--primary", "#7aa2f7"),
    brightMagenta: "#c0caf5",
    brightCyan: "#a4daff",
    brightWhite: resolve("--text", "#e6e8ee"),
  };

  probe.remove();
  return theme;
}

interface TerminalDockProps {
  visible: boolean;
  onClose: () => void;
  fontSize?: number;
}

export function TerminalDock({ visible, onClose, fontSize = DEFAULT_FONT_SIZE }: TerminalDockProps) {
  const tabs = useTerminalsStore((s) => s.tabs);
  const activeId = useTerminalsStore((s) => s.activeId);
  const addTab = useTerminalsStore((s) => s.addTab);
  const removeTab = useTerminalsStore((s) => s.removeTab);
  const setActive = useTerminalsStore((s) => s.setActive);

  const sessions = useRef<Map<string, Session>>(new Map());
  const ptyToTab = useRef<Map<string, string>>(new Map());
  const hostRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  // Client-only component: document always exists, so theme is a concrete ITheme.
  const theme = useMemo(() => readThemeFromTokens(), []);

  const sessionForPty = useCallback((ptyId: string): Session | undefined => {
    const tabId = ptyToTab.current.get(ptyId);
    return tabId ? sessions.current.get(tabId) : undefined;
  }, []);

  useEffect(() => {
    const offData = athena.terminal.onData((d: TerminalData) => {
      const s = sessionForPty(d.id);
      if (s) s.term.write(d.chunk);
    });
    const offExit = athena.terminal.onExit((e: TerminalExit) => {
      const s = sessionForPty(e.id);
      if (!s) return;
      s.exited = true;
      const code = e.exitCode ? ` (code ${e.exitCode})` : "";
      s.term.write(
        `\r\n\x1b[2m[process exited${code}] open a new tab to start another shell\x1b[0m\r\n`,
      );
      rerender();
    });
    return () => {
      offData();
      offExit();
    };
  }, [sessionForPty, rerender]);

  const ensureSession = useCallback(
    async (tab: TerminalTab) => {
      const tabId = tab.id;
      if (sessions.current.has(tabId)) return;

      const term = new Terminal({
        fontSize: fontSize > 0 ? fontSize : DEFAULT_FONT_SIZE,
        fontFamily: MONO_FONT,
        fontWeight: "400",
        fontWeightBold: "700",
        lineHeight: 1.15,
        letterSpacing: 0,
        cursorBlink: true,
        scrollback: 5000,
        allowProposedApi: true,
        theme,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);

      let webgl: WebglAddon | null = null;
      try {
        const addon = new WebglAddon();
        addon.onContextLoss(() => {
          addon.dispose();
          const s = sessions.current.get(tabId);
          if (s) s.webgl = null;
        });
        term.loadAddon(addon);
        webgl = addon;
      } catch {
        webgl = null;
      }

      const session: Session = { term, fit, webgl, ptyId: null, exited: false };
      sessions.current.set(tabId, session);

      const host = hostRefs.current.get(tabId);
      if (host && !term.element) {
        term.open(host);
        try {
          fit.fit();
        } catch {
          /* not laid out yet; the resize observer fits shortly */
        }
      }
      const cols = term.cols > 0 ? term.cols : 80;
      const rows = term.rows > 0 ? term.rows : 24;

      term.onData((data) => {
        if (session.ptyId) void athena.terminal.write(session.ptyId, data);
      });

      try {
        // exactOptionalPropertyTypes: only spread a key when it has a value (never `key: undefined`).
        const req: CreateTerminalReq = {
          cols,
          rows,
          boundTaskDisplayId: tab.boundTaskDisplayId ?? null,
          ...(tab.profile ? { profile: tab.profile } : {}),
          ...(tab.cwd ? { cwd: tab.cwd } : {}),
          ...(tab.stage ? { stage: tab.stage } : {}),
          ...(tab.model ? { model: tab.model } : {}),
        };
        const { id: ptyId } = await athena.terminal.create(req);
        session.ptyId = ptyId;
        ptyToTab.current.set(ptyId, tabId);
        void athena.terminal.resize(ptyId, cols, rows);
        rerender();
      } catch (err) {
        session.exited = true;
        const msg = err instanceof Error ? err.message : String(err);
        term.write(`\r\n\x1b[31mfailed to start terminal: ${msg}\x1b[0m\r\n`);
        rerender();
      }
    },
    [fontSize, theme, rerender],
  );

  useEffect(() => {
    for (const tab of tabs) void ensureSession(tab);
  }, [tabs, ensureSession]);

  const attachHost = useCallback((tabId: string, el: HTMLDivElement | null) => {
    hostRefs.current.set(tabId, el);
    const session = sessions.current.get(tabId);
    if (el && session && !session.term.element) {
      session.term.open(el);
      try {
        session.fit.fit();
      } catch {
        /* fits on next frame via the observer */
      }
    }
  }, []);

  useEffect(() => {
    if (!visible || !activeId) return;
    const session = sessions.current.get(activeId);
    const host = hostRefs.current.get(activeId);
    if (!session || !host) return;

    const doFit = (): void => {
      try {
        session.fit.fit();
      } catch {
        return;
      }
      if (session.ptyId && session.term.cols > 0 && session.term.rows > 0) {
        void athena.terminal.resize(session.ptyId, session.term.cols, session.term.rows);
      }
    };

    const raf = requestAnimationFrame(doFit);
    const ro = new ResizeObserver(doFit);
    ro.observe(host);
    session.term.focus();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [visible, activeId]);

  // Once web fonts settle, refit + force a full redraw so the WebGL glyph atlas is rebuilt with
  // correct metrics (belt-and-suspenders even though MONO_FONT is a system font).
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      for (const s of sessions.current.values()) {
        try {
          s.fit.fit();
          s.term.refresh(0, s.term.rows - 1);
        } catch {
          /* not laid out yet */
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      const next = readThemeFromTokens();
      for (const s of sessions.current.values()) s.term.options.theme = next;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const openScratch = useCallback(() => {
    addTab({ title: SCRATCH_TITLE, boundTaskDisplayId: null });
  }, [addTab]);

  const openNewTab = useCallback(() => {
    addTab({ title: "shell", boundTaskDisplayId: null });
  }, [addTab]);

  const closeTab = useCallback(
    (tabId: string) => {
      const session = sessions.current.get(tabId);
      if (session) {
        if (session.ptyId) {
          void athena.terminal.kill(session.ptyId).catch(() => undefined);
          ptyToTab.current.delete(session.ptyId);
        }
        try {
          session.webgl?.dispose();
        } catch {
          /* already disposed */
        }
        session.term.dispose();
        sessions.current.delete(tabId);
      }
      hostRefs.current.delete(tabId);
      removeTab(tabId);
    },
    [removeTab],
  );

  if (!visible) return <div className="terminal-dock-hidden" aria-hidden />;

  return (
    <div className="terminal-dock" role="region" aria-label="Integrated terminal">
      <div className="terminal-dock-tabs">
        <div className="terminal-dock-tablist" role="tablist">
          {tabs.map((tab) => {
            const session = sessions.current.get(tab.id);
            const live = session?.ptyId != null && session.exited === false;
            const isScratch = tab.boundTaskDisplayId == null && tab.title === SCRATCH_TITLE;
            // A claude-code session keeps its distinguishing "Claude · TASK" title (so it reads
            // differently from a plain bound shell, and two Claude tabs on one task don't collide);
            // other tabs prefer the bound task id.
            const label =
              tab.profile === "claude-code"
                ? tab.title
                : (tab.boundTaskDisplayId ?? (isScratch ? SCRATCH_TITLE : tab.title));
            const dotState = live ? "is-live" : session?.exited ? "is-exited" : "is-idle";
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={tab.id === activeId}
                className={`terminal-tab${tab.id === activeId ? " is-active" : ""}`}
                onClick={() => setActive(tab.id)}
              >
                {tab.boundTaskDisplayId ? (
                  <span className="terminal-tab-branch" aria-hidden>
                    ⎇
                  </span>
                ) : (
                  <SquareTerminal size={13} className="terminal-tab-icon" aria-hidden />
                )}
                <span className="terminal-tab-label">{label}</span>
                <span
                  className={`terminal-live-dot ${dotState}`}
                  title={live ? "live" : session?.exited ? "exited" : "starting"}
                  aria-hidden
                />
                <button
                  type="button"
                  className="terminal-tab-close"
                  aria-label={`Close ${label} terminal`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
            );
          })}
          <button type="button" className="terminal-tab-new" aria-label="New terminal tab" onClick={openNewTab}>
            <Plus size={14} aria-hidden />
          </button>
          <button type="button" className="terminal-tab-scratch" onClick={openScratch}>
            ⟩ scratch
          </button>
        </div>
        <div className="terminal-dock-meta">
          <span className="terminal-dock-runtime">node-pty</span>
          <button
            type="button"
            className="terminal-dock-close"
            aria-label="Hide terminal (Ctrl+`)"
            onClick={onClose}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </div>

      <div className="terminal-dock-panes">
        {tabs.length === 0 ? (
          <div className="terminal-dock-empty">
            <p>No terminals open.</p>
            <button type="button" className="terminal-empty-cta" onClick={openScratch}>
              Open a scratch terminal
            </button>
          </div>
        ) : null}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="terminal-pane"
            style={{ display: tab.id === activeId ? "block" : "none" }}
            ref={(el) => attachHost(tab.id, el)}
          />
        ))}
      </div>
    </div>
  );
}
