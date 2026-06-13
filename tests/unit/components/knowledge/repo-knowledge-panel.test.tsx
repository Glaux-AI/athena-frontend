// @vitest-environment jsdom

/**
 * SnapshotCard unit tests (Phase D - readiness §5.27.Z).
 *
 * `SnapshotCard` is the per-repo KG snapshot card rendered on the repo
 * Topology tab. The former `RepoKnowledgePanel` bundle that co-lived in
 * this module was removed in the Phase D knowledge-UX overhaul (its only
 * mount - the cap Repos-tab inline expand - was deleted); the repo
 * Topology tab renders the interactive file graph + inline file-blueprint
 * panel and a dedicated Configs tab instead (ADR-073 §4). So this suite now
 * covers only the surviving export.
 *
 * Covers:
 *   - Renders the snapshot with the indexed SHA (branch / files / LOC are
 *     deliberately NOT here - canonical homes elsewhere per ADR-073).
 *   - Truncates the indexed SHA to 7 chars.
 *   - Pending PRs appear in the card when present.
 *   - "No pending PRs" inline hint when the list is empty.
 */

import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SnapshotCard } from "@/components/knowledge/repo-knowledge-panel";
import type { RepoKnowledge } from "@/lib/api/client";

function makeKnowledge(overrides: Partial<RepoKnowledge> = {}): RepoKnowledge {
  return {
    repo_id: "repo_t1",
    repo_full_name: "lumen/billing-svc",
    primary_language: "TypeScript",
    files_indexed: 312,
    loc: 24180,
    last_commit: { sha: "a12c4f9", when: "12m ago", author: "Jordan", message: "Tighten guards" },
    services: [],
    modules: [],
    top_files: [],
    call_edges: [],
    configs: [],
    adrs_referenced: [],
    snapshot: {
      indexed_sha: "a12c4f99999",
      indexed_branch: "main",
      last_full_sync: "12m ago",
      pending_prs: [{ pr_number: 412, sha: "a3f12abdead", changed_files: 8 }],
    },
    exports: 72,
    decision_records_referenced: 5,
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
    recent_commits: [],
    ...overrides,
  };
}

describe("SnapshotCard", () => {
  it("renders the snapshot card with the indexed SHA only (no duplicated counts)", () => {
    cleanup();
    const knowledge = makeKnowledge();
    render(<SnapshotCard knowledge={knowledge} />);

    expect(screen.getByTestId("repo-knowledge-snapshot")).toBeTruthy();
    // Indexed SHA is the snapshot's unique fact; it renders (truncated).
    expect(screen.getByText("a12c4f9")).toBeTruthy();
    // Branch / files / LOC are NOT duplicated here (canonical homes: the
    // ScopeHeader slug + TopologyHeader per ADR-073).
    expect(screen.queryByText("main")).toBeNull();
    expect(screen.queryByText(knowledge.loc.toLocaleString())).toBeNull();
  });

  it("truncates the indexed SHA to 7 chars in the snapshot", () => {
    cleanup();
    render(<SnapshotCard knowledge={makeKnowledge()} />);
    // a12c4f99999 -> a12c4f9
    expect(screen.getByText("a12c4f9")).toBeTruthy();
  });

  it("renders the pending-PR chip when snapshot.pending_prs is populated", () => {
    cleanup();
    render(<SnapshotCard knowledge={makeKnowledge()} />);
    // Short SHA + PR number.
    expect(screen.getByText(/#412/)).toBeTruthy();
  });

  it("renders 'No pending PRs' inline hint when snapshot.pending_prs is empty", () => {
    cleanup();
    render(
      <SnapshotCard
        knowledge={makeKnowledge({
          snapshot: {
            indexed_sha: "deadbeefcafe",
            indexed_branch: "main",
            last_full_sync: "1h ago",
            pending_prs: [],
          },
        })}
      />,
    );
    expect(screen.getByText(/no pending prs/i)).toBeTruthy();
  });
});
