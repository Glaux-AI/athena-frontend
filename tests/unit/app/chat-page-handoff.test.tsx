// @vitest-environment jsdom

/**
 * /chat page home→chat handoff regression test.
 *
 * A draft typed into the /dashboard ask composer is carried to /chat in memory
 * (`lib/chat/draft-handoff.ts`); /chat must create a fresh org thread and send
 * that draft into it. The bug this pins: the handoff send fired BEFORE the new
 * thread's (empty) transcript finished loading, so the load's `hydrate()`
 * aborted the in-flight stream and wiped the optimistic turn - leaving an empty
 * chat with the message lost.
 *
 * Pins:
 *  1. send() is held until the new thread's transcript load settles (so
 *     hydrate() can never abort it), then fires once with the draft content
 *     into the freshly-created thread.
 *  2. Under React StrictMode's double-mount, init runs once: exactly one thread
 *     is created and the draft is never sent into a pre-existing thread.
 */

import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import type { ChatMessage, ChatThread } from "@/lib/api/client";
import { setChatDraftHandoff } from "@/lib/chat/draft-handoff";

const {
  listThreadsMock,
  getThreadMock,
  createThreadMock,
  domainsListMock,
  modelsEnabledMock,
  streamChatMessageMock,
} = vi.hoisted(() => ({
  listThreadsMock: vi.fn(),
  getThreadMock: vi.fn(),
  createThreadMock: vi.fn(),
  domainsListMock: vi.fn(),
  modelsEnabledMock: vi.fn(),
  streamChatMessageMock: vi.fn(),
}));

// The shared test setup forces mock mode (`NEXT_PUBLIC_API_MODE=mock`), under
// which /chat disables compose and never consumes a handoff. Pin live mode for
// this file so the home→chat handoff path actually runs (setup.ts documents
// per-test overrides for live-mode behaviour).
vi.mock("@/lib/config", () => ({
  config: {
    apiUrl: "http://localhost:8000",
    apiMode: "live",
    isMock: false,
    appName: "Athena",
    isProd: false,
    enterpriseSsoEnabled: false,
    supabase: { url: "", anonKey: "", isConfigured: () => false },
  },
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
        createThread: createThreadMock,
      },
      domains: { ...actual.api.domains, list: domainsListMock },
      models: { ...actual.api.models, enabled: modelsEnabledMock },
    },
  };
});

// The send path streams through `streamChatMessage`; stub it so we can assert
// WHEN it's invoked and WITH WHAT, without any real network.
vi.mock("@/lib/api/chat-stream", () => ({
  streamChatMessage: streamChatMessageMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/chat",
}));

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

import ChatPage from "@/app/(protected)/chat/page";

function makeThread(id: string): ChatThread {
  return {
    id,
    title: "New chat",
    scope: { kind: "org", label: "Acme" },
    preview: "",
    updated_at: "2026-06-12T10:00:00Z",
  };
}

function makeAssistantMessage(id: string, threadId: string): ChatMessage {
  return {
    id,
    thread_id: threadId,
    role: "assistant",
    who: "Athena",
    avatar: "AT",
    content: "Here is the answer.",
    created_at: "2026-06-12T10:00:01Z",
  };
}

/** A one-message stream so send() reaches a settled reply (no failure path). */
function fakeStream(threadId: string) {
  return (async function* () {
    yield { type: "message" as const, message: makeAssistantMessage("a1", threadId) };
  })();
}

const DRAFT = "What does the auth service do?";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  listThreadsMock.mockReset();
  getThreadMock.mockReset();
  createThreadMock.mockReset();
  domainsListMock.mockReset().mockResolvedValue([]);
  modelsEnabledMock.mockReset().mockResolvedValue([]);
  streamChatMessageMock.mockReset();
});

describe("/chat page · home→chat handoff", () => {
  it("holds the send until the new thread's transcript settles, then sends the draft into it", async () => {
    listThreadsMock.mockResolvedValue([]);
    createThreadMock.mockResolvedValue({ thread: makeThread("new1") });
    streamChatMessageMock.mockImplementation((threadId: string) => fakeStream(threadId));

    // The new thread's transcript load is held open so we can prove the send
    // waits for it (without the fix, send fires before this resolves and gets
    // aborted by the load's hydrate()).
    let resolveGet: (v: { thread: ChatThread; messages: ChatMessage[] }) => void = () => {};
    getThreadMock.mockReturnValue(
      new Promise<{ thread: ChatThread; messages: ChatMessage[] }>((r) => {
        resolveGet = r;
      }),
    );

    setChatDraftHandoff({ content: DRAFT, attachmentIds: [], model: null, effort: "medium" });
    render(<ChatPage />);

    // Init created the thread and the transcript load is in flight...
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledWith("new1"));
    // ...so the draft must NOT have been sent yet (this is the regression).
    expect(streamChatMessageMock).not.toHaveBeenCalled();

    // Settle the (empty) transcript - now the send is free to fire.
    resolveGet({ thread: makeThread("new1"), messages: [] });

    await waitFor(() => expect(streamChatMessageMock).toHaveBeenCalledTimes(1));
    expect(streamChatMessageMock.mock.calls[0]![0]).toBe("new1");
    expect(streamChatMessageMock.mock.calls[0]![1]).toBe(DRAFT);
  });

  it("creates exactly one thread under StrictMode and never sends into a pre-existing thread", async () => {
    listThreadsMock.mockResolvedValue([makeThread("existing1")]);
    createThreadMock.mockResolvedValue({ thread: makeThread("new2") });
    getThreadMock.mockImplementation((id: string) =>
      Promise.resolve({ thread: makeThread(id), messages: [] }),
    );
    streamChatMessageMock.mockImplementation((threadId: string) => fakeStream(threadId));

    setChatDraftHandoff({ content: DRAFT, attachmentIds: [], model: null, effort: "medium" });
    render(
      <StrictMode>
        <ChatPage />
      </StrictMode>,
    );

    await waitFor(() => expect(streamChatMessageMock).toHaveBeenCalled());
    // The double-mount must not consume the handoff twice / spawn two threads.
    expect(createThreadMock).toHaveBeenCalledTimes(1);
    // The draft lands in the new thread, never the pre-existing one.
    expect(streamChatMessageMock).toHaveBeenCalledTimes(1);
    expect(streamChatMessageMock.mock.calls[0]![0]).toBe("new2");
    expect(streamChatMessageMock.mock.calls[0]![1]).toBe(DRAFT);
  });
});
