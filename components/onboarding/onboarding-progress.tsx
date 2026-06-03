/**
 * OnboardingProgress — the 3-phase rail shared by the first-run flow.
 *
 *   1. Workspace  (/orgs/new)
 *   2. Plan       (/onboarding/{slug}/plan)
 *   3. Set up     (/onboarding/{slug})
 *
 * Pure presentation — the parent passes `current` (1-based). Earlier steps
 * render "done" (check), the current step is highlighted, later steps are
 * muted. Decorative only, so the connecting rail is `aria-hidden` and the
 * list carries an `aria-label` describing where the user is.
 */

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

const STEPS = [
  { n: 1, label: "Workspace" },
  { n: 2, label: "Plan" },
  { n: 3, label: "Set up" },
] as const;

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
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  done
                    ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
                    : active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-4" aria-hidden /> : s.n}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wider",
                  active
                    ? "text-[var(--text)]"
                    : "text-[var(--text-subtle)]",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "mx-2 mb-5 h-px flex-1 transition-colors",
                  done ? "bg-[var(--primary)]" : "bg-[var(--border)]",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
