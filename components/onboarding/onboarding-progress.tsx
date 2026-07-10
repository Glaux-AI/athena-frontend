/**
 * OnboardingProgress - the 3-phase rail shared by the first-run flow.
 *
 *   1. Workspace  (/orgs/new)
 *   2. Plan       (/onboarding/{slug}/plan)
 *   3. Set up     (/onboarding/{slug})
 *
 * Pure presentation - the parent passes `current` (1-based). Rendered as a
 * constellation route: done phases are lit star-dots, the current phase
 * twinkles, later phases are hollow, and dotted constellation links join
 * them. Decorative only, so the connectors are `aria-hidden` and the list
 * carries an `aria-label` describing where the user is.
 */

import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";

const STEPS = [
  { n: 1, label: "Workspace" },
  { n: 2, label: "Plan" },
  { n: 3, label: "Set up" },
] as const;

const LIT_DOT = { "--dot-color": "var(--primary)" } as CSSProperties;

export function OnboardingProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol
      className="mx-auto flex w-full max-w-md items-center"
      aria-label={`Onboarding · step ${current} of 3`}
    >
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <li
            key={s.n}
            className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}
          >
            <div className="flex flex-col items-center gap-1.5">
              <span
                className="flex h-3 items-center justify-center"
                aria-current={active ? "step" : undefined}
              >
                {done || active ? (
                  <span
                    className={cn("star-dot", active && "is-live")}
                    style={LIT_DOT}
                    aria-hidden
                  />
                ) : (
                  <span
                    className="inline-block size-1.5 rounded-full border border-[var(--border-strong)]"
                    aria-hidden
                  />
                )}
              </span>
              <span
                className={cn(
                  "text-micro font-medium uppercase tracking-wider",
                  active ? "text-[var(--text)]" : "text-[var(--text-subtle)]",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="constellation-link mx-2 mb-5 flex-1" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
