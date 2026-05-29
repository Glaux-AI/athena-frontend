// @vitest-environment jsdom

/**
 * BuySeatsModal unit tests — §7.9.9 rows 2495..2498.
 *
 * Validates:
 *   - solo tier surfaces both tabs (à la carte default + upgrade)
 *   - pro tier surfaces only the à la carte tab
 *   - free tier with `pro_upgrade_quote === null` surfaces only the
 *     à la carte tab (the tab-strip is hidden when there's no upgrade
 *     quote to render)
 *   - count input is bound + clamped (min 1, max 50)
 *   - live preview math: 3 × $15 = $45/mo
 *   - upgrade-tab math (solo_total / pro_total / breakeven render)
 *   - submit triggers `api.billing.buySeats` with the right count
 *   - upgrade submit triggers `api.billing.upgradeToPro` with the right
 *     additional_seats (= max(0, total - pro_included_seats))
 *   - openWithContext({inviteeEmail}) renders "Onboard <email>" headline
 *   - Stripe Checkout link opens in a new tab via window.open
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

const getSeatsSpy = vi.spyOn(client.api.billing, "getSeats");
const buySeatsSpy = vi.spyOn(client.api.billing, "buySeats");
const upgradeSpy = vi.spyOn(client.api.billing, "upgradeToPro");
const openSpy = vi.fn();

beforeEach(() => {
  // jsdom doesn't ship window.open — stub it for the Stripe redirect.
  Object.defineProperty(window, "open", { value: openSpy, writable: true });
});

afterEach(() => {
  cleanup();
  getSeatsSpy.mockReset();
  buySeatsSpy.mockReset();
  upgradeSpy.mockReset();
  openSpy.mockReset();
  // Reset store between tests so `open` doesn't leak.
  act(() => {
    useBuySeatsModalStore.getState().close();
  });
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
    pro_upgrade_quote: {
      pro_included_seats: 5,
      pro_extra_seat_price_per_month_usd: 15,
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

  it("renders live preview math: 3 × $15 = $45/mo", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    render(<BuySeatsModalHost />);
    openModal();
    const input = (await screen.findByTestId("buy-seats-count")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });
    const preview = screen.getByTestId("buy-seats-preview");
    expect(preview.textContent).toMatch(/Total: 3 × \$15\.00 = \$45\.00\/mo/);
    expect(screen.getByTestId("buy-seats-submit").textContent).toMatch(
      /Add 3 seats for \$45\.00\/mo/,
    );
  });

  it("upgrade tab renders solo_total + pro_total + breakeven math", async () => {
    getSeatsSpy.mockResolvedValueOnce(
      seats({
        tier: "solo",
        included_seats: 1,
        total_seats: 6,
        active_seats: 6,
        pro_upgrade_quote: {
          pro_included_seats: 5,
          pro_extra_seat_price_per_month_usd: 15,
          breakeven_seats: 8,
        },
      }),
    );
    render(<BuySeatsModalHost />);
    openModal();
    const upgradeTab = await screen.findByTestId("buy-seats-tab-upgrade");
    fireEvent.click(upgradeTab);
    // 6 total seats, included=1, extras=5. Solo = 50 + 5*15 = 125; Pro = 150 + 1*15 = 165.
    const solo = await screen.findByTestId("buy-seats-solo-total");
    const pro = await screen.findByTestId("buy-seats-pro-total");
    expect(solo.textContent).toMatch(/\$125\.00\/mo/);
    expect(pro.textContent).toMatch(/\$165\.00\/mo/);
    expect(screen.getByTestId("buy-seats-breakeven").textContent).toMatch(
      /Breakeven at 8 seats/,
    );
  });

  it("submit calls api.billing.buySeats with the chosen count + opens Stripe", async () => {
    getSeatsSpy.mockResolvedValueOnce(seats({ tier: "solo" }));
    buySeatsSpy.mockResolvedValueOnce({
      additional_seats: 4,
      total_seats: 5,
      stripe_invoice_url: "https://billing.stripe.com/p/mock/test",
      tier: "solo",
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
      expect(openSpy).toHaveBeenCalledWith(
        "https://billing.stripe.com/p/mock/test",
        "_blank",
        "noopener,noreferrer",
      );
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
          pro_extra_seat_price_per_month_usd: 15,
          breakeven_seats: 8,
        },
      }),
    );
    upgradeSpy.mockResolvedValueOnce({
      checkout_url: "https://checkout.stripe.com/upgrade",
    });
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
      expect(openSpy).toHaveBeenCalledWith(
        "https://checkout.stripe.com/upgrade",
        "_blank",
        "noopener,noreferrer",
      );
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
