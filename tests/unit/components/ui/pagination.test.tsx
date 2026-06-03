// @vitest-environment jsdom

/**
 * Pagination — the controlled page navigator + page-size selector. Pins the
 * window summary, the page-count math, the prev/next disabled edges, and the
 * change callbacks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Pagination } from "@/components/ui/pagination";

const noop = () => {};

beforeEach(() => {
  cleanup();
});

describe("Pagination", () => {
  it("summarizes the current window + page count", () => {
    render(
      <Pagination total={137} page={0} pageSize={10} onPageChange={noop} onPageSizeChange={noop} label="endpoints" />,
    );
    expect(screen.getByTestId("pagination-summary").textContent).toContain("Showing 1–10 of 137 endpoints");
    expect(screen.getByTestId("pagination-status").textContent).toContain("Page 1 of 14");
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(
      <Pagination total={25} page={0} pageSize={10} onPageChange={noop} onPageSizeChange={noop} />,
    );
    expect((screen.getByTestId("pagination-prev") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("pagination-next") as HTMLButtonElement).disabled).toBe(false);

    rerender(<Pagination total={25} page={2} pageSize={10} onPageChange={noop} onPageSizeChange={noop} />);
    expect((screen.getByTestId("pagination-prev") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("pagination-next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("emits page + size changes", () => {
    const onPage = vi.fn();
    const onSize = vi.fn();
    render(
      <Pagination total={100} page={1} pageSize={10} onPageChange={onPage} onPageSizeChange={onSize} />,
    );
    fireEvent.click(screen.getByTestId("pagination-next"));
    expect(onPage).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByTestId("pagination-prev"));
    expect(onPage).toHaveBeenCalledWith(0);
    fireEvent.change(screen.getByTestId("pagination-page-size"), { target: { value: "50" } });
    expect(onSize).toHaveBeenCalledWith(50);
  });

  it("offers the 10/20/50/100 page sizes", () => {
    render(<Pagination total={100} page={0} pageSize={10} onPageChange={noop} onPageSizeChange={noop} />);
    const opts = Array.from(
      screen.getByTestId("pagination-page-size").querySelectorAll("option"),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(opts).toEqual(["10", "20", "50", "100"]);
  });
});
