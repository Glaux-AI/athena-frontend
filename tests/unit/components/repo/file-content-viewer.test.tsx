// @vitest-environment jsdom

/**
 * FileContentViewer unit tests - covers content rendering with line
 * numbers, coverage_warning banner, slice + show-full-file flow, copy
 * button, loading + error states.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { FileContentViewer } from "@/components/repo/file-content-viewer";
import type { RepoFileContentResponse } from "@/lib/api/client";

const REPO_ID = "repo_demo";
const FILE_ID = "file_seed_123";

function makeResp(over: Partial<RepoFileContentResponse> = {}): RepoFileContentResponse {
  return {
    content: "def login():\n    return 200\n",
    language: "Python",
    total_lines: 2,
    indexed_branch_sha: "abc1234567",
    citation: "[node:abc:L1-L2]",
    truncated: false,
    coverage_warning: null,
    ...over,
  };
}

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
          content: vi.fn(),
        },
      },
    },
  };
});

import { api } from "@/lib/api/client";

describe("FileContentViewer", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders content with line numbers", async () => {
    (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeResp());

    render(<FileContentViewer repoId={REPO_ID} fileId={FILE_ID} />);
    await waitFor(() => expect(screen.queryByTestId("file-content-skeleton")).toBeNull());

    const pre = screen.getByTestId("file-content-pre");
    expect(pre.textContent).toContain("def login()");
    expect(pre.textContent).toContain("return 200");
    // Line numbers 1 and 2 should be present.
    expect(pre.textContent).toMatch(/1.*def login/);
    expect(pre.textContent).toMatch(/2.*return 200/);
  });

  it("renders coverage_warning banner when envelope carries it", async () => {
    (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResp({ coverage_warning: "only first 4000 chars per file scanned" }),
    );

    render(<FileContentViewer repoId={REPO_ID} fileId={FILE_ID} />);
    await waitFor(() => expect(screen.queryByTestId("file-content-skeleton")).toBeNull());

    expect(screen.getByTestId("file-content-coverage-warning")).toBeTruthy();
    expect(screen.getByText(/Showing summary/i)).toBeTruthy();
  });

  it("passes line_start / line_end through to api.repos.files.content", async () => {
    (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeResp());

    render(<FileContentViewer repoId={REPO_ID} fileId={FILE_ID} lineStart={10} lineEnd={25} />);
    await waitFor(() =>
      expect(api.repos.files.content).toHaveBeenCalledWith(
        REPO_ID,
        FILE_ID,
        { line_start: 10, line_end: 25 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("re-fetches full file when 'Show full file' button is clicked", async () => {
    (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeResp());

    render(<FileContentViewer repoId={REPO_ID} fileId={FILE_ID} lineStart={5} lineEnd={9} />);
    await waitFor(() => expect(screen.queryByTestId("file-content-skeleton")).toBeNull());

    fireEvent.click(screen.getByTestId("file-content-show-full"));
    await waitFor(() => {
      const calls = (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mock.calls;
      // After clicking "show full", the second call should NOT include line_start/line_end.
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[2]).toEqual({});
    });
  });

  it("copy button writes content to clipboard", async () => {
    (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeResp());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<FileContentViewer repoId={REPO_ID} fileId={FILE_ID} />);
    await waitFor(() => expect(screen.queryByTestId("file-content-skeleton")).toBeNull());

    fireEvent.click(screen.getByTestId("file-content-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("def login():\n    return 200\n"));
  });

  it("shows skeleton while loading, then error + retry on failure", async () => {
    (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));

    render(<FileContentViewer repoId={REPO_ID} fileId={FILE_ID} />);
    // The skeleton is shown briefly - assert it then disappears.
    await waitFor(() => expect(screen.queryByTestId("file-content-skeleton")).toBeNull());

    expect(screen.getByTestId("file-content-error")).toBeTruthy();
    expect(screen.getByText(/nope/)).toBeTruthy();
    const retryBtn = screen.getByTestId("file-content-retry");
    expect(retryBtn).toBeTruthy();

    // Retry should call the API again.
    (api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeResp());
    fireEvent.click(retryBtn);
    await waitFor(() =>
      expect((api.repos.files.content as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });
});
