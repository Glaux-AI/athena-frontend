"use client";

/**
 * ReasoningPanel - a quiet disclosure for the model's thinking.
 *
 * The chat stream carries the model's reasoning on its own `reasoning` event
 * (never mixed into the answer body). Rendered as an inline text toggle that
 * opens a height-capped block traced by a dotted constellation rule (distinct
 * from blockquotes' solid rule) - open by default while the turn
 * streams (so the user watches Athena think) and collapsed on the settled
 * message. Tokens-only; nothing here implies a Sophia mood.
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
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Brain className="size-3.5 text-[var(--primary)]" aria-hidden />
        <span>Reasoning</span>
        <ChevronDown
          className={cn("size-3.5 text-[var(--text-subtle)] transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-l border-dashed border-[var(--constellation)] pl-3 text-xs leading-relaxed text-[var(--text-muted)]">
          {reasoning}
        </div>
      )}
    </div>
  );
}
