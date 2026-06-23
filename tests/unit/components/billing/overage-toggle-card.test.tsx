// @vitest-environment jsdom

/**
 * OverageToggleCard - §7.10.5 row 4 unit tests.
 *
 * Covers the toggle save flow + the 409 `payment_method_required`
 * inline-error path (the readiness's "add a card first" branch).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { OverageToggleCard } from "@/components/billing/overage-toggle-card";
import * as client from "@/lib/api/client";
import type { CreditBalance } from "@/lib/api/client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const configureOverageSpy = vi.spyOn(client.api.credits, "configureOverage");

afterEach(() => {
  cleanup();
  configureOverageSpy.mockReset();
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

describe("OverageToggleCard", () => {
  it("saves with enabled=true and a cap amount", async () => {
    configureOverageSpy.mockResolvedValueOnce(undefined);
    const onUpdated = vi.fn();
    render(
      <OverageToggleCard
        balance={balance()}
        orgId="org_test"
        isOwner
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByTestId("overage-toggle"));
    const capInput = (await screen.findByTestId("overage-cap-input")) as HTMLInputElement;
    // The user enters USD; $50 → cap_usd 50 to the API.
    fireEvent.change(capInput, { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("overage-save"));
    await waitFor(() => {
      expect(configureOverageSpy).toHaveBeenCalledWith("org_test", {
        enabled: true,
        cap_usd: 50,
      });
    });
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  it("renders inline payment_method_required error", async () => {
    configureOverageSpy.mockRejectedValueOnce(
      new client.ApiError(
        409,
        "payment_method_required",
        "Add a payment method first.",
      ),
    );
    render(
      <OverageToggleCard
        balance={balance()}
        orgId="org_test"
        isOwner
        onUpdated={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("overage-toggle"));
    fireEvent.click(screen.getByTestId("overage-save"));
    await waitFor(() => {
      expect(screen.queryByTestId("overage-payment-method-error")).not.toBeNull();
    });
  });

  it("disables save for non-owners", () => {
    render(
      <OverageToggleCard
        balance={balance()}
        orgId="org_test"
        isOwner={false}
        onUpdated={() => {}}
      />,
    );
    const save = screen.getByTestId("overage-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
