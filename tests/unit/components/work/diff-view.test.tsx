// @vitest-environment jsdom

/**
 * <DiffView> - unified-diff parsing + rendering.
 *
 * The implementation flow's "review the change before the PR" gate (DEV-1/2)
 * depends on this turning raw `git diff` text into a legible file-by-file diff.
 * These tests pin the parser (file split, +/- counts, line content) and the
 * never-throw fallback for unparseable bodies.
 */

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DiffView, diffPreamble, looksLikePatch } from "@/components/work/diff-view";

afterEach(() => cleanup());

const TWO_FILE_PATCH = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -10,2 +10,2 @@
-old line
+new line
 unchanged`;

describe("DiffView", () => {
  it("splits a multi-file patch and shows each file with its path", () => {
    render(<DiffView patch={TWO_FILE_PATCH} />);
    expect(screen.getByText(/2 files changed/)).toBeTruthy();
    expect(screen.getByText("src/foo.ts")).toBeTruthy();
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("renders added, removed, and context line content (expanded by default)", () => {
    render(<DiffView patch={TWO_FILE_PATCH} />);
    // added
    expect(screen.getByText("const c = 4;")).toBeTruthy();
    // removed
    expect(screen.getByText("const b = 2;")).toBeTruthy();
    // context (the trailing line)
    expect(screen.getByText("unchanged")).toBeTruthy();
  });

  it("counts adds/removes across files, ignoring git metadata lines", () => {
    render(<DiffView patch={TWO_FILE_PATCH} />);
    // Header totals are unique: 3 added (b=3, c=4, new line), 2 removed (b=2,
    // old line). The `index` sha line must NOT inflate the count.
    expect(screen.getByText("+3")).toBeTruthy();
    expect(screen.getByText("−2")).toBeTruthy();
    // the index sha line is metadata, never a rendered diff row.
    expect(screen.queryByText(/1111111\.\.2222222/)).toBeNull();
  });

  it("falls back to raw text for a body that is not a diff (never throws)", () => {
    render(<DiffView patch="Just a prose summary - no diff here." />);
    expect(screen.getByText(/Just a prose summary/)).toBeTruthy();
    expect(screen.queryByText(/files changed/)).toBeNull();
  });

  it("badges new files (--- /dev/null) and deleted files (+++ /dev/null)", () => {
    const patch = `--- /dev/null
+++ b/components/settings/appearance-setting.tsx
@@ -0,0 +1,2 @@
+export function AppearanceSetting() {
+  return null;
--- a/legacy/old-toggle.tsx
+++ /dev/null
@@ -1,1 +0,0 @@
-export const OldToggle = null;`;
    render(<DiffView patch={patch} />);
    // Real paths label both files - never "/dev/null".
    expect(
      screen.getByText("components/settings/appearance-setting.tsx"),
    ).toBeTruthy();
    expect(screen.getByText("legacy/old-toggle.tsx")).toBeTruthy();
    expect(screen.getByText("new file")).toBeTruthy();
    expect(screen.getByText("deleted")).toBeTruthy();
  });

  it("renders a pre-diff banner (e.g. the repo-creation note) as a warning", () => {
    const patch = `Approving this gate CREATES the private repository acme/new-svc on GitHub and opens the PR there.

--- /dev/null
+++ b/README.md
@@ -0,0 +1,1 @@
+# new-svc`;
    render(<DiffView patch={patch} />);
    const note = screen.getByTestId("diff-preamble");
    expect(note.textContent).toContain("acme/new-svc");
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("emits no preamble for a plain patch", () => {
    expect(diffPreamble(TWO_FILE_PATCH)).toBe("");
    render(<DiffView patch={TWO_FILE_PATCH} />);
    expect(screen.queryByTestId("diff-preamble")).toBeNull();
  });
});

describe("looksLikePatch", () => {
  it("detects git-diff, hunk-header, and ---/+++ forms", () => {
    expect(looksLikePatch("diff --git a/x b/x\n--- a/x\n+++ b/x")).toBe(true);
    expect(looksLikePatch("@@ -1,2 +1,3 @@\n+added")).toBe(true);
    expect(looksLikePatch("--- a/x\n+++ b/x\n@@")).toBe(true);
  });

  it("rejects plain prose", () => {
    expect(looksLikePatch("We changed the retry logic in the billing service.")).toBe(false);
  });
});
