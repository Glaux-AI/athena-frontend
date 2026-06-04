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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <Brain className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
        <span>Reasoning</span>
        <ChevronDown
          className={cn("ml-auto size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-t border-[var(--border)] px-3 py-2 text-xs leading-relaxed text-[var(--text-muted)]">
          {reasoning}
        </div>
      )}
    </div>
  );
}
