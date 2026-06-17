// @vitest-environment jsdom

/**
 * SubtaskPlanView - the decompose breakdown, read AND edit (IMPL-18).
 *
 * Pins:
 *  - read mode renders each proposed task + its "After: …" dependency label;
 *  - edit mode (editable) renders structured per-task fields and, on Save,
 *    serializes back to a valid `{ items: [...] }` body with the user's edits;
 *  - a blank title blocks the save (nothing is emitted) with an inline alert;
 *  - Cancel discards the draft via onCancel;
 *  - an unparseable body opens the editor on a single blank task (graceful).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SubtaskPlanView } from "@/components/work/subtask-plan-view";

const validBody = JSON.stringify({
  items: [
    { ref: "a", type: "implementation", title: "First task", body: "do a", depends_on: [] },
    { ref: "b", type: "test", title: "Second task", depends_on: ["a"] },
  ],
});

afterEach(() => cleanup());

describe("SubtaskPlanView - read mode", () => {
  it("renders each task and its dependency label", () => {
    render(<SubtaskPlanView body={validBody} />);
    expect(screen.getByText("First task")).toBeTruthy();
    expect(screen.getByText("Second task")).toBeTruthy();
    expect(screen.getByText(/After: First task/)).toBeTruthy();
  });

  it("falls back to raw text when the body does not parse", () => {
    render(<SubtaskPlanView body="not a plan" />);
    expect(screen.getByText("not a plan")).toBeTruthy();
  });
});

describe("SubtaskPlanView - edit mode", () => {
  it("renders a structured field per task", () => {
    render(<SubtaskPlanView body={validBody} editable onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByLabelText("Task title")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add task" })).toBeTruthy();
  });

  it("saves an edited title as a valid serialized plan, keeping dependencies", () => {
    const onSave = vi.fn();
    render(<SubtaskPlanView body={validBody} editable onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Task title")[0]!, {
      target: { value: "Renamed task" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(onSave.mock.calls[0]![0] as string);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].title).toBe("Renamed task");
    // The untouched second task keeps its dependency on the first.
    expect(parsed.items[1].depends_on).toEqual(["a"]);
  });

  it("adds a task and includes it in the saved plan", () => {
    const onSave = vi.fn();
    render(<SubtaskPlanView body={validBody} editable onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    const titles = screen.getAllByLabelText("Task title");
    expect(titles).toHaveLength(3);
    fireEvent.change(titles[2]!, { target: { value: "Third task" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    const parsed = JSON.parse(onSave.mock.calls[0]![0] as string);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[2].title).toBe("Third task");
  });

  it("toggles a dependency and records it on save", () => {
    const onSave = vi.fn();
    render(<SubtaskPlanView body={validBody} editable onSave={onSave} onCancel={vi.fn()} />);

    // Make the first task wait on the second.
    fireEvent.click(screen.getByRole("button", { name: "Depends on Second task" }));
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    const parsed = JSON.parse(onSave.mock.calls[0]![0] as string);
    expect(parsed.items[0].depends_on).toContain("b");
  });

  it("blocks a save when a task has no title and shows an inline alert", () => {
    const onSave = vi.fn();
    render(<SubtaskPlanView body={validBody} editable onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getAllByLabelText("Task title")[0]!, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/title/i);
  });

  it("discards the draft via Cancel", () => {
    const onCancel = vi.fn();
    render(<SubtaskPlanView body={validBody} editable onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("opens on a single blank task when the body is unparseable", () => {
    render(<SubtaskPlanView body="not json" editable onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByLabelText("Task title")).toHaveLength(1);
  });
});
