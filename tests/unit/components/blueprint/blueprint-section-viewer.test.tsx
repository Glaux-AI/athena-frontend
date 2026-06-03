// @vitest-environment jsdom

/**
 * BlueprintSectionViewer — body-rendering tests.
 *
 * Pins the fix for the "shallow blueprint" display bug: a diagram section
 * (architecture / overview / portfolio) used to render its body_json
 * diagram INSTEAD OF the body_markdown narrative (structured XOR markdown),
 * hiding the section's actual depth. Now it renders BOTH — the diagram to
 * navigate, the prose to explain. Stubs KnowledgeMermaid (mermaid lib is
 * heavy in jsdom).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import type { BlueprintSection } from "@/lib/api/client";

vi.mock("@/components/knowledge/knowledge-mermaid", () => ({
  KnowledgeMermaid: ({ chart }: { chart: string }) => <pre data-testid="mermaid-stub">{chart}</pre>,
}));

function makeSection(over: Partial<BlueprintSection> = {}): BlueprintSection {
  return {
    section_key: "architecture", title: "Architecture", summary: "System flow.",
    token_count: 200, origin: "synthesized", editable: true, locked: false,
    protected_from_ai: false, current_version: 2, has_pending_proposal: false,
    parent_section_key: null, ordering: 0,
    body_markdown: null, body_json: null, body_kind: "markdown",
    source_refs: [], last_edited_by_user_id: null, last_synced_at: null,
    ...over,
  };
}

const noop = () => {};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlueprintSectionViewer body rendering", () => {
  it("renders BOTH the diagram and the narrative for an architecture section", () => {
    render(
      <BlueprintSectionViewer
        section={makeSection({
          section_key: "architecture",
          body_json: { mermaid: 'flowchart LR\n  L0["app · 5 files"]' },
          body_markdown: "The request flow begins at the route handlers and fans out to lib.",
        })}
        onEdit={noop}
        onLockToggle={noop}
        onRegenerate={noop}
        onViewRevisions={noop}
      />,
    );
    // Diagram present (structured body) …
    expect(screen.getByTestId("mermaid-stub").textContent).toContain("flowchart LR");
    // … AND the narrative prose is shown, not hidden behind the diagram.
    expect(screen.getByText(/request flow begins at the route handlers/i)).toBeTruthy();
  });

  it("shows the narrative for a 1-repo overview where the diagram is suppressed (null mermaid)", () => {
    render(
      <BlueprintSectionViewer
        section={makeSection({
          section_key: "overview",
          title: "Overview",
          // 1-repo capability → BE suppresses the single-node diagram (mermaid null).
          body_json: { mermaid: null, repos: [{ repo_id: "r1", name: "acme/web" }] },
          body_markdown: "This capability owns billing end to end across its services.",
        })}
        onEdit={noop}
        onLockToggle={noop}
        onRegenerate={noop}
        onViewRevisions={noop}
      />,
    );
    expect(screen.queryByTestId("mermaid-stub")).toBeNull();
    expect(screen.getByText(/owns billing end to end/i)).toBeTruthy();
  });
});
