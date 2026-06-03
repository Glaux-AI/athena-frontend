// @vitest-environment jsdom

/**
 * CreditsTopupModal — §7.10.5 row 5 unit tests (ADR-081).
 *
 * Validates the min/max amount clamp + the Razorpay Checkout.js open call.
 * The balance poll is mocked here (lives in the e2e suite); we focus on the
 * submit path + the disabled-on-invalid-amount guard.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CreditsTopupModal } from "@/components/billing/credits-topup-modal";
import * as client from "@/lib/api/client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

// Stub the Razorpay Checkout.js wrapper so the modal's submit path runs
// without loading the real hosted script.
const openCheckoutSpy = vi.fn();
vi.mock("@/lib/billing/razorpay-checkout", () => ({
  openRazorpayCheckout: (args: unknown) => openCheckoutSpy(args),
}));

// Stub the post-payment balance poll so it resolves immediately.
const pollSpy = vi.fn();
vi.mock("@/components/billing/use-topup-return-poll", () => ({
  pollCreditBalanceIncrease: (...args: unknown[]) => pollSpy(...args),
}));

const topupSpy = vi.spyOn(client.api.credits, "topup");

afterEach(() => {
  cleanup();
  topupSpy.mockReset();
  openCheckoutSpy.mockReset();
  pollSpy.mockReset();
});

describe("CreditsTopupModal", () => {
  it("renders with default amount ₹2,500 ($25 at rate 100)", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        usdToInr={100}
        onTopupReturn={() => {}}
      />,
    );
    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    // Input is in rupees: default $25 × 100 = ₹2,500.
    expect(input.value).toBe("2500");
    expect(screen.getByTestId("credits-topup-preview").textContent).toMatch(
      /Adding ₹2,500 to your balance/,
    );
  });

  it("renders free-tier copy", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="free"
        usdToInr={100}
        onTopupReturn={() => {}}
      />,
    );
    expect(screen.getByText(/Topup credit lets you use platform models on Free/)).not.toBeNull();
  });

  it("renders solo rollover copy", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        usdToInr={100}
        onTopupReturn={() => {}}
      />,
    );
    expect(screen.getByText(/Credit rolls over month-to-month/)).not.toBeNull();
  });

  it("clamps + submits the API call then opens Razorpay Checkout", async () => {
    const order = {
      order_id: "order_mock_credit_topup_x",
      razorpay_key_id: "rzp_test_mock",
      amount: 500000,
      currency: "INR",
      purchase: "credit_topup",
      checkout_options: { order_id: "order_mock_credit_topup_x", currency: "INR" },
    };
    topupSpy.mockResolvedValueOnce(order);
    openCheckoutSpy.mockResolvedValueOnce({
      status: "verified",
      orderId: order.order_id,
      paymentId: "pay_x",
    });
    pollSpy.mockResolvedValueOnce(true);

    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        usdToInr={100}
        onTopupReturn={() => {}}
      />,
    );

    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    // The user enters rupees; ₹5,000 at rate 100 → amount_usd 50 to the API.
    fireEvent.change(input, { target: { value: "5000" } });
    fireEvent.click(screen.getByTestId("credits-topup-submit"));

    await waitFor(() => {
      expect(topupSpy).toHaveBeenCalledWith("org_test", { amount_usd: 50 });
    });
    await waitFor(() => {
      expect(openCheckoutSpy).toHaveBeenCalledWith({ order });
    });
  });

  it("disables submit when amount is below minimum", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        usdToInr={100}
        onTopupReturn={() => {}}
      />,
    );
    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    // ₹500 at rate 100 → $5, below the $10 minimum.
    fireEvent.change(input, { target: { value: "500" } });
    const submit = screen.getByTestId("credits-topup-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("disables submit when amount exceeds maximum", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        usdToInr={100}
        onTopupReturn={() => {}}
      />,
    );
    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    // ₹200,000 at rate 100 → $2,000, above the $1,000 maximum.
    fireEvent.change(input, { target: { value: "200000" } });
    const submit = screen.getByTestId("credits-topup-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
