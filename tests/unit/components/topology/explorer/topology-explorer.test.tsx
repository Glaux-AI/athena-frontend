// @vitest-environment jsdom

/**
 * TopologyExplorer - full-screen layout contract. The children are mocked so
 * the test exercises only the orchestrator: clicking the graph's full-screen
 * toggle lifts the surface into the fixed overlay (graph left / detail docked
 * right, structure tree hidden) and Escape brings it back. The seam that keeps
 * the live graph from remounting (its stable tree position) is a structural
 * invariant of the JSX, asserted indirectly here by the layout swap.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { Seed } from "@/components/topology/explorer/explorer-graph";

vi.mock("@/components/topology/explorer/explorer-store", () => ({
  ExplorerProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="provider">{children}</div>,
}));
vi.mock("@/components/topology/explorer/explorer-search-bar", () => ({
  ExplorerSearchBar: () => <div data-testid="mock-search">search</div>,
}));
vi.mock("@/components/topology/explorer/explorer-graph-panel", () => ({
  ExplorerGraphPanel: ({ fullscreen, onToggleFullscreen }: { fullscreen?: boolean; onToggleFullscreen?: () => void }) => (
    <button
      type="button"
      data-testid="mock-graph-fs"
      data-fs={fullscreen ? "1" : "0"}
      onClick={() => onToggleFullscreen?.()}
    >
      graph
    </button>
  ),
}));
vi.mock("@/components/topology/explorer/explorer-detail-panel", () => ({
  ExplorerDetailPanel: () => <div data-testid="mock-detail">detail</div>,
}));
vi.mock("@/components/topology/explorer/containment-tree", () => ({
  ContainmentTree: () => <div data-testid="mock-tree">tree</div>,
}));

import { TopologyExplorer } from "@/components/topology/explorer/topology-explorer";

const seed = {} as unknown as Seed;

beforeEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("TopologyExplorer full screen", () => {
  it("renders the normal layout (structure tree + detail, not full screen) by default", () => {
    render(<TopologyExplorer seed={seed} scope="repo" repoId="r1" />);
    const root = screen.getByTestId("topology-explorer");
    expect(root.hasAttribute("data-fullscreen")).toBe(false);
    expect(root.getAttribute("role")).toBeNull();
    expect(screen.queryByTestId("mock-tree")).not.toBeNull();
    expect(screen.queryByTestId("mock-detail")).not.toBeNull();
    expect(screen.getByTestId("mock-graph-fs").getAttribute("data-fs")).toBe("0");
  });

  it("the graph's full-screen toggle lifts the surface into the overlay, docking detail and hiding the tree", () => {
    render(<TopologyExplorer seed={seed} scope="repo" repoId="r1" />);
    fireEvent.click(screen.getByTestId("mock-graph-fs"));

    const root = screen.getByTestId("topology-explorer");
    expect(root.hasAttribute("data-fullscreen")).toBe(true);
    expect(root.getAttribute("role")).toBe("dialog");
    expect(root.getAttribute("aria-modal")).toBe("true");
    // structure tree is replaced by the detail panel in the aside
    expect(screen.queryByTestId("mock-tree")).toBeNull();
    expect(screen.queryByTestId("mock-detail")).not.toBeNull();
    // the graph is told it's full screen (→ fill height + minimise icon)
    expect(screen.getByTestId("mock-graph-fs").getAttribute("data-fs")).toBe("1");
    // scroll is locked while the overlay is open
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("Escape exits full screen and restores the normal layout", async () => {
    render(<TopologyExplorer seed={seed} scope="repo" repoId="r1" />);
    fireEvent.click(screen.getByTestId("mock-graph-fs"));
    expect(screen.getByTestId("topology-explorer").hasAttribute("data-fullscreen")).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });

    // exit waits out the ~600 ms close animation before unmounting the overlay,
    // so give waitFor generous headroom over its 1 s default to avoid CPU-load flakes.
    await waitFor(() => expect(screen.getByTestId("topology-explorer").hasAttribute("data-fullscreen")).toBe(false), { timeout: 3000 });
    expect(screen.queryByTestId("mock-tree")).not.toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});
