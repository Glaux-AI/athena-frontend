"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Local theme system (replaces `next-themes`).
 *
 * Why not next-themes: its inline pre-hydration script carries the CSP nonce,
 * but browsers hide `nonce` attributes from DOM reads, so React 19 hydration
 * sees server `nonce="..."` vs client `""` and throws the minified #418.
 * next-themes doesn't set `suppressHydrationWarning` on that script, so the
 * error is unavoidable while keeping a strict `script-src 'nonce-…'` CSP.
 * This module renders its own boot script WITH `suppressHydrationWarning`.
 *
 * Behavior kept identical: class strategy (`.dark` on <html>), default
 * "system" with live matchMedia tracking, localStorage key "theme"
 * (backward-compatible with values next-themes already stored), color-scheme
 * style hint, transition suppression during switches, cross-tab sync.
 */

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** Runs before paint; must stay in sync with applyTheme() below. */
const BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark")t="system";var d=t==="dark"||(t==="system"&&matchMedia("${MEDIA_QUERY}").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const t = window.localStorage.getItem(STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MEDIA_QUERY).matches;
}

function applyTheme(theme: Theme, systemDark: boolean) {
  const dark = theme === "dark" || (theme === "system" && systemDark);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
}

/** Kill all transitions for one frame so a theme flip doesn't animate. */
function withoutTransitions(mutate: () => void) {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important;animation-duration:0.01ms!important}",
    ),
  );
  document.head.appendChild(style);
  mutate();
  // Force a reflow so the mutation paints under the suppression style.
  document.body.getBoundingClientRect();
  window.setTimeout(() => style.remove(), 1);
}

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  nonce,
}: {
  children: ReactNode;
  /** CSP nonce from middleware.ts for the inline pre-hydration script. */
  nonce?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Track OS preference live (matters while theme === "system").
  useEffect(() => {
    const mql = window.matchMedia(MEDIA_QUERY);
    const onChange = () => setSystemDark(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Re-apply whenever preference or OS state changes (post-boot-script).
  useEffect(() => {
    applyTheme(theme, systemDark);
  }, [theme, systemDark]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const t = e.newValue === "light" || e.newValue === "dark" ? e.newValue : "system";
      withoutTransitions(() => setThemeState(t));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    withoutTransitions(() => {
      setThemeState(next);
      applyTheme(next, systemPrefersDark());
    });
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode) - in-memory theme still applies */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme:
        theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light",
      setTheme,
    }),
    [theme, systemDark, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}
