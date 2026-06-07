// @vitest-environment jsdom

/**
 * limit-error-toast — §7.10.5 unit tests for the 6 error-code mapping.
 *
 * Asserts each known code triggers a `toast.error(...)` and that
 * unknown codes pass through (return false).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { showLimitErrorToast } from "@/lib/billing/limit-error-toast";
import { ApiError } from "@/lib/api/client";

const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

afterEach(() => {
  toastError.mockReset();
});

describe("showLimitErrorToast", () => {
  it("returns false for non-ApiError", () => {
    expect(showLimitErrorToast(new Error("boom"))).toBe(false);
  });

  it("returns false for ApiError with an unhandled code", () => {
    expect(
      showLimitErrorToast(new ApiError(500, "internal", "Server error")),
    ).toBe(false);
  });

  it("handles credits_exhausted with remaining amount", () => {
    const err = new ApiError(
      402,
      "credits_exhausted",
      "Credits exhausted.",
      undefined,
      {
        credits_remaining_usd: "0.00",
        monthly_credit_usd: 25,
        tier: "solo",
        upgrade_url: "/settings/billing",
        topup_url: "/settings/billing",
      },
    );
    expect(showLimitErrorToast(err)).toBe(true);
    expect(toastError).toHaveBeenCalledTimes(1);
    const firstCall = toastError.mock.calls[0];
    expect(firstCall?.[0]).toMatch(/AI credits exhausted/);
  });

  it("handles spend_cap_reached with cap amount", () => {
    const err = new ApiError(402, "spend_cap_reached", "Spend cap reached.", undefined, {
      hard_cap_usd: 50,
      mtd_spend_usd: "50.00",
      tier: "solo",
    });
    expect(showLimitErrorToast(err)).toBe(true);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/Spend cap reached \(\$50\)/);
  });

  it("handles overage_not_enabled", () => {
    const err = new ApiError(
      402,
      "overage_not_enabled",
      "Enable overage.",
      undefined,
      {
        credits_remaining_usd: "0.00",
        overage_cap_usd: null,
        upgrade_url: "/settings/billing",
      },
    );
    expect(showLimitErrorToast(err)).toBe(true);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/overage is off/);
  });

  it("handles repo_limit_exceeded with count + limit", () => {
    const err = new ApiError(
      409,
      "repo_limit_exceeded",
      "Repo limit reached.",
      undefined,
      { current_count: 3, limit: 3, tier: "free", upgrade_url: "/settings/billing" },
    );
    expect(showLimitErrorToast(err)).toBe(true);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/Repo limit reached \(3\/3 on free\)/);
  });

  it("handles domain_limit_exceeded", () => {
    const err = new ApiError(
      409,
      "domain_limit_exceeded",
      "Cap limit reached.",
      undefined,
      { current_count: 3, limit: 3, tier: "free" },
    );
    expect(showLimitErrorToast(err)).toBe(true);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/Domain limit reached/);
  });

  it("handles repo_too_large", () => {
    const err = new ApiError(413, "repo_too_large", "Repo too large.", undefined, {
      total_size_mb: 75,
      limit_mb: 50,
      tier: "free",
      repo: "acme/api",
    });
    expect(showLimitErrorToast(err)).toBe(true);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/acme\/api/);
    expect(toastError.mock.calls[0]?.[0]).toMatch(/75 MB \(limit 50 MB\)/);
  });
});
