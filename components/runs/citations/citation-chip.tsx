"use client";

/**
 * CitationChip - clickable pill that surfaces a single knowledge-graph
 * or repo-file source. Mirrors `cost-pill.tsx` styling primitives so the
 * new chips don't drift from the rest of the run-page surface.
 *
 * Source kinds match the canonical Athena citation grammar:
 *   - `kn://…/file.py:L12-L30`  → knowledge-graph node
 *   - `repo://owner/name/path#L42` → repo file slice
 *
 * Click fires the parent-managed `onOpen` callback - the drawer is
 * hoisted at the renderer root so multiple chips share one overlay.
 *
 * Both KN and repo chips render the same neutral surface; the icon
 * disambiguates the kind. Keyboard accessible - native button with
 * focus-visible ring inherited from the surrounding focus token.
 */

import { Database, FileCode2 } from "lucide-react";

import { cn } from "@/lib/cn";

export type CitationSource = "kn" | "repo";

interface CitationChipProps {
  source: CitationSource;
  /** Canonical reference string - passed through to the drawer + click
   *  handler. The drawer fetcher decodes it back into a knowledge node or
   *  repo file slice. */
  ref: string;
  /** Display label - what the user reads on the chip. Falls back to
   *  `ref` when omitted. */
  label?: string;
  onOpen: () => void;
  className?: string;
}

export function CitationChip({
  source,
  ref: refValue,
  label,
  onOpen,
  className,
}: CitationChipProps) {
  const Icon = source === "kn" ? Database : FileCode2;
  const tooltip = source === "kn" ? "Knowledge graph source" : "Repo file source";
  const display = label ?? refValue;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open citation source: ${display}`}
      title={tooltip}
      data-testid="citation-chip"
      data-source={source}
      data-ref={refValue}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
        "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
        "transition-colors duration-150 ease-out",
        "hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="max-w-[280px] truncate">{display}</span>
    </button>
  );
}
