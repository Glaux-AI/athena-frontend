/**
 * api.credits namespace — round-trip tests through the mock handler.
 *
 * Asserts the four endpoints (getBalance / topup / configureOverage /
 * setSpendCap) hit the right mock routes and return the right shapes
 * for the 7 named fixtures.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api } from "@/lib/api/client";

const ACTIVE_ORG_KEY = "athena.activeOrgId";

function setActiveOrg(orgId: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
  }
}

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

describe("api.credits.getBalance — 7 fixtures", () => {
  const tierCases: Array<[string, string]> = [
    ["free-no-credit", "free"],
    ["free-with-byo", "free"],
    ["solo-healthy", "solo"],
    ["solo-warning", "solo"],
    ["solo-halted", "solo"],
    ["solo-overage", "solo"],
    ["solo-spend-cap-hit", "solo"],
  ];
  for (const [orgId, expectedTier] of tierCases) {
    it(`returns tier '${expectedTier}' for orgId '${orgId}'`, async () => {
      setActiveOrg(orgId);
      const b = await api.credits.getBalance(orgId);
      expect(b.tier).toBe(expectedTier);
    });
  }

  it("solo-warning has over_80_pct_threshold === true", async () => {
    setActiveOrg("solo-warning");
    const b = await api.credits.getBalance("solo-warning");
    expect(b.over_80_pct_threshold).toBe(true);
  });

  it("solo-halted has remaining $0 + overage disabled", async () => {
    setActiveOrg("solo-halted");
    const b = await api.credits.getBalance("solo-halted");
    expect(Number(b.credits_remaining_usd)).toBe(0);
    expect(b.overage_enabled).toBe(false);
  });

  it("solo-overage has negative remaining + overage enabled + cap", async () => {
    setActiveOrg("solo-overage");
    const b = await api.credits.getBalance("solo-overage");
    expect(Number(b.credits_remaining_usd)).toBeLessThan(0);
    expect(b.overage_enabled).toBe(true);
    expect(b.overage_cap_usd).toBe(50);
  });

  it("solo-spend-cap-hit has mtd_spend >= hard_cap", async () => {
    setActiveOrg("solo-spend-cap-hit");
    const b = await api.credits.getBalance("solo-spend-cap-hit");
    expect(b.hard_cap_usd).toBe(50);
    expect(Number(b.mtd_spend_usd)).toBe(50);
  });
});

describe("api.credits mutations round-trip", () => {
  it("topup returns a Razorpay order payload", async () => {
    setActiveOrg("solo-healthy");
    const r = await api.credits.topup("solo-healthy", { amount_usd: 50 });
    expect(r.order_id).toMatch(/^order_mock_credit_topup/);
    expect(r.razorpay_key_id).toBe("rzp_test_mock");
    expect(r.currency).toBe("INR");
    // 50 USD × 100 (usd_to_inr) × 100 (paise subunit) = 500000 paise.
    expect(r.amount).toBe(500000);
    expect(r.checkout_options).toMatchObject({ order_id: r.order_id, currency: "INR" });
  });

  it("configureOverage updates fixture state", async () => {
    setActiveOrg("solo-healthy");
    await api.credits.configureOverage("solo-healthy", {
      enabled: true,
      cap_usd: 100,
    });
    const after = await api.credits.getBalance("solo-healthy");
    expect(after.overage_enabled).toBe(true);
    expect(after.overage_cap_usd).toBe(100);
  });

  it("setSpendCap updates + clears fixture state", async () => {
    setActiveOrg("solo-warning");
    await api.credits.setSpendCap("solo-warning", { cap_usd: 75 });
    let after = await api.credits.getBalance("solo-warning");
    expect(after.hard_cap_usd).toBe(75);

    await api.credits.setSpendCap("solo-warning", { cap_usd: null });
    after = await api.credits.getBalance("solo-warning");
    expect(after.hard_cap_usd).toBeNull();
  });
});
