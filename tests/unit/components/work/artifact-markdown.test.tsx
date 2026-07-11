// @vitest-environment jsdom

/**
 * ArtifactMarkdown - pins the artifact-body rendering fix: bodies render as
 * FORMATTED markdown (headings, lists, GFM tables - never raw `#`/`-` text),
 * ```mermaid``` blocks become diagrams, and bare `kn://`/`repo://` refs render
 * as citation chips wired to the citation drawer (the raw URI never shows).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  ArtifactMarkdown,
  linkifyUriCitations,
} from "@/components/work/artifact-markdown";

vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() }),
}));
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, chart: string) => ({
      svg: `<svg data-testid="mermaid-svg"><title>${chart}</title></svg>`,
    })),
  },
}));

const drawer = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock("@/components/runs/citations/citation-drawer", () => ({
  CitationDrawer: (props: Record<string, unknown>) => {
    drawer.last = props;
    return props["open"] ? (
      <div data-testid="citation-drawer">{String(props["refValue"])}</div>
    ) : null;
  },
}));

afterEach(() => {
  cleanup();
  drawer.last = null;
});

describe("ArtifactMarkdown", () => {
  it("renders headings, lists, and tables as elements - never raw markdown text", () => {
    const body =
      "## Decisions\n\n- keep the token system\n- ship dark mode\n\n" +
      "| Option | Verdict |\n| --- | --- |\n| radio-cards | chosen |";
    const { container } = render(<ArtifactMarkdown text={body} />);
    expect(screen.getByText("Decisions").tagName).toBe("H2");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(screen.getByText("Option").tagName).toBe("TH");
    // The raw marker characters must not survive as visible text.
    expect(screen.queryByText(/## Decisions/)).toBeNull();
    expect(screen.queryByText(/^- keep/)).toBeNull();
  });

  it("renders a ```mermaid block as a diagram, not a code box", async () => {
    const { container } = render(
      <ArtifactMarkdown text={"```mermaid\ngraph TD; A-->B;\n```"} />,
    );
    expect(container.querySelector('[aria-label="Diagram"]')).not.toBeNull();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="mermaid-svg"]')).not.toBeNull(),
    );
    expect(container.querySelector("pre")).toBeNull();
  });

  it("renders kn:// and repo:// refs as chips that open the citation drawer", () => {
    render(
      <ArtifactMarkdown
        text={"Grounded in kn://athena/agent/task_pr.py:L10-L20 and repo://acme/api today."}
      />,
    );
    const chips = screen.getAllByTestId("inline-citation");
    expect(chips).toHaveLength(2);
    expect(chips[0]!.textContent).toBe("task_pr.py:L10-L20");
    // The raw scheme never renders as visible body text.
    expect(screen.queryByText(/kn:\/\//)).toBeNull();

    fireEvent.click(chips[1]!);
    expect(screen.getByTestId("citation-drawer").textContent).toBe("repo://acme/api");
    expect(drawer.last).toMatchObject({ open: true, source: "repo" });
  });
});

describe("linkifyUriCitations", () => {
  it("wraps bare refs in the private citation scheme with a basename label", () => {
    const out = linkifyUriCitations("See kn://app/billing/file.py:L12-L30 for it.");
    expect(out).toContain("[file.py:L12-L30](athena-cite:kn:");
    expect(out).toContain(encodeURIComponent("kn://app/billing/file.py:L12-L30"));
  });

  it("leaves plain text untouched", () => {
    expect(linkifyUriCitations("no refs here")).toBe("no refs here");
  });
});
