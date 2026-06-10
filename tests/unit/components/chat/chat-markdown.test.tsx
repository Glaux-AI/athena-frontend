// @vitest-environment jsdom

/**
 * ChatMarkdown rendering test — pins that assistant message bodies render as
 * formatted markdown (the user-visible requirement): bold / inline code /
 * links, bullet + numbered lists, fenced code blocks, GFM tables, and that a
 * ```mermaid``` block is routed to the diagram renderer rather than a code box.
 *
 * next-themes + mermaid are mocked so the diagram path is deterministic and
 * doesn't pull mermaid's heavy DOM machinery into the test. Assertions are
 * native (no jest-dom) — `getBy*` already throws when an element is absent.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ChatMarkdown } from "@/components/chat/chat-markdown";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, chart: string) => ({
      svg: `<svg data-testid="mermaid-svg"><title>${chart}</title></svg>`,
    })),
  },
}));

afterEach(() => cleanup());

describe("ChatMarkdown", () => {
  it("renders bold, inline code, and external links", () => {
    render(
      <ChatMarkdown content={"This is **bold**, `inline`, and [a link](https://example.com)."} />,
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("inline").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "a link" });
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders bullet and numbered lists", () => {
    const { container } = render(
      <ChatMarkdown content={"- alpha\n- beta\n\n1. one\n2. two"} />,
    );
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(screen.getByText("alpha").tagName).toBe("LI");
    expect(screen.getByText("two").tagName).toBe("LI");
  });

  it("renders a fenced code block inside <pre><code>", () => {
    const { container } = render(<ChatMarkdown content={"```ts\nconst x = 1;\n```"} />);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.querySelector("code")).not.toBeNull();
    expect(pre!.textContent).toContain("const x = 1;");
  });

  it("renders a GFM table", () => {
    const md = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    const { container } = render(<ChatMarkdown content={md} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(screen.getByText("Col A").tagName).toBe("TH");
  });

  it("routes a mermaid block to the diagram renderer, not a code box", async () => {
    const { container } = render(
      <ChatMarkdown content={"```mermaid\ngraph TD; A-->B;\n```"} />,
    );
    // Diagram container is present synchronously; the SVG is injected async.
    expect(container.querySelector('[aria-label="Diagram"]')).not.toBeNull();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="mermaid-svg"]')).not.toBeNull(),
    );
    // It must not have fallen through to a fenced-code <pre>.
    expect(container.querySelector("pre")).toBeNull();
  });
});

describe("ChatMarkdown · inline citations", () => {
  it("renders [node:…] as a clean numbered chip, hiding the raw id + lines", () => {
    const onCitation = vi.fn();
    render(
      <ChatMarkdown
        content="One architecture [node:3b889aa7-64ed-4782-9f5f-c7d4a26f5d0f:L1-L150]."
        onCitation={onCitation}
      />,
    );
    const chip = screen.getByTestId("inline-citation");
    expect(chip.textContent).toBe("source");
    // The internal UUID / line range must never reach the DOM text.
    expect(screen.queryByText(/3b889aa7/)).toBeNull();
    expect(screen.queryByText(/L1-L150/)).toBeNull();

    fireEvent.click(chip);
    // Third arg = the chip's visible label, forwarded so the citation drawer
    // can lead with it instead of the raw ref.
    expect(onCitation).toHaveBeenCalledWith(
      "kn",
      "3b889aa7-64ed-4782-9f5f-c7d4a26f5d0f:L1-L150",
      "source",
    );
  });

  it("numbers unique refs and reuses the number for a repeat", () => {
    render(
      <ChatMarkdown
        content={
          "A [node:aaaaaaaa-0000-0000-0000-000000000001] " +
          "B [convention:bbbbbbbb-0000-0000-0000-000000000002] " +
          "C [node:aaaaaaaa-0000-0000-0000-000000000001]"
        }
        onCitation={vi.fn()}
      />,
    );
    const chips = screen.getAllByTestId("inline-citation");
    expect(chips.map((c) => c.textContent)).toEqual(["source", "decision", "source"]);
  });

  it("labels a path-style citation with the file basename", () => {
    render(
      <ChatMarkdown content={"See [node:athena/billing/tier.py:L1-L30] now."} onCitation={vi.fn()} />,
    );
    const chip = screen.getByTestId("inline-citation");
    expect(chip.textContent).toBe("tier.py");
    // The full path / line range never renders as visible body text.
    expect(screen.queryByText(/athena\/billing/)).toBeNull();
  });

  it("leaves ordinary markdown links untouched", () => {
    render(
      <ChatMarkdown content="See [the docs](https://example.com)." onCitation={vi.fn()} />,
    );
    expect(screen.queryByTestId("inline-citation")).toBeNull();
    expect(screen.getByRole("link", { name: "the docs" }).getAttribute("href")).toBe(
      "https://example.com",
    );
  });
});
