// @vitest-environment jsdom

/**
 * ChatMessage pin affordance test. Pins: the pin toggle shows on an assistant
 * answer only when pin handlers are supplied; an unpinned row pins on click,
 * a pinned row unpins; the affordance is absent without handlers and on
 * optimistic (`__local_`) rows.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ChatMessage } from "@/components/chat/chat-message";
import { type ChatMessage as ChatMessageT } from "@/lib/api/client";

afterEach(() => cleanup());

function assistant(over: Partial<ChatMessageT> = {}): ChatMessageT {
  return {
    id: "m1",
    thread_id: "t1",
    role: "assistant",
    who: "Athena",
    avatar: "AT",
    content: "the answer",
    created_at: "2026-06-30T00:00:00.000Z",
    ...over,
  };
}

const common = {
  onCitationOpen: () => {},
  onEdit: () => {},
  editDisabled: false,
  onPickClarification: () => {},
  cardsDisabled: true,
};

describe("ChatMessage pin button", () => {
  it("pins an unpinned assistant answer", () => {
    const onPin = vi.fn();
    render(<ChatMessage message={assistant()} {...common} onPin={onPin} onUnpin={() => {}} />);
    fireEvent.click(screen.getByLabelText("Pin answer"));
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it("unpins a pinned assistant answer", () => {
    const onUnpin = vi.fn();
    render(
      <ChatMessage
        message={assistant({ pinned_at: "2026-06-30T01:00:00.000Z" })}
        {...common}
        onPin={() => {}}
        onUnpin={onUnpin}
      />,
    );
    fireEvent.click(screen.getByLabelText("Unpin answer"));
    expect(onUnpin).toHaveBeenCalledTimes(1);
  });

  it("hides the pin affordance without handlers", () => {
    render(<ChatMessage message={assistant()} {...common} />);
    expect(screen.queryByLabelText("Pin answer")).toBeNull();
  });

  it("hides the pin affordance on optimistic local rows", () => {
    render(
      <ChatMessage message={assistant({ id: "__local_1" })} {...common} onPin={() => {}} onUnpin={() => {}} />,
    );
    expect(screen.queryByLabelText("Pin answer")).toBeNull();
  });
});
