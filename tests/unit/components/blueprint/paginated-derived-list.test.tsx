// @vitest-environment jsdom

/**
 * PaginatedDerivedList - fetches whole-dataset pages from
 * `api.knowledge.derivedList` and drives the pager. Pins: page-0 fetch on
 * mount, the instant initialItems render, the "pager only when total > one
 * page" rule, next-page → new offset, and page-size change → new limit + reset
 * to page 0.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { DerivedItem } from "@/lib/api/client";

const derivedList = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: { knowledge: { derivedList: (...a: unknown[]) => derivedList(...a) } },
}));

import { PaginatedDerivedList } from "@/components/blueprint/paginated-derived-list";

const item = (i: number): DerivedItem => ({
  node_id: `n${i}`,
  name: `item ${i}`,
  kind: "api_endpoint",
  path: null,
  headline: null,
});
const page = (items: DerivedItem[], total: number, offset = 0, limit = 10) => ({ items, total, offset, limit });
const fill = (n: number, base = 0) => Array.from({ length: n }, (_, i) => item(base + i));
const renderRow = (it: DerivedItem) => <div key={it.node_id}>{it.name}</div>;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PaginatedDerivedList", () => {
  it("fetches page 0 on mount and renders rows; no pager when it fits one page", async () => {
    derivedList.mockResolvedValue(page([item(0), item(1)], 2));
    render(
      <PaginatedDerivedList scope="repo" scopeId="r1" listKey="api_surface" initialItems={[]} renderItem={renderRow} />,
    );
    await waitFor(() => expect(screen.getByText("item 0")).toBeTruthy());
    expect(derivedList).toHaveBeenCalledWith({ scope: "repo", scopeId: "r1", list: "api_surface", offset: 0, limit: 10 });
    expect(screen.queryByTestId("pagination-summary")).toBeNull(); // total 2 ≤ 10
  });

  it("shows the pager when total exceeds one default page and pages forward", async () => {
    derivedList.mockResolvedValue(page(fill(10), 137));
    render(
      <PaginatedDerivedList scope="repo" scopeId="r1" listKey="api_surface" initialItems={[]} renderItem={renderRow} />,
    );
    await waitFor(() => expect(screen.getByTestId("pagination-summary")).toBeTruthy());
    expect(screen.getByTestId("pagination-summary").textContent).toContain("of 137");

    derivedList.mockResolvedValue(page(fill(10, 10), 137));
    fireEvent.click(screen.getByTestId("pagination-next"));
    await waitFor(() =>
      expect(derivedList).toHaveBeenLastCalledWith({ scope: "repo", scopeId: "r1", list: "api_surface", offset: 10, limit: 10 }),
    );
  });

  it("changing page size refetches with the new limit and resets to page 0", async () => {
    derivedList.mockResolvedValue(page(fill(10), 137));
    render(
      <PaginatedDerivedList scope="domain" scopeId="c1" listKey="services" initialItems={[]} renderItem={renderRow} />,
    );
    await waitFor(() => expect(screen.getByTestId("pagination-page-size")).toBeTruthy());

    fireEvent.click(screen.getByTestId("pagination-next"));
    await waitFor(() => expect(derivedList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 })));

    derivedList.mockResolvedValue(page(fill(50), 137));
    fireEvent.change(screen.getByTestId("pagination-page-size"), { target: { value: "50" } });
    await waitFor(() =>
      expect(derivedList).toHaveBeenLastCalledWith({ scope: "domain", scopeId: "c1", list: "services", offset: 0, limit: 50 }),
    );
  });

  it("renders initialItems instantly for page 0 before the fetch resolves", async () => {
    let resolve: (v: unknown) => void = () => {};
    derivedList.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(
      <PaginatedDerivedList scope="repo" scopeId="r1" listKey="api_surface" initialItems={[item(99)]} renderItem={renderRow} />,
    );
    expect(screen.getByText("item 99")).toBeTruthy(); // instant, from initialItems
    resolve(page([item(0)], 1));
    await waitFor(() => expect(screen.getByText("item 0")).toBeTruthy());
  });
});
