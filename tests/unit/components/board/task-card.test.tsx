// @vitest-environment jsdom

/**
 * TaskCard kebab menu - the quick actions ("Move to" statuses + "Set
 * priority") added above the existing triage items, and that everything stays
 * optional (a card with only the old actions renders the old menu; a card
 * with none renders no kebab at all).
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TaskCard, type TaskCardActions } from "@/components/board/task-card";
import type { Task } from "@/lib/api/client";

// Radix's popover positioning (floating-ui) observes the anchor; jsdom has no
// ResizeObserver, so give it an inert one.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

/** Minimal Task with only the fields the card reads. */
function task(partial: Partial<Task> = {}): Task {
  return {
    id: "t1",
    display_id: "FEAT-1",
    type: "feature",
    status: "todo",
    priority: null,
    title: "Ship the thing",
    label_ids: [],
    owner_user_id: null,
    ai_delegated: false,
    health: null,
    target_date: null,
    cancel_reason: null,
    estimate_points: null,
    spent_usd: null,
    children_total: 0,
    children_done: 0,
    children_blocked: 0,
    created_at: new Date().toISOString(),
    ...partial,
  } as Task;
}

function openMenu(t: Task, actions: TaskCardActions) {
  render(<TaskCard task={t} actions={actions} />);
  fireEvent.click(screen.getByLabelText("Task actions"));
}

describe("TaskCard - Move to", () => {
  it("lists every board status except the current one (and in_review when railed)", () => {
    openMenu(task({ type: "feature", status: "todo" }), { onMove: () => {} });
    expect(screen.queryByText("Move to")).not.toBeNull();
    for (const label of ["Backlog", "Triage", "In progress", "Blocked", "Done"]) {
      expect(screen.queryByText(label)).not.toBeNull();
    }
    expect(screen.queryByText("To do")).toBeNull(); // current status
    expect(screen.queryByText("In review")).toBeNull(); // gate-owned (railed)
  });

  it("offers in_review for an unrailed (plain task) card", () => {
    openMenu(task({ type: "task", status: "todo" }), { onMove: () => {} });
    expect(screen.queryByText("In review")).not.toBeNull();
  });

  it("reports the picked status to the parent", () => {
    const onMove = vi.fn();
    openMenu(task(), { onMove });
    fireEvent.click(screen.getByText("In progress"));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("in_progress");
  });

  it("does not offer moves on a cancelled task (restore is its path back)", () => {
    openMenu(task({ status: "cancelled" }), {
      onMove: () => {},
      onRestore: () => {},
    });
    expect(screen.queryByText("Move to")).toBeNull();
    expect(screen.queryByText("Restore to board")).not.toBeNull();
  });
});

describe("TaskCard - Set priority", () => {
  it("offers Urgent/High/Medium/Low plus a clear", () => {
    openMenu(task(), { onSetPriority: () => {} });
    expect(screen.queryByText("Set priority")).not.toBeNull();
    for (const label of ["Urgent", "High", "Medium", "Low", "Clear priority"]) {
      expect(screen.queryByText(label)).not.toBeNull();
    }
  });

  it("reports the picked priority, and null for clear", () => {
    const onSetPriority = vi.fn();
    openMenu(task(), { onSetPriority });
    fireEvent.click(screen.getByText("Urgent"));
    expect(onSetPriority).toHaveBeenCalledWith("urgent");

    fireEvent.click(screen.getByLabelText("Task actions"));
    fireEvent.click(screen.getByText("Clear priority"));
    expect(onSetPriority).toHaveBeenCalledWith(null);
  });
});

describe("TaskCard - compatibility", () => {
  it("keeps the existing triage items below the quick actions", () => {
    openMenu(task(), {
      onMove: () => {},
      onSetPriority: () => {},
      onMarkDone: () => {},
      onArchive: () => {},
      onDelete: () => {},
    });
    for (const label of [
      "Mark as done",
      "Remove from board",
      "Not needed",
      "Obsolete",
      "Delete",
    ]) {
      expect(screen.queryByText(label)).not.toBeNull();
    }
  });

  it("renders the old menu unchanged when only the old actions are wired", () => {
    openMenu(task(), { onMarkDone: () => {}, onDelete: () => {} });
    expect(screen.queryByText("Move to")).toBeNull();
    expect(screen.queryByText("Set priority")).toBeNull();
    expect(screen.queryByText("Mark as done")).not.toBeNull();
  });

  it("renders no kebab at all without actions", () => {
    render(<TaskCard task={task()} />);
    expect(screen.queryByLabelText("Task actions")).toBeNull();
  });
});
