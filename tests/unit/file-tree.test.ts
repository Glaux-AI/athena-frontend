/**
 * Unit test for `buildFileTree` — the pure path→directory-forest builder behind
 * the repo Files tab's `<FileTree>`. The KG has no folder nodes, so the tree is
 * derived entirely from each file's `path`; this guards the nesting, sort order
 * (folders before files, both alphabetical), and recursive folder counts.
 */
import { describe, expect, it } from "vitest";

import { buildFileTree, buildFolderNodeMap, normalizeDirPath, type TreeDir } from "@/components/repo/file-tree";
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

describe("normalizeDirPath", () => {
  it("drops trailing/leading/duplicate slashes and normalizes separators", () => {
    expect(normalizeDirPath("src/api/")).toBe("src/api");
    expect(normalizeDirPath("/src//api/")).toBe("src/api");
    expect(normalizeDirPath("src\\api")).toBe("src/api");
    expect(normalizeDirPath("")).toBe("");
  });
});

describe("buildFolderNodeMap", () => {
  it("keys module + service node directories to their node id (normalized)", () => {
    const map = buildFolderNodeMap([
      { id: "mod1", node_kind: "module", path: "src/api/" },
      { id: "svc1", node_kind: "service", path: "services/web" },
      { id: "file1", node_kind: "file", path: "src/api/router.ts" },
    ]);
    // Trailing slash on the module path still matches the FileTree folder path.
    expect(map.get("src/api")).toBe("mod1");
    expect(map.get("services/web")).toBe("svc1");
    // A file is not a folder — its path must not become a folder key.
    expect(map.has("src/api/router.ts")).toBe(false);
  });

  it("prefers a module over a service for the same directory", () => {
    // Service appears first in the array; the module must still win the path.
    const map = buildFolderNodeMap([
      { id: "svc", node_kind: "service", path: "src/core" },
      { id: "mod", node_kind: "module", path: "src/core" },
    ]);
    expect(map.get("src/core")).toBe("mod");
  });

  it("ignores pathless nodes and keeps the first node per directory", () => {
    const map = buildFolderNodeMap([
      { id: "a", node_kind: "module", path: null },
      { id: "b", node_kind: "module", path: "pkg" },
      { id: "c", node_kind: "module", path: "pkg/" },
    ]);
    expect(map.get("pkg")).toBe("b");
    expect(map.size).toBe(1);
  });
});
