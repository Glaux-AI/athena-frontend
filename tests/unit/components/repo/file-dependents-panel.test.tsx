// @vitest-environment jsdom

/**
 * FileDependentsPanel unit tests — covers the §6.5.6 FE-mirror surface
 * for the three modes (dependents / dependencies / neighborhood),
 * cross-repo highlighting, hop grouping, navigation click-through,
 * empty / loading / error states.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FileDependentsPanel } from "@/components/repo/file-dependents-panel";
import type { FileDependentsEnvelope, FileDependentsItem } from "@/lib/api/client";

const REPO_ID = "repo_demo";
const FILE_ID = "file_seed_123";
const REPO_NAME = "acme/api-svc";

function makeItem(over: Partial<FileDependentsItem> = {}): FileDependentsItem {
  return {
    id: "file_peer_1",
    node_kind: "file",
    path: "src/auth/login.py",
    name: "login.py",
    summary: "Auth login handler",
    tags: ["Python"],
    layer: "API",
    repo_full_name: REPO_NAME,
    hop_distance: 1,
    ...over,
  };
}

function envelope(items: FileDependentsItem[]): FileDependentsEnvelope {
  return {
    items,
    total: items.length,
    freshness: {
      kg_snapshot_id: "abc1234567890",
      last_indexed_at: "2026-05-28T00:00:00Z",
      commits_behind: 0,
      stale_but_usable: false,
    },
    search_quality: items.length >= 2 ? "exact" : items.length === 1 ? "fuzzy" : "empty",
  };
}

// Mock the api client so each test controls the envelope.
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      repos: {
        ...actual.api.repos,
        files: {
          ...actual.api.repos.files,
          dependents: vi.fn(),
          dependencies: vi.fn(),
          slice: vi.fn(),
        },
      },
    },
  };
});

import { api } from "@/lib/api/client";

describe("FileDependentsPanel", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders tree grouped by hop_distance from mock envelope", async () => {
    const env = envelope([
      makeItem({ id: "p1", hop_distance: 1, path: "src/a.py", name: "a.py" }),
      makeItem({ id: "p2", hop_distance: 2, path: "src/b.py", name: "b.py" }),
      makeItem({ id: "p3", hop_distance: 3, path: "src/c.py", name: "c.py" }),
      makeItem({ id: "p4", hop_distance: 1, path: "src/d.py", name: "d.py" }),
    ]);
    (api.repos.files.dependents as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(env);

    render(<FileDependentsPanel repoId={REPO_ID} fileId={FILE_ID} mode="dependents" />);
    await waitFor(() => expect(screen.queryByTestId("file-dependents-dependents-skeleton")).toBeNull());

    expect(screen.getByTestId("file-dependents-dependents")).toBeTruthy();
    expect(screen.getByText(/Hop 1/)).toBeTruthy();
    expect(screen.getByText(/Hop 2/)).toBeTruthy();
    expect(screen.getByText(/Hop 3\+/)).toBeTruthy();
    expect(screen.getAllByTestId("file-dependents-row")).toHaveLength(4);
  });

  it("highlights cross-repo items when repo_full_name differs from seed", async () => {
    const env = envelope([
      makeItem({ id: "p1", repo_full_name: "acme/other-svc", path: "src/other.py" }),
      makeItem({ id: "p2", repo_full_name: REPO_NAME, path: "src/same.py" }),
    ]);
    (api.repos.files.dependents as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(env);

    render(<FileDependentsPanel repoId={REPO_ID} fileId={FILE_ID} mode="dependents" seedRepoFullName={REPO_NAME} />);
    await waitFor(() => expect(screen.queryByTestId("file-dependents-dependents-skeleton")).toBeNull());

    const rows = screen.getAllByTestId("file-dependents-row");
    expect(rows[0]?.getAttribute("data-cross-repo")).toBe("true");
    expect(rows[1]?.getAttribute("data-cross-repo")).toBe("false");
    expect(screen.getAllByText(/cross-repo/i).length).toBeGreaterThan(0);
  });

  it("invokes onNavigate when a row is clicked", async () => {
    const env = envelope([makeItem({ id: "navigate_me" })]);
    (api.repos.files.dependents as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(env);
    const onNavigate = vi.fn();

    render(
      <FileDependentsPanel
        repoId={REPO_ID}
        fileId={FILE_ID}
        mode="dependents"
        onNavigate={onNavigate}
      />,
    );
    await waitFor(() => expect(screen.queryByTestId("file-dependents-dependents-skeleton")).toBeNull());

    fireEvent.click(screen.getByTestId("file-dependents-row"));
    expect(onNavigate).toHaveBeenCalledWith("navigate_me");
  });

  it("renders empty state when envelope.items is empty", async () => {
    (api.repos.files.dependents as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(envelope([]));

    render(<FileDependentsPanel repoId={REPO_ID} fileId={FILE_ID} mode="dependents" />);
    await waitFor(() => expect(screen.queryByTestId("file-dependents-dependents-skeleton")).toBeNull());

    expect(screen.getByText(/No callers found within 3 hops/i)).toBeTruthy();
  });

  it("shows skeleton while loading", () => {
    (api.repos.files.dependents as unknown as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<FileDependentsPanel repoId={REPO_ID} fileId={FILE_ID} mode="dependents" />);
    expect(screen.getByTestId("file-dependents-dependents-skeleton")).toBeTruthy();
  });

  it("renders error message on API failure", async () => {
    (api.repos.files.dependents as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    render(<FileDependentsPanel repoId={REPO_ID} fileId={FILE_ID} mode="dependents" />);
    await waitFor(() => expect(screen.queryByTestId("file-dependents-dependents-skeleton")).toBeNull());

    expect(screen.getByTestId("file-dependents-dependents-error")).toBeTruthy();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it("renders freshness bar with snapshot SHA + search_quality", async () => {
    (api.repos.files.dependents as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      envelope([makeItem({ id: "p1" }), makeItem({ id: "p2", path: "src/x.py" })]),
    );

    render(<FileDependentsPanel repoId={REPO_ID} fileId={FILE_ID} mode="dependents" />);
    await waitFor(() => expect(screen.queryByTestId("file-dependents-dependents-skeleton")).toBeNull());

    const bar = screen.getByTestId("file-dependents-freshness");
    expect(bar.textContent).toContain("abc1234");
    expect(bar.textContent).toContain("exact");
    expect(bar.textContent).toContain("2 hits");
  });

  it("routes through api.repos.files.slice when mode === 'neighborhood'", async () => {
    (api.repos.files.slice as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(envelope([makeItem()]));

    render(<FileDependentsPanel repoId={REPO_ID} fileId={FILE_ID} mode="neighborhood" />);
    await waitFor(() => expect(screen.queryByTestId("file-dependents-neighborhood-skeleton")).toBeNull());

    expect(api.repos.files.slice).toHaveBeenCalledWith(
      REPO_ID,
      FILE_ID,
      { max_hops: 2 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByTestId("file-dependents-neighborhood")).toBeTruthy();
  });
});
