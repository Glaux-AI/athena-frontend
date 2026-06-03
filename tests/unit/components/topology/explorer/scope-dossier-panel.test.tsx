// @vitest-environment jsdom

/**
 * ScopeDossierPanel — the detail view for a synthetic scope node (repo/cap/org).
 * It has no KG row, so it loads the scope's Blueprint and previews the
 * narrative-apex sections (overview/architecture/portfolio) read-only. These
 * tests pin the orchestration: toc → preview-section fetch → render, the 404
 * soft-fail, non-404 error, the not-ready status chip, and the
 * "Open full blueprint" link. The body renderers (markdown/structured) are
 * mocked — they have their own tests — so this stays a focused unit test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import type { BlueprintSection, BlueprintStatus, BlueprintToc } from "@/lib/api/client";
import type { GNode } from "@/components/topology/explorer/explorer-graph";

// Hoisted so the (hoisted) vi.mock factories below can reference them without
// hitting a temporal-dead-zone on the class / mock fns.
const { MockApiError, mockGetToc, mockGetSection } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, msg = "") {
      super(msg);
      this.status = status;
    }
  }
  return { MockApiError, mockGetToc: vi.fn(), mockGetSection: vi.fn() };
});

// next/link → a plain anchor (no app-router context needed in jsdom).
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));

// Heavy Blueprint body renderers — the panel's job is orchestration, not body
// rendering (mermaid/markdown have their own tests). Stub them so this test
// neither pulls the mermaid chain nor asserts their internals.
vi.mock("@/components/blueprint/blueprint-structured-body", () => ({
  hasStructuredBody: () => false,
  DIAGRAM_SECTIONS: new Set(["overview", "architecture", "portfolio"]),
  BlueprintStructuredBody: () => null,
}));
vi.mock("@/components/blueprint/blueprint-section-viewer", () => ({
  MarkdownLite: ({ source }: { source: string }) => <div data-testid="md">{source}</div>,
  stripLeadingTitleHeading: (s: string) => s,
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: MockApiError,
  api: {
    blueprint: {
      repo: { getToc: mockGetToc, getSection: mockGetSection },
      capability: { getToc: mockGetToc, getSection: mockGetSection },
      org: { getToc: mockGetToc, getSection: mockGetSection },
    },
  },
}));

import { ScopeDossierPanel } from "@/components/topology/explorer/scope-dossier-panel";

function tocOf(sectionKeys: string[], status: BlueprintStatus = "ready"): BlueprintToc {
  return {
    blueprint_id: "bp1",
    scope_kind: "repo",
    capability_id: null,
    repo_id: "r1",
    status,
    last_synced_at: null,
    pending_proposals_count: 0,
    sections: sectionKeys.map((k, i) => ({
      section_key: k,
      title: k.charAt(0).toUpperCase() + k.slice(1),
      summary: "",
      token_count: 0,
      origin: "synthesized",
      editable: true,
      locked: false,
      protected_from_ai: false,
      current_version: 1,
      has_pending_proposal: false,
      parent_section_key: null,
      ordering: i,
    })),
  };
}

function sectionOf(key: string, body: string): BlueprintSection {
  return {
    section_key: key,
    title: key.charAt(0).toUpperCase() + key.slice(1),
    summary: "",
    token_count: 0,
    origin: "synthesized",
    editable: true,
    locked: false,
    protected_from_ai: false,
    current_version: 1,
    has_pending_proposal: false,
    parent_section_key: null,
    ordering: 0,
    body_markdown: body,
    body_json: null,
    body_kind: "markdown",
    source_refs: [],
    last_edited_by_user_id: null,
    last_synced_at: null,
  };
}

const repoNode: GNode = { id: "scope:repo:r1", node_kind: "repo", name: "lumen/inbox-web" };

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ScopeDossierPanel", () => {
  it("renders the scope identity + the overview body, and previews only narrative-apex sections", async () => {
    mockGetToc.mockResolvedValue(tocOf(["overview", "guardrails", "stack"]));
    mockGetSection.mockResolvedValue(sectionOf("overview", "This repo is the live support console."));

    render(
      <ScopeDossierPanel
        kind="repo"
        scopeId="r1"
        node={repoNode}
        childCount={3}
        fullHref="/capabilities/c1/repos/r1?tab=blueprint"
      />,
    );

    expect(screen.getByText("lumen/inbox-web")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("This repo is the live support console.")).toBeTruthy());

    // Only `overview` is a narrative-apex section → exactly one section fetch.
    expect(mockGetSection).toHaveBeenCalledTimes(1);
    expect(mockGetSection).toHaveBeenCalledWith("r1", "overview");

    // KPI chips + the "more sections" pointer (3 total − 1 previewed = 2).
    expect(screen.getByText("3 children loaded")).toBeTruthy();
    expect(screen.getByText("3 blueprint sections")).toBeTruthy();
    expect(screen.getByText(/2 more sections in the full blueprint/)).toBeTruthy();
  });

  it("previews multiple apex sections (overview + architecture) and skips non-apex", async () => {
    mockGetToc.mockResolvedValue(tocOf(["overview", "architecture", "api_surface"]));
    mockGetSection.mockImplementation((_id: string, key: string) =>
      Promise.resolve(sectionOf(key, key === "overview" ? "Overview prose." : "Architecture prose.")),
    );

    render(<ScopeDossierPanel kind="repo" scopeId="r1" node={repoNode} childCount={0} fullHref={null} />);

    await waitFor(() => expect(screen.getByText("Overview prose.")).toBeTruthy());
    expect(screen.getByText("Architecture prose.")).toBeTruthy();
    expect(screen.getByTestId("scope-section-overview")).toBeTruthy();
    expect(screen.getByTestId("scope-section-architecture")).toBeTruthy();
    // api_surface is not a narrative-apex section → never fetched.
    expect(mockGetSection).toHaveBeenCalledTimes(2);
    expect(mockGetSection).not.toHaveBeenCalledWith("r1", "api_surface");
  });

  it("soft-fails on 404 with a friendly note (no error card) but keeps identity + KPI", async () => {
    mockGetToc.mockRejectedValue(new MockApiError(404, "no blueprint"));

    render(<ScopeDossierPanel kind="repo" scopeId="r1" node={repoNode} childCount={5} fullHref={null} />);

    await waitFor(() => expect(screen.getByText(/hasn't been synthesized yet/i)).toBeTruthy());
    expect(screen.queryByText(/Couldn't load the blueprint/i)).toBeNull();
    expect(screen.getByText("lumen/inbox-web")).toBeTruthy();
    expect(screen.getByText("5 children loaded")).toBeTruthy();
    expect(mockGetSection).not.toHaveBeenCalled();
  });

  it("surfaces a non-404 failure softly as an inline message", async () => {
    mockGetToc.mockRejectedValue(new MockApiError(500, "boom"));

    render(<ScopeDossierPanel kind="capability" scopeId="cap1" node={undefined} childCount={0} fullHref={null} />);

    await waitFor(() => expect(screen.getByText(/Couldn't load the blueprint — boom/i)).toBeTruthy());
  });

  it("shows a status chip when the blueprint is not yet ready", async () => {
    mockGetToc.mockResolvedValue(tocOf(["overview"], "building"));
    mockGetSection.mockResolvedValue(sectionOf("overview", "Draft overview."));

    render(<ScopeDossierPanel kind="org" scopeId="org1" node={undefined} childCount={2} fullHref="/knowledge?tab=blueprint" />);

    await waitFor(() => expect(screen.getByText("blueprint building")).toBeTruthy());
  });

  it("renders the Open-full-blueprint link to the passed href, and hides it when null", async () => {
    mockGetToc.mockResolvedValue(tocOf(["overview"]));
    mockGetSection.mockResolvedValue(sectionOf("overview", "Body."));

    const withLink = render(
      <ScopeDossierPanel kind="repo" scopeId="r1" node={repoNode} childCount={1} fullHref="/capabilities/c1/repos/r1?tab=blueprint" />,
    );
    await waitFor(() => expect(screen.getByText("Body.")).toBeTruthy());
    expect(screen.getByTestId("scope-open-blueprint").getAttribute("href")).toBe(
      "/capabilities/c1/repos/r1?tab=blueprint",
    );
    withLink.unmount();

    render(<ScopeDossierPanel kind="repo" scopeId="r1" node={repoNode} childCount={1} fullHref={null} />);
    await waitFor(() => expect(screen.getByText("Body.")).toBeTruthy());
    expect(screen.queryByTestId("scope-open-blueprint")).toBeNull();
  });
});
