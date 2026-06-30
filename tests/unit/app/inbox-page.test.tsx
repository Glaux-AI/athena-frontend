// @vitest-environment jsdom

/**
 * /inbox page behaviour tests. Pins the fixes for the live report:
 *  - acting on a row (click) navigates to its deep link AND removes it from the
 *    default "Open" view (dismiss-after-action);
 *  - the per-row dismiss (X) clears it without navigating;
 *  - an unknown / newer kind (run_completed, chat_share) renders a neutral row
 *    instead of crashing the page (the live KIND_META undefined crash).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { InboxItem, InboxPage as InboxPageT } from "@/lib/api/client";

const { pushMock, listMock, markReadMock, markAllReadMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  listMock: vi.fn(),
  markReadMock: vi.fn(),
  markAllReadMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      inbox: { list: listMock, markRead: markReadMock, markAllRead: markAllReadMock },
    },
  };
});

import InboxPage from "@/app/(protected)/inbox/page";

function item(over: Partial<InboxItem> & Pick<InboxItem, "id" | "kind">): InboxItem {
  return {
    priority: "normal",
    when: "1h ago",
    created_at: "2026-06-30T00:00:00.000Z",
    read: false,
    task_id: null,
    title: "Title",
    actor: "Athena",
    actor_avatar: null,
    actor_kind: "agent",
    context: "Context",
    cta: "Open",
    phase: null,
    to: null,
    ...over,
  } as InboxItem;
}

const PAGE = (items: InboxItem[]): InboxPageT => ({ items, unread_count: items.filter((i) => !i.read).length, next_cursor: null });

beforeEach(() => {
  pushMock.mockReset();
  markReadMock.mockReset().mockResolvedValue({});
  markAllReadMock.mockReset().mockResolvedValue({ marked: 0 });
});
afterEach(() => cleanup());

describe("InboxPage", () => {
  it("renders an unknown/newer kind without crashing", async () => {
    listMock.mockResolvedValue(
      PAGE([
        item({ id: "r1", kind: "run_completed", title: "Task finished", task_id: "tsk_9" }),
        item({ id: "s1", kind: "chat_share", title: "A shared chat", to: "/chat?shared=sh1" }),
      ]),
    );
    render(<InboxPage />);
    expect(await screen.findByText("Task finished")).toBeTruthy();
    expect(screen.getByText("A shared chat")).toBeTruthy();
    // The new kinds resolve to real labels (not the fallback) - the label
    // shows on both the card and its filter chip.
    expect(screen.getAllByText("Task complete").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shared chat").length).toBeGreaterThan(0);
  });

  it("click navigates to the task cockpit and dismisses from the open view", async () => {
    listMock.mockResolvedValue(PAGE([item({ id: "a1", kind: "approval_needed", title: "Sign-off", task_id: "tsk_1" })]));
    render(<InboxPage />);
    const row = await screen.findByLabelText(/Sign-off/);
    fireEvent.click(row);
    expect(pushMock).toHaveBeenCalledWith("/work/tsk_1");
    expect(markReadMock).toHaveBeenCalledWith("a1");
    // Default "Open" view: the read item leaves the list.
    await waitFor(() => expect(screen.queryByText("Sign-off")).toBeNull());
  });

  it("click uses the `to` deep link when there is no task", async () => {
    listMock.mockResolvedValue(PAGE([item({ id: "m1", kind: "mention", title: "You were mentioned", to: "/chat?thread=th1" })]));
    render(<InboxPage />);
    fireEvent.click(await screen.findByLabelText(/You were mentioned/));
    expect(pushMock).toHaveBeenCalledWith("/chat?thread=th1");
    expect(markReadMock).toHaveBeenCalledWith("m1");
  });

  it("the row dismiss (X) clears it without navigating", async () => {
    listMock.mockResolvedValue(PAGE([item({ id: "b1", kind: "budget_alert", title: "Over budget", to: "/cost" })]));
    render(<InboxPage />);
    expect(await screen.findByText("Over budget")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss notification"));
    expect(markReadMock).toHaveBeenCalledWith("b1");
    expect(pushMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Over budget")).toBeNull());
  });
});
