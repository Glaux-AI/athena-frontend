"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/cn";

type ThemeValue = "light" | "dark" | "system";

type Option = {
  value: ThemeValue;
  label: string;
  sub: string;
  Icon: typeof Sun;
  preview: "light" | "dark" | "split";
};

const OPTIONS: Option[] = [
  { value: "light", label: "Light", sub: "Bright surfaces", Icon: Sun, preview: "light" },
  { value: "dark", label: "Dark", sub: "Dim surfaces", Icon: Moon, preview: "dark" },
  { value: "system", label: "System", sub: "Follow your OS", Icon: Monitor, preview: "split" },
];

/**
 * Appearance preference (Light / Dark / System), bound to `next-themes`.
 *
 * Lives on the `/settings/personalisation` page. Reads/writes the same
 * `next-themes` state as the global <ThemeToggle/>, so the two stay in
 * lockstep automatically. Persistence is owned by next-themes (localStorage) —
 * this component holds no state of its own beyond the mount guard.
 */
export function AppearanceSetting({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selected: ThemeValue = (theme as ThemeValue | undefined) ?? "system";
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectAt(index: number) {
    const i = (index + OPTIONS.length) % OPTIONS.length;
    setTheme(OPTIONS[i].value);
    btnRefs.current[i]?.focus();
  }

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-sm font-medium text-[var(--text)]">Appearance</h2>
        <p id="appearance-help" className="text-sm text-[var(--text-muted)]">
          Choose your theme · applies on this browser
        </p>
      </div>

      {/* Mount guard: never read `theme` during SSR/first paint — render a same-size
          placeholder so there is no hydration mismatch or flash of the wrong selection. */}
      {!mounted ? (
        <div aria-hidden className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {OPTIONS.map((o) => (
            <div
              key={o.value}
              className="h-[124px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]"
            />
          ))}
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="Theme"
          aria-describedby="appearance-help"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {OPTIONS.map((o, i) => {
            const isSel = selected === o.value;
            return (
              <button
                key={o.value}
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSel}
                tabIndex={isSel ? 0 : -1}
                onClick={() => setTheme(o.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    selectAt(i + 1);
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    selectAt(i - 1);
                  } else if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setTheme(o.value);
                  }
                }}
                className={cn(
                  "relative rounded-[var(--radius-lg)] border bg-[var(--surface-2)] p-3.5 text-left",
                  "transition-[border-color,box-shadow] motion-reduce:transition-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
                  isSel
                    ? "border-[var(--primary)] shadow-[0_0_0_3px_var(--primary-soft)]"
                    : "border-[var(--border)] hover:border-[var(--text-muted)]",
                )}
              >
                {isSel ? (
                  <span className="absolute right-2.5 top-2.5 flex size-[18px] items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)]">
                    <Check className="size-3" aria-hidden />
                  </span>
                ) : null}

                <ThemePreview kind={o.preview} />

                <span className="mt-3 flex items-center gap-2">
                  <o.Icon
                    className={cn("size-[17px]", isSel ? "text-[var(--primary)]" : "text-[var(--text)]")}
                    aria-hidden
                  />
                  <span>
                    <span className="block text-sm font-medium leading-tight text-[var(--text)]">
                      {o.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{o.sub}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Decorative theme swatch shown inside each card.
 *
 * These intentionally use fixed light/dark base colors rather than theme
 * tokens: a swatch must always depict *its own* theme (a "Light" swatch stays
 * light even while the app is in dark mode), which theme-reactive tokens can't
 * do. The blocks contain no text, so they're outside the token-contrast
 * (text-on-surface) guard. The accent bar uses the real --primary token.
 */
function ThemePreview({ kind }: { kind: "light" | "dark" | "split" }) {
  if (kind === "split") {
    return (
      <span
        aria-hidden
        className="flex h-[58px] overflow-hidden rounded-md border border-[var(--border)]"
      >
        <span className="w-1/2" style={{ background: "#ffffff" }} />
        <span className="w-1/2" style={{ background: "#0d1117" }} />
      </span>
    );
  }

  const dark = kind === "dark";
  return (
    <span
      aria-hidden
      className="flex h-[58px] overflow-hidden rounded-md border border-[var(--border)]"
      style={{ background: dark ? "#0d1117" : "#ffffff" }}
    >
      <span className="h-full w-1/4" style={{ background: dark ? "#161b22" : "#f0ece1" }} />
      <span className="flex flex-1 flex-col justify-center gap-1 px-2">
        <span className="h-1 w-3/4 rounded-full bg-[var(--primary)]" />
        <span
          className="h-1 w-full rounded-full"
          style={{ background: dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)" }}
        />
        <span
          className="h-1 w-1/2 rounded-full"
          style={{ background: dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)" }}
        />
      </span>
    </span>
  );
}
