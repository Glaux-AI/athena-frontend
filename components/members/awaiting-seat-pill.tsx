"use client";

/**
 * AwaitingSeatPill — §7.9.6 row 2472.
 *
 * Status pill rendered on a pending-invitation row when the workspace
 * would be over its seat cap when that invitation gets accepted. The
 * pill is clickable: clicking it surfaces a Sonner toast pointing at
 * the (deferred) BuySeatsModal — the modal swap is a one-line change
 * once §7.9.9 lands.
 *
 * Today the call site computes "would exceed cap" FE-side from the
 * SeatsOut summary; once the BE attaches a per-row `would_exceed_cap`
 * flag (also reserved as a follow-up), the caller can read that field
 * directly instead.
 */

import { Clock } from "lucide-react";
import { toast } from "sonner";

import { BUY_SEATS_MODAL_PENDING_TOAST } from "@/components/billing/seats-card";

export function AwaitingSeatPill() {
  return (
    <button
      type="button"
      data-testid="awaiting-seat-pill"
      aria-label="Awaiting seat — buy a seat to admit this invitation"
      onClick={() => toast.info(BUY_SEATS_MODAL_PENDING_TOAST)}
      className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Clock className="size-3" aria-hidden />
      Awaiting seat
    </button>
  );
}
