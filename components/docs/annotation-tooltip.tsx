"use client";

/**
 * AnnotationTooltip — small hover/focus popover rendered next to an inline
 * annotation token in a doc body. Implements F-04.11 / ADR-063.
 *
 * Three token kinds, each with its own visual treatment + tooltip content:
 *
 *   [unverified_reference: <kind> '<id>']
 *     amber underline + "?" icon. Tooltip: kind + id + alternatives + a
 *     "Resolve" CTA hint (resolution happens through a re-run / clarification,
 *     not inline — this surface is read-only display per spec).
 *
 *   [verified_existing: <path:line>]
 *     subtle green check. Tooltip: path:line + "Click to view source" hint.
 *
 *   [new_utility: <name>]
 *     blue dotted underline. Tooltip: "Agent introducing a new utility — the
 *     reviewer will check for duplicates."
 *
 * The component is positionless by default — callers wrap the trigger in a
 * `<span class="relative">` and the tooltip absolute-positions below.
 */

import { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";

export type AnnotationKind = "unverified_reference" | "verified_existing" | "new_utility";

interface ParsedAnnotation {
  kind: AnnotationKind;
  /** The textual content of the token between the colon and the closing `]`. */
  raw: string;
  /** For `unverified_reference` and `verified_existing`, the inferred sub-kind
   * before the quoted id (e.g. "function", "module"). */
  sub_kind?: string;
  /** The bare identifier inside quotes (for unverified) or after the colon
   * (for new_utility). For verified_existing, this is the `path:line`. */
  identifier: string;
}

/**
 * Parse one annotation token's content (the part between `[<kind>:` and `]`)
 * into a structured `ParsedAnnotation`. Tolerant of whitespace variation;
 * never throws — unrecognised shapes fall back to identifier-only.
 */
export function parseAnnotation(kind: AnnotationKind, raw: string): ParsedAnnotation {
  const trimmed = raw.trim();
  if (kind === "unverified_reference") {
    // Shape: `<sub_kind> '<id>'` — e.g. `function 'charge_ach'`.
    const m = trimmed.match(/^(\S+)\s+['"](.+)['"]$/);
    if (m && m[1]) {
      return { kind, raw: trimmed, sub_kind: m[1], identifier: m[2]! };
    }
    return { kind, raw: trimmed, identifier: trimmed };
  }
  if (kind === "verified_existing") {
    // Shape: `<path>:<line>` — already keyed by location.
    return { kind, raw: trimmed, identifier: trimmed };
  }
  // new_utility: just the name.
  return { kind, raw: trimmed, identifier: trimmed };
}

const KIND_STYLES: Record<AnnotationKind, { underline: string; tone: string; iconColor: string }> = {
  unverified_reference: {
    underline: "underline decoration-[var(--warning)] decoration-2 underline-offset-2",
    tone: "border-[var(--warning)] bg-[var(--warning-soft)]",
    iconColor: "text-[var(--warning-ink)]",
  },
  new_utility: {
    underline: "underline decoration-dotted decoration-[var(--info)] decoration-2 underline-offset-2",
    tone: "border-[var(--info)] bg-[var(--info-soft)]",
    iconColor: "text-[var(--info-ink)]",
  },
  verified_existing: {
    underline: "",
    tone: "border-[var(--success)] bg-[var(--success-soft)]",
    iconColor: "text-[var(--success-ink)]",
  },
};

interface AnnotationTooltipProps {
  annotation: ParsedAnnotation;
  /** Children rendered as the inline trigger (usually the surrounding text). */
  children: ReactNode;
}

export function AnnotationTooltip({ annotation, children }: AnnotationTooltipProps) {
  const [open, setOpen] = useState(false);
  const style = KIND_STYLES[annotation.kind];
  const Icon =
    annotation.kind === "unverified_reference"
      ? AlertCircle
      : annotation.kind === "verified_existing"
      ? CheckCircle2
      : Sparkles;

  const headline =
    annotation.kind === "unverified_reference"
      ? `Unverified reference: ${annotation.sub_kind ?? "—"} '${annotation.identifier}'`
      : annotation.kind === "verified_existing"
      ? `Verified existing: ${annotation.identifier}`
      : `New utility: ${annotation.identifier}`;

  const helper =
    annotation.kind === "unverified_reference"
      ? "Athena drafted this but couldn't find a matching definition in the KB. Resolve via a re-run, or accept as-is for low-stakes phases."
      : annotation.kind === "verified_existing"
      ? "This reference resolves to a real path:line in the indexed code."
      : "Agent is introducing a new utility — reviewers will check for duplicates before merge.";

  return (
    <span
      className={cn("relative inline cursor-help", style.underline)}
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      role="note"
      aria-label={`${headline}. ${helper}`}
      data-annotation-kind={annotation.kind}
    >
      <span className="inline-flex items-baseline gap-0.5">
        {children}
        <Icon className={cn("size-3 shrink-0 self-center", style.iconColor)} aria-hidden />
      </span>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute left-0 top-full z-30 mt-1 w-72 rounded-md border p-2 text-xs shadow-[var(--shadow-2)]",
            "bg-[var(--surface)]",
            style.tone,
          )}
        >
          <span className="block font-semibold text-[var(--text)]">{headline}</span>
          <span className="mt-1 block text-[var(--text-muted)]">{helper}</span>
        </span>
      )}
    </span>
  );
}
