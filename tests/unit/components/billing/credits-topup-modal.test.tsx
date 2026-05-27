// @vitest-environment jsdom

/**
 * CreditsTopupModal — §7.10.5 row 5 unit tests.
 *
 * Validates the min/max amount clamp + Stripe-checkout open call. Polling
 * loop is not exercised here (lives in the e2e suite); we focus on the
 * submit path + the disabled-on-invalid-amount guard.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CreditsTopupModal } from "@/components/billing/credits-topup-modal";
import * as client from "@/lib/api/client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const topupSpy = vi.spyOn(client.api.credits, "topup");
const openSpy = vi.fn();

afterEach(() => {
  cleanup();
  topupSpy.mockReset();
  openSpy.mockReset();
});

describe("CreditsTopupModal", () => {
  it("renders with default amount $25", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        onTopupReturn={() => {}}
      />,
    );
    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    expect(input.value).toBe("25");
    expect(screen.getByTestId("credits-topup-preview").textContent).toMatch(
      /Adding \$25\.00 to your balance/,
    );
  });

  it("renders free-tier copy", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="free"
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
        onTopupReturn={() => {}}
      />,
    );
    expect(screen.getByText(/Credit rolls over month-to-month/)).not.toBeNull();
  });

  it("clamps + submits the API call with valid amount", async () => {
    topupSpy.mockResolvedValueOnce({
      checkout_url: "https://checkout.stripe.com/test",
    });
    // jsdom doesn't ship window.open — stub it.
    Object.defineProperty(window, "open", { value: openSpy, writable: true });

    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        onTopupReturn={() => {}}
      />,
    );

    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("credits-topup-submit"));

    await waitFor(() => {
      expect(topupSpy).toHaveBeenCalledWith("org_test", { amount_usd: 50 });
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://checkout.stripe.com/test",
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  it("disables submit when amount is below minimum", () => {
    render(
      <CreditsTopupModal
        open
        onOpenChange={() => {}}
        orgId="org_test"
        tier="solo"
        onTopupReturn={() => {}}
      />,
    );
    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
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
        onTopupReturn={() => {}}
      />,
    );
    const input = screen.getByTestId("credits-topup-amount") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000" } });
    const submit = screen.getByTestId("credits-topup-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
