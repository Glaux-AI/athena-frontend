// @vitest-environment jsdom

/**
 * FreeOnboardingCard — §7.10.5 unit tests.
 *
 * The card itself is unconditional (parent gates on tier === "free");
 * we assert the three CTAs render with the expected labels.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { FreeOnboardingCard } from "@/components/billing/free-onboarding-card";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  cleanup();
});

describe("FreeOnboardingCard", () => {
  it("renders the welcome card with the Free-tier repo limit (capabilities unlimited)", () => {
    render(<FreeOnboardingCard orgId="org_test" onTopupReturn={() => {}} />);
    expect(screen.queryByTestId("free-onboarding-card")).not.toBeNull();
    expect(screen.getByText(/5 repos \(up to 50 MB each\)/)).not.toBeNull();
    expect(screen.getByText(/Unlimited capabilities/)).not.toBeNull();
  });

  it("renders BYO + topup + upgrade CTAs", () => {
    render(<FreeOnboardingCard orgId="org_test" onTopupReturn={() => {}} />);
    expect(screen.queryByTestId("free-onboarding-byo")).not.toBeNull();
    expect(screen.queryByTestId("free-onboarding-topup")).not.toBeNull();
    expect(screen.queryByTestId("free-onboarding-upgrade")).not.toBeNull();
  });
});
