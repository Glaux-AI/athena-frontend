// @vitest-environment jsdom

/**
 * BuySeatsModal unit tests — §7.9.9 rows 2495..2498 (ADR-081).
 *
 * Validates:
 *   - solo tier surfaces both tabs (à la carte default + upgrade)
 *   - pro tier surfaces only the à la carte tab
 *   - free tier with `pro_upgrade_quote === null` surfaces only the
 *     à la carte tab (the tab-strip is hidden when there's no upgrade
 *     quote to render)
 *   - count input is bound + clamped (min 1, max 50)
 *   - live preview math (INR): 3 × ₹1,299 = ₹3,897/mo
 *   - upgrade-tab math (solo_total / pro_total / breakeven render)
 *   - submit triggers `api.billing.buySeats` with the right count then
 *     opens Razorpay Checkout with the returned order
 *   - upgrade submit triggers `api.billing.upgradeToPro` with the right
 *     additional_seats (= max(0, total - pro_included_seats))
 *   - openWithContext({inviteeEmail}) renders "Onboard <email>" headline
 *
 * Pattern follows the rest of the billing suite: spy the api client,
 * render the modal host with the Zustand store flipped open, assert
 * plain DOM (no jest-dom).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { BuySeatsModalHost } from "@/components/billing/buy-seats-modal";
import {
  useBuySeatsModalStore,
  type BuySeatsModalContext,
} from "@/lib/stores/buy-seats-modal";
import * as client from "@/lib/api/client";

// useSession is consumed by the host for activeOrgId. Stub it so the
// modal renders against a known org.
vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({
    activeOrgId: "org_test",
    me: null,
    session: null,
    status: "authenticated" as const,
    setActiveOrgId: () => {},
    refreshMe: async () => {},
    signOut: async () => {},
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// Stub the Razorpay Checkout.js wrapper so submit paths don't load the
// real hosted script. Resolves "verified" by default (set per-test below).
const openCheckoutSpy = vi.fn();
vi.mock("@/lib/billing/razorpay-checkout", () => ({
  openRazorpayCheckout: (args: unknown) => openCheckoutSpy(args),
}));

const getSeatsSpy = vi.spyOn(client.api.billing, "getSeats");
const buySeatsSpy = vi.spyOn(client.api.billing, "buySeats");
const upgradeSpy = vi.spyOn(client.api.billing, "upgradeToPro");
// The upgrade tab fetches the price catalog for base prices; pin it.
const catalogSpy = vi.spyOn(client.api.billing, "priceCatalog");

beforeEach(() => {
  catalogSpy.mockResolvedValue({
    currency: "INR",
    solo_base: 1499,
    solo_extra_seat: 1299,
    pro_base: 7999,
    pro_extra_seat: 899,
  });
  // Default: every checkout resolves verified.
  openCheckoutSpy.mockResolvedValue({
    status: "verified",
    orderId: "order_x",
    paymentId: "pay_x",
  });
});

afterEach(() => {
  cleanup();
  getSeatsSpy.mockReset();
  buySeatsSpy.mockReset();
  upgradeSpy.mockReset();
  catalogSpy.mockReset();
  openCheckoutSpy.mockClear();
  // Reset store between tests so `open` doesn't leak.
  act(() => {
    useBuySeatsModalStore.getState().close();
  });
});

/** A minimal order payload the buy/upgrade endpoints resolve in mock. */
function orderPayload(extra: Partial<client.OrderPayload> = {}): client.OrderPayload {
  return {
    order_id: "order_x",
    razorpay_key_id: "rzp_test_mock",
    amount: 100,
    currency: "INR",
    purchase: "seats",
    checkout_options: { order_id: "order_x", currency: "INR" },
    ...extra,
  };
}

