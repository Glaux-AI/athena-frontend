// @vitest-environment jsdom

/**
 * Chat-drawer citation clickability test.
 *
 * Bug: the chat-drawer rendered citations as inert `<span>` pills — they
 * carried `title=` but no `onClick`. The run-page surface already had
 * clickable `<CitationChip>` chips that opened a `<CitationDrawer>`; this
 * test pins that the same component is now wired into the chat-drawer
 * with one hoisted drawer instance for all chips in the conversation.
 *
 * Coverage:
 *   - Chips render with `data-testid="citation-chip"` (proves the run-page
 *     component is in use, not a bespoke chat-drawer pill).
 *   - Clicking a chip opens the shared `<CitationDrawer>`.
 *   - The drawer carries the chip's ref string in its body.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup, fireEvent, render, screen, waitFor,
} from "@testing-library/react";

import type { ChatMessage, ChatThread } from "@/lib/api/client";

const { listThreadsMock, getThreadMock } = vi.hoisted(() => ({
  listThreadsMock: vi.fn(),
  getThreadMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      chat: {
        ...actual.api.chat,
        listThreads: listThreadsMock,
        getThread: getThreadMock,
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Drawer's `apiFetch` resolves real network — stub global `fetch` so the
// resolver hit doesn't blow up in jsdom and the drawer can still surface
// the fallback ref view.
beforeEach(() => {
  cleanup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ title: "Mock citation", body: "mock body" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  listThreadsMock.mockReset();
  getThreadMock.mockReset();
});

import { ChatDrawer } from "@/components/chat/chat-drawer";
import { useChatDrawerStore } from "@/lib/stores/chat-drawer";

function makeThread(id: string): ChatThread {
  return {
    id,
    title: "Thread title",
    scope: { kind: "org", label: "Acme" },
    preview: "",
    updated_at: "2026-05-28T10:00:00Z",
  };
}

function makeAssistantMessage(
  id: string,
  threadId: string,
  citations: ChatMessage["citations"],
): ChatMessage {
  return {
    id,
    thread_id: threadId,
    role: "assistant",
    who: "Athena",
    avatar: "AT",
    content: "Here is the answer.",
    created_at: "2026-05-28T10:00:00Z",
    ...(citations ? { citations } : {}),
  };
}

describe("ChatDrawer · citation chips", () => {
  it("renders citations as clickable chips that open a shared drawer", async () => {
    listThreadsMock.mockResolvedValue([makeThread("t1")]);
    getThreadMock.mockResolvedValue({
      thread: makeThread("t1"),
      messages: [
        makeAssistantMessage("m1", "t1", [
          { kind: "file", label: "auth.py", ref: "kn://app/auth.py:L1-L20" },
          { kind: "adr", label: "ADR-004", ref: "kn://adrs/004.md" },
        ]),
      ],
    });

    // Open the drawer so the conversation pane mounts.
    useChatDrawerStore.setState({ open: true, activeThreadId: "t1" });

    render(<ChatDrawer />);

    // Two chips, both using the shared `<CitationChip>` component
    // (its data-testid is "citation-chip").
    const chips = await screen.findAllByTestId("citation-chip");
    expect(chips).toHaveLength(2);

    // Click the first chip — drawer should mount.
    fireEvent.click(chips[0]!);
    const drawer = await screen.findByTestId("citation-drawer");
    expect(drawer).not.toBeNull();
    expect(drawer.textContent).toContain("kn://app/auth.py:L1-L20");
  });

  it("falls back to the chip label as the drawer ref when no `ref` is set", async () => {
    listThreadsMock.mockResolvedValue([makeThread("t2")]);
    getThreadMock.mockResolvedValue({
      thread: makeThread("t2"),
      messages: [
        makeAssistantMessage("m1", "t2", [
          { kind: "doc", label: "knowledge-architecture" },
        ]),
      ],
    });
    useChatDrawerStore.setState({ open: true, activeThreadId: "t2" });

    render(<ChatDrawer />);

    const chips = await screen.findAllByTestId("citation-chip");
    expect(chips).toHaveLength(1);
    fireEvent.click(chips[0]!);
    const drawer = await screen.findByTestId("citation-drawer");
    expect(drawer.textContent).toContain("knowledge-architecture");
  });

  it("still caps the visible chips at 4 and shows the overflow counter", async () => {
    listThreadsMock.mockResolvedValue([makeThread("t3")]);
    getThreadMock.mockResolvedValue({
      thread: makeThread("t3"),
      messages: [
        makeAssistantMessage("m1", "t3", [
          { kind: "file", label: "a", ref: "kn://a" },
          { kind: "file", label: "b", ref: "kn://b" },
          { kind: "file", label: "c", ref: "kn://c" },
          { kind: "file", label: "d", ref: "kn://d" },
          { kind: "file", label: "e", ref: "kn://e" },
        ]),
      ],
    });
    useChatDrawerStore.setState({ open: true, activeThreadId: "t3" });

    render(<ChatDrawer />);

    await waitFor(() => {
      expect(screen.getAllByTestId("citation-chip")).toHaveLength(4);
    });
    expect(screen.getByText("+1")).not.toBeNull();
  });
});
