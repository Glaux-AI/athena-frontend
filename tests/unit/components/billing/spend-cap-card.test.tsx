// @vitest-environment jsdom

/**
 * SpendCapCard — §7.10.5 row 3 unit tests.
 *
 * Covers the set + clear flow + the owner-only disabled-input guard.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { SpendCapCard } from "@/components/billing/spend-cap-card";
import * as client from "@/lib/api/client";
import type { CreditBalance } from "@/lib/api/client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const setSpendCapSpy = vi.spyOn(client.api.credits, "setSpendCap");

afterEach(() => {
  cleanup();
  setSpendCapSpy.mockReset();
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

describe("SpendCapCard", () => {
  it("renders 'No cap set' when hard_cap_usd is null", () => {
    render(
      <SpendCapCard
        balance={balance()}
        orgId="org_test"
        isOwner
        onUpdated={() => {}}
      />,
    );
    expect(screen.getByTestId("spend-cap-current").textContent).toMatch(/No cap set/);
  });

  it("renders current cap when hard_cap_usd is set", () => {
    render(
      <SpendCapCard
        balance={balance({ hard_cap_usd: 100 })}
        orgId="org_test"
        isOwner
        onUpdated={() => {}}
      />,
    );
    expect(screen.getByTestId("spend-cap-current").textContent).toMatch(/Cap: \$100\.00/);
  });

  it("saves a new cap when owner enters a value and clicks Save", async () => {
    setSpendCapSpy.mockResolvedValueOnce(undefined);
    const onUpdated = vi.fn();
    render(
      <SpendCapCard
        balance={balance()}
        orgId="org_test"
        isOwner
        onUpdated={onUpdated}
      />,
    );
    fireEvent.click(screen.getByTestId("spend-cap-edit"));
    const input = screen.getByTestId("spend-cap-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.click(screen.getByTestId("spend-cap-save"));
    await waitFor(() => {
      expect(setSpendCapSpy).toHaveBeenCalledWith("org_test", { cap_usd: 150 });
    });
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  it("clears the cap on Clear", async () => {
    setSpendCapSpy.mockResolvedValueOnce(undefined);
    render(
      <SpendCapCard
        balance={balance({ hard_cap_usd: 100 })}
        orgId="org_test"
        isOwner
        onUpdated={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("spend-cap-clear"));
    await waitFor(() => {
      expect(setSpendCapSpy).toHaveBeenCalledWith("org_test", { cap_usd: null });
    });
  });

  it("disables inputs for non-owners", () => {
    render(
      <SpendCapCard
        balance={balance()}
        orgId="org_test"
        isOwner={false}
        onUpdated={() => {}}
      />,
    );
    const edit = screen.getByTestId("spend-cap-edit") as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
  });
});
