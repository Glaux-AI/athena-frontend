"use client";

/**
 * PhaseTabList — tab strip for the Implement-track phase tabs on
 * `/runs/[id]`. Per readiness row 996 + §3.6 r5 + §4.x r2.
 *
 * Implement-track tabs: Spec, Plan, Implement, Review, CI, PR.
 * The active tab is round-tripped through the URL search params
 * (`?phase=spec`) so deep links + reloads land on the same artifact.
 *
 * The PRD-track variant exposes the canonical four-stage PRD tabs
 * (Frame, Research, Draft, Sign-off) — same component, different tab
 * set. Mirrors the project's existing tab-strip pattern in
 * `runs/[id]/page.tsx` (`PlanPhase` uses a similar inline tab list)
 * without pulling in `@radix-ui/react-tabs` for the sole purpose of
 * re-rendering keyboard semantics we already enforce locally.
 *
 * Keyboard nav:
 *   - ArrowLeft / ArrowRight cycle through tabs (wrap-around).
 *   - Home / End jump to first / last.
 *   - Enter / Space activate the focused tab (native button).
 */

import { useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import {
  Eye,
  FileText,
  GitPullRequest,
  Hammer,
  ListTree,
  ShieldCheck,
  Search,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

export type PhaseTrack = "prd" | "implement";

interface TabDef {
  /** URL-safe phase key the active tab writes into `?phase=…`. */
  key: string;
  label: string;
  icon: LucideIcon;
}

const IMPLEMENT_TABS: TabDef[] = [
  { key: "spec", label: "Spec", icon: FileText },
  { key: "plan", label: "Plan", icon: ListTree },
  { key: "implement", label: "Implement", icon: Hammer },
  { key: "review", label: "Review", icon: Eye },
  { key: "ci", label: "CI", icon: ShieldCheck },
  { key: "pr", label: "PR", icon: GitPullRequest },
];

const PRD_TABS: TabDef[] = [
  { key: "frame", label: "Frame", icon: Target },
  { key: "research", label: "Research", icon: Search },
  { key: "draft", label: "Draft", icon: FileText },
  { key: "signoff", label: "Sign-off", icon: Users },
];

export interface PhaseTabListProps {
  runId: string;
  currentTrack: PhaseTrack;
  /** Active phase key. The parent owns the URL search-param round-trip;
   *  this component just renders + invokes `onChange`. */
  activePhase: string;
  onChange: (phase: string) => void;
}

export function PhaseTabList({
  runId,
  currentTrack,
  activePhase,
  onChange,
}: PhaseTabListProps) {
  const tabs = useMemo(
    () => (currentTrack === "implement" ? IMPLEMENT_TABS : PRD_TABS),
    [currentTrack],
  );
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const focusTab = useCallback((key: string) => {
    const el = tabRefs.current.get(key);
    el?.focus();
  }, []);

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const idx = tabs.findIndex((t) => t.key === activePhase);
      const last = tabs.length - 1;
      let nextIdx: number | null = null;
      if (e.key === "ArrowRight") nextIdx = idx >= last ? 0 : idx + 1;
      else if (e.key === "ArrowLeft") nextIdx = idx <= 0 ? last : idx - 1;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = last;
      if (nextIdx === null) return;
      e.preventDefault();
      const nextKey = tabs[nextIdx]!.key;
      onChange(nextKey);
      focusTab(nextKey);
    },
    [tabs, activePhase, onChange, focusTab],
  );

  return (
    <div
      className="border-b border-[var(--border)]"
      role="tablist"
      aria-label={`${currentTrack === "implement" ? "Implement" : "PRD"} phase tabs`}
      data-testid="phase-tab-list"
      data-track={currentTrack}
      data-run-id={runId}
    >
      <div className="flex flex-wrap gap-0">
        {tabs.map((tab) => {
          const isActive = tab.key === activePhase;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.key, el);
                else tabRefs.current.delete(tab.key);
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`phase-panel-${tab.key}`}
              id={`phase-tab-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              data-phase={tab.key}
              onClick={() => onChange(tab.key)}
              onKeyDown={onKey}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium",
                "transition-colors duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                isActive
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
