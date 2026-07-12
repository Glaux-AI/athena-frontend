// @vitest-environment jsdom

/**
 * <ClarificationCard> - the ONE ask-the-user card (2026-07-12 consolidation:
 * the canned `clarify_scope` depth ladder is gone; `options` became optional).
 *
 * Covers: option buttons send the picked value; an option-less card renders
 * as an open question (no buttons, composer hint instead); the hint hides
 * once the question was answered (disabled).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { ClarificationCard } from "@/components/chat/clarification-card";
import type { ClarificationPayload } from "@/lib/api/client";

afterEach(cleanup);

function payload(options: string[]): ClarificationPayload {
  return {
    type: "clarification",
    clarification_id: "c1",
    question: "Which service should I trace?",
    options: options.map((o) => ({ label: o, value: o })),
  };
}

describe("ClarificationCard", () => {
  it("renders option buttons and reports the picked value", () => {
    const onPick = vi.fn();
    render(<ClarificationCard clarification={payload(["API", "Worker"])} onPick={onPick} />);
    const buttons = screen.getAllByTestId("clarification-option");
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(onPick).toHaveBeenCalledWith("Worker");
  });

  it("renders an open question without buttons when options are empty", () => {
    render(<ClarificationCard clarification={payload([])} onPick={() => {}} />);
    expect(screen.queryAllByTestId("clarification-option")).toHaveLength(0);
    expect(screen.getByTestId("clarification-open-hint")).toBeTruthy();
    expect(screen.getByText("Which service should I trace?")).toBeTruthy();
  });

  it("hides the open-question hint once answered (disabled)", () => {
    render(
      <ClarificationCard clarification={payload([])} onPick={() => {}} disabled />,
    );
    expect(screen.queryByTestId("clarification-open-hint")).toBeNull();
  });
});
