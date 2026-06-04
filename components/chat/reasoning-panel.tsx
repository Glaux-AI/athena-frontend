"use client";

/**
 * ReasoningPanel — a collapsible disclosure for the model's thinking.
 *
 * The chat stream carries the model's reasoning on its own `reasoning` event
 * (never mixed into the answer body). We show it in a compact, height-capped
 * panel that's open by default while the turn streams (so the user watches
 * Athena think) and collapsed on the settled message. Tokens-only; nothing
 * here implies a Sophia mood.
 */

import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

export function ReasoningPanel({
  reasoning,
  defaultOpen = false,
}: {
  reasoning: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!reasoning.trim()) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] shadow-[var(--inner-highlight)]",
          "transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          open && "border-b border-[var(--border)]",
        )}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
          <Brain className="size-3" aria-hidden />
        </span>
        <span>Reasoning</span>
        <ChevronDown
          className={cn("ml-auto size-3.5 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words bg-[var(--surface)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text-muted)]">
          {reasoning}
        </div>
      )}
    </div>
  );
}
