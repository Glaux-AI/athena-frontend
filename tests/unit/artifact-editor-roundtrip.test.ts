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
