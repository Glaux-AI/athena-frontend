"use client";

/**
 * Results list for the knowledge palette — grouped by section header
 * (Files / Functions / Classes / ...), with kind icons, score chip,
 * and repo + layer chips per row. Pure presentation; the parent owns
 * the selection state + click handler.
 */

import {
  BookOpen, Box, Code2, FileCode2, FileText, Layers, Server,
  Settings as ConfigIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { SearchItem } from "@/lib/api/client";

const KIND_ICON: Record<string, React.ReactNode> = {
  file: <FileText className="size-3.5" aria-hidden />,
  function: <Code2 className="size-3.5" aria-hidden />,
  class: <Box className="size-3.5" aria-hidden />,
  config: <ConfigIcon className="size-3.5" aria-hidden />,
  document: <FileCode2 className="size-3.5" aria-hidden />,
  service: <Server className="size-3.5" aria-hidden />,
  module: <Layers className="size-3.5" aria-hidden />,
};

const GROUP_LABEL: Record<string, string> = {
  file: "Files",
  function: "Functions",
  class: "Classes",
  config: "Configs",
  document: "Documents",
  service: "Services",
  module: "Modules",
  overlay: "Domain notes",
  other: "Other",
};

function groupKey(item: SearchItem): string {
  if (item.kind === "overlay") return "overlay";
  return item.node_kind && GROUP_LABEL[item.node_kind] ? item.node_kind : "other";
}

function itemIcon(item: SearchItem): React.ReactNode {
  if (item.kind === "overlay") return <BookOpen className="size-3.5" aria-hidden />;
  if (item.node_kind && KIND_ICON[item.node_kind]) return KIND_ICON[item.node_kind];
  return <Code2 className="size-3.5" aria-hidden />;
}

export function Results({
  items, selected, onPick, setSelected,
}: {
  items: SearchItem[];
  selected: number;
  onPick: (i: SearchItem, newTab: boolean) => void;
  setSelected: (i: number) => void;
}) {
  const flat: ({ kind: "header"; label: string } | { kind: "item"; item: SearchItem; idx: number })[] = [];
  let lastGroup: string | null = null;
  items.forEach((item, idx) => {
    const g = groupKey(item);
    if (g !== lastGroup) {
      flat.push({ kind: "header", label: GROUP_LABEL[g] ?? "Other" });
      lastGroup = g;
    }
    flat.push({ kind: "item", item, idx });
  });

  return (
    <ul id="knowledge-search-results" className="p-1">
      {flat.map((entry, i) =>
        entry.kind === "header" ? (
          <li
            key={`h-${i}`}
            className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
          >{entry.label}</li>
        ) : (
          <ResultRow
            key={entry.item.id}
            item={entry.item}
            isSelected={entry.idx === selected}
            onFocus={() => setSelected(entry.idx)}
            onClick={(e) => onPick(entry.item, e.metaKey || e.ctrlKey)}
          />
        ),
      )}
    </ul>
  );
}

function ResultRow({
  item, isSelected, onFocus, onClick,
}: {
  item: SearchItem;
  isSelected: boolean;
  onFocus: () => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        onMouseEnter={onFocus}
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition",
          isSelected
            ? "bg-[var(--primary-soft)] text-[var(--primary)]"
            : "text-[var(--text)] hover:bg-[var(--surface-2)]",
        )}
      >
        <span className="mt-0.5 text-[var(--text-muted)]">{itemIcon(item)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{item.name}</span>
            {item.repo_full_name && (
              <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0 text-[9px] font-medium text-[var(--text-subtle)]">
                {item.repo_full_name}
              </span>
            )}
            {item.layer && (
              <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0 text-[9px] font-medium text-[var(--text-subtle)]">
                {item.layer}
              </span>
            )}
          </span>
          {item.path && (
            <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]">{item.path}</span>
          )}
          {item.summary && (
            <span className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">{item.summary}</span>
          )}
        </span>
        <span
          className="shrink-0 self-start rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-subtle)]"
          title={`${item.score_basis}: ${item.score.toFixed(3)}`}
        >{item.score.toFixed(2)}</span>
      </button>
    </li>
  );
}
