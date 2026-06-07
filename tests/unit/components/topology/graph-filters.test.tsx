// @vitest-environment jsdom

/**
 * GraphFilters unit tests — `/knowledge/graph` filter bar.
 *
 * Covers:
 *   - Renders one chip per layer + per kind, both starting un-pressed.
 *   - Toggling a chip flips its aria-pressed and emits the next state.
 *   - Multi-select keeps prior selections.
 *   - Domain select emits the chosen id; clears repo selection.
 *   - "Clear all" link appears when any filter is active and resets state.
 *   - parseFiltersFromQuery / serializeFiltersToQuery round-trip the URL.
 *   - Counter shows "{filtered} of {total} nodes shown".
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  EMPTY_FILTERS,
  GraphFilters,
  KIND_OPTIONS,
  LAYER_OPTIONS,
  parseFiltersFromQuery,
  serializeFiltersToQuery,
  type GraphFiltersState,
} from "@/components/topology/graph-filters";

vi.mock("@/lib/api/client", () => ({
  api: {
    domains: {
      list: vi.fn(async () => [
        { id: "cap-1", name: "Billing",  slug: "billing"  },
        { id: "cap-2", name: "Identity", slug: "identity" },
      ]),
      listRepos: vi.fn(async (capId: string) => capId === "cap-1"
        ? [
            { id: "repo-1", repo_full_name: "lumen/billing-svc", domain_id: "cap-1" },
            { id: "repo-2", repo_full_name: "lumen/billing-fe",  domain_id: "cap-1" },
          ]
        : []),
    },
  },
}));

describe("GraphFilters — URL helpers", () => {
  it("parseFiltersFromQuery hydrates the four BE params + q + kinds", () => {
    const sp = new URLSearchParams("domain_id=cap-1&repo_id=repo-2&layer=API,Service&kind=file,function&limit=300&q=invoice");
    const f = parseFiltersFromQuery(sp);
    expect(f.domainId).toBe("cap-1");
    expect(f.repoId).toBe("repo-2");
    expect(f.layers).toEqual(["API", "Service"]);
    expect(f.kinds).toEqual(["file", "function"]);
    expect(f.limit).toBe(300);
    expect(f.q).toBe("invoice");
  });

  it("parseFiltersFromQuery falls back to defaults for missing / bad values", () => {
    const f = parseFiltersFromQuery(new URLSearchParams("limit=99999&layer=Bogus"));
    expect(f.limit).toBe(200);
    expect(f.layers).toEqual([]);
    expect(f.domainId).toBeNull();
  });

  it("serializeFiltersToQuery omits defaults and zero-length arrays", () => {
    expect(serializeFiltersToQuery(EMPTY_FILTERS)).toBe("");
    const qs = serializeFiltersToQuery({
      ...EMPTY_FILTERS,
      domainId: "cap-1", layers: ["API"], q: "foo", limit: 500,
    });
    const sp = new URLSearchParams(qs);
    expect(sp.get("domain_id")).toBe("cap-1");
    expect(sp.get("layer")).toBe("API");
    expect(sp.get("q")).toBe("foo");
    expect(sp.get("limit")).toBe("500");
    expect(sp.get("kind")).toBeNull();
  });
});

describe("GraphFilters — component", () => {
  beforeEach(() => { cleanup(); });

  function harness(initial: Partial<GraphFiltersState> = {}) {
    const value: GraphFiltersState = { ...EMPTY_FILTERS, ...initial };
    const onChange = vi.fn();
    render(<GraphFilters value={value} onChange={onChange} filteredCount={12} totalCount={48} />);
    return { value, onChange };
  }

  it("renders one chip per layer and per kind, all un-pressed by default", () => {
    harness();
    for (const l of LAYER_OPTIONS) expect(screen.getByTestId(`graph-filter-layer-${l}`).getAttribute("aria-pressed")).toBe("false");
    for (const k of KIND_OPTIONS) expect(screen.getByTestId(`graph-filter-kind-${k}`).getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the counter as '{filtered} of {total} nodes shown'", () => {
    harness();
    expect(screen.getByTestId("graph-filter-counter").textContent).toMatch(/12 of 48 nodes shown/);
  });

  it("toggling a layer chip emits the new state with that layer pushed", () => {
    const { onChange } = harness();
    fireEvent.click(screen.getByTestId("graph-filter-layer-API"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layers: ["API"] }));
  });

  it("toggling an already-selected layer removes it", () => {
    const { onChange } = harness({ layers: ["API", "Service"] });
    fireEvent.click(screen.getByTestId("graph-filter-layer-API"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layers: ["Service"] }));
  });

  it("toggling a kind chip emits the new state with that kind pushed", () => {
    const { onChange } = harness();
    fireEvent.click(screen.getByTestId("graph-filter-kind-file"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kinds: ["file"] }));
  });

  it("loads domains into the combobox", async () => {
    harness();
    await waitFor(() => {
      const sel = screen.getByTestId("graph-filter-domain") as HTMLSelectElement;
      expect(sel.options.length).toBeGreaterThan(1);
    });
    const sel = screen.getByTestId("graph-filter-domain") as HTMLSelectElement;
    expect([...sel.options].some((o) => o.text === "Billing")).toBe(true);
  });

  it("repo select is disabled until a domain is chosen", async () => {
    const { onChange } = harness();
    const repoSel = screen.getByTestId("graph-filter-repo") as HTMLSelectElement;
    expect(repoSel.disabled).toBe(true);
    // Wait for the async domain list to populate before firing change —
    // a `<select>` can only emit values for options that already exist.
    await waitFor(() => {
      const sel = screen.getByTestId("graph-filter-domain") as HTMLSelectElement;
      expect([...sel.options].some((o) => o.value === "cap-1")).toBe(true);
    });
    fireEvent.change(screen.getByTestId("graph-filter-domain"), { target: { value: "cap-1" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ domainId: "cap-1", repoId: null }));
  });

  it("free-text search emits the new q", () => {
    const { onChange } = harness();
    fireEvent.change(screen.getByTestId("graph-filter-search"), { target: { value: "invoice" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: "invoice" }));
  });

  it("limit stepper clamps below 10 / above 1000", () => {
    const { onChange } = harness();
    fireEvent.change(screen.getByTestId("graph-filter-limit"), { target: { value: "5000" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ limit: 1000 }));
    fireEvent.change(screen.getByTestId("graph-filter-limit"), { target: { value: "0" } });
    // 0 || 200 → setLimit(200) → clamped to 200 (default), not 10.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it("`Clear all` only appears when a filter is active and resets to EMPTY_FILTERS", () => {
    // Inactive: no Clear all button.
    cleanup();
    const noop = vi.fn();
    render(<GraphFilters value={EMPTY_FILTERS} onChange={noop} filteredCount={0} totalCount={0} />);
    expect(screen.queryByTestId("graph-filter-clear")).toBeNull();

    // Active: Clear all is rendered; clicking it emits EMPTY_FILTERS.
    cleanup();
    const onChange = vi.fn();
    render(<GraphFilters value={{ ...EMPTY_FILTERS, layers: ["API"] }} onChange={onChange} filteredCount={3} totalCount={9} />);
    const clear = screen.getByTestId("graph-filter-clear");
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
