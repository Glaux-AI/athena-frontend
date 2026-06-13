// @vitest-environment jsdom

/**
 * SeatsBadge + AwaitingSeatPill unit tests - §7.9.6 rows 2472 + 2473.
 *
 * Covers:
 *   - SeatsBadge: hidden while seats is null, renders pill and links to
 *     /settings/billing when summary is available.
 *   - AwaitingSeatPill: renders + carries the right aria-label.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SeatsBadge } from "@/components/members/seats-badge";
import { AwaitingSeatPill } from "@/components/members/awaiting-seat-pill";
import type { SeatsOut } from "@/lib/api/client";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => { cleanup(); });

function seats(extra: Partial<SeatsOut> = {}): SeatsOut {
  return {
    tier: "pro",
    included_seats: 5,
    additional_seats: 0,
    total_seats: 5,
    active_seats: 4,
    pending_invitations: 0,
    available_seats: 1,
    extra_seat_price_per_month: 899,
    pro_upgrade_quote: null,
    ...extra,
  };
}

describe("SeatsBadge", () => {
  it("renders nothing while seats is null", () => {
    render(<SeatsBadge seats={null} />);
    expect(screen.queryByTestId("seats-badge")).toBeNull();
  });

  it("renders 'Seats: N / M used' and links to /settings/billing", () => {
    render(<SeatsBadge seats={seats({ active_seats: 4, total_seats: 5 })} />);
    const badge = screen.getByTestId("seats-badge");
    expect(badge.textContent).toMatch(/Seats: 4 \/ 5/);
    expect(badge.getAttribute("href")).toBe("/settings/billing");
  });

  it("carries an aria-label describing the open-billing action", () => {
    render(<SeatsBadge seats={seats({ active_seats: 2, total_seats: 5 })} />);
    const badge = screen.getByTestId("seats-badge");
    expect(badge.getAttribute("aria-label")).toMatch(/2 of 5 seats used/);
  });
});

describe("AwaitingSeatPill", () => {
  it("renders with an explanatory aria-label", () => {
    render(<AwaitingSeatPill />);
    const pill = screen.getByTestId("awaiting-seat-pill");
    expect(pill.textContent).toMatch(/Awaiting seat/i);
    expect(pill.getAttribute("aria-label")).toMatch(/buy a seat/i);
  });

  it("is clickable (button role) - wires into the deferred BuySeatsModal toast", () => {
    render(<AwaitingSeatPill />);
    const pill = screen.getByTestId("awaiting-seat-pill");
    expect(pill.tagName).toBe("BUTTON");
    // Click doesn't throw; the toast is fired-and-forget so we don't
    // assert on it here (Sonner toasts are tested in their own suite).
    fireEvent.click(pill);
  });
});
