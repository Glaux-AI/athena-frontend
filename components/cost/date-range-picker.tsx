"use client";

/**
 * Global date-range picker for /cost - the page's single time control.
 *
 * A `secondary`-styled trigger shows the active window; the popover offers the
 * standard presets (this month / last month / 7·30·90 days / 12 months) plus a
 * custom range built from two native date inputs. Selecting anything emits a
 * `CostRange` and closes - the page re-fetches the summary + per-model trend
 * against the new window.
 *
 * Radix Popover gives focus management + Esc-to-close for free; motion is the
 * standard 150ms popover fade/zoom and collapses under `prefers-reduced-motion`
 * via the global token rule.
 */

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  type CostRange,
  PRESETS,
  customRange,
  formatRangeSpan,
  resolvePreset,
} from "./date-range";

export function DateRangePicker({
  value,
  onChange,
}: {
  value: CostRange;
  onChange: (next: CostRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(value.preset === "custom");
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);

  // Re-seed the custom inputs whenever the popover opens, so they reflect the
  // window currently in effect rather than a stale prior edit.
  useEffect(() => {
    if (open) {
      setFrom(value.from);
      setTo(value.to);
      setCustomMode(value.preset === "custom");
    }
  }, [open, value]);

  const pick = (next: CostRange) => {
    onChange(next);
    setOpen(false);
  };

  const customValid = Boolean(from && to && from <= to);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Date range: ${value.label}`}
          className={cn(
            "group inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)]",
            "transition-colors duration-150 hover:bg-[var(--surface-2)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
            "data-[state=open]:bg-[var(--surface-2)]",
          )}
        >
          <CalendarDays className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="whitespace-nowrap">{value.label}</span>
          <ChevronDown className="size-3.5 text-[var(--text-subtle)] transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className={cn(
            "glass z-50 w-[18rem] rounded-xl p-1.5 shadow-[var(--shadow-3)]",
            "animate-pop-in",
          )}
        >
          <div className="flex flex-col">
            {PRESETS.map((p) => {
              const active = value.preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => pick(resolvePreset(p.key))}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    active
                      ? "bg-[var(--primary-soft)] font-medium text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                  )}
                >
                  <span>{p.label}</span>
                  {active && <Check className="size-3.5 text-[var(--primary)]" aria-hidden />}
                </button>
              );
            })}

            <div className="my-1 h-px bg-[var(--border)]" />

            <button
              type="button"
              onClick={() => setCustomMode((v) => !v)}
              aria-expanded={customMode}
              className={cn(
                "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                value.preset === "custom"
                  ? "bg-[var(--primary-soft)] font-medium text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              )}
            >
              <span>Custom range</span>
              {value.preset === "custom" ? (
                <Check className="size-3.5 text-[var(--primary)]" aria-hidden />
              ) : (
                <ChevronDown className={cn("size-3.5 text-[var(--text-subtle)] transition-transform", customMode && "rotate-180")} aria-hidden />
              )}
            </button>

            {customMode && (
              <div className="mt-1 flex flex-col gap-2 rounded-md bg-[var(--surface-2)] p-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">From</span>
                  <input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">To</span>
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </label>
                {from && to && !customValid && (
                  <p className="text-[11px] text-[var(--danger)]">From must be on or before To.</p>
                )}
                <button
                  type="button"
                  disabled={!customValid}
                  onClick={() => pick(customRange(from, to))}
                  className={cn(
                    "mt-0.5 inline-flex h-8 items-center justify-center rounded-md bg-[var(--primary)] px-3 text-sm font-medium text-[var(--primary-fg)]",
                    "transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  Apply {customValid ? `· ${formatRangeSpan({ from, to })}` : "range"}
                </button>
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
