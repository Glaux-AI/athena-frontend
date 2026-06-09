"use client";

/**
 * <DiffView> — a real, file-by-file unified-diff viewer.
 *
 * The implementation flow's "review the change before the PR" gate (DEV-2)
 * hinges on the developer actually SEEING the diff — not a wall of monospace.
 * This parses standard unified-diff / `git diff` text into files → hunks → lines
 * and renders it with add/remove coloring, line-number gutters, per-file
 * collapse, and a fullscreen view (DEV-1/8). Token-only colors; no diff library
 * on the bundle.
 *
 * Input is raw patch text (one or more files, each with `--- a/… / +++ b/…`
 * headers and `@@` hunks). Anything it can't parse is shown verbatim in a
 * monospace block — it never throws and never loses content.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileDiff, Maximize2 } from "lucide-react";

import { Modal } from "@/components/ui/overlay";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

type DiffLineKind = "add" | "del" | "context";
interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}
interface DiffHunk {
  header: string;
  lines: DiffLine[];
}
interface DiffFile {
  path: string;
  added: number;
  removed: number;
  binary: boolean;
  hunks: DiffHunk[];
}

/** True when a body reads as a raw unified diff even without a ```diff fence. */
export function looksLikePatch(body: string): boolean {
  return (
    /^diff --git /m.test(body) ||
    /^@@ .* @@/m.test(body) ||
    (/^--- /m.test(body) && /^\+\+\+ /m.test(body))
  );
}

function stripPathPrefix(raw: string): string {
  const path = (raw.split("\t")[0] ?? "").trim();
  if (path === "/dev/null") return "/dev/null";
  return path.replace(/^[ab]\//, "");
}

function newFile(path: string): DiffFile {
  return { path, added: 0, removed: 0, binary: false, hunks: [] };
}

/** Parse unified-diff text into files. Resilient: skips git metadata
 *  (`index`, mode, rename) and only counts +/-/context once inside a hunk. */
function parsePatch(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  let cur: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i] ?? "";
    if (ln.startsWith("diff --git")) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(ln);
      cur = newFile(m ? (m[2] ?? "(file)") : "(file)");
      files.push(cur);
      hunk = null;
      continue;
    }
    if (ln.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ")) {
      const oldP = stripPathPrefix(ln.slice(4));
      const newP = stripPathPrefix((lines[i + 1] ?? "").slice(4));
      const path = newP === "/dev/null" ? oldP : newP;
      if (!cur || cur.hunks.length > 0) {
        cur = newFile(path);
        files.push(cur);
        hunk = null;
      } else {
        cur.path = path;
      }
      i += 1;
      continue;
    }
    if (ln.startsWith("Binary files") && cur) {
      cur.binary = true;
      continue;
    }
    if (ln.startsWith("@@")) {
      if (!cur) {
        cur = newFile("(file)");
        files.push(cur);
      }
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(ln);
      oldNo = m ? Number(m[1]) : 0;
      newNo = m ? Number(m[2]) : 0;
      hunk = { header: ln, lines: [] };
      cur.hunks.push(hunk);
      continue;
    }
    if (!cur || !hunk) continue; // header noise before the first hunk
    if (ln.startsWith("+")) {
      hunk.lines.push({ kind: "add", text: ln.slice(1), oldNo: null, newNo: newNo++ });
      cur.added += 1;
    } else if (ln.startsWith("-")) {
      hunk.lines.push({ kind: "del", text: ln.slice(1), oldNo: oldNo++, newNo: null });
      cur.removed += 1;
    } else if (ln.startsWith("\\")) {
      // "\ No newline at end of file" — metadata, skip.
    } else {
      const text = ln.startsWith(" ") ? ln.slice(1) : ln;
      hunk.lines.push({ kind: "context", text, oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return files.filter((f) => f.hunks.length > 0 || f.binary);
}

export function DiffView({ patch }: { patch: string }) {
  const files = useMemo(() => parsePatch(patch), [patch]);
  const [full, setFull] = useState(false);

  // Unparseable (or empty) — show the raw text rather than drop it.
  if (files.length === 0) {
    return (
      <pre className="max-h-[460px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
        <code className="font-mono">{patch}</code>
      </pre>
    );
  }

  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);

  return (
    <Stack gap="2">
      <Cluster
        justify="between"
        align="center"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5"
      >
        <Cluster gap="2" align="center">
          <FileDiff className="size-3.5 text-[var(--primary)]" aria-hidden />
          <span className="text-xs font-medium text-[var(--text-muted)]">
            {files.length} file{files.length === 1 ? "" : "s"} changed
          </span>
          <DiffStat added={added} removed={removed} />
        </Cluster>
        <button
          type="button"
          onClick={() => setFull(true)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Maximize2 className="size-3" aria-hidden />
          Expand
        </button>
      </Cluster>

      <FileList files={files} />

      <Modal
        open={full}
        onClose={() => setFull(false)}
        title={`Diff · ${files.length} file${files.length === 1 ? "" : "s"}`}
        description={`${added} added, ${removed} removed`}
        size="lg"
        className="max-w-[min(1200px,96vw)]"
      >
        <FileList files={files} defaultOpen />
      </Modal>
    </Stack>
  );
}

function DiffStat({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums">
      <span className="text-[var(--success-ink)]">+{added}</span>
      <span className="text-[var(--danger-ink)]">−{removed}</span>
    </span>
  );
}

function FileList({ files, defaultOpen = true }: { files: DiffFile[]; defaultOpen?: boolean }) {
  return (
    <Stack gap="2">
      {files.map((f, i) => (
        <FileBlock key={`${f.path}-${i}`} file={f} defaultOpen={defaultOpen} />
      ))}
    </Stack>
  );
}

function FileBlock({ file, defaultOpen }: { file: DiffFile; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text)]" title={file.path}>
          {file.path}
        </span>
        <DiffStat added={file.added} removed={file.removed} />
      </button>
      {open &&
        (file.binary ? (
          <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Binary file — not shown.</p>
        ) : (
          <div className="overflow-x-auto bg-[var(--surface)]">
            {file.hunks.map((h, hi) => (
              <div key={hi}>
                <div className="bg-[var(--surface-2)] px-3 py-0.5 font-mono text-[11px] text-[var(--text-subtle)]">
                  {h.header}
                </div>
                {h.lines.map((line, li) => (
                  <DiffRow key={li} line={line} />
                ))}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

const ROW_STYLE: Record<DiffLineKind, string> = {
  add: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  del: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  context: "text-[var(--text-muted)]",
};
const SIGN: Record<DiffLineKind, string> = { add: "+", del: "−", context: " " };

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div className={cn("flex font-mono text-xs leading-relaxed", ROW_STYLE[line.kind])}>
      <span className="w-10 shrink-0 select-none px-1 text-right text-[var(--text-subtle)] tabular-nums">
        {line.oldNo ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none px-1 text-right text-[var(--text-subtle)] tabular-nums">
        {line.newNo ?? ""}
      </span>
      <span className="w-4 shrink-0 select-none text-center opacity-70">{SIGN[line.kind]}</span>
      <span className="whitespace-pre px-1">{line.text || " "}</span>
    </div>
  );
}
