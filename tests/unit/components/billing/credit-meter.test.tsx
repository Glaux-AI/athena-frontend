// @vitest-environment jsdom

/**
 * CreditMeter — §7.10.5 row 1 unit tests.
 *
 * Renders all 5 states (healthy / warning / exhausted / overage /
 * free-zero) and asserts the headline + sub-line copy matches the
 * readiness spec. The 5-way state derivation lives in
 * `deriveCreditState()` so the halt banner shares the same logic.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { CreditMeter, deriveCreditState } from "@/components/billing/credit-meter";
import type { CreditBalance } from "@/lib/api/client";

// Sonner toast — stub out to keep specs deterministic.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
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
    usd_to_inr: 100,
    ...extra,
  };
}

describe("deriveCreditState", () => {
  it("returns 'healthy' for solo with full credit", () => {
    expect(deriveCreditState(balance())).toBe("healthy");
  });
  it("returns 'warning' when over_80_pct_threshold is true", () => {
    expect(
      deriveCreditState(
        balance({ credits_remaining_usd: "4.00", over_80_pct_threshold: true }),
      ),
    ).toBe("warning");
  });
  it("returns 'exhausted' when remaining <= 0 and overage off", () => {
    expect(
      deriveCreditState(
        balance({
          credits_remaining_usd: "0.00",
          overage_enabled: false,
          over_80_pct_threshold: true,
        }),
      ),
    ).toBe("exhausted");
  });
  it("returns 'in_overage' when remaining < 0 and overage on", () => {
    expect(
      deriveCreditState(
        balance({
          credits_remaining_usd: "-10.00",
          overage_enabled: true,
        }),
      ),
    ).toBe("in_overage");
  });
  it("returns 'free_zero' when tier is free and remaining is 0", () => {
    expect(
      deriveCreditState(
        balance({
          tier: "free",
          credits_remaining_usd: "0.00",
          monthly_credit_usd: 0,
        }),
      ),
    ).toBe("free_zero");
  });
});

describe("CreditMeter", () => {
  it("renders healthy state with $X of $Y available", () => {
    render(
      <CreditMeter balance={balance()} orgId="org_test" onRefresh={() => {}} />,
    );
    const headline = screen.getByTestId("credit-meter-headline");
    // USD ledger ($25 of $25) displayed in INR at rate 100.
    expect(headline.textContent).toMatch(/₹2,500 of ₹2,500 available/);
    expect(screen.getByTestId("credit-meter-subline").textContent).toMatch(/Refreshes/);
  });

  it("renders warning state with 80% consumed copy", () => {
    render(
      <CreditMeter
        balance={balance({ credits_remaining_usd: "4.00", over_80_pct_threshold: true })}
        orgId="org_test"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByTestId("credit-meter-headline").textContent).toMatch(
      /80% consumed/,
    );
    expect(screen.getByTestId("credit-meter-subline").textContent).toMatch(
      /Top up to avoid interruption/,
    );
  });

  it("renders exhausted state with red headline + enable-overage link", () => {
    render(
      <CreditMeter
        balance={balance({
          credits_remaining_usd: "0.00",
          overage_enabled: false,
          over_80_pct_threshold: true,
        })}
        orgId="org_test"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByTestId("credit-meter-headline").textContent).toMatch(
      /AI credits exhausted/,
    );
    expect(screen.queryByTestId("credit-meter-enable-overage")).not.toBeNull();
  });

  it("renders overage state with consumed-past-plan copy + manage link", () => {
    render(
      <CreditMeter
        balance={balance({
          credits_remaining_usd: "-10.00",
          overage_enabled: true,
        })}
        orgId="org_test"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByTestId("credit-meter-headline").textContent).toMatch(
      /On overage: ₹1,000 consumed past plan/,
    );
    expect(screen.queryByTestId("credit-meter-manage-overage")).not.toBeNull();
  });

  it("renders free-zero with BYO key link", () => {
    render(
      <CreditMeter
        balance={balance({
          tier: "free",
          credits_remaining_usd: "0.00",
          monthly_credit_usd: 0,
        })}
        orgId="org_test"
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByTestId("credit-meter-headline").textContent).toMatch(
      /No credit included on Free plan/,
    );
    expect(screen.queryByTestId("credit-meter-configure-byo")).not.toBeNull();
  });

  it("opens topup modal on top-up CTA click", () => {
    render(
      <CreditMeter balance={balance()} orgId="org_test" onRefresh={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("credit-meter-topup"));
    expect(screen.queryByTestId("credits-topup-modal")).not.toBeNull();
  });
});
