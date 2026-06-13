"use client";

/**
 * FileTree - a collapsible directory tree for the repo Files tab, built from
 * the flat `RepoFileRow[]` the file API returns. The KG has no folder nodes,
 * so folders are derived from each file's `path` - the tree maps 1:1 to the
 * original repo layout. Replaces the former dense 8-column flat table: folders
 * nest, you expand to drill in, and clicking a file opens its detail drawer.
 *
 * Accessibility mirrors the topology `ContainmentTree`: role=tree/treeitem/
 * group, a rotating caret, depth indentation, primary-soft selection, and the
 * focused/selected row reveals its ancestors + scrolls into view.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Folder, FolderOpen, FileText } from "lucide-react";

import { Cluster } from "@/components/layout/primitives";
import type { KnowledgeNode, RepoFileRow } from "@/lib/api/client";
import { cn } from "@/lib/cn";

interface TreeFile {
  type: "file";
  name: string;
  path: string;
  row: RepoFileRow;
}
export interface TreeDir {
  type: "dir";
  name: string;
  path: string;
  dirs: TreeDir[];
  files: TreeFile[];
  /** Recursive file count - the folder badge. */
  fileCount: number;
}

const INDENT = 14;
const ROW_PAD = 6;
/** Extra left pad on file rows so a file icon lines up under its folder icon
 *  (files have no caret; caret width + gap ≈ 20px). */
const FILE_GUTTER = 20;

/** Build a sorted directory forest from flat file rows. Folders sort before
 *  files; both alphabetical. Splits on `/` and `\` so POSIX + Windows paths
 *  both nest correctly. */
export function buildFileTree(rows: readonly RepoFileRow[]): TreeDir {
  const root: TreeDir = { type: "dir", name: "", path: "", dirs: [], files: [], fileCount: 0 };
  const index = new Map<string, TreeDir>([["", root]]);

  for (const row of rows) {
    const parts = row.path.split(/[\\/]/).filter(Boolean);
    if (parts.length === 0) continue;
    let parent = root;
    let curPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      curPath = curPath ? `${curPath}/${seg}` : seg;
      let dir = index.get(curPath);
      if (!dir) {
        dir = { type: "dir", name: seg, path: curPath, dirs: [], files: [], fileCount: 0 };
        index.set(curPath, dir);
        parent.dirs.push(dir);
      }
      parent = dir;
    }
    parent.files.push({ type: "file", name: parts[parts.length - 1]!, path: row.path, row });
  }

  const finalize = (d: TreeDir): number => {
    d.dirs.sort((a, b) => a.name.localeCompare(b.name));
    d.files.sort((a, b) => a.name.localeCompare(b.name));
    let count = d.files.length;
    for (const sub of d.dirs) count += finalize(sub);
    d.fileCount = count;
    return count;
  };
  finalize(root);
  return root;
}

/** Normalize a path the way {@link buildFileTree} derives folder paths - split
 *  on POSIX + Windows separators, drop empty segments, re-join with `/`. A
 *  module/service node's BE `path` (its directory) is keyed through this so it
 *  lines up 1:1 with a {@link TreeDir.path}, regardless of trailing slash or
 *  separator style. */
export function normalizeDirPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).join("/");
}

/** Folder path → KG node id, built from the repo's directory-altitude group
 *  nodes (`module` / `service` - the nodes that carry their own dossier). Keys
 *  are normalized to match {@link TreeDir.path}; a `module` wins a path it
 *  shares with a `service`. Folders absent from the map have no dossier to open
 *  (e.g. pure intermediate dirs the ingestor didn't promote to a module). */
export function buildFolderNodeMap(
  nodes: readonly Pick<KnowledgeNode, "id" | "node_kind" | "path">[],
): Map<string, string> {
  const map = new Map<string, string>();
  // Two passes so a `module` always wins a directory it shares with a `service`.
  for (const kind of ["module", "service"] as const) {
    for (const n of nodes) {
      if (n.node_kind !== kind || !n.path) continue;
      const key = normalizeDirPath(n.path);
      if (key && !map.has(key)) map.set(key, n.id);
    }
  }
  return map;
}

function collectDirPaths(d: TreeDir, acc: string[] = []): string[] {
  for (const sub of d.dirs) {
    acc.push(sub.path);
    collectDirPaths(sub, acc);
  }
  return acc;
}

