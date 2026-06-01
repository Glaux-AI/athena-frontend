// @vitest-environment jsdom

/**
 * ReasoningPanel test — the collapsible "what Athena is thinking" disclosure.
 * Pins: nothing renders for empty reasoning, collapsed-by-default hides the
 * text behind a toggle, and `defaultOpen` shows it immediately (used on the
 * live streaming turn). Native assertions — no jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ReasoningPanel } from "@/components/chat/reasoning-panel";

afterEach(() => cleanup());

describe("ReasoningPanel", () => {
  it("renders nothing when reasoning is blank", () => {
    const { container } = render(<ReasoningPanel reasoning="   " />);
    expect(container.firstChild).toBeNull();
  });

  it("is collapsed by default and reveals the reasoning on toggle", () => {
    render(<ReasoningPanel reasoning="weighing the auth modules" />);
    expect(screen.queryByText("weighing the auth modules")).toBeNull();
    fireEvent.click(screen.getByText("Reasoning"));
    expect(screen.getByText("weighing the auth modules")).not.toBeNull();
  });

  it("starts open when defaultOpen is set", () => {
    render(<ReasoningPanel reasoning="immediate thoughts" defaultOpen />);
    expect(screen.getByText("immediate thoughts")).not.toBeNull();
  });
});
