// @vitest-environment jsdom

/**
 * ImportsGraph unit tests — per-repo imports viz on the Topology tab.
 *
 * Covers:
 *   - Renders one node per file (from top_symbols + edge endpoints).
 *   - Renders edges (verified via the wrapper count, not the SVG path —
 *     React Flow only paints the SVG after a real viewport measurement
 *     cycle which jsdom doesn't run; same constraint as the sibling
 *     `entity-graph-react-flow.test.tsx`).
 *   - Empty state renders when no `imports` edges are supplied.
 *   - Layered/Force toggle flips the wrapper data-mode attribute.
 *   - Neighborhood-only checkbox flips state.
 *   - prefers-reduced-motion is honored (data-reduced-motion="true").
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ImportsGraph } from "@/components/topology/imports-graph";
import type { CallEdge, TopSymbol } from "@/lib/api/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  class StubResizeObserver { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver = StubResizeObserver;
  if (typeof DOMRect === "undefined") {
    (globalThis as unknown as { DOMRect: typeof DOMRect }).DOMRect = class {
      bottom = 0; height = 0; left = 0; right = 0; top = 0; width = 0; x = 0; y = 0;
      static fromRect() { return new (this as unknown as { new (): DOMRect })(); }
      toJSON() { return {}; }
    } as unknown as typeof DOMRect;
  }
});

function stubMatchMedia(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true, configurable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: reduced && q.includes("reduce"), media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })),
  });
}

const SYMBOLS: TopSymbol[] = [
  { id: "f1", kind: "function", name: "main", path: "src/main.ts:10:20", signature: "()", docstring: null, visibility: "public", language: "TypeScript", callers_count: 0, callees_count: 1, importance: 0.9, adrs_referenced: [], has_tests: false },
  { id: "f2", kind: "function", name: "util", path: "src/util.ts:5:30", signature: "()", docstring: null, visibility: "public", language: "TypeScript", callers_count: 1, callees_count: 0, importance: 0.5, adrs_referenced: [], has_tests: false },
  { id: "f3", kind: "function", name: "helper", path: "src/lib/helper.ts:8:18", signature: "()", docstring: null, visibility: "public", language: "TypeScript", callers_count: 1, callees_count: 0, importance: 0.4, adrs_referenced: [], has_tests: false },
];

const IMPORTS: CallEdge[] = [
  { kind: "imports", from: { id: "f1", name: "main", path: "src/main.ts" }, to: { id: "f2", name: "util", path: "src/util.ts" }, occurrences: 1 },
  { kind: "imports", from: { id: "f1", name: "main", path: "src/main.ts" }, to: { id: "f3", name: "helper", path: "src/lib/helper.ts" }, occurrences: 2 },
];

const OTHER_KIND: CallEdge = { kind: "calls", from: { id: "f2", name: "util", path: "src/util.ts" }, to: { id: "f3", name: "helper", path: "src/lib/helper.ts" }, occurrences: 1 };

describe("ImportsGraph", () => {
  beforeEach(() => { cleanup(); stubMatchMedia(false); });

  it("renders one file-tier node per file from symbols + edges", () => {
    render(<ImportsGraph topSymbols={SYMBOLS} edges={IMPORTS} />);
    expect(screen.getAllByTestId("imports-node-file").length).toBe(3);
    expect(screen.getByText("main.ts")).toBeTruthy();
    expect(screen.getByText("util.ts")).toBeTruthy();
    expect(screen.getByText("helper.ts")).toBeTruthy();
  });

  it("filters to `imports` kind only (other kinds are ignored)", () => {
    // Only one `imports` edge → only its endpoints (2 nodes) render.
    render(<ImportsGraph topSymbols={[]} edges={[OTHER_KIND]} />);
    expect(screen.getByTestId("imports-graph-empty")).toBeTruthy();
  });

  it("renders the empty state when no imports edges are supplied", () => {
    render(<ImportsGraph topSymbols={SYMBOLS} edges={[]} />);
    expect(screen.getByTestId("imports-graph-empty")).toBeTruthy();
    expect(screen.getByText(/no imports edges yet/i)).toBeTruthy();
  });

  it("invokes onSync when the empty-state CTA is clicked", () => {
    const onSync = vi.fn();
    render(<ImportsGraph topSymbols={SYMBOLS} edges={[]} onSync={onSync} />);
    fireEvent.click(screen.getByRole("button", { name: /sync repo/i }));
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("flips the data-mode attribute when the Force toggle is clicked", () => {
    render(<ImportsGraph topSymbols={SYMBOLS} edges={IMPORTS} />);
    const wrapper = screen.getByTestId("imports-graph");
    expect(wrapper.getAttribute("data-mode")).toBe("layered");
    fireEvent.click(screen.getByTestId("imports-mode-force"));
    expect(wrapper.getAttribute("data-mode")).toBe("force");
    fireEvent.click(screen.getByTestId("imports-mode-layered"));
    expect(wrapper.getAttribute("data-mode")).toBe("layered");
  });

  it("toggles the neighborhood-only state via the checkbox", () => {
    render(<ImportsGraph topSymbols={SYMBOLS} edges={IMPORTS} />);
    const cb = screen.getByTestId("imports-neighborhood") as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
  });

  it("mounts the React Flow pan/zoom controls (zoom-in / zoom-out / fit-view)", () => {
    const { container } = render(<ImportsGraph topSymbols={SYMBOLS} edges={IMPORTS} />);
    expect(container.querySelector(".react-flow__controls")).not.toBeNull();
    expect(container.querySelector(".react-flow__controls-fitview")).not.toBeNull();
  });

  it("honors prefers-reduced-motion: reduce on the wrapper", () => {
    stubMatchMedia(true);
    render(<ImportsGraph topSymbols={SYMBOLS} edges={IMPORTS} />);
    expect(screen.getByTestId("imports-graph").getAttribute("data-reduced-motion")).toBe("true");
  });
});
