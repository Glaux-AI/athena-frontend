// @vitest-environment jsdom

/**
 * NodeDossierDrawer unit tests - the rich-render additions: the folded-symbol
 * Elements section + the dossier Mermaid Diagram section (both post node-drop).
 * Mocks the node fetch + stubs KnowledgeMermaid (avoids the mermaid lib in
 * jsdom).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NodeDossierDrawer } from "@/components/knowledge/node-dossier-drawer";
import { api, type NodeDossier, type RepoFileRow } from "@/lib/api/client";

vi.mock("@/components/knowledge/knowledge-mermaid", () => ({
  KnowledgeMermaid: ({ chart }: { chart: string }) => <pre data-testid="mermaid-stub">{chart}</pre>,
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      knowledge: { ...actual.api.knowledge, node: vi.fn() },
      repos: { ...actual.api.repos, files: { ...actual.api.repos.files, list: vi.fn() } },
    },
  };
});

/** One file row from the repo file listing - its `id` IS the file's KG node id. */
function fileRow(over: Partial<RepoFileRow> = {}): RepoFileRow {
  return {
    id: "file1", path: "svc/checkout.ts", name: "checkout.ts", language: "ts", layer: "service",
    parser: "tree_sitter", loc: 120, symbols_count: 4, imports_count: 3, todos_count: 0,
    summary_preview: "", indexed_branch_sha: null, ...over,
  };
}

function filesOut(items: RepoFileRow[]) {
  return {
    repo_id: "r1", repo_full_name: "lumen/billing-svc", items,
    next_cursor: null, has_more: false,
    totals: { files: items.length, filtered: items.length, by_language: {}, by_layer: {} },
  };
}

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
    const d = dossier({ mermaid: null, kind: "domain" });
    delete d.elements;
    vi.mocked(api.knowledge.node).mockResolvedValue({ dossier: d });
    render(<NodeDossierDrawer nodeId="n1" canBack={false} onNavigate={() => {}} onBack={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Reassembles raw emails/)).toBeTruthy());
    expect(screen.queryByTestId("dossier-element")).toBeNull();
    expect(screen.queryByText("Diagram")).toBeNull();
  });
});

/**
 * Leaf nodes (api_endpoint / db_table / dependency / …) have no blueprint of
 * their own - opening one should land on (or link to) its home FILE's
 * blueprint, never an empty drawer.
 */
describe("NodeDossierDrawer leaf → file blueprint", () => {
  /** api_endpoint with a `contained_by` file (the populated-dossier / mock case). */
  function endpointWithFile() {
    const d = dossier({
      node_id: "ep1", name: "POST /checkout", kind: "api_endpoint", path: "svc/checkout.ts",
      mermaid: null,
      contained_by: { node_id: "file1", name: "checkout.ts", path: "svc/checkout.ts", kind: "file" },
    });
    delete d.elements;
    return {
      node_kind: "api_endpoint", name: "POST /checkout", path: "svc/checkout.ts", repo_id: "r1",
      dossier: d,
    };
  }

  it("auto-forwards a freshly-opened leaf to its file via contained_by", async () => {
    vi.mocked(api.knowledge.node).mockResolvedValue(endpointWithFile());
    const onNavigate = vi.fn();
    render(
      <NodeDossierDrawer
        nodeId="ep1" canBack={false}
        onNavigate={onNavigate} onBack={() => {}} onClose={() => {}}
        consumeForwardArm={() => true}
      />,
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("file1"));
    // No second lookup needed - the dossier already named the file.
    expect(api.repos.files.list).not.toHaveBeenCalled();
  });

  it("shows a one-click 'Open file blueprint' CTA when NOT armed (e.g. via Back)", async () => {
    vi.mocked(api.knowledge.node).mockResolvedValue(endpointWithFile());
    const onNavigate = vi.fn();
    render(
      <NodeDossierDrawer
        nodeId="ep1" canBack onNavigate={onNavigate} onBack={() => {}} onClose={() => {}}
      />,
    );
    const cta = await screen.findByTestId("open-file-blueprint");
    expect(onNavigate).not.toHaveBeenCalled(); // didn't auto-forward
    fireEvent.click(cta);
    expect(onNavigate).toHaveBeenCalledWith("file1");
  });

  it("resolves a real-mode leaf (dossier null) to its file via the file listing", async () => {
    vi.mocked(api.knowledge.node).mockResolvedValue({
      node_kind: "dependency", name: "requests", path: "requirements.txt", repo_id: "r1", dossier: null,
    });
    vi.mocked(api.repos.files.list).mockResolvedValue(
      filesOut([fileRow({ id: "file9", path: "requirements.txt", name: "requirements.txt" })]),
    );
    const onNavigate = vi.fn();
    render(
      <NodeDossierDrawer
        nodeId="dep1" canBack={false}
        onNavigate={onNavigate} onBack={() => {}} onClose={() => {}}
        consumeForwardArm={() => true}
      />,
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("file9"));
    expect(api.repos.files.list).toHaveBeenCalledWith("r1", expect.objectContaining({ q: "requirements.txt" }));
  });

  it("renders an identity fallback (no forward) for a synthetic node with no file", async () => {
    vi.mocked(api.knowledge.node).mockResolvedValue({
      node_kind: "external_system", name: "Stripe", path: "<external:Stripe>", repo_id: "r1",
      summary: "Third-party payment provider.", dossier: null,
    });
    const onNavigate = vi.fn();
    render(
      <NodeDossierDrawer
        nodeId="ext1" canBack={false}
        onNavigate={onNavigate} onBack={() => {}} onClose={() => {}}
        consumeForwardArm={() => true}
      />,
    );
    await waitFor(() => expect(screen.getByText("Third-party payment provider.")).toBeTruthy());
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("open-file-blueprint")).toBeNull();
    expect(api.repos.files.list).not.toHaveBeenCalled(); // synthetic `<…>` path → no lookup
  });
});
