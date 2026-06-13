"use client";

/**
 * SeatsBadge - §7.9.6 row 2473.
 *
 * "Seats: N / M used" pill rendered at the top of /settings/members
 * next to the page title. Subtle chrome (no CTA prominence); the chip
 * links to /settings/billing so admins can act on full carriage.
 */

import Link from "next/link";

import type { SeatsOut } from "@/lib/api/client";

export function SeatsBadge({ seats }: { seats: SeatsOut | null }) {
  if (!seats) return null;
  return (
    <Link
      href="/settings/billing"
      data-testid="seats-badge"
      aria-label={`${seats.active_seats} of ${seats.total_seats} seats used - open billing`}
      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <span className="font-medium text-[var(--text)]">
        Seats: {seats.active_seats} / {seats.total_seats}
      </span>
      <span>used</span>
    </Link>
  );
}
