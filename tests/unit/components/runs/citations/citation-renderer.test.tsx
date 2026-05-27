// @vitest-environment jsdom

/**
 * CitationRenderer unit tests (readiness row 865 + §3.6 r5).
 *
 * Covers:
 *   - Plain text with no citations renders untouched.
 *   - A `kn://…` token is detected and replaced with a citation chip.
 *   - A `repo://…` token is detected and replaced with a citation chip.
 *   - Inline citations (text + chip + text) split and re-render correctly.
 *   - Multiple chips coexist in one render and share one drawer instance.
 *   - Clicking a chip opens the drawer with the right source + ref.
 *   - Esc on the open drawer closes it.
 *   - Backdrop click also closes the drawer.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CitationRenderer } from "@/components/runs/citations/citation-renderer";

describe("CitationRenderer", () => {
  beforeEach(() => {
    cleanup();
    // Mock the citation-resolve endpoint so the drawer doesn't fail when
    // it tries to fetch in the open state. jsdom doesn't ship `fetch` by
    // default; stub it lazily.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            title: "Mock citation",
            body: "mock body",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  it("renders plain text untouched when there are no citations", () => {
    render(<CitationRenderer text="The API should retry on transient 5xx." />);
    expect(
      screen.queryByText(/the api should retry on transient 5xx/i),
    ).not.toBeNull();
    expect(screen.queryAllByTestId("citation-chip")).toHaveLength(0);
  });

  it("replaces a kn:// reference with a citation chip", () => {
    render(
      <CitationRenderer text="See kn://app/billing/file.py:L12-L30 for context." />,
    );
    const chips = screen.getAllByTestId("citation-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]!.getAttribute("data-source")).toBe("kn");
    expect(chips[0]!.getAttribute("data-ref")).toBe(
      "kn://app/billing/file.py:L12-L30",
    );
  });

  it("replaces a repo:// reference with a citation chip", () => {
    render(
      <CitationRenderer text="Per repo://owner/name/path/file.py#L42 we use…" />,
    );
    const chips = screen.getAllByTestId("citation-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]!.getAttribute("data-source")).toBe("repo");
    expect(chips[0]!.getAttribute("data-ref")).toBe(
      "repo://owner/name/path/file.py#L42",
    );
  });

  it("splits inline citations into surrounding text + chip(s)", () => {
    render(
      <CitationRenderer text="prefix kn://a/b.py:L1-L2 middle repo://o/n/p#L9 suffix" />,
    );
    const chips = screen.getAllByTestId("citation-chip");
    expect(chips).toHaveLength(2);
    const renderer = screen.getByTestId("citation-renderer");
    const textContent = renderer.textContent ?? "";
    expect(textContent).toContain("prefix");
    expect(textContent).toContain("middle");
    expect(textContent).toContain("suffix");
  });

  it("renders multiple chips that share a single drawer instance", () => {
    render(
      <CitationRenderer text="See kn://a/b.py:L1-L2 and repo://o/n/p#L9 plus kn://c/d.py:L5-L6" />,
    );
    expect(screen.getAllByTestId("citation-chip")).toHaveLength(3);
    // Drawer is mounted lazily — present once at least one chip is open.
    fireEvent.click(screen.getAllByTestId("citation-chip")[0]!);
    expect(screen.getAllByTestId("citation-drawer")).toHaveLength(1);
  });

  it("opens the drawer with the matching source + ref on chip click", () => {
    render(<CitationRenderer text="kn://a/b.py:L1-L2" />);
    fireEvent.click(screen.getAllByTestId("citation-chip")[0]!);
    const drawer = screen.getByTestId("citation-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer.textContent).toContain("kn://a/b.py:L1-L2");
    expect(drawer.textContent).toContain("Knowledge graph");
  });

  it("closes the drawer when Escape is pressed", () => {
    render(<CitationRenderer text="kn://a/b.py:L1-L2" />);
    fireEvent.click(screen.getAllByTestId("citation-chip")[0]!);
    expect(screen.queryByTestId("citation-drawer")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("citation-drawer")).toBeNull();
  });

  it("closes the drawer when the backdrop is clicked", () => {
    render(<CitationRenderer text="repo://o/n/p#L9" />);
    fireEvent.click(screen.getAllByTestId("citation-chip")[0]!);
    expect(screen.queryByTestId("citation-drawer")).not.toBeNull();
    fireEvent.click(screen.getByTestId("citation-drawer-backdrop"));
    expect(screen.queryByTestId("citation-drawer")).toBeNull();
  });
});
