// @vitest-environment jsdom

/**
 * §7 — Embed routes unit tests.
 *
 * Covers the read-only embed surfaces:
 *
 *   - `<EmbedRunPage>` renders goal + status pill + cost when given a
 *     complete run prop.
 *   - `<EmbedRunPage>` falls back to the "missing" empty state when run
 *     is null.
 *   - `<EmbedArtifactPage>` renders body + title + kind chip when given
 *     a complete artifact prop.
 *   - `<EmbedArtifactPage>` empty state when artifact is null.
 *   - `<EmbedLayout>` does NOT render the AppShell, sidebar, top nav, or
 *     command palette.
 *   - The embed layout metadata advertises `robots: noindex,follow` and
 *     `referrer: no-referrer` so embeds don't pollute search or leak
 *     the embedding host's URL.
 *
 * The presentational components are intentionally exported alongside
 * the route `default`s so we can render them here without going through
 * `params: Promise<{ id }>` / fetch / Next.js's server-side resolution.
 *
 * Per repo convention (no @testing-library/jest-dom): assertions use
 * plain DOM property / attribute checks, not `toBeInTheDocument`.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { EmbedRunPage } from "@/app/embed/runs/[id]/_view";
import { EmbedArtifactPage } from "@/app/embed/artifacts/[id]/_view";
import EmbedLayout, { metadata as embedLayoutMetadata } from "@/app/embed/layout";
import type { RunDetail, RunDocument } from "@/lib/api/client";

function buildRun(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "tsk_embed_test",
    goal: "Add retry policy to billing invoice processor",
    status: "running",
    spent_usd: 4.27,
    created_at: "2026-05-26T08:30:00Z",
    output_summary: null,
    stream_url: "http://localhost:8000/v1/runs/tsk_embed_test/events",
    kind: "implement",
    capability_id: "cap_billing",
    current_phase: 2,
    progress: 47,
    assignee: "agent:athena",
    requested_by: "sarah-c",
    source: { kind: "jira", label: "BILL-4271" },
    summary: "Customers occasionally see double charges on retry. Add an idempotent retry policy with backoff.",
    ...overrides,
  };
}

function buildArtifact(overrides: Partial<RunDocument> = {}): RunDocument {
  return {
    id: "doc_embed_test",
    run_id: "tsk_embed_test",
    kind: "spec",
    title: "billing-retry-spec.md",
    version: "v3",
    status: "needs-review",
    markdown: "# Billing Retry Spec\n\nThis spec describes the retry policy.\n\n## Goals\n\n- Idempotent retries\n- Bounded backoff\n",
    body: null,
    citations: [
      { label: "BILL-4271", kind: "ticket", ref: "https://jira.example/BILL-4271" },
      {
        label: "billing-retry.md",
        kind: "doc",
        ref: "doc_predecessor",
        embed_url: "/embed/artifacts/doc_predecessor",
      },
    ],
    org_name: "Acme Corp",
    last_edited_at: "2026-05-26T12:00:00Z",
    last_edited_by: "Sarah Chen",
    ...overrides,
  };
}

describe("EmbedRunPage", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the goal, status pill, phase progress, and cost when given a complete run", () => {
    const run = buildRun({ status: "running", spent_usd: 4.27, progress: 47 });
    render(<EmbedRunPage run={run} />);

    // Goal headline shows up verbatim.
    expect(
      screen.queryByRole("heading", { name: /add retry policy to billing invoice processor/i }),
    ).not.toBeNull();

    // Status pill renders with the bucketed label ("Running" for status=running).
    const pill = screen.getByTestId("run-status-pill");
    expect(pill.textContent ?? "").toMatch(/running/i);

    // Cost shows up in the header strip — formatted via formatUsd.
    const root = pill.parentElement?.parentElement ?? document.body;
    expect(root.textContent ?? "").toContain("$4.27");

    // Progress + phase label render as part of the header summary.
    expect(root.textContent ?? "").toContain("47%");

    // The "Open in Athena" CTA links to the in-app run URL (and uses
    // target="_top" so it breaks out of the iframe).
    const openLink = screen.getByRole("link", { name: /open in athena/i }) as HTMLAnchorElement;
    expect(openLink.getAttribute("href")).toBe("/runs/tsk_embed_test");
    expect(openLink.getAttribute("target")).toBe("_top");

    // No "Approve", "Reject", "Cancel run" buttons — read-only surface.
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel run/i })).toBeNull();
  });

  it("renders the missing empty state when run is null", () => {
    render(<EmbedRunPage run={null} />);

    // The "Run not available" copy is the canonical signal that we landed
    // in the missing-empty path, not the live one.
    expect(
      screen.queryByRole("heading", { name: /run not available/i }),
    ).not.toBeNull();

    // The goal headline from buildRun must NOT appear.
    expect(
      screen.queryByText(/add retry policy to billing invoice processor/i),
    ).toBeNull();

    // No phase rail rendered in the empty state.
    expect(screen.queryByRole("list", { name: /run phases/i })).toBeNull();
  });
});

describe("EmbedArtifactPage", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the title, kind chip, status, version, and body", () => {
    const artifact = buildArtifact();
    render(<EmbedArtifactPage artifact={artifact} />);

    // Title is the document filename, rendered as the page heading.
    expect(
      screen.queryByRole("heading", { name: /billing-retry-spec\.md/i }),
    ).not.toBeNull();

    // Kind chip carries the kind label.
    const kindChip = screen.getByTestId("artifact-kind-chip");
    expect(kindChip.textContent ?? "").toMatch(/spec/i);

    // Version + status are surfaced in the header strip.
    const header = kindChip.parentElement?.parentElement ?? document.body;
    expect(header.textContent ?? "").toContain("v3");
    expect(header.textContent ?? "").toMatch(/needs review/i);

    // Body renderer outputs at least one paragraph derived from the markdown.
    const body = screen.getByTestId("artifact-body");
    expect(body.textContent ?? "").toContain("This spec describes the retry policy.");
    expect(body.textContent ?? "").toMatch(/billing retry spec/i);

    // Metadata pill: org name + relative edit time.
    expect(header.textContent ?? "").toContain("Acme Corp");

    // Citations: the embed_url-bearing one becomes an <a>, the other stays inert.
    const citationLink = screen.queryByRole("link", { name: /billing-retry\.md/i });
    expect(citationLink).not.toBeNull();
    expect(citationLink!.getAttribute("href")).toBe("/embed/artifacts/doc_predecessor");

    // The "Open in Athena" CTA links into the run.
    const openLink = screen.getByRole("link", { name: /open in athena/i }) as HTMLAnchorElement;
    expect(openLink.getAttribute("href")).toBe("/runs/tsk_embed_test");
  });

  it("renders the missing empty state when artifact is null", () => {
    render(<EmbedArtifactPage artifact={null} />);

    expect(
      screen.queryByRole("heading", { name: /artifact not available/i }),
    ).not.toBeNull();

    // No body element when there's nothing to render.
    expect(screen.queryByTestId("artifact-body")).toBeNull();
    expect(screen.queryByTestId("artifact-kind-chip")).toBeNull();
  });
});

describe("EmbedLayout", () => {
  beforeEach(() => {
    cleanup();
  });

  it("does NOT render the AppShell, sidebar, top nav, or command palette", () => {
    const { container } = render(
      <EmbedLayout>
        <div data-testid="embed-child">Embedded payload</div>
      </EmbedLayout>,
    );

    // The child renders cleanly.
    expect(screen.getByTestId("embed-child").textContent).toBe("Embedded payload");

    // No <nav>, <aside>, or <header role="banner"> in the embed shell.
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector("aside")).toBeNull();

    // TopBar carries a "Sophia" / org-switcher region; sidebar carries the
    // /dashboard nav link. Neither must appear in the embed shell.
    expect(
      container.querySelector('[data-testid="top-bar"], [data-testid="sidebar-nav"]'),
    ).toBeNull();

    // No "Dashboard" link (the main protected-shell sidebar item).
    expect(
      Array.from(container.querySelectorAll("a")).find((a) =>
        (a.textContent ?? "").trim().toLowerCase() === "dashboard",
      ),
    ).toBeUndefined();
  });

  it("exposes metadata that advertises noindex,follow + no-referrer to consumers", () => {
    // Next.js generates the <head> tags from this object at request
    // time — `app/layout.tsx` does the same for its own metadata. The
    // unit-test surface is the metadata config itself: anything we
    // assert here is what Next will serialize into the embed response.
    expect(embedLayoutMetadata.robots).toEqual({ index: false, follow: true });
    expect(embedLayoutMetadata.referrer).toBe("no-referrer");
  });
});
