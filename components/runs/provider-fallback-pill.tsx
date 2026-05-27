"use client";

/**
 * ProviderFallbackPill — transparency chip for the run-page chip cluster
 * (readiness §3.1 row 812). When the primary LLM route fails and LiteLLM
 * rolls over to a secondary model, this chip surfaces that fact next to
 * the cost pill so the user understands "this answer came from the
 * fallback model".
 *
 * Read-only — click opens a popover that lists each provider route the
 * run touched. The chip is hidden entirely when `fallback_count === 0`
 * (no fallbacks happened, nothing to surface).
 *
 * Visual rhythm: mirrors `<CostPill>` shape so the cluster stays even.
 * Amber-toned when fallbacks happened (warning surface). Popover follows
 * the same native pattern used by `<DevModeBadge>` in `top-bar.tsx`
 * (outside-click + Escape close; trapped focus via React focus order).
 *
 * Wire field names stay snake_case per ADR-032.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { useFallbackInfo } from "@/hooks/use-fallback-info";
import { cn } from "@/lib/cn";

import { ProviderFallbackPopover } from "./provider-fallback-popover";

export interface ProviderFallbackPillProps {
  runId: string;
  className?: string;
}

export function ProviderFallbackPill({ runId, className }: ProviderFallbackPillProps) {
  const { routes, fallback_count, isLoading, error } = useFallbackInfo(runId);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape (same pattern as DevModeBadge popover).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When the popover opens, move focus into it so the keyboard user lands
  // on the dialog body (popover content is read-only — no inner
  // interactives to tab through, so the dialog itself takes focus).
  useEffect(() => {
    if (open) popRef.current?.focus();
  }, [open]);

  // Loading skeleton — tiny shimmer in the chip slot so the cluster
  // doesn't pop in. Indistinguishable visual weight from the resolved
  // null state when fallback_count is 0.
  if (isLoading) {
    return (
      <span
        data-testid="provider-fallback-skeleton"
        aria-hidden
        className={cn(
          "inline-block h-5 w-20 animate-pulse rounded-md bg-[var(--surface-2)]",
          className,
        )}
      />
    );
  }

  // Error rendered as a flag-only icon so we don't crash the cluster.
  if (error) {
    return (
      <span
        data-testid="provider-fallback-error"
        title={error}
        aria-label="Provider fallback info unavailable"
        className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5",
          "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
          className,
        )}
      >
        <AlertTriangle className="size-3" aria-hidden />
      </span>
    );
  }

  // Nothing to surface — primary route handled every call.
  if (fallback_count === 0) return null;

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        role="button"
        aria-label="Provider fallback details"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="provider-fallback-pill"
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
          "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]",
          "transition-colors duration-150 ease-out",
          "hover:bg-[var(--warning)] hover:text-[var(--surface)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )}
      >
        <AlertTriangle className="size-3" aria-hidden />
        Fallback active
        <span
          className="ml-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-[var(--warning)] px-1 font-mono text-[10px] tabular-nums text-white"
          data-testid="provider-fallback-count"
        >
          {fallback_count}
        </span>
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Provider fallback details"
          tabIndex={-1}
          className="absolute left-0 top-full z-40 mt-1 w-[420px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg focus:outline-none"
          data-testid="provider-fallback-popover"
        >
          <ProviderFallbackPopover routes={routes} />
        </div>
      )}
    </span>
  );
}
