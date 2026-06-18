// @vitest-environment jsdom

/**
 * Athena adaptive visual blocks - the `parseBlock` reader, the renderable
 * predicates, and the two block components (SummaryCard / Callout).
 *
 * The contract these pin: the parser is TOTAL (never throws, splits attrs on
 * the first `": "` so values may carry `:`, body = non-attr lines + everything
 * after the first blank line), the tone map falls back to `info`, and an empty
 * / malformed block degrades to render-nothing (so the markdown router falls
 * through to a plain code block) rather than throwing.
 */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

import {
  parseBlock,
  isRenderableSummary,
  isRenderableCallout,
  SummaryCard,
  Callout,
} from "@/components/ui/athena-blocks";

afterEach(cleanup);

describe("parseBlock", () => {
  it("splits attributes on the first ': ' and gathers the trailing body", () => {
    const { attrs, body } = parseBlock(
      ["type: risk", "title: Redis dependency", "", "If Redis is unreachable the limiter fails open."].join("\n"),
    );
    expect(attrs).toEqual({ type: "risk", title: "Redis dependency" });
    expect(body).toBe("If Redis is unreachable the limiter fails open.");
  });

  it("keeps a ':' inside a value - the FIRST ': ' wins (paths are safe)", () => {
    const { attrs } = parseBlock("tldr: Edit app/api.py:42 to add the guard.");
    expect(attrs["tldr"]).toBe("Edit app/api.py:42 to add the guard.");
  });

  it("lower-cases + trims the key so 'Type:' and 'type:' read the same", () => {
    const { attrs } = parseBlock("Type:   warn");
    expect(attrs["type"]).toBe("warn");
  });

  it("treats a non key:value line in the head as the start of the body", () => {
    const { attrs, body } = parseBlock(["type: info", "this is already body text", "more body"].join("\n"));
    expect(attrs).toEqual({ type: "info" });
    expect(body).toBe("this is already body text\nmore body");
  });

  it("ends the attribute head at the first blank line (later key:value is body)", () => {
    const { attrs, body } = parseBlock(["tldr: lead line", "", "key: value still counts as body"].join("\n"));
    expect(attrs).toEqual({ tldr: "lead line" });
    expect(body).toBe("key: value still counts as body");
  });

  it("ignores blank attribute lines and an unknown key is simply carried", () => {
    const { attrs } = parseBlock(["", "tldr: x", "unknown: y"].join("\n"));
    expect(attrs).toEqual({ tldr: "x", unknown: "y" });
  });

  it("a single-word line with no ': ' is body, not an attribute (no key:value)", () => {
    // "key:value" (no space after the colon) is NOT an attribute by the rules.
    const { attrs, body } = parseBlock("notanattr:novalue");
    expect(attrs).toEqual({});
    expect(body).toBe("notanattr:novalue");
  });

  it("never throws on empty / whitespace / odd input", () => {
    expect(() => parseBlock("")).not.toThrow();
    expect(parseBlock("")).toEqual({ attrs: {}, body: "" });
    expect(() => parseBlock("   \n\n   ")).not.toThrow();
    // @ts-expect-error - exercising the total-reader contract against bad input.
    expect(() => parseBlock(undefined)).not.toThrow();
  });
});

describe("SummaryCard", () => {
  it("renders the tldr lead line and labeled stat pills", () => {
    render(
      createElement(SummaryCard, {
        source: [
          "tldr: Add token-bucket rate limiting to the public API.",
          "chips: scope=3 files · changes=1 add / 2 modify · risk=low",
        ].join("\n"),
      }),
    );
    expect(screen.getByText("Add token-bucket rate limiting to the public API.")).toBeTruthy();
    expect(screen.getByTestId("athena-summary")).toBeTruthy();
    // Label + value of one chip render as separate spans.
    expect(screen.getByText("scope")).toBeTruthy();
    expect(screen.getByText("3 files")).toBeTruthy();
    expect(screen.getByText("low")).toBeTruthy();
  });

  it("splits chips on ' · ' OR ',' and supports a bare value-only chip", () => {
    render(createElement(SummaryCard, { source: "chips: a=1, gate=implementation, standalone" }));
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("implementation")).toBeTruthy();
    expect(screen.getByText("standalone")).toBeTruthy();
  });

  it("renders tldr alone when there are no chips", () => {
    render(createElement(SummaryCard, { source: "tldr: A trivial one-line conclusion." }));
    expect(screen.getByText("A trivial one-line conclusion.")).toBeTruthy();
    expect(isRenderableSummary("tldr: A trivial one-line conclusion.")).toBe(true);
  });

  it("renders null (and reports not-renderable) for an empty block", () => {
    const { container } = render(createElement(SummaryCard, { source: "" }));
    expect(container.firstChild).toBeNull();
    expect(isRenderableSummary("")).toBe(false);
    expect(isRenderableSummary("foo: bar")).toBe(false); // no tldr, no chips
  });
});

describe("Callout", () => {
  it("maps each known tone to its data-tone and renders title + body", () => {
    render(
      createElement(Callout, {
        source: ["type: risk", "title: Redis dependency", "", "The limiter **fails open**."].join("\n"),
      }),
    );
    const box = screen.getByTestId("athena-callout");
    expect(box.getAttribute("data-tone")).toBe("risk");
    expect(screen.getByText("Redis dependency")).toBeTruthy();
    // MarkdownLite renders the inline bold from the body.
    expect(screen.getByText("fails open")).toBeTruthy();
  });

  it.each([
    ["info", "info"],
    ["warn", "warn"],
    ["risk", "risk"],
    ["success", "success"],
  ])("tone %s -> data-tone %s", (type, expected) => {
    render(createElement(Callout, { source: `type: ${type}\ntitle: t` }));
    expect(screen.getByTestId("athena-callout").getAttribute("data-tone")).toBe(expected);
  });

  it("falls back to info for an unknown or missing type", () => {
    const { container: c1 } = render(createElement(Callout, { source: "type: explode\ntitle: t" }));
    expect(c1.querySelector('[data-testid="athena-callout"]')?.getAttribute("data-tone")).toBe("info");
    const { container: c2 } = render(createElement(Callout, { source: "title: no type here" }));
    expect(c2.querySelector('[data-testid="athena-callout"]')?.getAttribute("data-tone")).toBe("info");
  });

  it("renders a body-only callout (no title)", () => {
    render(createElement(Callout, { source: "type: info\n\nJust a note with no heading." }));
    expect(screen.getByText("Just a note with no heading.")).toBeTruthy();
    expect(isRenderableCallout("type: info\n\nJust a note with no heading.")).toBe(true);
  });

  it("renders null (and reports not-renderable) for an empty block", () => {
    const { container } = render(createElement(Callout, { source: "type: warn" }));
    expect(container.firstChild).toBeNull();
    expect(isRenderableCallout("type: warn")).toBe(false);
    expect(isRenderableCallout("")).toBe(false);
  });

  it("does not throw on a malformed block", () => {
    expect(() => render(createElement(Callout, { source: ":::\n\n```\nunbalanced" }))).not.toThrow();
  });
});
