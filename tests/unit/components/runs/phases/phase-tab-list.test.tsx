// @vitest-environment jsdom

/**
 * PhaseTabList unit tests (readiness row 996 + §3.6 r5 + §4.x r2).
 *
 * Covers:
 *   - Renders all six Implement-track tabs with correct labels.
 *   - Renders all four PRD-track tabs when `currentTrack === "prd"`.
 *   - Click invokes `onChange` with the picked phase key.
 *   - Active tab carries `aria-selected="true"`.
 *   - Inactive tabs are reachable via the parent's roving tabindex
 *     (only the active tab is tab-stop).
 *   - ArrowRight cycles forward (wrap-around).
 *   - ArrowLeft cycles backward (wrap-around).
 *   - Home / End jump to first / last.
 *
 * Note: the repo does NOT depend on `@testing-library/jest-dom`, so these
 * tests use plain DOM property / attribute assertions.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PhaseTabList } from "@/components/runs/phases/phase-tab-list";

describe("PhaseTabList", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders all six Implement-track tabs", () => {
    render(
      <PhaseTabList
        runId="tsk_1"
        currentTrack="implement"
        activePhase="spec"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(screen.queryByRole("tab", { name: /spec/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /plan/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /implement/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /review/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /^ci$/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /^pr$/i })).not.toBeNull();
  });

  it("renders all four PRD-track tabs when track is prd", () => {
    render(
      <PhaseTabList
        runId="tsk_2"
        currentTrack="prd"
        activePhase="frame"
        onChange={vi.fn()}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(screen.queryByRole("tab", { name: /frame/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /research/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /draft/i })).not.toBeNull();
    expect(screen.queryByRole("tab", { name: /sign-off/i })).not.toBeNull();
  });

  it("invokes onChange when a tab is clicked", () => {
    const onChange = vi.fn();
    render(
      <PhaseTabList
        runId="tsk_3"
        currentTrack="implement"
        activePhase="spec"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /plan/i }));
    expect(onChange).toHaveBeenCalledWith("plan");
    fireEvent.click(screen.getByRole("tab", { name: /^pr$/i }));
    expect(onChange).toHaveBeenCalledWith("pr");
  });

  it("marks the active tab with aria-selected", () => {
    render(
      <PhaseTabList
        runId="tsk_4"
        currentTrack="implement"
        activePhase="plan"
        onChange={vi.fn()}
      />,
    );
    const plan = screen.getByRole("tab", { name: /plan/i });
    expect(plan.getAttribute("aria-selected")).toBe("true");
    const spec = screen.getByRole("tab", { name: /spec/i });
    expect(spec.getAttribute("aria-selected")).toBe("false");
  });

  it("uses a roving tabindex (only active tab is tab-stop)", () => {
    render(
      <PhaseTabList
        runId="tsk_5"
        currentTrack="implement"
        activePhase="implement"
        onChange={vi.fn()}
      />,
    );
    const implement = screen.getByRole("tab", { name: /implement/i });
    expect(implement.getAttribute("tabindex")).toBe("0");
    const spec = screen.getByRole("tab", { name: /spec/i });
    expect(spec.getAttribute("tabindex")).toBe("-1");
  });

  it("cycles to the next tab on ArrowRight (wraps from last)", () => {
    const onChange = vi.fn();
    render(
      <PhaseTabList
        runId="tsk_6"
        currentTrack="implement"
        activePhase="spec"
        onChange={onChange}
      />,
    );
    const spec = screen.getByRole("tab", { name: /spec/i });
    fireEvent.keyDown(spec, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("plan");

    cleanup();
    onChange.mockClear();
    render(
      <PhaseTabList
        runId="tsk_6b"
        currentTrack="implement"
        activePhase="pr"
        onChange={onChange}
      />,
    );
    const pr = screen.getByRole("tab", { name: /^pr$/i });
    fireEvent.keyDown(pr, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("spec");
  });

  it("cycles to the previous tab on ArrowLeft (wraps from first)", () => {
    const onChange = vi.fn();
    render(
      <PhaseTabList
        runId="tsk_7"
        currentTrack="implement"
        activePhase="plan"
        onChange={onChange}
      />,
    );
    const plan = screen.getByRole("tab", { name: /plan/i });
    fireEvent.keyDown(plan, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("spec");

    cleanup();
    onChange.mockClear();
    render(
      <PhaseTabList
        runId="tsk_7b"
        currentTrack="implement"
        activePhase="spec"
        onChange={onChange}
      />,
    );
    const spec = screen.getByRole("tab", { name: /spec/i });
    fireEvent.keyDown(spec, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("pr");
  });

  it("jumps to first / last on Home / End", () => {
    const onChange = vi.fn();
    render(
      <PhaseTabList
        runId="tsk_8"
        currentTrack="implement"
        activePhase="implement"
        onChange={onChange}
      />,
    );
    const implement = screen.getByRole("tab", { name: /implement/i });
    fireEvent.keyDown(implement, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("pr");
    fireEvent.keyDown(implement, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("spec");
  });

  it("respects the currentTrack prop and switches the tab set", () => {
    const { rerender } = render(
      <PhaseTabList
        runId="tsk_9"
        currentTrack="implement"
        activePhase="spec"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    rerender(
      <PhaseTabList
        runId="tsk_9"
        currentTrack="prd"
        activePhase="frame"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });
});
