"use client";

/**
 * §7.8.1 — ModelChip: a model rendered as a pill that reveals a rich
 * hover/focus tooltip (description + domain + pricing + rate limit +
 * context) wherever a model appears as a chip in the UX.
 *
 * A token-styled popover (mouse + keyboard triggered, no Radix
 * dependency) so the chip stays
 * accessible — the trigger is a focusable element with an `aria-label`
 * carrying the same facts the sighted tooltip shows.
 */

import { useState } from "react";
import { Brain, Eye } from "lucide-react";

import { cn } from "@/lib/cn";
import { priceLabel, rateLabel } from "@/lib/models/format";
import type { CatalogModel } from "@/lib/api/client";

export function ModelChip({
  model,
  currency = "USD",
  label,
  className,
}: {
  model: CatalogModel;
  /** Provider pricing currency (defaults USD). */
  currency?: string;
  /** Override the visible chip text (defaults to the model display name). */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rate = rateLabel(model.rate_limit);
  const aria =
    `${model.display_name}. ${model.description}` +
    (model.supports_vision ? " Accepts image input." : "");
  const pricing = `${priceLabel(model.input_price, currency)} in · ${priceLabel(model.output_price, currency)} out`;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        role="note"
        aria-label={aria}
        data-testid="model-chip"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex max-w-[220px] cursor-help items-center gap-1 truncate rounded-full",
          "bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--text)]",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          className,
        )}
      >
        {model.thinking && <Brain className="size-2.5 shrink-0 text-[var(--primary)]" aria-hidden />}
        {model.supports_vision && <Eye className="size-2.5 shrink-0 text-[var(--text-muted)]" aria-hidden />}
        <span className="truncate">{label ?? model.display_name}</span>
      </span>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "glass absolute left-0 top-full z-50 mt-1 w-72 rounded-xl p-3 text-xs shadow-[var(--shadow-3)]",
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[var(--text)]">{model.display_name}</span>
            <span className="flex shrink-0 items-center gap-1">
              {model.supports_vision && <VisionBadge />}
              <ModelTypeBadge type={model.model_type} thinking={model.thinking} />
            </span>
          </span>
          <span className="mt-1 block text-[var(--text-muted)]">{model.description}</span>
          <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
            <Fact label="Context" value={`${model.context_window.toLocaleString()} tok`} />
            {model.max_output_tokens > 0 && (
              <Fact label="Max output" value={`${model.max_output_tokens.toLocaleString()} tok`} />
            )}
            <Fact label="Pricing" value={pricing} />
            <Fact label="Rate limit" value={rate ?? "See provider notes"} />
          </span>
          <span className="mt-2 block font-mono text-[10px] text-[var(--text-muted)]">
            {model.id}
          </span>
        </span>
      )}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text)]">{value}</span>
    </>
  );
}

function ModelTypeBadge({ type, thinking }: { type: string; thinking: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        thinking
          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
          : "bg-[var(--surface-2)] text-[var(--text-muted)]",
      )}
    >
      {thinking && <Brain className="size-2.5" aria-hidden />}
      {type}
    </span>
  );
}

function VisionBadge() {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5",
        "bg-[var(--surface-2)] text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
      )}
    >
      <Eye className="size-2.5" aria-hidden />
      vision
    </span>
  );
}