function seats(extra: Partial<client.SeatsOut> = {}): client.SeatsOut {
  return {
    tier: "solo",
    included_seats: 1,
    additional_seats: 0,
    total_seats: 1,
    active_seats: 1,
    pending_invitations: 0,
    available_seats: 0,
    extra_seat_price_per_month: 1299,
    pro_upgrade_quote: {
      pro_included_seats: 5,
      pro_extra_seat_price_per_month: 899,
      breakeven_seats: 8,
    },
    ...extra,
  };
}

function openModal() {
  act(() => {
    useBuySeatsModalStore.getState().openModal();
  });
}

function openModalWithContext(ctx: BuySeatsModalContext) {
  act(() => {
    useBuySeatsModalStore.getState().openWithContext(ctx);
  });
}

describe("BuySeatsModal", () => {
  it("renders both tabs for solo tier (à la carte default + upgrade visible)", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    render(<BuySeatsModalHost />);
    openModal();
    await screen.findByTestId("buy-seats-modal");
    await screen.findByTestId("buy-seats-tab-alacarte");
    expect(screen.queryByTestId("buy-seats-tab-upgrade")).not.toBeNull();
  });

  it("renders only à la carte tab for pro tier (no tab strip)", async () => {
    getSeatsSpy.mockResolvedValueOnce(
      seats({
        tier: "pro",
        included_seats: 5,
        total_seats: 5,
        active_seats: 5,
        pro_upgrade_quote: null,
      }),
    );
    render(<BuySeatsModalHost />);
    openModal();
    await screen.findByTestId("buy-seats-count");
    expect(screen.queryByTestId("buy-seats-tab-upgrade")).toBeNull();
    expect(screen.queryByTestId("buy-seats-tab-alacarte")).toBeNull();
  });

  it("renders only à la carte tab when pro_upgrade_quote is null (e.g. free / enterprise)", async () => {
    // Caller is expected to short-circuit Free orgs at the open handler;
    // even if it slipped through, the absence of a quote hides the
    // upgrade tab so the surface degrades safely.
    getSeatsSpy.mockResolvedValueOnce(
      seats({ tier: "free", pro_upgrade_quote: null }),
    );
    render(<BuySeatsModalHost />);
    openModal();
    await screen.findByTestId("buy-seats-count");
    expect(screen.queryByTestId("buy-seats-tab-upgrade")).toBeNull();
  });

  it("count input clamps to min 1", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    render(<BuySeatsModalHost />);
    openModal();
    const input = (await screen.findByTestId("buy-seats-count")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    const submit = screen.getByTestId("buy-seats-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("count input clamps to max 50", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    render(<BuySeatsModalHost />);
    openModal();
    const input = (await screen.findByTestId("buy-seats-count")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75" } });
    const submit = screen.getByTestId("buy-seats-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("renders live preview math (INR): 3 × ₹1,299 = ₹3,897/mo", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    render(<BuySeatsModalHost />);
    openModal();
    const input = (await screen.findByTestId("buy-seats-count")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });
    const preview = screen.getByTestId("buy-seats-preview");
    expect(preview.textContent).toMatch(/Total: 3 × ₹1,299 = ₹3,897\/mo/);
    expect(screen.getByTestId("buy-seats-submit").textContent).toMatch(
      /Add 3 seats for ₹3,897\/mo/,
    );
  });

  it("upgrade tab renders solo_total + pro_total + breakeven math (INR)", async () => {
    getSeatsSpy.mockResolvedValueOnce(
      seats({
        tier: "solo",
        included_seats: 1,
        total_seats: 6,
        active_seats: 6,
        pro_upgrade_quote: {
          pro_included_seats: 5,
          pro_extra_seat_price_per_month: 899,
          breakeven_seats: 8,
        },
      }),
    );
    render(<BuySeatsModalHost />);
    openModal();
    const upgradeTab = await screen.findByTestId("buy-seats-tab-upgrade");
    fireEvent.click(upgradeTab);
    // 6 total seats, included=1, extras=5. Solo = 1499 + 5*1299 = 7994;
    // Pro = 7999 + 1*899 = 8898.
    const solo = await screen.findByTestId("buy-seats-solo-total");
    const pro = await screen.findByTestId("buy-seats-pro-total");
    await waitFor(() => expect(solo.textContent).toMatch(/₹7,994\/mo/));
    expect(pro.textContent).toMatch(/₹8,898\/mo/);
    expect(screen.getByTestId("buy-seats-breakeven").textContent).toMatch(
      /Breakeven at 8 seats/,
    );
  });

  it("submit calls api.billing.buySeats with the chosen count + opens Razorpay", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    const order = orderPayload({ purchase: "seats", requested_seats: 4 } as Partial<client.OrderPayload>);
    buySeatsSpy.mockResolvedValueOnce({
      ...order,
      tier: "solo",
      requested_seats: 4,
      projected_total: 5,
    });
    render(<BuySeatsModalHost />);
    openModal();
    const input = (await screen.findByTestId("buy-seats-count")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(screen.getByTestId("buy-seats-submit"));
    await waitFor(() => {
      expect(buySeatsSpy).toHaveBeenCalledWith("org_test", { count: 4 });
    });
    await waitFor(() => {
      expect(openCheckoutSpy).toHaveBeenCalled();
    });
  });

  it("upgrade submit calls api.billing.upgradeToPro with the right additional_seats", async () => {
    getSeatsSpy.mockResolvedValueOnce(
      seats({
        tier: "solo",
        included_seats: 1,
        total_seats: 7,
        active_seats: 7,
        pro_upgrade_quote: {
          pro_included_seats: 5,
          pro_extra_seat_price_per_month: 899,
          breakeven_seats: 8,
        },
      }),
    );
    upgradeSpy.mockResolvedValueOnce(orderPayload({ purchase: "tier_pro" }));
    render(<BuySeatsModalHost />);
    openModal();
    fireEvent.click(await screen.findByTestId("buy-seats-tab-upgrade"));
    fireEvent.click(await screen.findByTestId("buy-seats-upgrade-submit"));
    await waitFor(() => {
      expect(upgradeSpy).toHaveBeenCalledWith("org_test", {
        additional_seats: 2, // max(0, 7-5) = 2
      });
    });
    await waitFor(() => {
      expect(openCheckoutSpy).toHaveBeenCalled();
    });
  });

  it("openWithContext({inviteeEmail}) renders the 'Onboard <email>' headline", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    render(<BuySeatsModalHost />);
    openModalWithContext({ inviteeEmail: "alice@x.com" });
    const headline = await screen.findByTestId("buy-seats-headline");
    expect(headline.textContent).toMatch(/Onboard alice@x\.com/);
  });

  it("default open() renders the 'Grow your team' headline", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    render(<BuySeatsModalHost />);
    openModal();
    const headline = await screen.findByTestId("buy-seats-headline");
    expect(headline.textContent).toMatch(/Grow your team/);
  });

  it("renders a load error when the seats GET rejects", async () => {
    getSeatsSpy.mockRejectedValueOnce(
      new client.ApiError(500, "internal", "Seats unavailable"),
    );
    render(<BuySeatsModalHost />);
    openModal();
    await waitFor(() => {
      expect(screen.getByText(/Seats unavailable/)).not.toBeNull();
    });
  });

  it("surfaces inline submit error when buySeats rejects (e.g. seats_release_would_displace)", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    buySeatsSpy.mockRejectedValueOnce(
      new client.ApiError(409, "seats_release_would_displace", "Would displace a member."),
    );
    render(<BuySeatsModalHost />);
    openModal();
    await screen.findByTestId("buy-seats-count");
    fireEvent.click(screen.getByTestId("buy-seats-submit"));
    const err = await screen.findByTestId("buy-seats-error");
    expect(err.textContent).toMatch(/Would displace a member/);
  });
});
