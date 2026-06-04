"use client";

/**
 * §3.6 r6 — GateBanner.
 *
 * Sticky banner shown above the run detail when there is exactly one open
 * approval gate on the run. Reads from `useOpenGate(run.id)`; renders
 * nothing when no gate is open. The banner is non-blocking: the page
 * scrolls under it and focus is not trapped (per ADR-027 #19).
 *
 * Layout: gate_key chip · opened-at relative time · opened-by line ·
 * `<GateBannerActions>` (Approve / Reject / Handoff). Loading skeleton
 * holds the same vertical footprint to avoid layout shift; errors render
 * inline as a dismissable inline banner — they do NOT take over the page.
 */

import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { GateBannerActions } from "@/components/runs/gates/gate-banner-actions";
import { useOpenGate } from "@/hooks/use-open-gate";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import type { RunDetail } from "@/lib/api/client";

/** Friendly label for an `opened_by_kind` value. Falls through to the raw
 *  string when an unknown kind shows up so the banner still renders. */
function openedByLabel(kind: string | null | undefined, id: string | null | undefined): string {
  const who = id ?? "unknown";
  switch (kind) {
    case "user":   return `user ${who}`;
    case "agent":  return `agent ${who}`;
    case "system": return "system";
    default:       return kind ? `${kind} ${who}` : `opened by ${who}`;
  }
}

export function GateBanner({ run }: { run: RunDetail }) {
  const { gate, loading, error, mutate } = useOpenGate(run.id);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Checking for open approval gates"
        data-testid="gate-banner-loading"
        className="sticky top-0 z-30 -mx-4 mb-3 border-b border-[var(--border)] bg-[var(--surface-2)]/80 px-4 py-3 backdrop-blur"
      >
        <Cluster gap="3" align="center">
          <div className="h-4 w-32 animate-pulse rounded-md bg-[var(--surface-3)]" />
          <div className="h-3 w-24 animate-pulse rounded-md bg-[var(--surface-3)]" />
          <div className="ml-auto h-8 w-56 animate-pulse rounded-md bg-[var(--surface-3)]" />
        </Cluster>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        data-testid="gate-banner-error"
        className="sticky top-0 z-30 -mx-4 mb-3 border-b border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 backdrop-blur"
      >
        <Cluster gap="2" align="center">
          <AlertTriangle className="size-4 text-[var(--danger-ink)]" aria-hidden />
          <span className="text-xs text-[var(--danger-ink)]">
            Couldn&apos;t load approval-gate state: {error.message}
          </span>
        </Cluster>
      </div>
    );
  }

  if (!gate) return null;

  return (
    <section
      aria-label="Approval gate"
      data-testid="gate-banner"
      data-gate-key={gate.gate_key}
      className={cn(
        "sticky top-0 z-30 -mx-4 mb-3 border-b border-[var(--warning)]",
        "bg-[var(--warning-soft)]/95 px-4 py-3 backdrop-blur",
      )}
    >
      <Cluster gap="4" justify="between" align="center" className="flex-wrap">
        <Stack gap="1" className="min-w-0">
          <Cluster gap="2" align="center" className="flex-wrap">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--warning)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-fg)]"
              data-testid="gate-banner-key"
            >
              <ShieldCheck className="size-3" aria-hidden />
              {gate.gate_key}
            </span>
            <span className="text-sm font-semibold text-[var(--text)]">
              Awaiting your decision
            </span>
          </Cluster>
          <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
            <Clock className="size-3" aria-hidden />
            <span data-testid="gate-banner-opened-at">
              opened {formatRelativeTime(gate.opened_at)}
            </span>
            <span aria-hidden>·</span>
            <span data-testid="gate-banner-opened-by">
              by {openedByLabel(gate.opened_by_kind, gate.opened_by_id)}
            </span>
          </Cluster>
        </Stack>
        <GateBannerActions
          runId={run.id}
          gateKey={gate.gate_key}
          opened_by_kind={gate.opened_by_kind ?? null}
          opened_by_id={gate.opened_by_id ?? null}
          onResolved={mutate}
        />
      </Cluster>
    </section>
  );
}
