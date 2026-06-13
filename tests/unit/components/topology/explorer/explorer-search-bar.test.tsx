// @vitest-environment jsdom

/**
 * ExplorerSearchBar - the click/Enter → `select` seam. React Flow node clicks
 * don't fire headless, so the search bar is the jsdom-testable input that proves
 * a pick drives the shared selection (with a stub for an off-graph hit).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const selectMock = vi.fn();
const searchState = { data: null as unknown, loading: false, error: null as string | null };

vi.mock("@/components/topology/explorer/explorer-store", () => ({
  useExplorer: () => ({ graph: { nodes: new Map() }, select: selectMock }),
}));
vi.mock("@/features/search/use-knowledge-search", () => ({
  useKnowledgeSearch: () => searchState,
}));

import { ExplorerSearchBar } from "@/components/topology/explorer/explorer-search-bar";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  searchState.data = {
    query: "che", mode: "hybrid",
    items: [
      { id: "file1", kind: "node", node_kind: "file", overlay_kind: null, name: "checkout.ts", path: "svc/checkout.ts", summary: "", layer: "service", language: "ts", tags: [], repo_id: "r1", repo_full_name: "x", domain_id: null, score: 1, score_basis: "rrf" },
    ],
    totals: { matched: 1, returned: 1 }, freshness: "fresh", search_quality: "exact",
  };
});

describe("ExplorerSearchBar", () => {
  it("selecting a result calls select(id, {stub}) with the item's identity", () => {
    render(<ExplorerSearchBar scope="repo" repoId="r1" />);
    fireEvent.change(screen.getByTestId("explorer-search-input"), { target: { value: "che" } });
    fireEvent.click(screen.getByText("checkout.ts"));
    expect(selectMock).toHaveBeenCalledTimes(1);
    const [id, opts] = selectMock.mock.calls[0]!;
    expect(id).toBe("file1");
    expect(opts.stub).toMatchObject({ id: "file1", node_kind: "file", name: "checkout.ts", repo_id: "r1" });
  });

  it("Enter selects the active (first) result", () => {
    render(<ExplorerSearchBar scope="repo" repoId="r1" />);
    const input = screen.getByTestId("explorer-search-input");
    fireEvent.change(input, { target: { value: "che" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(selectMock).toHaveBeenCalledWith("file1", expect.objectContaining({ stub: expect.any(Object) }));
  });

  it("hides the result list below 2 query chars", () => {
    render(<ExplorerSearchBar scope="repo" repoId="r1" />);
    fireEvent.change(screen.getByTestId("explorer-search-input"), { target: { value: "c" } });
    expect(screen.queryByTestId("explorer-search-results")).toBeNull();
  });
});
