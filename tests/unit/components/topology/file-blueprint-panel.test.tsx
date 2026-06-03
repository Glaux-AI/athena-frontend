// @vitest-environment jsdom

/**
 * FileBlueprintPanel unit tests — the inline file blueprint rendered below the
 * repo Topology graph on node-select. Covers: instant seed headline before the
 * detail fetch, the lazy-loaded summary/symbols/imports body, and the
 * Open-full-detail / clear handlers.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FileBlueprintPanel } from "@/components/topology/file-blueprint-panel";
import { api, type RepoFileDetail, type TopFile } from "@/lib/api/client";

// Mock the api client so each test controls the file-detail fetch.
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      repos: {
        ...actual.api.repos,
        files: { ...actual.api.repos.files, get: vi.fn() },
      },
    },
  };
});

const SEED: TopFile = {
  id: "f_seed", name: "hydrate.py", path: "inbox-svc/src/conversations/hydrate.py",
  language: "Python", layer: "service", summary: "Reassembles email threads.",
  loc: 218, symbols: 7, importance: 0.93, is_entry_point: true,
};

function detail(over: Partial<RepoFileDetail> = {}): RepoFileDetail {
  return {
    id: "f_seed", repo_id: "repo_1", path: SEED.path, name: SEED.name,
    language: "Python", layer: "service", parser: "tree_sitter", loc: 218,
    symbols: ["hydrate", "merge_window"], imports: ["typing.Iterator"], todos: [],
    summary: "Full multi-paragraph dossier prose.", indexed_branch_sha: "abc1234",
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  // jsdom doesn't implement scrollIntoView — stub it so the mount effect runs.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("FileBlueprintPanel", () => {
  it("renders the seed headline instantly (path + entry-point + chips)", () => {
    vi.mocked(api.repos.files.get).mockReturnValue(new Promise(() => {})); // never resolves
    render(<FileBlueprintPanel repoId="repo_1" fileId="f_seed" seed={SEED} onClose={() => {}} onOpenFull={() => {}} />);
    expect(screen.getByText(SEED.path)).toBeTruthy();
    expect(screen.getByText(/entry point/i)).toBeTruthy();
    expect(screen.getByText("Python")).toBeTruthy();
  });

  it("renders summary prose + symbols + imports once the detail resolves", async () => {
    vi.mocked(api.repos.files.get).mockResolvedValue(detail());
    render(<FileBlueprintPanel repoId="repo_1" fileId="f_seed" seed={SEED} onClose={() => {}} onOpenFull={() => {}} />);
    await waitFor(() => expect(screen.getByText(/full multi-paragraph dossier/i)).toBeTruthy());
    expect(screen.getAllByTestId("file-blueprint-symbol").length).toBe(2);
    expect(screen.getByText("typing.Iterator")).toBeTruthy();
  });

  it("fires onOpenFull / onClose from the header buttons", async () => {
    vi.mocked(api.repos.files.get).mockResolvedValue(detail());
    const onOpenFull = vi.fn();
    const onClose = vi.fn();
    render(<FileBlueprintPanel repoId="repo_1" fileId="f_seed" seed={SEED} onClose={onClose} onOpenFull={onOpenFull} />);
    fireEvent.click(screen.getByTestId("file-blueprint-open-full"));
    expect(onOpenFull).toHaveBeenCalledWith("f_seed");
    fireEvent.click(screen.getByTestId("file-blueprint-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
