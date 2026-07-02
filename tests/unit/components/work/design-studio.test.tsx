// @vitest-environment jsdom

/**
 * Design Studio (the production design surface that supersedes the plain
 * prototype preview). Pins the user-facing wiring that does NOT depend on the
 * sandboxed iframe actually executing (a real browser only):
 *   - progressive disclosure: the Pro toggle reveals read-grade Layers + Inspector;
 *   - Tier-3 whole-design refine composes the expected request;
 *   - Tier-1 token knobs appear once an element is picked (simulated bridge msg).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

import { DesignStudio } from "@/components/work/design-studio/design-studio";
import { BRIDGE_SCRIPT } from "@/components/work/design-studio/editor-bridge";
import type { PickedNode } from "@/components/work/design-studio/editor-bridge";
import type { StageRefineInput } from "@/lib/api/client";

vi.mock("@/hooks/use-enabled-models", () => ({
  useEnabledModels: () => ({ models: [], isLoading: false, error: null }),
}));

// The studio fetches the ORG's own tokens; stub it so tests never hit the
// network (and assert the studio works with the neutral-starter empty set).
vi.mock("@/lib/api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      design: { tokens: vi.fn().mockResolvedValue({ tokens: [], origin: "empty", repo_id: null }) },
    },
  };
});

afterEach(cleanup);

const CODE = "<!doctype html><html><body><button>Buy now</button></body></html>";

const noop = async () => {};

describe("DesignStudio", () => {
  it("keeps Pro tools hidden by default and reveals Layers + Inspector on toggle", () => {
    render(<DesignStudio code={CODE} onRefine={noop} onSaveEdits={noop} />);
    expect(screen.queryByText(/^Layers$/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^pro$/i }));
    expect(screen.getByText(/^Layers$/)).toBeTruthy();
    expect(screen.getByText(/^Inspector$/)).toBeTruthy();
    expect(screen.getByText(/select an element to inspect/i)).toBeTruthy();
  });

  it("composes a whole-design refine from the Edit tab", () => {
    const onRefine = vi.fn().mockResolvedValue(undefined);
    render(<DesignStudio code={CODE} onRefine={onRefine} onSaveEdits={noop} />);

    fireEvent.click(screen.getByRole("tab", { name: /edit/i }));
    const box = screen.getByPlaceholderText(/describe the change to the design/i);
    fireEvent.change(box, { target: { value: "use a teal accent" } });
    fireEvent.click(screen.getByRole("button", { name: /apply with ai/i }));

    expect(onRefine).toHaveBeenCalledTimes(1);
    const req = onRefine.mock.calls[0]?.[0] as StageRefineInput;
    expect(req.instruction).toContain("Refine the design: use a teal accent");
    expect(req.effort).toBe("medium");
  });

  it("shows token-valued knobs once an element is picked (Tier-1)", () => {
    const { container } = render(<DesignStudio code={CODE} onRefine={noop} onSaveEdits={noop} />);
    fireEvent.click(screen.getByRole("tab", { name: /edit/i }));

    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    const node: PickedNode = {
      id: "n0",
      selector: "button",
      tag: "button",
      text: "Buy now",
      snippet: "<button>Buy now</button>",
      styles: {
        color: "rgb(0, 0, 0)",
        background: "rgba(0, 0, 0, 0)",
        fontSize: "16px",
        padding: "8px",
        borderRadius: "0px",
        hidden: false,
      },
    };
    fireEvent(
      window,
      new MessageEvent("message", {
        data: { source: "athena-studio", type: "pick", node },
        source: iframe.contentWindow,
      }),
    );

    expect(screen.getByText(/^Text color$/)).toBeTruthy();
    expect(screen.getByText(/^Background$/)).toBeTruthy();
    // The picked element shows up in the scoped AI bar too.
    const bar = screen.getByText(/apply with ai/i).closest("div") as HTMLElement;
    expect(within(bar.parentElement as HTMLElement).getByText(/<button>/)).toBeTruthy();
  });

  it("keeps the iframe mounted (hidden) while the Code tab is active", () => {
    const { container } = render(<DesignStudio code={CODE} onRefine={noop} onSaveEdits={noop} />);
    fireEvent.click(screen.getByRole("tab", { name: /code/i }));

    // Unmounting would silently discard unsaved Tier-1 edits - it must stay,
    // hidden with CSS, and come back on tab return.
    const iframe = container.querySelector("iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    expect(iframe?.closest("[hidden]")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /preview/i }));
    expect(
      (container.querySelector("iframe") as HTMLIFrameElement).closest("[hidden]"),
    ).toBeNull();
  });

  it("resizes the preview wrapper via the width presets (Fit / 1280 / 768 / 375)", () => {
    const { container } = render(<DesignStudio code={CODE} onRefine={noop} onSaveEdits={noop} />);
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.className).toContain("h-[640px]");

    fireEvent.click(screen.getByRole("button", { name: "375" }));
    expect(iframe.parentElement?.className).toContain("w-[375px]");

    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(iframe.parentElement?.className).not.toContain("w-[375px]");
  });

  it("marks the injected bridge script so serialization can strip it", () => {
    const { container } = render(<DesignStudio code={CODE} onRefine={noop} onSaveEdits={noop} />);
    const iframe = container.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc")).toContain("<script data-athena-bridge>");
  });
});

describe("BRIDGE_SCRIPT serialize - stale-outline fallback sweep", () => {
  it("scrubs ONLY the exact editor-chrome signature, never a user's indigo outline", () => {
    // The chrome signature is the outline AND the -2px offset TOGETHER; a
    // user's own indigo-500 outline (e.g. a focus-ring demo) must survive.
    document.body.innerHTML =
      '<div id="stale" style="outline: rgb(99, 102, 241) solid 2px; outline-offset: -2px;">stale chrome</div>' +
      '<div id="user-ring" style="outline: 2px solid rgb(99, 102, 241);">kept - no chrome offset</div>' +
      '<div id="user-offset" style="outline: 2px solid #6366f1; outline-offset: 4px;">kept - different offset</div>';
    const posted: Array<{ type?: string; html?: string }> = [];
    const origPost = window.postMessage;
    // The bridge posts up via parent.postMessage (parent === window here).
    window.postMessage = ((msg: { type?: string; html?: string }) => {
      posted.push(msg);
    }) as typeof window.postMessage;
    try {
      // Run the real injected script in this jsdom window, then drive it with
      // the cockpit's serialize command.
      window.eval(BRIDGE_SCRIPT);
      window.dispatchEvent(
        new MessageEvent("message", { data: { dir: "athena-studio", type: "serialize" } }),
      );
    } finally {
      window.postMessage = origPost;
      document.body.innerHTML = "";
    }
    const html = posted.find((m) => m.type === "serialized")?.html ?? "";
    expect(html).toContain("<!doctype html>");
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.getElementById("stale")?.getAttribute("style") ?? "").not.toContain("outline");
    expect(doc.getElementById("user-ring")?.getAttribute("style") ?? "").toContain("99, 102, 241");
    expect(doc.getElementById("user-offset")?.getAttribute("style") ?? "").toContain("6366f1");
  });
});
