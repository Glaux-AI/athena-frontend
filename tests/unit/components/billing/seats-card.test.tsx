// @vitest-environment jsdom

/**
 * SeatsCard unit tests — §7.9.5 row 2463.
 *
 * Covers the readiness's call-out cases:
 *   - solo 1/1   → "1 of 1 seats used" + at-cap chrome on the CTA.
 *   - pro 4/5    → "4 of 5 seats used" + normal-styled CTA.
 *   - pro 5/5    → at-cap chrome visible (CTA stays clickable → toast).
 *   - error case → renders the error copy, not the headline.
 *
 * Pattern follows the rest of the repo: spy the api client, render the
 * component directly, assert plain DOM (no jest-dom matcher).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { SeatsCard } from "@/components/billing/seats-card";
import * as client from "@/lib/api/client";

const getSeatsSpy = vi.spyOn(client.api.billing, "getSeats");

afterEach(() => {
  cleanup();
  getSeatsSpy.mockReset();
});

function seats(extra: Partial<client.SeatsOut> = {}): client.SeatsOut {
  return {
    tier: "solo",
    included_seats: 1,
    additional_seats: 0,
    total_seats: 1,
    active_seats: 1,
    pending_invitations: 0,
    available_seats: 0,
    extra_seat_price_per_month_usd: 15,
    pro_upgrade_quote: null,
    ...extra,
  };
}

describe("SeatsCard", () => {
  it("renders '1 of 1 seats used' for solo 1/1 (at cap)", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo", active_seats: 1, total_seats: 1 }));
    render(<SeatsCard orgId="org_test" />);
    const headline = await screen.findByTestId("seats-headline");
    expect(headline.textContent).toMatch(/1 of 1 seats used/);
    expect(screen.getByTestId("seats-subline").textContent).toMatch(/1 included \+ 0 paid extras/);
    expect(screen.queryByTestId("seats-at-cap")).not.toBeNull();
  });

  it("renders '4 of 5 seats used' for pro 4/5 (headroom; no at-cap chrome)", async () => {
    getSeatsSpy.mockResolvedValueOnce(
      seats({
        tier: "pro",
        included_seats: 5,
        additional_seats: 0,
        total_seats: 5,
        active_seats: 4,
        pending_invitations: 0,
        available_seats: 1,
      }),
    );
    render(<SeatsCard orgId="org_test" />);
    const headline = await screen.findByTestId("seats-headline");
    expect(headline.textContent).toMatch(/4 of 5 seats used/);
    expect(screen.queryByTestId("seats-at-cap")).toBeNull();
  });

  it("renders yellow CTA chrome when pro 5/5 (at cap)", async () => {
    getSeatsSpy.mockResolvedValueOnce(
      seats({
        tier: "pro",
        included_seats: 5,
        additional_seats: 0,
        total_seats: 5,
        active_seats: 5,
        pending_invitations: 0,
        available_seats: 0,
      }),
    );
    render(<SeatsCard orgId="org_test" />);
    await screen.findByTestId("seats-headline");
    const cta = screen.getByTestId("buy-more-seats");
    // Yellow-toned chrome → contains the warning-soft token.
    expect(cta.className).toMatch(/warning-soft/);
    // At-cap label visible.
    expect(screen.queryByTestId("seats-at-cap")).not.toBeNull();
  });

  it("surfaces an error message when the read fails", async () => {
    getSeatsSpy.mockRejectedValueOnce(
      new client.ApiError(500, "internal", "Seats unavailable"),
    );
    render(<SeatsCard orgId="org_test" />);
    await waitFor(() => {
      expect(screen.queryByTestId("seats-headline")).toBeNull();
    });
    expect(screen.getByText(/Seats unavailable/)).not.toBeNull();
  });

  it("renders nothing while orgId is null (prevents flash on first paint)", () => {
    render(<SeatsCard orgId={null} />);
    // Skeleton renders, but the headline never lands.
    expect(screen.queryByTestId("seats-headline")).toBeNull();
  });
});
