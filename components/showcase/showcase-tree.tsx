"use client";

/** Left-nav directory tree for a showcase repo. Folders expand/collapse;
 *  clicking a file (or a folder mapped to a module/service node) selects it
 *  so the main pane shows that node's dossier. The repo root selects the
 *  combined blueprint. */

import { useState } from "react";
import { ChevronRight, FileCode2, Folder, Home } from "lucide-react";

import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
import type { ShowcaseTreeNode } from "@/lib/api/public-client";

interface TreeProps {
  root: ShowcaseTreeNode;
  selectedKey: string | null;
  onSelect: (node: ShowcaseTreeNode) => void;
}

function keyOf(node: ShowcaseTreeNode): string {
  return node.node_id ?? node.path;
}

export function ShowcaseTree({ root, selectedKey, onSelect }: TreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(root.children.filter((c) => c.kind === "dir").slice(0, 1).map((c) => c.path)),
  );
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <nav aria-label="Repository files" role="tree" className="flex flex-col gap-0.5 text-sm">
      <button
        type="button"
        role="treeitem"
        aria-selected={selectedKey === null}
        onClick={() => onSelect(root)}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium transition-colors",
          focusRing,
          selectedKey === null
            ? "bg-[var(--primary-soft)] text-[var(--primary)]"
            : "text-[var(--text)] hover:bg-[var(--surface-2)]",
        )}
      >
        <Home className="size-4 shrink-0" aria-hidden /> Overview
      </button>
      {root.children.map((child) => (
        <TreeRow
          key={keyOf(child)}
          node={child}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

interface RowProps {
  node: ShowcaseTreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  selectedKey: string | null;
  onSelect: (node: ShowcaseTreeNode) => void;
}

function TreeRow({ node, depth, expanded, toggle, selectedKey, onSelect }: RowProps) {
  const isDir = node.kind === "dir";
  const isOpen = expanded.has(node.path);
  const isSelected = selectedKey !== null && selectedKey === keyOf(node);
  const pad = { paddingLeft: `${depth * 12 + 8}px` };

  const onRow = () => {
    if (isDir && !node.node_id) toggle(node.path);
    else onSelect(node);
  };

  return (
    <div role="treeitem" aria-selected={isSelected} aria-expanded={isDir ? isOpen : undefined}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md py-1 pr-2 transition-colors",
          isSelected ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
        )}
        style={pad}
      >
        {isDir ? (
          <button
            type="button"
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={() => toggle(node.path)}
            className={cn("grid size-5 shrink-0 place-items-center rounded text-[var(--text-subtle)] hover:text-[var(--text)]", focusRing)}
          >
            <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} aria-hidden />
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={onRow}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left",
            focusRing,
            isSelected ? "text-[var(--primary)]" : "text-[var(--text)]",
          )}
        >
          {isDir ? (
            <Folder className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
          ) : (
            <FileCode2 className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
          )}
          <span className="truncate">{node.name}</span>
          {!isDir && node.loc > 0 && (
            <span className="ml-auto shrink-0 pl-2 text-micro tabular-nums text-[var(--text-subtle)]">
              {node.loc}
            </span>
          )}
        </button>
      </div>
      {isDir && isOpen && node.children.length > 0 && (
        <div role="group">
          {node.children.map((child) => (
            <TreeRow
              key={keyOf(child)}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedKey={selectedKey}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
