// @vitest-environment jsdom

/**
 * Unit tests for `<ConfidenceBadge>` - the subtle ring that shows how confident
 * Athena is in an artifact it produced (a task deliverable or a chat answer).
 *
 * Per repo convention (no `@testing-library/jest-dom`): assertions use plain
 * DOM property / attribute checks.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ConfidenceBadge } from "@/components/ui/confidence-badge";

describe("<ConfidenceBadge>", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders nothing when there is no score", () => {
    const { container: c1 } = render(<ConfidenceBadge score={null} />);
    expect(c1.firstChild).toBeNull();
    cleanup();
    const { container: c2 } = render(<ConfidenceBadge score={undefined} />);
    expect(c2.firstChild).toBeNull();
    cleanup();
    const { container: c3 } = render(<ConfidenceBadge score={Number.NaN} />);
    expect(c3.firstChild).toBeNull();
  });

  it("shows the score as an integer percentage", () => {
    render(<ConfidenceBadge score={0.86} />);
    expect(screen.queryByText("86")).not.toBeNull();
  });

  it("clamps an out-of-range score into [0, 100]", () => {
    render(<ConfidenceBadge score={1.4} />);
    expect(screen.queryByText("100")).not.toBeNull();
  });

  it("maps high/medium/low to the success/warning/danger token classes", () => {
    const ringClass = (score: number): string => {
      cleanup();
      render(<ConfidenceBadge score={score} />);
      // The value arc is the SVG <circle> carrying the level stroke token.
      return screen.getByRole("button").innerHTML;
    };
    expect(ringClass(0.9)).toContain("--success-ink");
    expect(ringClass(0.6)).toContain("--warning-ink");
    expect(ringClass(0.3)).toContain("--danger-ink");
  });

  it("announces the level + percentage on the trigger for screen readers", () => {
    render(<ConfidenceBadge score={0.9} />);
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-label")).toContain("High confidence");
    expect(trigger.getAttribute("aria-label")).toContain("90");
  });
});
