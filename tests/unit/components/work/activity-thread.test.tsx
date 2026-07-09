// @vitest-environment jsdom

/**
 * ActivityThread - the task page's main-column comments + decision log
 * (Work OS rehaul W2). Pins:
 *  - the foot composer posts kind `comment` by default (human discussion);
 *  - the Comment | Steer segmented toggle only exists when steering makes
 *    sense (`canSteer`), and the Steer segment posts kind `steer` text-only;
 *  - typing `@` offers a member list; picking inserts a single-token handle
 *    (the email local-part when the display name has spaces);
 *  - a posted entry refreshes the thread via onChanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { Member } from "@/lib/api/client";

const { postThreadMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  postThreadMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: { ...actual.api.tasks, postThread: postThreadMock },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { ActivityThread } from "@/components/work/decision-sidebar";

function member(extra: Partial<Member> = {}): Member {
  return {
    user_id: "u1",
    membership_id: "m1",
    email: "vikas@acme.com",
    display_name: "Vikas Kumar",
    avatar_url: null,
    role: "engineer",
    is_owner: false,
    joined_at: "2026-01-01T00:00:00Z",
    deactivated_at: null,
    ...extra,
  };
}

const MEMBERS: Member[] = [
  member(),
  member({ user_id: "u2", membership_id: "m2", display_name: "Ada", email: "ada@acme.com" }),
];

function renderThread(overrides: Partial<Parameters<typeof ActivityThread>[0]> = {}) {
  return render(
    <ActivityThread
      taskId="t1"
      entries={[]}
      isLoading={false}
      onChanged={() => {}}
      memberById={new Map(MEMBERS.map((m) => [m.user_id, m]))}
      meId="me"
      members={MEMBERS}
      canSteer={false}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityThread composer", () => {
  it("posts kind comment by default and refreshes the thread", async () => {
    postThreadMock.mockResolvedValue({});
    const onChanged = vi.fn();
    renderThread({ onChanged });

    fireEvent.change(screen.getByRole("textbox", { name: /write a comment/i }), {
      target: { value: "Ship it after the demo." },
    });
    fireEvent.click(screen.getByRole("button", { name: /comment/i }));

    await waitFor(() =>
      expect(postThreadMock).toHaveBeenCalledWith("t1", {
        kind: "comment",
        body: "Ship it after the demo.",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The box clears after a successful post.
    expect(
      (screen.getByRole("textbox", { name: /write a comment/i }) as HTMLTextAreaElement)
        .value,
    ).toBe("");
  });

  it("hides the Comment | Steer toggle when steering makes no sense", () => {
    renderThread({ canSteer: false });
    expect(screen.queryByRole("radiogroup", { name: /post as/i })).toBeNull();
  });

  it("shows the toggle when canSteer and posts kind steer from the Steer segment", async () => {
    postThreadMock.mockResolvedValue({});
    renderThread({ canSteer: true });

    const group = screen.getByRole("radiogroup", { name: /post as/i });
    expect(group).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /steer/i }));

    fireEvent.change(screen.getByRole("textbox", { name: /steer athena/i }), {
      target: { value: "Focus on the retry path." },
    });
    fireEvent.click(screen.getByRole("button", { name: /steer athena/i }));

    await waitFor(() =>
      expect(postThreadMock).toHaveBeenCalledWith("t1", {
        kind: "steer",
        body: "Focus on the retry path.",
      }),
    );
  });

  it("meta+Enter submits the comment", async () => {
    postThreadMock.mockResolvedValue({});
    renderThread();

    const box = screen.getByRole("textbox", { name: /write a comment/i });
    fireEvent.change(box, { target: { value: "quick note" } });
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });

    await waitFor(() =>
      expect(postThreadMock).toHaveBeenCalledWith("t1", {
        kind: "comment",
        body: "quick note",
      }),
    );
  });

  it("offers members on @ and inserts the email local-part for spaced names", async () => {
    renderThread();
    const box = screen.getByRole("textbox", {
      name: /write a comment/i,
    }) as HTMLTextAreaElement;

    // Type "@vi" with the caret at the end - the assist should list Vikas.
    fireEvent.change(box, { target: { value: "@vi" } });
    const option = await screen.findByText("Vikas Kumar");
    fireEvent.mouseDown(option);

    // "Vikas Kumar" has a space, so the inserted handle is the email local-part.
    expect(box.value).toBe("@vikas ");
    // Nothing was posted - inserting a mention is not a submit.
    expect(postThreadMock).not.toHaveBeenCalled();
  });

  it("surfaces a post failure as a toast and keeps the text", async () => {
    postThreadMock.mockRejectedValue(new Error("boom"));
    renderThread();

    const box = screen.getByRole("textbox", { name: /write a comment/i });
    fireEvent.change(box, { target: { value: "will fail" } });
    fireEvent.click(screen.getByRole("button", { name: /comment/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect((box as HTMLTextAreaElement).value).toBe("will fail");
  });
});
