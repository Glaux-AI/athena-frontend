import { describe, expect, it } from "vitest";

import {
  normalizeChangeKind,
  parseChangeManifest,
  summarizeChanges,
} from "@/lib/work/change-manifest";

const FULL = `## Approach
Wire the new endpoint and its test.

## Changes

| File | Change | Location | Why |
| --- | --- | --- | --- |
| \`api/routers/tasks.py\` | Add | \`edit_span\` | new endpoint |
| \`api/schemas/tasks.py\` | Modify | \`StageRefineIn\` | add field |
| \`api/legacy.py\` | Delete | whole file | dead code |

## CHANGE CHECKLIST
- [ ] api/routers/tasks.py - edit_span added
`;

describe("parseChangeManifest", () => {
  it("locates the Changes table and splits the prose around it", () => {
    const { table, before, after } = parseChangeManifest(FULL);
    expect(table).not.toBeNull();
    expect(table!.headers).toEqual(["File", "Change", "Location", "Why"]);
    expect(table!.rows).toHaveLength(3);
    expect(table!.fileIdx).toBe(0);
    expect(table!.changeIdx).toBe(1);
    expect(before).toContain("## Approach");
    expect(before).toContain("## Changes");
    expect(after).toContain("## CHANGE CHECKLIST");
  });

  it("returns table: null and the whole body for a trivial plan with no table", () => {
    const body = "Edit `config.py` line 12 to bump the timeout, then run the unit test.";
    const { table, before, after } = parseChangeManifest(body);
    expect(table).toBeNull();
    expect(before).toBe(body);
    expect(after).toBe("");
  });

  it("recognizes a table that omits the Change column (changeIdx -1)", () => {
    const body = `## Changes

| Path | Location | Why |
| --- | --- | --- |
| \`a.ts\` | top | x |
`;
    const { table } = parseChangeManifest(body);
    expect(table).not.toBeNull();
    expect(table!.fileIdx).toBe(0);
    expect(table!.changeIdx).toBe(-1);
  });

  it("skips a leading non-file table and finds the change-table", () => {
    const body = `| Metric | Value |
| --- | --- |
| coverage | 80% |

| File | Change |
| --- | --- |
| \`a.ts\` | Add |
`;
    const { table } = parseChangeManifest(body);
    expect(table).not.toBeNull();
    expect(table!.headers).toEqual(["File", "Change"]);
    expect(table!.rows).toEqual([["`a.ts`", "Add"]]);
  });

  it("ignores a pipe-table inside a fenced code block and finds the real one", () => {
    const body = `Use this shape:

\`\`\`md
| File | Change | Why |
| --- | --- | --- |
| example.ts | Modify | demo |
\`\`\`

## Changes

| File | Change | Why |
| --- | --- | --- |
| \`real.ts\` | Add | the real one |
`;
    const { table, before } = parseChangeManifest(body);
    expect(table).not.toBeNull();
    expect(table!.rows).toEqual([["`real.ts`", "Add", "the real one"]]);
    // The example fence stays balanced in the leading prose (no orphaned ```).
    expect((before.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it("treats an escaped pipe as a literal pipe in a cell (GFM semantics)", () => {
    const body = `| File | Change | Why |
| --- | --- | --- |
| \`a\\|b.ts\` | Add | has a \\| pipe |
`;
    const { table } = parseChangeManifest(body);
    expect(table).not.toBeNull();
    expect(table!.rows).toHaveLength(1);
    expect(table!.rows[0]).toHaveLength(3);
    expect(table!.rows[0]![0]).toBe("`a|b.ts`");
    expect(table!.rows[0]![1]).toBe("Add");
  });
});

describe("normalizeChangeKind", () => {
  it("maps the common Change-column words", () => {
    expect(normalizeChangeKind("Add")).toBe("add");
    expect(normalizeChangeKind("New file")).toBe("add");
    expect(normalizeChangeKind("Modify")).toBe("modify");
    expect(normalizeChangeKind("Update")).toBe("modify");
    expect(normalizeChangeKind("Delete")).toBe("delete");
    expect(normalizeChangeKind("Remove")).toBe("delete");
    expect(normalizeChangeKind("rename")).toBe("modify");
    expect(normalizeChangeKind("???")).toBe("other");
  });
});

describe("summarizeChanges", () => {
  it("counts by kind when a Change column is present (typed)", () => {
    const { table } = parseChangeManifest(FULL);
    const s = summarizeChanges(table!);
    expect(s).toEqual({ total: 3, added: 1, modified: 1, removed: 1, typed: true });
  });

  it("reports only the total when there is no Change column", () => {
    const { table } = parseChangeManifest(`| Path | Why |
| --- | --- |
| \`a.ts\` | x |
| \`b.ts\` | y |
`);
    const s = summarizeChanges(table!);
    expect(s).toEqual({ total: 2, added: 0, modified: 0, removed: 0, typed: false });
  });
});