/** Ancestor dir paths of a file path: `a/b/c.ts` → `["a", "a/b"]`. */
function ancestorDirs(filePath: string): string[] {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  const acc: string[] = [];
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? `${cur}/${parts[i]}` : parts[i]!;
    acc.push(cur);
  }
  return acc;
}

function findFilePath(d: TreeDir, fileId: string): string | null {
  for (const f of d.files) if (f.row.id === fileId) return f.path;
  for (const sub of d.dirs) {
    const hit = findFilePath(sub, fileId);
    if (hit) return hit;
  }
  return null;
}

interface FileTreeProps {
  tree: TreeDir;
  /** A filter/search is active → expand everything so matches are visible. */
  filtering: boolean;
  selectedFileId: string | null;
  /** Deep-link / grep focus - reveal this file's ancestors + scroll to it. */
  focusFileId: string | null;
  onFileClick: (row: RepoFileRow) => void;
  /** Folder path → module/service node id (from the repo KG). A folder in this
   *  map opens its dossier on click, in addition to expanding. */
  folderNodeIds: Map<string, string>;
  /** Node id of the folder dossier currently open - drives the row highlight. */
  selectedFolderNodeId: string | null;
  /** Open a folder's dossier in the shared node-dossier drawer. */
  onFolderOpen: (nodeId: string) => void;
}

export function FileTree({
  tree,
  filtering,
  selectedFileId,
  focusFileId,
  onFileClick,
  folderNodeIds,
  selectedFolderNodeId,
  onFolderOpen,
}: FileTreeProps) {
  const allDirPaths = useMemo(() => collectDirPaths(tree), [tree]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // Default reveal: fully collapsed. A search expands everything so matches are
  // visible; otherwise every folder starts closed. `allDirPaths` changes
  // identity on each rebuild, so this re-collapses whenever the file set changes.
  useEffect(() => {
    setOpen(filtering ? new Set(allDirPaths) : new Set());
  }, [filtering, allDirPaths]);

  // Focus a file → reveal its ancestor folders.
  useEffect(() => {
    if (!focusFileId) return;
    const path = findFilePath(tree, focusFileId);
    if (!path) return;
    setOpen((prev) => {
      const next = new Set(prev);
      for (const a of ancestorDirs(path)) next.add(a);
      return next;
    });
  }, [focusFileId, tree]);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <>
      <TreeHeader
        fileCount={tree.fileCount}
        dirCount={allDirPaths.length}
        onExpandAll={() => setOpen(new Set(allDirPaths))}
        onCollapseAll={() => setOpen(new Set())}
      />
      <ul
        role="tree"
        aria-label="Repository files"
        data-testid="file-tree"
        className="max-h-[72vh] overflow-y-auto py-1"
      >
        {tree.dirs.map((d) => (
          <DirNode
            key={d.path}
            dir={d}
            depth={0}
            open={open}
            onToggle={toggle}
            selectedFileId={selectedFileId}
            focusFileId={focusFileId}
            onFileClick={onFileClick}
            folderNodeIds={folderNodeIds}
            selectedFolderNodeId={selectedFolderNodeId}
            onFolderOpen={onFolderOpen}
          />
        ))}
        {tree.files.map((f) => (
          <FileNode
            key={f.row.id}
            file={f}
            depth={0}
            selectedFileId={selectedFileId}
            focusFileId={focusFileId}
            onFileClick={onFileClick}
          />
        ))}
      </ul>
    </>
  );
}

