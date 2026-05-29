// @vitest-environment jsdom

/**
 * CreditHaltBanner — §7.10.5 row 2 unit tests.
 *
 * Asserts the three banner shapes (warning / exhausted / spend_cap)
 * fire under the right BE state and that only the warning variant is
 * dismissible per session.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CreditHaltBanner, __testing } from "@/components/billing/credit-halt-banner";
import * as client from "@/lib/api/client";
import type { CreditBalance } from "@/lib/api/client";

vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({
    status: "authenticated",
    session: null,
    me: null,
    activeOrgId: "org_test",
    setActiveOrgId: vi.fn(),
    refreshMe: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }),
}));

const getBalanceSpy = vi.spyOn(client.api.credits, "getBalance");

beforeEach(() => {
  __testing.resetCache();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  getBalanceSpy.mockReset();
});

function balance(extra: Partial<CreditBalance> = {}): CreditBalance {
  return {
    credits_remaining_usd: "25.00",
    monthly_credit_usd: 25,
    period_start: "2026-05-01T00:00:00Z",
    period_end: "2026-06-01T00:00:00Z",
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "0.00",
    over_80_pct_threshold: false,
    tier: "solo",
    ...extra,
  };
}

describe("CreditHaltBanner", () => {
  it("renders nothing for healthy state", async () => {
    getBalanceSpy.mockResolvedValueOnce(balance());
    const { container } = render(<CreditHaltBanner />);
    // No banner should appear — wait one microtask for the promise resolution.
    await waitFor(() => {
      expect(getBalanceSpy).toHaveBeenCalled();
    });
    expect(container.querySelector("[data-testid^='credit-halt-banner-']")).toBeNull();
  });

  it("renders warning banner at 80%, dismissible", async () => {
    getBalanceSpy.mockResolvedValueOnce(
      balance({
        credits_remaining_usd: "4.00",
        over_80_pct_threshold: true,
        mtd_spend_usd: "21.00",
      }),
    );
    render(<CreditHaltBanner />);
    await waitFor(() => {
      expect(screen.queryByTestId("credit-halt-banner-warning")).not.toBeNull();
    });
    expect(screen.queryByTestId("credit-halt-banner-dismiss")).not.toBeNull();
    fireEvent.click(screen.getByTestId("credit-halt-banner-dismiss"));
    await waitFor(() => {
      expect(screen.queryByTestId("credit-halt-banner-warning")).toBeNull();
    });
  });

  it("renders non-dismissible exhausted banner with role=alert", async () => {
    getBalanceSpy.mockResolvedValueOnce(
      balance({
        credits_remaining_usd: "0.00",
        overage_enabled: false,
        over_80_pct_threshold: true,
        mtd_spend_usd: "25.00",
      }),
    );
    render(<CreditHaltBanner />);
    await waitFor(() => {
      expect(screen.queryByTestId("credit-halt-banner-exhausted")).not.toBeNull();
    });
    const banner = screen.getByTestId("credit-halt-banner-exhausted");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(screen.queryByTestId("credit-halt-banner-dismiss")).toBeNull();
  });

  it("renders spend_cap banner when mtd_spend hits hard_cap", async () => {
    getBalanceSpy.mockResolvedValueOnce(
      balance({
        credits_remaining_usd: "5.00",
        hard_cap_usd: 50,
        mtd_spend_usd: "50.00",
      }),
    );
    render(<CreditHaltBanner />);
    await waitFor(() => {
      expect(screen.queryByTestId("credit-halt-banner-spend_cap")).not.toBeNull();
    });
    expect(screen.queryByTestId("credit-halt-banner-dismiss")).toBeNull();
  });
});
