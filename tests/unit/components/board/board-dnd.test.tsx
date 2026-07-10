// @vitest-environment jsdom

/**
 * Board drag surface - KanbanBoard / SwimlaneBoard with `onTaskMove`.
 *
 * Covers the compatibility contract (no `onTaskMove` = today's static board:
 * no draggable cards, empty columns dropped), the render-all-columns branch
 * (a draggable board shows the full status set minus `cancelled` so empty
 * columns are drop targets), the drop flow (dragstart -> drop calls
 * `onTaskMove` with the task + column status), and the gate rule (a railed
 * task can't land in `in_review`; the column explains why).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { KanbanBoard } from "@/components/board/kanban-board";
import { SwimlaneBoard } from "@/components/board/swimlane-board";
import { BOARD_COLUMN_ORDER, TASK_STATUS_LABEL } from "@/lib/work/task-meta";
import type { KanbanColumn, Task, TaskStatus } from "@/lib/api/client";
import type { Swimlane } from "@/lib/work/board-group";

afterEach(cleanup);

/** Minimal Task with only the fields the card + drag rules read. */
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

const column = (status: TaskStatus, tasks: Task[]): KanbanColumn => ({
  status,
  tasks,
  total: tasks.length,
});

/** The stand-in for the real DataTransfer jsdom doesn't implement. */
function makeDataTransfer() {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? "",
    setDragImage: vi.fn(),
    effectAllowed: "",
    dropEffect: "",
  };
}

/** Start dragging the (only) card on the board. */
function startDrag(container: HTMLElement) {
  const dataTransfer = makeDataTransfer();
  const handle = container.querySelector('[draggable="true"]');
  expect(handle).not.toBeNull();
  fireEvent.dragStart(handle as HTMLElement, { dataTransfer });
  return dataTransfer;
}

describe("KanbanBoard - static (no onTaskMove)", () => {
  it("renders only non-empty columns and no draggable cards", () => {
    const { container } = render(
      <KanbanBoard columns={[column("todo", [task()]), column("done", [])]} />,
    );
    expect(screen.queryByText("To do")).not.toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText("Backlog")).toBeNull();
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });
});

describe("KanbanBoard - draggable (onTaskMove present)", () => {
  it("renders every status column (minus cancelled) so empties are drop targets", () => {
    render(
      <KanbanBoard columns={[column("todo", [task()])]} onTaskMove={() => {}} />,
    );
    for (const status of BOARD_COLUMN_ORDER) {
      expect(screen.queryByText(TASK_STATUS_LABEL[status])).not.toBeNull();
    }
    expect(screen.queryByText("Cancelled")).toBeNull();
  });

  it("drops a card into an empty column and reports the move", () => {
    const onTaskMove = vi.fn();
    const t = task();
    const { container } = render(
      <KanbanBoard columns={[column("todo", [t])]} onTaskMove={onTaskMove} />,
    );
    const dataTransfer = startDrag(container);
    // The drop handler sits on the column root; events bubble up from the pill.
    fireEvent.drop(screen.getByText("Blocked"), { dataTransfer });
    expect(onTaskMove).toHaveBeenCalledTimes(1);
    expect(onTaskMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: t.id }),
      "blocked",
    );
  });

  it("shows the drop affordance on a valid hover", () => {
    const { container } = render(
      <KanbanBoard columns={[column("todo", [task()])]} onTaskMove={() => {}} />,
    );
    expect(container.querySelector(".ring-2")).toBeNull();
    startDrag(container);
    fireEvent.dragEnter(screen.getByText("In progress"));
    expect(container.querySelector('[class*="--glow-accent"]')).not.toBeNull();
  });

  it("refuses in_review for a railed task and explains the gate", () => {
    const onTaskMove = vi.fn();
    const { container } = render(
      <KanbanBoard
        columns={[column("todo", [task({ type: "bug" })])]}
        onTaskMove={onTaskMove}
      />,
    );
    const dataTransfer = startDrag(container);
    fireEvent.dragEnter(screen.getByText("In review"));
    expect(
      screen.queryByText("In review is set by the stage gate."),
    ).not.toBeNull();
    fireEvent.drop(screen.getByText("In review"), { dataTransfer });
    expect(onTaskMove).not.toHaveBeenCalled();
  });

  it("allows in_review for an unrailed (plain task) card", () => {
    const onTaskMove = vi.fn();
    const t = task({ type: "task" });
    const { container } = render(
      <KanbanBoard columns={[column("todo", [t])]} onTaskMove={onTaskMove} />,
    );
    const dataTransfer = startDrag(container);
    fireEvent.drop(screen.getByText("In review"), { dataTransfer });
    expect(onTaskMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: t.id }),
      "in_review",
    );
  });

  it("ignores a drop on the card's own column (same-status no-op)", () => {
    const onTaskMove = vi.fn();
    const { container } = render(
      <KanbanBoard columns={[column("todo", [task()])]} onTaskMove={onTaskMove} />,
    );
    const dataTransfer = startDrag(container);
    fireEvent.drop(screen.getByText("To do"), { dataTransfer });
    expect(onTaskMove).not.toHaveBeenCalled();
  });
});

describe("SwimlaneBoard - draggable", () => {
  const lane = (key: string, label: string, tasks: Task[]): Swimlane => ({
    key,
    label,
    total: tasks.length,
    columns: [column("todo", tasks)],
  });

  it("static lanes keep only their non-empty columns", () => {
    render(<SwimlaneBoard lanes={[lane("l1", "Ada", [task()])]} />);
    expect(screen.queryByText("To do")).not.toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("draggable lanes render the full column row; a drop is a status change", () => {
    const onTaskMove = vi.fn();
    const t = task();
    const { container } = render(
      <SwimlaneBoard
        lanes={[lane("l1", "Ada", [t])]}
        onTaskMove={onTaskMove}
      />,
    );
    // The lane fills in its empty statuses (minus cancelled).
    for (const status of BOARD_COLUMN_ORDER) {
      expect(screen.queryByText(TASK_STATUS_LABEL[status])).not.toBeNull();
    }
    const dataTransfer = startDrag(container);
    fireEvent.drop(screen.getByText("In progress"), { dataTransfer });
    expect(onTaskMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: t.id }),
      "in_progress",
    );
  });
});
