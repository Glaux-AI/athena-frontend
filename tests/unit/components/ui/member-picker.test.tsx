// @vitest-environment jsdom

/**
 * <MemberPicker> - the shared type-to-search people picker mounted by every
 * person selector (domain + team rosters, task owner, bulk reassign, ownership
 * transfer).
 *
 * Covers the default trigger label (placeholder / selected), opening the
 * popover, filtering by name and by email as you type, that picking a person
 * reports the right member to the parent, the no-match empty state, and the
 * header / footer slots receiving a working `close` callback.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { MemberPicker } from "@/components/ui/member-picker";
import type { Member } from "@/lib/api/client";

afterEach(cleanup);

function member(extra: Partial<Member> = {}): Member {
  return {
    user_id: "u1",
    membership_id: "m1",
    email: "ada@acme.com",
    display_name: "Ada Lovelace",
    avatar_url: null,
    role: "engineer",
    is_owner: false,
    joined_at: "2026-01-01T00:00:00Z",
    deactivated_at: null,
    ...extra,
  };
}

const PEOPLE: Member[] = [
  member(),
  member({ user_id: "u2", membership_id: "m2", display_name: "Grace Hopper", email: "grace@acme.com" }),
  member({ user_id: "u3", membership_id: "m3", display_name: "Alan Turing", email: "alan@acme.com" }),
];

function openPicker(testId = "picker") {
  fireEvent.click(screen.getByTestId(testId));
  return screen.getByTestId(`${testId}-search`);
}

describe("MemberPicker", () => {
  it("shows the placeholder on the default trigger when nothing is selected", () => {
    render(
      <MemberPicker members={PEOPLE} onSelect={() => {}} placeholder="Pick someone" data-testid="picker" />,
    );
    expect(screen.getByTestId("picker").textContent).toMatch(/Pick someone/);
  });

  it("shows the selected person's name and email on the trigger", () => {
    render(<MemberPicker members={PEOPLE} value="u2" onSelect={() => {}} data-testid="picker" />);
    const trigger = screen.getByTestId("picker").textContent ?? "";
    expect(trigger).toMatch(/Grace Hopper/);
    expect(trigger).toMatch(/grace@acme.com/);
  });

  it("opens and lists every candidate", () => {
    render(<MemberPicker members={PEOPLE} onSelect={() => {}} data-testid="picker" />);
    openPicker();
    expect(screen.queryByText("Ada Lovelace")).not.toBeNull();
    expect(screen.queryByText("Grace Hopper")).not.toBeNull();
    expect(screen.queryByText("Alan Turing")).not.toBeNull();
  });

  it("filters by name as you type", () => {
    render(<MemberPicker members={PEOPLE} onSelect={() => {}} data-testid="picker" />);
    const search = openPicker();
    fireEvent.change(search, { target: { value: "grace" } });
    expect(screen.queryByText("Grace Hopper")).not.toBeNull();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.queryByText("Alan Turing")).toBeNull();
  });

  it("filters by email as you type", () => {
    render(<MemberPicker members={PEOPLE} onSelect={() => {}} data-testid="picker" />);
    const search = openPicker();
    fireEvent.change(search, { target: { value: "alan@" } });
    expect(screen.queryByText("Alan Turing")).not.toBeNull();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
  });

  it("reports the chosen member to the parent", () => {
    const onSelect = vi.fn();
    render(<MemberPicker members={PEOPLE} onSelect={onSelect} data-testid="picker" />);
    openPicker();
    fireEvent.click(screen.getByText("Grace Hopper"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u2" }));
  });

  it("shows a no-match message when nobody matches the query", () => {
    render(<MemberPicker members={PEOPLE} onSelect={() => {}} data-testid="picker" />);
    const search = openPicker();
    fireEvent.change(search, { target: { value: "zzz-nobody" } });
    expect(screen.queryByText(/No people match/)).not.toBeNull();
  });

  it("renders a custom empty state when given", () => {
    render(
      <MemberPicker
        members={[]}
        onSelect={() => {}}
        data-testid="picker"
        emptyState="Everyone is already here."
      />,
    );
    openPicker();
    expect(screen.queryByText("Everyone is already here.")).not.toBeNull();
  });

  it("renders header and footer rows and hands them a working close()", () => {
    render(
      <MemberPicker
        members={PEOPLE}
        onSelect={() => {}}
        data-testid="picker"
        header={(close) => (
          <button type="button" onClick={close}>
            Assign to me
          </button>
        )}
        footer={(close) => (
          <button type="button" onClick={close}>
            Unassign
          </button>
        )}
      />,
    );
    openPicker();
    expect(screen.queryByText("Assign to me")).not.toBeNull();
    const unassign = screen.getByText("Unassign");
    fireEvent.click(unassign);
    // close() collapses the popover, so the search box is gone afterwards.
    expect(screen.queryByTestId("picker-search")).toBeNull();
  });

  it("Enter selects the arrow-highlighted row", () => {
    const onSelect = vi.fn();
    render(<MemberPicker members={PEOPLE} onSelect={onSelect} data-testid="picker" />);
    const search = openPicker();
    fireEvent.keyDown(search, { key: "ArrowDown" }); // 0 (Ada) -> 1 (Grace)
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u2" }));
  });

  it("type-to-narrow then Enter selects the single match", () => {
    const onSelect = vi.fn();
    render(<MemberPicker members={PEOPLE} onSelect={onSelect} data-testid="picker" />);
    const search = openPicker();
    fireEvent.change(search, { target: { value: "alan" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u3" }));
  });

  it("Enter is a no-op when the filtered list is empty", () => {
    const onSelect = vi.fn();
    render(<MemberPicker members={PEOPLE} onSelect={onSelect} data-testid="picker" />);
    const search = openPicker();
    fireEvent.change(search, { target: { value: "nobody-here" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("exposes combobox + listbox semantics and marks the active option", () => {
    render(<MemberPicker members={PEOPLE} onSelect={() => {}} data-testid="picker" />);
    const search = openPicker();
    expect(search.getAttribute("role")).toBe("combobox");
    expect(screen.getByRole("listbox")).not.toBeNull();
    const options = screen.getAllByRole("option");
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("shows skeleton rows (not an empty message) while the roster is loading", () => {
    render(<MemberPicker members={[]} loading onSelect={() => {}} data-testid="picker" />);
    openPicker();
    expect(screen.getByRole("listbox").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("No teammates yet.")).toBeNull();
  });
});
