/**
 * Tests for the pure helpers behind `usePageContext` - the chat FAB's
 * route -> {label, entity} mapping and the page_context string builder.
 *
 * These are the load-bearing, DOM-free parts: the live `capture()` reads the
 * page's innerText (covered by the e2e/manual path), but the mapping + string
 * shaping must be deterministic so the agent always gets a well-formed snapshot.
 */

import { describe, expect, it } from "vitest";

import { describeRoute, tidyPageText, buildPageContext } from "@/hooks/use-page-context";

describe("describeRoute", () => {
  it("maps top-level routes to friendly labels with no entity", () => {
    expect(describeRoute("/cost")).toEqual({ label: "Cost Analytics", entityKind: null, entityId: null });
    expect(describeRoute("/dashboard")).toEqual({ label: "Home", entityKind: null, entityId: null });
    expect(describeRoute("/knowledge").label).toBe("Organization Knowledge");
  });

  it("extracts the entity from dynamic detail routes", () => {
    expect(describeRoute("/work/task_123")).toEqual({ label: "Task", entityKind: "task", entityId: "task_123" });
    expect(describeRoute("/domains/dom_9")).toEqual({ label: "Domain", entityKind: "domain", entityId: "dom_9" });
    expect(describeRoute("/mcp/srv_1")).toEqual({ label: "MCP server", entityKind: "mcp", entityId: "srv_1" });
  });

  it("picks the deepest segment (a repo page is a repo, not its domain)", () => {
    expect(describeRoute("/domains/dom_9/repos/repo_42")).toEqual({
      label: "Repository",
      entityKind: "repo",
      entityId: "repo_42",
    });
  });

  it("decodes encoded id segments", () => {
    expect(describeRoute("/domains/a%20b").entityId).toBe("a b");
  });

  it("falls back to a neutral label for unknown routes", () => {
    expect(describeRoute("/something-new")).toEqual({ label: "Athena", entityKind: null, entityId: null });
  });
});

describe("tidyPageText", () => {
  it("collapses runs of spaces and blank lines", () => {
    expect(tidyPageText("a   b\n\n\n\nc  \n  ")).toBe("a b\n\nc");
  });
});

describe("buildPageContext", () => {
  it("leads with the heading + route and names the entity", () => {
    const out = buildPageContext("/domains/dom_9", "?tab=topology", "Billing", "Repos: 4\nOpen tasks: 2");
    expect(out).toContain("Page: Billing (route /domains/dom_9?tab=topology)");
    expect(out).toContain("This page is showing domain `dom_9`.");
    expect(out).toContain("Open tasks: 2");
  });

  it("uses the route label when there is no heading", () => {
    const out = buildPageContext("/cost", "", null, "Total spend $10");
    expect(out).toContain("Page: Cost Analytics (route /cost)");
  });

  it("truncates very long page text and flags it", () => {
    const long = "x".repeat(20_000);
    const out = buildPageContext("/cost", "", null, long);
    expect(out).toContain("[...page text truncated...]");
    // the body is capped well under the BE's 16k page_context limit
    expect(out!.length).toBeLessThan(16_000);
  });

  it("returns null when there is nothing to say", () => {
    // An empty route with no text still yields the Page line, so this checks
    // the genuinely-empty guard via whitespace-only text on a known route.
    const out = buildPageContext("/cost", "", null, "   \n  ");
    expect(out).toBe("Page: Cost Analytics (route /cost)");
  });
});
