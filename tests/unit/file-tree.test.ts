/**
 * Unit test for `buildFileTree` — the pure path→directory-forest builder behind
 * the repo Files tab's `<FileTree>`. The KG has no folder nodes, so the tree is
 * derived entirely from each file's `path`; this guards the nesting, sort order
 * (folders before files, both alphabetical), and recursive folder counts.
 */
import { describe, expect, it } from "vitest";

import { buildFileTree, type TreeDir } from "@/components/repo/file-tree";
import type { RepoFileRow } from "@/lib/api/client";

function makeRow(path: string, extra: Partial<RepoFileRow> = {}): RepoFileRow {
  const name = path.split(/[\\/]/).pop() ?? path;
  return {
    id: `id_${path}`,
    path,
    name,
    language: "TypeScript",
    layer: "Service",
    parser: "tree_sitter",
    loc: 100,
    symbols_count: 0,
    imports_count: 0,
    todos_count: 0,
    summary_preview: "",
    indexed_branch_sha: null,
    ...extra,
  };
}

function dirNames(d: TreeDir): string[] {
  return d.dirs.map((x) => x.name);
}
function fileNames(d: TreeDir): string[] {
  return d.files.map((x) => x.name);
}
function child(d: TreeDir, name: string): TreeDir {
  const hit = d.dirs.find((x) => x.name === name);
  if (!hit) throw new Error(`no dir ${name}`);
  return hit;
}

describe("buildFileTree", () => {
  it("nests files under their path segments", () => {
    const tree = buildFileTree([makeRow("src/api/router.ts")]);
    expect(dirNames(tree)).toEqual(["src"]);
    const src = child(tree, "src");
    expect(dirNames(src)).toEqual(["api"]);
    const api = child(src, "api");
    expect(fileNames(api)).toEqual(["router.ts"]);
  });

  it("merges files that share a folder", () => {
    const tree = buildFileTree([
      makeRow("src/api/router.ts"),
      makeRow("src/api/handlers.ts"),
    ]);
    const api = child(child(tree, "src"), "api");
    // alphabetical: handlers before router
    expect(fileNames(api)).toEqual(["handlers.ts", "router.ts"]);
  });

  it("sorts folders before files and both alphabetically", () => {
    const tree = buildFileTree([
      makeRow("zeta.ts"),
      makeRow("alpha.ts"),
      makeRow("utils/x.ts"),
      makeRow("api/y.ts"),
    ]);
    expect(dirNames(tree)).toEqual(["api", "utils"]);
    expect(fileNames(tree)).toEqual(["alpha.ts", "zeta.ts"]);
  });

  it("computes recursive file counts on every folder", () => {
    const tree = buildFileTree([
      makeRow("src/a.ts"),
      makeRow("src/deep/b.ts"),
      makeRow("src/deep/c.ts"),
      makeRow("README.md"),
    ]);
    expect(tree.fileCount).toBe(4);
    const src = child(tree, "src");
    expect(src.fileCount).toBe(3);
    expect(child(src, "deep").fileCount).toBe(2);
  });

  it("places slash-free paths at the root", () => {
    const tree = buildFileTree([makeRow("README.md")]);
    expect(dirNames(tree)).toEqual([]);
    expect(fileNames(tree)).toEqual(["README.md"]);
  });

  it("splits Windows-style backslash paths", () => {
    const tree = buildFileTree([makeRow("src\\api\\router.ts")]);
    const api = child(child(tree, "src"), "api");
    expect(fileNames(api)).toEqual(["router.ts"]);
  });

  it("returns an empty root for no rows", () => {
    const tree = buildFileTree([]);
    expect(tree.fileCount).toBe(0);
    expect(tree.dirs).toEqual([]);
    expect(tree.files).toEqual([]);
  });
});
