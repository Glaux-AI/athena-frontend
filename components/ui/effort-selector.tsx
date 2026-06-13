"use client";

/**
 * <EffortSelector> - the per-action effort dial, picked next to the model on
 * every "Run with Athena" action.
 *
 * Effort is flow content, not plumbing (so unlike the model picker it's always
 * shown): it's the user's call on how hard Athena works this run. Each level
 * states plainly what it does - the tool-call budget it grants and, at high+,
 * that Athena may delegate read-only sub-tasks - so the choice is legible, never
 * magic. Presentational: the parent owns `value` / `onChange`, matching the
 * <ModelSelector> convention. Radix Popover gives focus + Esc-to-close.
 */

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Gauge } from "lucide-react";

import { cn } from "@/lib/cn";
import type { EffortLevel } from "@/lib/api/client";

interface EffortMeta {
  label: string;
  /** Plain-language description of what this level does (anti-magic). */
  detail: string;
}

/** The closed set + its honest descriptions (mirrors the backend
 *  `task_effort.policy_for`: budgets 20/40/100/200/1000-call backstop - the
 *  per-stage cost cap is the real ceiling; sub-agents >= high). */
const EFFORT_META: Record<EffortLevel, EffortMeta> = {
  fast: { label: "Fast", detail: "Quick pass · up to 20 tool calls" },
  medium: { label: "Medium", detail: "Balanced · up to 40 tool calls" },
  high: {
    label: "High",
    detail: "Thorough · up to 100 tool calls · can delegate sub-tasks",
  },
  max: {
    label: "Max",
    detail: "Deep · up to 200 tool calls · can delegate sub-tasks",
  },
  unrestricted: {
    label: "Unrestricted",
    detail: "Until done (cost-capped) · can delegate sub-tasks",
  },
};

const EFFORT_ORDER: EffortLevel[] = ["fast", "medium", "high", "max", "unrestricted"];

export function EffortSelector({
  value,
  onChange,
  disabled,
  align = "start",
  className,
}: {
  value: EffortLevel;
  onChange: (effort: EffortLevel) => void;
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Effort: ${EFFORT_META[value].label}`}
          className={cn(
            "group inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text)]",
            "transition-colors duration-150 hover:bg-[var(--surface-2)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "data-[state=open]:bg-[var(--surface-2)]",
            className,
          )}
        >
          <Gauge className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
          <span className="truncate">{EFFORT_META[value].label}</span>
          <ChevronDown
            className="size-3.5 shrink-0 text-[var(--text-subtle)] transition-transform duration-150 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className={cn(
            "glass z-50 w-[19rem] rounded-xl p-1.5 shadow-[var(--shadow-3)]",
            "animate-pop-in",
          )}
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            How hard should Athena work this run?
          </p>
          <div className="flex flex-col">
            {EFFORT_ORDER.map((level) => (
              <EffortRow
                key={level}
                meta={EFFORT_META[level]}
                active={level === value}
                onPick={() => onChange(level)}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function EffortRow({
  meta,
  active,
  onPick,
}: {
  meta: EffortMeta;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active}
      className={cn(
        "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
        active
          ? "bg-[var(--primary-soft)]"
          : "hover:bg-[var(--surface-2)]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[var(--text)]">{meta.label}</span>
        <span className="block text-xs text-[var(--text-muted)]">{meta.detail}</span>
      </span>
      {active && (
        <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
      )}
    </button>
  );
}
