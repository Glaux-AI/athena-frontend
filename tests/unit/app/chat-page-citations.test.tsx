// @vitest-environment jsdom

/**
 * /chat page citation clickability regression test.
 *
 * The /chat page must render citations as clickable `<CitationChip>` chips
 * (`data-testid="citation-chip"`) wired to one hoisted `<CitationDrawer>` -
 * not inert `title=`-only `<span>` pills.
 *
 * Pins: chips use the run-page component, clicking one opens the shared
 * `<CitationDrawer>` carrying the chip's ref (with a label fallback when no
 * `ref` is set), and the overflow `+{N}` counter past 4 chips is preserved.
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

// The page now uses `useRouter` (a proposal card's "Start task" navigates to
// the cockpit on create) - stub the App Router so render doesn't invariant.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/chat",
}));

// The page reads `me.features` for the subscription-grounding copy - the
// chips under test don't care, so a minimal anonymous session suffices.
vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({
    status: "authenticated",
    session: null,
    me: null,
    activeOrgId: "org_1",
    setActiveOrgId: () => undefined,
    refreshMe: async () => undefined,
    signOut: async () => undefined,
  }),
}));

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

import ChatPage from "@/app/(protected)/chat/page";

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

describe("/chat page · citation chips", () => {
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

    render(<ChatPage />);

    // The whole-page render is heavy; under full-suite load the default 1s
    // findBy timeout is borderline - give the first paint room to land.
    const chips = await screen.findAllByTestId("citation-chip", {}, { timeout: 5000 });
    expect(chips).toHaveLength(2);

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

    render(<ChatPage />);

    const chips = await screen.findAllByTestId("citation-chip");
    expect(chips).toHaveLength(1);
    fireEvent.click(chips[0]!);
    const drawer = await screen.findByTestId("citation-drawer");
    expect(drawer.textContent).toContain("knowledge-architecture");
  });

  it("caps the visible chips at 4 and shows the overflow counter", async () => {
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

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getAllByTestId("citation-chip")).toHaveLength(4);
    });
    expect(screen.getByText("+1")).not.toBeNull();
  });
});
