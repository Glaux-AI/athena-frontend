"use client";

/**
 * AwaitingSeatPill - §7.9.6 row 2472.
 *
 * Status pill rendered on a pending-invitation row when the workspace
 * would be over its seat cap when that invitation gets accepted. The
 * pill is clickable: clicking it opens <BuySeatsModal> via the global
 * `useBuySeatsModal()` hook, scoped to the inviting workspace.
 *
 * Today the call site computes "would exceed cap" FE-side from the
 * SeatsOut summary; once the BE attaches a per-row `would_exceed_cap`
 * flag (also reserved as a follow-up), the caller can read that field
 * directly instead.
 */

import { Clock } from "lucide-react";

import { useBuySeatsModal } from "@/lib/stores/buy-seats-modal";

export function AwaitingSeatPill({ inviteeEmail }: { inviteeEmail?: string }) {
  const modal = useBuySeatsModal();
  const onClick = () => {
    if (inviteeEmail) {
      modal.openWithContext({ inviteeEmail });
    } else {
      modal.open();
    }
  };
  return (
    <button
      type="button"
      data-testid="awaiting-seat-pill"
      aria-label="Awaiting seat - buy a seat to admit this invitation"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Clock className="size-3" aria-hidden />
      Awaiting seat
    </button>
  );
}
