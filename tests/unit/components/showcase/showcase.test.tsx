// @vitest-environment jsdom

/**
 * Public showcase UI unit tests (ADR-093):
 *   - ShowcaseRepoCard links to the repo ONLY when ready; an indexing repo
 *     renders a status badge and no navigation.
 *   - ShowcaseSectionBlock renders a derived-item list and fires onNode with
 *     the clicked item's node_id (the click-to-dossier wiring).
 *   - format helpers compact + usd render the metric strings.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ShowcaseRepoCard } from "@/components/showcase/showcase-repo-card";
import { ShowcaseMetricsBar } from "@/components/showcase/showcase-metrics";
import { ShowcaseSectionBlock } from "@/components/showcase/showcase-section";
import { ShowcaseNodeView } from "@/components/showcase/showcase-node-view";
import { compact, usd } from "@/components/showcase/format";
import type {
  ShowcaseNodeDossier,
  ShowcaseRepoMetrics,
  ShowcaseRepoSummary,
  ShowcaseSection,
} from "@/lib/api/public-client";

afterEach(cleanup);

function metrics(over: Partial<ShowcaseRepoMetrics> = {}): ShowcaseRepoMetrics {
  return {
    files_indexed: 1200,
    lines_of_code: 354000,
    node_count: 4300,
    edge_count: 5000,
    exports: 90,
    primary_language: "TypeScript",
    architectural_pattern: "layered",
    ingest_cost_usd: 12.5,
    commit_sha: "93d9a73b",
    commit_short: "93d9a73",
    last_synced_at: "2026-06-24T10:00:00Z",
    commits_behind: 0,
    knowledge_models: [
      { model: "gemini-3.5-flash", calls: 120, cost_usd: 9.0 },
      { model: "gemini-3.1-flash-lite", calls: 1100, cost_usd: 3.5 },
    ],
    ...over,
  };
}

function repo(over: Partial<ShowcaseRepoSummary> = {}): ShowcaseRepoSummary {
  return {
    repo_id: "r1",
    slug: "react",
    full_name: "facebook/react",
    owner: "facebook",
    name: "react",
    summary: "A JS library for building UIs.",
    default_branch: "main",
    ready: true,
    ingestion_status: "ready",
    metrics: metrics(),
    ...over,
  };
}

describe("ShowcaseRepoCard", () => {
  it("links to the repo when ready", () => {
    render(<ShowcaseRepoCard repo={repo()} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/showcase/react");
    expect(screen.getByText("react")).toBeTruthy();
  });

  it("shows a status badge and no link while indexing", () => {
    render(<ShowcaseRepoCard repo={repo({ ready: false, ingestion_status: "indexing" })} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Indexing")).toBeTruthy();
  });
});

describe("ShowcaseSectionBlock", () => {
  function section(over: Partial<ShowcaseSection> = {}): ShowcaseSection {
    return {
      section_key: "api_surface",
      title: "API surface",
      summary: "Public endpoints.",
      origin: "derived",
      body_markdown: null,
      body_json: {
        items: [
          { node_id: "n1", name: "GET /v1/repos", path: "routes/repos.py", kind: "api_endpoint" },
        ],
      },
      body_kind: "json",
      source_refs: [],
      ...over,
    };
  }

  it("renders derived items and fires onNode on click", () => {
    const onNode = vi.fn();
    render(<ShowcaseSectionBlock section={section()} onNode={onNode} />);
    expect(screen.getByText("API surface")).toBeTruthy();
    fireEvent.click(screen.getByText("GET /v1/repos"));
    expect(onNode).toHaveBeenCalledWith("n1");
  });
});

describe("ShowcaseNodeView", () => {
  function nodeDossier(over: Partial<ShowcaseNodeDossier> = {}): ShowcaseNodeDossier {
    return {
      id: "n1",
      node_kind: "file",
      path: "src/app.ts",
      name: "app.ts",
      summary: null,
      layer: "app",
      tags: ["entrypoint"],
      repo_full_name: "facebook/react",
      dossier: {
        headline: "The app entry point.",
        what: "Boots the application.",
        architecture: { role: "entry", layer: "app", pattern: null, responsibilities: ["wires routes"] },
        signals: { language: "TypeScript", loc: 120 },
        relations: {
          imported_by: Array.from({ length: 14 }, (_, i) => ({
            node_id: `dep${i}`,
            name: `mod${i}.ts`,
            kind: "file",
          })),
        },
        elements: [{ name: "main", kind: "function", line_start: 1, line_end: 10 }],
        provenance: { llm: true, model: "gemini-3.5-flash" },
      },
      body: null,
      ...over,
    };
  }

  it("surfaces key aspects, elements and relationships", () => {
    render(<ShowcaseNodeView node={nodeDossier()} onBack={() => {}} onNav={() => {}} />);
    expect(screen.getByText("The app entry point.")).toBeTruthy();
    expect(screen.getByText("wires routes")).toBeTruthy(); // key aspect
    expect(screen.getByText("main")).toBeTruthy(); // folded element
    expect(screen.getByText("Relationships")).toBeTruthy(); // grouped at bottom
    expect(screen.getByText("mod0.ts")).toBeTruthy();
  });

  it("paginates a long relation list to 10 with a show-more toggle", () => {
    render(<ShowcaseNodeView node={nodeDossier()} onBack={() => {}} onNav={() => {}} />);
    expect(screen.getByText("mod0.ts")).toBeTruthy();
    expect(screen.queryByText("mod13.ts")).toBeNull(); // 14 refs → only 10 shown
    fireEvent.click(screen.getByText("Show 4 more"));
    expect(screen.getByText("mod13.ts")).toBeTruthy();
  });

  it("shows the full file source when no LLM dossier was generated", () => {
    const node = nodeDossier({
      dossier: { provenance: { llm: false } },
      body: { content: "export const x = 1;", language: "TypeScript", truncated: false },
    });
    render(<ShowcaseNodeView node={node} onBack={() => {}} onNav={() => {}} />);
    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("export const x = 1;")).toBeTruthy();
  });
});

describe("ShowcaseMetricsBar", () => {
  it("shows the knowledge-generation model with an overflow count", () => {
    render(<ShowcaseMetricsBar metrics={metrics()} />);
    expect(screen.getByText("Generated by")).toBeTruthy();
    expect(screen.getByText("gemini-3.5-flash")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
  });

  it("omits the model chip when none were recorded", () => {
    render(<ShowcaseMetricsBar metrics={metrics({ knowledge_models: [] })} />);
    expect(screen.queryByText("Generated by")).toBeNull();
  });
});

describe("format", () => {
  it("compacts large numbers and formats usd", () => {
    expect(compact(354000)).toBe("354K");
    expect(usd(0)).toBe("$0");
    expect(usd(0.004)).toBe("$0.0040");
    expect(usd(12.5)).toBe("$12.50");
  });
});
