// @vitest-environment jsdom

/**
 * RepoIngestCostCard - per-repo ingestion cost with a per-sync-cycle drill-down.
 * Covers: empty state, one row per repo, and lazy-fetching the cycle history on
 * expand (scoped to the page's from/to/source).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({
  api: { cost: { repoIngestCycles: vi.fn() } },
}));

import { api } from "@/lib/api/client";
import { RepoIngestCostCard } from "@/components/cost/repo-ingest-cost";

const rows = [
  { repo_id: "r1", name: "acme/web", usd: 186, pct: 0.024, calls: 742, prompt_tokens: 5_900_000, completion_tokens: 1_300_000, last_used: "2026-05-22T00:00:00Z" },
  { repo_id: "r2", name: "acme/api", usd: 142, pct: 0.019, calls: 511, prompt_tokens: 4_100_000, completion_tokens: 880_000, last_used: "2026-05-21T00:00:00Z" },
];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RepoIngestCostCard", () => {
  it("shows an empty state when there's no per-repo spend", () => {
    render(<RepoIngestCostCard rows={[]} source="all" from="2026-05-01" to="2026-05-31" />);
    expect(screen.getByText(/no per-repo ingestion spend yet/i)).toBeTruthy();
  });

  it("empty state on the Athena tab points BYO ingestion at the Your-keys source", () => {
    render(<RepoIngestCostCard rows={[]} source="athena" from="2026-05-01" to="2026-05-31" />);
    expect(screen.getByText(/no athena-credit ingestion/i)).toBeTruthy();
    expect(screen.getByText(/your keys/i)).toBeTruthy();
  });

  it("empty state on the Your-keys tab is source-specific", () => {
    render(<RepoIngestCostCard rows={[]} source="byo" from="2026-05-01" to="2026-05-31" />);
    expect(screen.getByText(/no your-key ingestion/i)).toBeTruthy();
  });

  it("renders one expandable row per repo with its cost", () => {
    render(<RepoIngestCostCard rows={rows} source="all" from="2026-05-01" to="2026-05-31" />);
    expect(screen.getByText("acme/web")).toBeTruthy();
    expect(screen.getByText("acme/api")).toBeTruthy();
    expect(screen.getAllByTestId("repo-ingest-row")).toHaveLength(2);
    // LLM token usage shows on each row alongside calls.
    expect(screen.getAllByText(/tokens ·/).length).toBe(2);
  });

  it("expands a row and lazily fetches its per-sync cycle history (scoped to the window)", async () => {
    vi.mocked(api.cost.repoIngestCycles).mockResolvedValue({
      repo_id: "r1",
      cycles: [
        {
          branch_sha: "a1b2c3d4567",
          started_at: "2026-05-22T00:00:00Z",
          usd: 40,
          calls: 200,
          prompt_tokens: 1000,
          completion_tokens: 300,
        },
      ],
    });
    render(<RepoIngestCostCard rows={rows} source="byo" from="2026-05-01" to="2026-05-31" />);
    fireEvent.click(screen.getAllByTestId("repo-ingest-row")[0]!);
    expect(api.cost.repoIngestCycles).toHaveBeenCalledWith("r1", {
      from: "2026-05-01",
      to: "2026-05-31",
      source: "byo",
    });
    expect(await screen.findByTestId("repo-ingest-cycles")).toBeTruthy();
    expect(screen.getByText("a1b2c3d")).toBeTruthy(); // sha sliced to 7 chars
  });
});
