// @vitest-environment jsdom

/**
 * Athena visual blocks - pins the renderable checks (the pure router gate) and
 * the render of the document blocks: figures resolve an asset to an auth'd image
 * (never an external URL), steps/quote/chart turn compact body lines into the
 * right UI, and a no-asset figure degrades to nothing (the caller then renders a
 * plain code block). Charts/steps/quote need no network; the figure path mocks
 * the attachment blob fetch.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({
  api: { attachments: { blobUrl: vi.fn(async () => "blob:fake-url") } },
}));

// jsdom has no object-URL APIs; the figure hook revokes its blob URL on unmount.
URL.revokeObjectURL = URL.revokeObjectURL || (() => {});

import {
  Chart,
  Figure,
  Quote,
  Steps,
  SummaryCard,
  isRenderableChart,
  isRenderableFigure,
  isRenderableQuote,
  isRenderableSteps,
} from "@/components/ui/athena-blocks";

afterEach(cleanup);

describe("athena-blocks renderable checks (the pure router gate)", () => {
  it("isRenderableFigure accepts only an athena-asset ref", () => {
    expect(isRenderableFigure("asset: athena-asset://abc123")).toBe(true);
    // An external URL is rejected - the body can never point at an arbitrary host.
    expect(isRenderableFigure("asset: https://evil.example/x.png")).toBe(false);
    expect(isRenderableFigure("caption: no asset")).toBe(false);
  });

  it("isRenderableChart requires at least one numeric datum", () => {
    expect(isRenderableChart("type: bar\n\nPlatform: 4200\nGrowth: 3100")).toBe(true);
    expect(isRenderableChart("type: bar\n\njust prose, no numbers")).toBe(false);
  });

  it("isRenderableChart works in the natural format (no blank line; ': ' or '=')", () => {
    // Data rows look like attributes; the chart must parse them anyway.
    expect(isRenderableChart("type: bar\nPlatform: 4200\nGrowth: 3100")).toBe(true);
    expect(isRenderableChart("type: pie\nA = 3\nB = 1")).toBe(true);
  });

  it("isRenderableSteps / isRenderableQuote need a body", () => {
    expect(isRenderableSteps("1. do a thing")).toBe(true);
    expect(isRenderableSteps("")).toBe(false);
    expect(isRenderableQuote("a key takeaway")).toBe(true);
    expect(isRenderableQuote("")).toBe(false);
  });
});

describe("athena-blocks render", () => {
  it("Steps renders numbered items", () => {
    render(<Steps source={"1. First thing\n2. Second thing"} />);
    expect(screen.getByText("First thing")).toBeTruthy();
    expect(screen.getByText("Second thing")).toBeTruthy();
  });

  it("Quote renders the takeaway and attribution", () => {
    // `by:` is an attribute, so (like every block) it leads before the body text.
    render(<Quote source={"by: ADR-091\nFail closed, not open."} />);
    expect(screen.getByText(/Fail closed/)).toBeTruthy();
    expect(screen.getByText("ADR-091")).toBeTruthy();
  });

  it("Chart (bar) renders the title and category labels", () => {
    render(<Chart source={"type: bar\ntitle: Spend by team\n\nPlatform: 4200\nGrowth: 3100"} />);
    expect(screen.getByText("Spend by team")).toBeTruthy();
    expect(screen.getByText("Platform")).toBeTruthy();
    expect(screen.getByText("Growth")).toBeTruthy();
  });

  it("Chart (pie) renders a percentage legend", () => {
    render(<Chart source={"type: pie\n\nA: 3\nB: 1"} />);
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
  });

  it("Chart renders data with NO blank line before it (natural model format)", () => {
    render(<Chart source={"type: bar\ntitle: Spend\nPlatform: 4200\nGrowth: 3100"} />);
    expect(screen.getByText("Spend")).toBeTruthy();
    expect(screen.getByText("Platform")).toBeTruthy();
    expect(screen.getByText("Growth")).toBeTruthy();
  });

  it("Steps keeps a step that contains a colon", () => {
    render(<Steps source={"Deploy: push to prod\nVerify: run smoke tests"} />);
    expect(screen.getByText(/Deploy: push to prod/)).toBeTruthy();
    expect(screen.getByText(/Verify: run smoke tests/)).toBeTruthy();
  });

  it("SummaryCard style: tiles renders big-number tiles", () => {
    render(<SummaryCard source={"tldr: Adds rate limiting\nchips: files=12, risk=low\nstyle: tiles"} />);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("files")).toBeTruthy();
  });

  it("Figure with no valid asset renders nothing (degrades)", () => {
    const { container } = render(<Figure source={"caption: no asset here"} />);
    expect(container.firstChild).toBeNull();
  });

  it("Figure resolves an asset to an image with its caption", async () => {
    render(
      <Figure
        source={
          "asset: athena-asset://3f2504e0-4f89-41d3-9a0c-0305e82c3301\ncaption: My figure\nalt: a chart"
        }
      />,
    );
    await waitFor(() => expect(screen.getByAltText("a chart")).toBeTruthy());
    expect(screen.getByText("My figure")).toBeTruthy();
  });
});
