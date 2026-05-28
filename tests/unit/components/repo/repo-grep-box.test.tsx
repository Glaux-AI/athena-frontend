// @vitest-environment jsdom

/**
 * RepoGrepBox unit tests — covers the §6.5.6 in-repo regex grep surface:
 * toggle expansion, Enter-to-submit, results render, coverage_warning,
 * cancellable via AbortController.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RepoGrepBox } from "@/components/repo/repo-grep-box";
import type { RepoGrepEnvelope } from "@/lib/api/client";

const REPO_ID = "repo_demo";

function envelope(over: Partial<RepoGrepEnvelope> = {}): RepoGrepEnvelope {
  return {
    items: [
      {
        path: "src/auth/login.py",
        line: 12,
        match: "def login_handler",
        context_before: "# entrypoint",
        context_after: "    return 200",
        citation: "[node:abc:L12-L12]",
      },
      {
        path: "src/auth/logout.py",
        line: 5,
        match: "def login_handler_helper",
        context_before: "",
        context_after: "    pass",
        citation: "[node:def:L5-L5]",
      },
    ],
    total: 2,
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
        grep: vi.fn(),
      },
    },
  };
});

import { api } from "@/lib/api/client";

describe("RepoGrepBox", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts collapsed; toggle button expands the input", () => {
    render(<RepoGrepBox repoId={REPO_ID} />);
    expect(screen.getByTestId("repo-grep-box-toggle")).toBeTruthy();
    expect(screen.queryByTestId("repo-grep-box-input")).toBeNull();

    fireEvent.click(screen.getByTestId("repo-grep-box-toggle"));
    expect(screen.getByTestId("repo-grep-box-input")).toBeTruthy();
    expect(screen.getByTestId("repo-grep-box-submit")).toBeTruthy();
  });

  it("submits the pattern via Enter and renders the result rows", async () => {
    (api.repos.grep as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(envelope());

    render(<RepoGrepBox repoId={REPO_ID} />);
    fireEvent.click(screen.getByTestId("repo-grep-box-toggle"));

    const input = screen.getByTestId("repo-grep-box-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "def login" } });
    // Submitting the form (which Enter does) calls the API.
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.queryByTestId("repo-grep-box-skeleton")).toBeNull());
    expect(api.repos.grep).toHaveBeenCalledWith(
      REPO_ID,
      { pattern: "def login", max_results: 50 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const rows = screen.getAllByTestId("repo-grep-box-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("src/auth/login.py");
    expect(rows[0]?.textContent).toContain(":12");
    expect(rows[0]?.textContent).toContain("def login_handler");
  });

  it("renders coverage_warning banner when envelope carries it", async () => {
    (api.repos.grep as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      envelope({ coverage_warning: "only first 4000 chars per file scanned (partial summary)" }),
    );

    render(<RepoGrepBox repoId={REPO_ID} />);
    fireEvent.click(screen.getByTestId("repo-grep-box-toggle"));
    fireEvent.change(screen.getByTestId("repo-grep-box-input"), { target: { value: "foo" } });
    fireEvent.submit(screen.getByTestId("repo-grep-box-input").closest("form")!);

    await waitFor(() => expect(screen.queryByTestId("repo-grep-box-skeleton")).toBeNull());
    expect(screen.getByTestId("repo-grep-box-coverage-warning")).toBeTruthy();
    expect(screen.getByText(/Partial scan/i)).toBeTruthy();
  });

  it("cancels in-flight requests when input changes mid-flight", async () => {
    // First call hangs forever to simulate an in-flight request.
    const abortError = new DOMException("aborted", "AbortError");
    const firstCall = vi.fn().mockImplementation(
      (_repo: string, _q: unknown, init: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(abortError));
        }),
    );
    (api.repos.grep as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(firstCall);

    render(<RepoGrepBox repoId={REPO_ID} />);
    fireEvent.click(screen.getByTestId("repo-grep-box-toggle"));
    fireEvent.change(screen.getByTestId("repo-grep-box-input"), { target: { value: "alpha" } });
    fireEvent.submit(screen.getByTestId("repo-grep-box-input").closest("form")!);

    // Wait for the call to register and the signal to be wired.
    await waitFor(() => expect(firstCall).toHaveBeenCalled());
    const signal = (firstCall.mock.calls[0]?.[2] as RequestInit | undefined)?.signal;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    // Typing a new pattern triggers cancelInFlight() which aborts the signal.
    fireEvent.change(screen.getByTestId("repo-grep-box-input"), { target: { value: "beta" } });
    expect(signal?.aborted).toBe(true);
  });

  it("renders the empty state when the envelope has zero items", async () => {
    (api.repos.grep as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(envelope({ items: [], total: 0 }));

    render(<RepoGrepBox repoId={REPO_ID} />);
    fireEvent.click(screen.getByTestId("repo-grep-box-toggle"));
    fireEvent.change(screen.getByTestId("repo-grep-box-input"), { target: { value: "no_match" } });
    fireEvent.submit(screen.getByTestId("repo-grep-box-input").closest("form")!);

    await waitFor(() => expect(screen.getByText(/No matches/i)).toBeTruthy());
  });

  it("invokes onPick with the clicked match", async () => {
    (api.repos.grep as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(envelope());
    const onPick = vi.fn();

    render(<RepoGrepBox repoId={REPO_ID} onPick={onPick} />);
    fireEvent.click(screen.getByTestId("repo-grep-box-toggle"));
    fireEvent.change(screen.getByTestId("repo-grep-box-input"), { target: { value: "def" } });
    fireEvent.submit(screen.getByTestId("repo-grep-box-input").closest("form")!);

    await waitFor(() => expect(screen.queryByTestId("repo-grep-box-skeleton")).toBeNull());
    fireEvent.click(screen.getAllByTestId("repo-grep-box-row")[0]!);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]?.path).toBe("src/auth/login.py");
  });
});
