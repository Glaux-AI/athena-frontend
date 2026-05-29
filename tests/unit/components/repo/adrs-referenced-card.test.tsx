// @vitest-environment jsdom

/**
 * AdrsReferencedCard unit tests — covers populated + empty-state branches
 * for the per-repo ADR-references list on the Topology tab.
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AdrsReferencedCard } from "@/components/repo/adrs-referenced-card";
import type { AdrRef } from "@/lib/api/client";

const ADR: AdrRef = {
  id: "adr_014",
  title: "ADR-014 · Soft-delete lifecycle",
  date: "2026-04-10",
  status: "accepted",
  path: "docs/adr/ADR-014.md",
};

describe("AdrsReferencedCard", () => {
  it("renders each ADR with title, path, status, and date", () => {
    cleanup();
    render(<AdrsReferencedCard adrs={[ADR]} />);
    expect(screen.getByTestId("repo-adrs-referenced")).toBeTruthy();
    // Title + path both contain "ADR-014" → use getAllByText for robustness.
    expect(screen.getAllByText(/ADR-014/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2026-04-10/)).toBeTruthy();
    expect(screen.getByText(/^accepted$/i)).toBeTruthy();
    expect(screen.getByText(/docs\/adr\/ADR-014\.md/)).toBeTruthy();
  });

  it("renders empty state when no ADRs are referenced", () => {
    cleanup();
    render(<AdrsReferencedCard adrs={[]} />);
    expect(screen.getByText(/no adrs referenced by this repo/i)).toBeTruthy();
    expect(screen.queryByTestId("repo-adrs-referenced")).toBeNull();
  });

  it("shows the count in the header", () => {
    cleanup();
    render(
      <AdrsReferencedCard
        adrs={[
          ADR,
          { ...ADR, id: "adr_015", title: "ADR-015" },
          { ...ADR, id: "adr_016", title: "ADR-016", status: "proposed" },
        ]}
      />,
    );
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/^proposed$/i)).toBeTruthy();
  });
});
