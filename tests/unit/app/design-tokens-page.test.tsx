// @vitest-environment jsdom

/**
 * /design-tokens page - list behaviour over the mock backend (the in-process
 * handlers seed two systems). Pins the org-scale list affordances: name /
 * description search, origin filter chips, and the updated_at stamp.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/design-tokens",
  useSearchParams: () => ({ get: () => null }),
}));

import DesignTokensPage from "@/app/(protected)/design-tokens/page";

afterEach(cleanup);

describe("DesignTokensPage", () => {
  it("lists the org's design systems with origin chips and updated stamps", async () => {
    render(<DesignTokensPage />);
    expect(await screen.findByText("Lumen Editorial")).toBeTruthy();
    expect(screen.getByText("Lumen App Shell")).toBeTruthy();
    // Origin chips render per card.
    expect(screen.getByText("manual")).toBeTruthy();
    expect(screen.getByText("extracted")).toBeTruthy();
    // Absolute datetime (org convention), not a relative "3d ago".
    expect(screen.getAllByText(/updated .*2026/).length).toBeGreaterThan(0);
  });

  it("filters the list by name/description search", async () => {
    render(<DesignTokensPage />);
    await screen.findByText("Lumen Editorial");
    fireEvent.change(screen.getByLabelText("Search design systems"), {
      target: { value: "app shell" },
    });
    await waitFor(() => expect(screen.queryByText("Lumen Editorial")).toBeNull());
    expect(screen.getByText("Lumen App Shell")).toBeTruthy();

    // No matches surfaces the filtered empty state, not a blank column.
    fireEvent.change(screen.getByLabelText("Search design systems"), {
      target: { value: "zzz-not-a-system" },
    });
    expect(await screen.findByText("No matches")).toBeTruthy();
  });

  it("filters the list by origin chips", async () => {
    render(<DesignTokensPage />);
    await screen.findByText("Lumen Editorial");
    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    await waitFor(() => expect(screen.queryByText("Lumen App Shell")).toBeNull());
    expect(screen.getByText("Lumen Editorial")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("Lumen App Shell")).toBeTruthy();
  });
});
