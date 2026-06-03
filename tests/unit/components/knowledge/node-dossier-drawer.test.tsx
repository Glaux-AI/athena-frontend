// @vitest-environment jsdom

/**
 * NodeDossierDrawer unit tests — the rich-render additions: the folded-symbol
 * Elements section + the dossier Mermaid Diagram section (both post node-drop).
 * Mocks the node fetch + stubs KnowledgeMermaid (avoids the mermaid lib in
 * jsdom).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { NodeDossierDrawer } from "@/components/knowledge/node-dossier-drawer";
import { api, type NodeDossier } from "@/lib/api/client";

vi.mock("@/components/knowledge/knowledge-mermaid", () => ({
  KnowledgeMermaid: ({ chart }: { chart: string }) => <pre data-testid="mermaid-stub">{chart}</pre>,
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: { ...actual.api, knowledge: { ...actual.api.knowledge, node: vi.fn() } },
  };
});

function dossier(over: Partial<NodeDossier> = {}): NodeDossier {
  return {
    node_id: "n1", name: "hydrate.py", kind: "file", path: "svc/hydrate.py",
    headline: "Email thread reassembly", what: "Reassembles raw emails into threads.",
    architecture: { layer: "service", role: null, pattern: null, responsibilities: [] },
    signals: { language: "Python", loc: 218, tags: [] },
    contains: [], contained_by: null, relations: {}, see_also: [],
    elements: [
      { name: "ConversationHydrator", kind: "class", line_start: 32, line_end: 218, signature: "class ConversationHydrator:", doc: "Multi-stage reassembly.", complexity: 7 },
      { name: "merge_window", kind: "function", line_start: 60, line_end: 88, complexity: 3 },
    ],
    mermaid: "flowchart TD\n  A[hydrate] --> B[parser]",
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("NodeDossierDrawer rich render", () => {
  it("renders the folded Elements (symbol index) section", async () => {
    vi.mocked(api.knowledge.node).mockResolvedValue({ dossier: dossier() });
    render(<NodeDossierDrawer nodeId="n1" canBack={false} onNavigate={() => {}} onBack={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Elements \(2\)/)).toBeTruthy());
    expect(screen.getByText("ConversationHydrator")).toBeTruthy();
    expect(screen.getByText("merge_window")).toBeTruthy();
    expect(screen.getAllByTestId("dossier-element").length).toBe(2);
  });

  it("renders the dossier Mermaid diagram section", async () => {
    vi.mocked(api.knowledge.node).mockResolvedValue({ dossier: dossier() });
    render(<NodeDossierDrawer nodeId="n1" canBack={false} onNavigate={() => {}} onBack={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Diagram")).toBeTruthy());
    expect(screen.getByTestId("mermaid-stub").textContent).toContain("flowchart TD");
  });

  it("omits Elements + Diagram when absent (non-file node)", async () => {
    const d = dossier({ mermaid: null, kind: "capability" });
    delete d.elements;
    vi.mocked(api.knowledge.node).mockResolvedValue({ dossier: d });
    render(<NodeDossierDrawer nodeId="n1" canBack={false} onNavigate={() => {}} onBack={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Reassembles raw emails/)).toBeTruthy());
    expect(screen.queryByTestId("dossier-element")).toBeNull();
    expect(screen.queryByText("Diagram")).toBeNull();
  });
});
