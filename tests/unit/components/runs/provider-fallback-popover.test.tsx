// @vitest-environment jsdom

/**
 * ProviderFallbackPopover unit tests (readiness §3.1 row 812).
 *
 * Covers:
 *   - Renders the routes table with N rows when the routes list is
 *     populated.
 *   - Renders the empty-state copy when the routes list is empty.
 *   - Primary rows carry `data-role="primary"`; fallback rows carry
 *     `data-role="fallback"`.
 *   - Relative "Last activity" rendering surfaces (e.g. "0s ago" / "1m
 *     ago") for the row timestamp.
 *   - `fallback_from` text appears on rows that carry it and is dashed
 *     out (`—`) on rows that do not.
 *
 * Note: the repo does NOT depend on `@testing-library/jest-dom`, so these
 * tests use plain DOM property / attribute assertions.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ProviderFallbackPopover } from "@/components/runs/provider-fallback-popover";
import type { ProviderRoute } from "@/hooks/use-fallback-info";

describe("ProviderFallbackPopover", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the routes table with one row per route", () => {
    const routes: ProviderRoute[] = [
      { model: "claude-sonnet-4", primary: true, ts: new Date().toISOString(), calls: 5 },
      {
        model: "gpt-4o",
        primary: false,
        fallback_from: "claude-sonnet-4",
        ts: new Date().toISOString(),
        calls: 2,
      },
      {
        model: "gemini-2-flash",
        primary: false,
        fallback_from: "gpt-4o",
        ts: new Date().toISOString(),
        calls: 1,
      },
    ];
    render(<ProviderFallbackPopover routes={routes} />);
    expect(screen.queryByTestId("provider-fallback-table")).not.toBeNull();
    expect(screen.getAllByTestId("provider-fallback-row")).toHaveLength(3);
  });

  it("renders the empty-state copy when routes is empty", () => {
    render(<ProviderFallbackPopover routes={[]} />);
    const empty = screen.getByTestId("provider-fallback-empty");
    expect(empty.textContent?.toLowerCase()).toContain(
      "no provider routing data",
    );
    expect(screen.queryByTestId("provider-fallback-table")).toBeNull();
  });

  it("distinguishes primary rows from fallback rows via data-role", () => {
    const routes: ProviderRoute[] = [
      { model: "claude-sonnet-4", primary: true, ts: new Date().toISOString(), calls: 3 },
      {
        model: "gpt-4o",
        primary: false,
        fallback_from: "claude-sonnet-4",
        ts: new Date().toISOString(),
        calls: 1,
      },
    ];
    render(<ProviderFallbackPopover routes={routes} />);
    const rows = screen.getAllByTestId("provider-fallback-row");
    expect(rows[0]!.getAttribute("data-role")).toBe("primary");
    expect(rows[1]!.getAttribute("data-role")).toBe("fallback");
  });

  it("renders a relative 'Last activity' value for the row timestamp", () => {
    const routes: ProviderRoute[] = [
      {
        model: "claude-sonnet-4",
        primary: true,
        ts: new Date(Date.now() - 60_000).toISOString(),
        calls: 1,
      },
    ];
    render(<ProviderFallbackPopover routes={routes} />);
    // formatRelativeTime renders a minutes-ago suffix; assert the units
    // landed rather than the exact int (Date.now is wall-clock dependent).
    const row = screen.getByTestId("provider-fallback-row");
    expect(row.textContent).toMatch(/\d+(s|m|h|d) ago|just now/i);
  });

  it("renders fallback_from on fallback rows and a dash on primary rows", () => {
    const routes: ProviderRoute[] = [
      { model: "claude-sonnet-4", primary: true, ts: new Date().toISOString(), calls: 3 },
      {
        model: "gpt-4o",
        primary: false,
        fallback_from: "claude-sonnet-4",
        ts: new Date().toISOString(),
        calls: 1,
      },
    ];
    render(<ProviderFallbackPopover routes={routes} />);
    const rows = screen.getAllByTestId("provider-fallback-row");
    // Primary row: dashed out.
    expect(rows[0]!.textContent).toContain("—");
    // Fallback row: surfaces the upstream model id.
    expect(rows[1]!.textContent).toContain("claude-sonnet-4");
  });
});
