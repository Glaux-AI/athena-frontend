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

import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
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
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full bg-[var(--warning-soft)] px-2 text-micro font-medium leading-none text-[var(--warning-ink)] hover:opacity-90",
        focusRing,
      )}
    >
      <Clock className="size-3" aria-hidden />
      Awaiting seat
    </button>
  );
}
