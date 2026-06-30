// @vitest-environment jsdom

/**
 * PinnedPanel test - the conversation header's pinned-answers popover. Pins:
 * nothing renders with no pins; the count opens a popover listing each pin;
 * clicking a row jumps to it; the row's X unpins. Native assertions.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PinnedPanel } from "@/components/chat/pinned-panel";
import { type ChatMessage } from "@/lib/api/client";

afterEach(() => cleanup());

function pin(id: string, content: string): ChatMessage {
  return {
    id,
    thread_id: "t1",
    role: "assistant",
    who: "Athena",
    avatar: "AT",
    content,
    created_at: "2026-06-30T00:00:00.000Z",
    pinned_at: "2026-06-30T01:00:00.000Z",
  };
}

describe("PinnedPanel", () => {
  it("renders nothing when there are no pins", () => {
    const { container } = render(<PinnedPanel pins={[]} onJump={() => {}} onUnpin={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("opens, lists pins, and jumps on click", () => {
    const onJump = vi.fn();
    render(
      <PinnedPanel pins={[pin("m1", "the auth flow answer")]} onJump={onJump} onUnpin={() => {}} />,
    );
    // Collapsed: snippet hidden until opened.
    expect(screen.queryByText("the auth flow answer")).toBeNull();
    fireEvent.click(screen.getByLabelText("Pinned answers (1)"));
    fireEvent.click(screen.getByText("the auth flow answer"));
    expect(onJump).toHaveBeenCalledWith("m1");
  });

  it("unpins from the row action", () => {
    const onUnpin = vi.fn();
    render(<PinnedPanel pins={[pin("m2", "answer two")]} onJump={() => {}} onUnpin={onUnpin} />);
    fireEvent.click(screen.getByLabelText("Pinned answers (1)"));
    fireEvent.click(screen.getByLabelText("Unpin answer"));
    expect(onUnpin).toHaveBeenCalledWith("m2");
  });
});
