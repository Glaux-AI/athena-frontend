// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { roundTripMarkdown } from "@/lib/work/artifact-editor-extensions";

/**
 * The editor reads an artifact's markdown into a ProseMirror document and
 * serializes it back on save. These pin that round-trip on representative
 * artifact bodies: the goal is SEMANTIC fidelity (every heading / list item /
 * table cell / task item survives), not byte-identity - normalization of
 * whitespace and bullet markers is expected and fine.
 */

function norm(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

describe("artifact editor markdown round-trip", () => {
  it("preserves headings, paragraphs, and emphasis", () => {
    const md = "## Approach\n\nWire the **new** endpoint and its `test`.";
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("## Approach");
    expect(out).toContain("**new**");
    expect(out).toContain("`test`");
  });

  it("preserves bullet and ordered lists", () => {
    const md = "- first\n- second\n\n1. one\n2. two";
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("first");
    expect(out).toContain("second");
    expect(out).toMatch(/1\.\s+one/);
    expect(out).toMatch(/2\.\s+two/);
  });

  it("preserves a GFM table's headers and cells", () => {
    const md = [
      "| File | Change | Why |",
      "| --- | --- | --- |",
      "| `a.ts` | Add | new endpoint |",
      "| `b.ts` | Modify | wire it |",
    ].join("\n");
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("File");
    expect(out).toContain("Change");
    expect(out).toContain("a.ts");
    expect(out).toContain("Add");
    expect(out).toContain("b.ts");
    expect(out).toContain("Modify");
    // Still a pipe table after the round-trip.
    expect(out).toMatch(/\|.*File.*\|/);
  });

  it("preserves task-list checkboxes (checked + unchecked)", () => {
    const md = "- [ ] todo item\n- [x] done item";
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("todo item");
    expect(out).toContain("done item");
    expect(out).toMatch(/\[[ xX]\]/);
  });

  it("preserves fenced code blocks", () => {
    const md = "```sh\npnpm test\n```";
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("pnpm test");
    expect(out).toContain("```");
  });

  // Adaptive visual blocks ride the SAME code-fence transport. The editor must
  // treat an `athena-*` fence as an opaque code block and re-serialize it
  // verbatim (info-string + body) so a summary card / callout survives a human
  // edit pass instead of being parsed away.
  it("preserves an athena-summary block (info-string + body survive)", () => {
    const md = [
      "```athena-summary",
      "tldr: Add token-bucket rate limiting to the public API.",
      "chips: scope=3 files · risk=low · gate=implementation",
      "```",
    ].join("\n");
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("```athena-summary");
    expect(out).toContain("tldr: Add token-bucket rate limiting to the public API.");
    expect(out).toContain("chips: scope=3 files · risk=low · gate=implementation");
  });

  it("preserves an athena-callout block (info-string + body survive)", () => {
    const md = [
      "```athena-callout",
      "type: risk",
      "title: Redis dependency",
      "If Redis is unreachable the limiter fails open and the API is left unprotected.",
      "```",
    ].join("\n");
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("```athena-callout");
    expect(out).toContain("type: risk");
    expect(out).toContain("title: Redis dependency");
    expect(out).toContain("If Redis is unreachable the limiter fails open");
  });

  it("preserves an athena-figure block (asset ref + caption survive)", () => {
    const md = [
      "```athena-figure",
      "asset: athena-asset://3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      "caption: Figure 1. The dashboard layout.",
      "alt: Three KPI tiles above a trend chart.",
      "```",
    ].join("\n");
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("```athena-figure");
    expect(out).toContain("asset: athena-asset://3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    expect(out).toContain("caption: Figure 1. The dashboard layout.");
  });

  it("preserves an athena-steps block", () => {
    const md = [
      "```athena-steps",
      "1. Add the migration column",
      "2. Backfill existing rows",
      "3. Flip the read path behind the flag",
      "```",
    ].join("\n");
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("```athena-steps");
    expect(out).toContain("Backfill existing rows");
  });

  it("preserves an athena-quote block", () => {
    const md = [
      "```athena-quote",
      "The limiter must fail closed, not open.",
      "by: ADR-091",
      "```",
    ].join("\n");
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("```athena-quote");
    expect(out).toContain("fail closed");
  });

  it("preserves an athena-chart block (type + data survive)", () => {
    const md = [
      "```athena-chart",
      "type: bar",
      "title: Spend by team",
      "Platform: 4200",
      "Growth: 3100",
      "```",
    ].join("\n");
    const out = norm(roundTripMarkdown(md));
    expect(out).toContain("```athena-chart");
    expect(out).toContain("type: bar");
    expect(out).toContain("Platform: 4200");
  });

  it("is stable on a second pass for an athena block (idempotent)", () => {
    const md = [
      "```athena-callout",
      "type: warn",
      "title: Migration not applied",
      "Run the alembic upgrade before deploying.",
      "```",
    ].join("\n");
    const once = roundTripMarkdown(md);
    const twice = roundTripMarkdown(once);
    expect(norm(twice)).toBe(norm(once));
  });

  it("is stable on a second pass (idempotent)", () => {
    const md = [
      "## Changes",
      "",
      "| File | Change | Location | Why |",
      "| --- | --- | --- | --- |",
      "| `api/x.py` | Add | `handler` | new route |",
      "",
      "## CHANGE CHECKLIST",
      "",
      "- [ ] api/x.py handler added",
    ].join("\n");
    const once = roundTripMarkdown(md);
    const twice = roundTripMarkdown(once);
    expect(norm(twice)).toBe(norm(once));
  });
});