function DirNode({
  dir,
  depth,
  open,
  onToggle,
  selectedFileId,
  focusFileId,
  onFileClick,
  folderNodeIds,
  selectedFolderNodeId,
  onFolderOpen,
}: {
  dir: TreeDir;
  depth: number;
  open: Set<string>;
  onToggle: (path: string) => void;
  selectedFileId: string | null;
  focusFileId: string | null;
  onFileClick: (row: RepoFileRow) => void;
  folderNodeIds: Map<string, string>;
  selectedFolderNodeId: string | null;
  onFolderOpen: (nodeId: string) => void;
}) {
  const isOpen = open.has(dir.path);
  // A folder is a `module`/`service` KG node when the ingestor promoted its
  // directory; clicking it then opens that node's dossier (as well as toggling).
  const nodeId = folderNodeIds.get(dir.path) ?? null;
  const selected = nodeId !== null && nodeId === selectedFolderNodeId;
  return (
    <li role="treeitem" aria-expanded={isOpen} aria-selected={selected}>
      <button
        type="button"
        onClick={() => {
          onToggle(dir.path);
          if (nodeId) onFolderOpen(nodeId);
        }}
        style={{ paddingLeft: depth * INDENT + ROW_PAD }}
        data-testid="file-tree-dir"
        {...(nodeId ? { title: `Open ${dir.name} blueprint` } : {})}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]",
          selected ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
        )}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-[var(--text-subtle)] transition-transform duration-150", isOpen && "rotate-90")}
          aria-hidden
        />
        {isOpen ? (
          <FolderOpen className="size-4 shrink-0 text-[var(--primary)]" aria-hidden />
        ) : (
          <Folder
            className={cn("size-4 shrink-0", selected ? "text-[var(--primary)]" : "text-[var(--text-muted)]")}
            aria-hidden
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm text-[var(--text)]",
            selected ? "font-semibold" : "font-medium",
          )}
        >
          {dir.name}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-subtle)]" aria-label={`${dir.fileCount} files`}>
          {dir.fileCount}
        </span>
      </button>
      {isOpen && (
        <ul role="group">
          {dir.dirs.map((d) => (
            <DirNode
              key={d.path}
              dir={d}
              depth={depth + 1}
              open={open}
              onToggle={onToggle}
              selectedFileId={selectedFileId}
              focusFileId={focusFileId}
              onFileClick={onFileClick}
              folderNodeIds={folderNodeIds}
              selectedFolderNodeId={selectedFolderNodeId}
              onFolderOpen={onFolderOpen}
            />
          ))}
          {dir.files.map((f) => (
            <FileNode
              key={f.row.id}
              file={f}
              depth={depth + 1}
              selectedFileId={selectedFileId}
              focusFileId={focusFileId}
              onFileClick={onFileClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FileNode({
  file,
  depth,
  selectedFileId,
  focusFileId,
  onFileClick,
}: {
  file: TreeFile;
  depth: number;
  selectedFileId: string | null;
  focusFileId: string | null;
  onFileClick: (row: RepoFileRow) => void;
}) {
  const selected = file.row.id === selectedFileId;
  const rowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (file.row.id === focusFileId) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusFileId, file.row.id]);
  return (
    <li role="treeitem" aria-selected={selected}>
      <button
        ref={rowRef}
        type="button"
        onClick={() => onFileClick(file.row)}
        title={file.row.summary_preview || file.path}
        style={{ paddingLeft: depth * INDENT + ROW_PAD + FILE_GUTTER }}
        data-testid="file-tree-file"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]",
          selected ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
        )}
      >
        <FileText
          className={cn("size-3.5 shrink-0", selected ? "text-[var(--primary)]" : "text-[var(--text-subtle)]")}
          aria-hidden
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            selected ? "font-semibold text-[var(--text)]" : "text-[var(--text)]",
          )}
        >
          {file.name}
        </span>
        <Cluster gap="2" align="center" className="shrink-0 text-[10px] text-[var(--text-subtle)]">
          {file.row.language && <span className="uppercase tracking-wider">{file.row.language}</span>}
          <span className="tabular-nums">{file.row.loc.toLocaleString()}</span>
          {file.row.todos_count > 0 && (
            <span
              className="size-1.5 rounded-full bg-[var(--danger)]"
              title={`${file.row.todos_count} TODOs`}
              aria-label={`${file.row.todos_count} TODOs`}
            />
          )}
        </Cluster>
      </button>
    </li>
  );
}

function TreeHeader({
  fileCount,
  dirCount,
  onExpandAll,
  onCollapseAll,
}: {
  fileCount: number;
  dirCount: number;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-t-lg bg-gradient-to-b from-[var(--surface-2)] to-transparent px-3 py-2 shadow-[var(--inner-highlight)]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {fileCount.toLocaleString()} files · {dirCount.toLocaleString()} folders
      </span>
      <Cluster gap="2" align="center">
        <HeaderBtn onClick={onExpandAll}>Expand all</HeaderBtn>
        <span className="text-[var(--border-strong)]" aria-hidden>·</span>
        <HeaderBtn onClick={onCollapseAll}>Collapse all</HeaderBtn>
      </Cluster>
    </div>
  );
}

function HeaderBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      {children}
    </button>
  );
}
