// @vitest-environment jsdom

/**
 * TokenTableEditor - the structured Tokens tab. Pins: group rendering, inline
 * edits emitting a change that serializes back to css, per-group add, per-row
 * delete, dark override add/remove, and the name search filter.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TokenTableEditor } from "@/components/design-tokens/token-table-editor";
import { serializeSystemCss, type EditableToken } from "@/lib/design/css-model";

afterEach(cleanup);

const TOKENS: EditableToken[] = [
  { name: "--color-primary", light: "#31628f", dark: null, group: "color" },
  { name: "--space-4", light: "1rem", dark: null, group: "space" },
];

describe("TokenTableEditor", () => {
  it("renders tokens under their group headers", () => {
    render(<TokenTableEditor tokens={TOKENS} onChange={() => {}} />);
    expect(screen.getByText("Colors")).toBeTruthy();
    expect(screen.getByText("Spacing")).toBeTruthy();
    expect(screen.getByLabelText("--color-primary light value")).toBeTruthy();
    expect(screen.getByLabelText("--space-4 light value")).toBeTruthy();
  });

  it("editing a value emits tokens that serialize into the new css", () => {
    const onChange = vi.fn();
    render(<TokenTableEditor tokens={TOKENS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("--color-primary light value"), {
      target: { value: "#ff0000" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as EditableToken[];
    expect(next[0]).toMatchObject({ name: "--color-primary", light: "#ff0000" });
    expect(serializeSystemCss({ tokens: next, extraCss: "" })).toContain(
      "--color-primary: #ff0000;",
    );
  });

  it("strips characters that would break the serialized css from values", () => {
    const onChange = vi.fn();
    render(<TokenTableEditor tokens={TOKENS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("--space-4 light value"), {
      target: { value: "2rem;}" },
    });
    const next = onChange.mock.calls[0]?.[0] as EditableToken[];
    expect(next[1]?.light).toBe("2rem");
  });

  it("adds a token with the group's name prefix", () => {
    const onChange = vi.fn();
    render(<TokenTableEditor tokens={TOKENS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Add colors token"));
    const next = onChange.mock.calls[0]?.[0] as EditableToken[];
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ name: "--color-new", group: "color" });
  });

  it("deletes a row", () => {
    const onChange = vi.fn();
    render(<TokenTableEditor tokens={TOKENS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Delete --space-4"));
    const next = onChange.mock.calls[0]?.[0] as EditableToken[];
    expect(next.map((t) => t.name)).toEqual(["--color-primary"]);
  });

  it("adds and removes a dark override", () => {
    const onChange = vi.fn();
    render(<TokenTableEditor tokens={TOKENS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Add dark value for --color-primary"));
    let next = onChange.mock.calls[0]?.[0] as EditableToken[];
    expect(next[0]?.dark).toBe("#31628f");

    cleanup();
    onChange.mockClear();
    render(<TokenTableEditor tokens={next} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove dark value for --color-primary"));
    next = onChange.mock.calls[0]?.[0] as EditableToken[];
    expect(next[0]?.dark).toBeNull();
  });

  it("clears an active search when adding, so the new token is visible", () => {
    const onChange = vi.fn();
    render(<TokenTableEditor tokens={TOKENS} onChange={onChange} />);
    const search = screen.getByLabelText("Search tokens") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "space" } });
    // Only Spacing is visible under this filter - add there.
    fireEvent.click(screen.getByLabelText("Add spacing token"));
    const next = onChange.mock.calls[0]?.[0] as EditableToken[];
    expect(next[2]).toMatchObject({ name: "--space-new", group: "space" });
    // The query is cleared, so every group (and the new row) is visible again.
    expect(search.value).toBe("");
    expect(screen.getByText("Colors")).toBeTruthy();
  });

  it("filters rows (and empty groups) by the search box", () => {
    render(<TokenTableEditor tokens={TOKENS} onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search tokens"), { target: { value: "space" } });
    expect(screen.queryByText("Colors")).toBeNull();
    expect(screen.getByText("Spacing")).toBeTruthy();
    expect(screen.getByLabelText("--space-4 light value")).toBeTruthy();
  });
});
