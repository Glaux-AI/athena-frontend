// @vitest-environment jsdom

/**
 * MiniPreview (components editor) - the debounced per-row preview. Pins that
 * the debounce input is a PRIMITIVE (the built HTML string): debouncing a
 * fresh object literal re-triggers the debounce effect on every render, a
 * perpetual 300 ms setState loop per expanded row. Settled means zero
 * outstanding timers.
 */

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ComponentsEditor, draftsFromInputs } from "@/components/design-tokens/components-editor";

function Harness() {
  const [components, setComponents] = useState(() =>
    draftsFromInputs([
      { name: "Button", css: ".btn{color:red}", markup: "<button class='btn'>Go</button>" },
    ]),
  );
  return (
    <ComponentsEditor components={components} onChange={setComponents} css=":root{--a:1px}" repos={[]} />
  );
}

describe("MiniPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("debounces the built html and settles - no perpetual re-render loop", () => {
    render(<Harness />);
    // Expand the row so the preview mounts.
    fireEvent.click(screen.getByRole("button", { name: "Button" }));
    const iframe = () =>
      document.querySelector('iframe[title="Button preview"]') as HTMLIFrameElement;
    expect(iframe()).toBeTruthy();

    // An edit re-renders the row; the debounced preview picks it up once the
    // 300 ms window passes.
    fireEvent.change(screen.getByLabelText("Component markup"), {
      target: { value: "<em>Hi</em>" },
    });
    act(() => {
      vi.advanceTimersByTime(301);
    });
    expect(iframe().getAttribute("srcdoc")).toContain("<em>Hi</em>");

    // Settled: nothing may keep re-scheduling the debounce (the old
    // object-literal input left a timer pending forever).
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
