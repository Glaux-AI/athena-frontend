"use client";

/**
 * ContainmentTree - the bottom "directory structure", rebuilt as a projection of
 * the SAME `GraphState` (a `contains`-edge forest), replacing the old path-faked
 * TierExplorer. It is the keyboard-accessible mirror of the graph (React Flow
 * nodes aren't focusable): `role=tree`, arrow-free row buttons, carets to expand.
 *
 * Row click → `select(id)` (drives the whole page); caret → `expand(id)` (the
 * SAME on-demand fetch the graph uses - expanding either fills both). The
 * selected row's ancestors auto-reveal and it scrolls into view, so a search /
 * graph selection always lights up here too.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";

import { useExplorer } from "@/components/topology/explorer/explorer-store";

// Leaf kinds carry no children - no caret. Everything else (file/module/service/
// synthetic) can be expanded to pull its `contains` children on demand.
const LEAF_KINDS = new Set([
  "function", "class", "method", "api_endpoint", "db_table", "db_column",
  "dependency", "env_var", "event", "external_system", "glossary_term",
]);

export function ContainmentTree() {
  const { graph, rootId, selectedId, select, expand, expanding } = useExplorer();
  const selectedRowRef = useRef<HTMLDivElement | null>(null);

  // contains-edge forest, recomputed whenever the graph changes.
  const { childrenOf, parentOf } = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string>();
    for (const e of graph.edges.values()) {
      if (e.kind !== "contains") continue;
      if (!graph.nodes.has(e.source_id) || !graph.nodes.has(e.target_id)) continue;
      (childrenOf.get(e.source_id) ?? childrenOf.set(e.source_id, []).get(e.source_id)!).push(e.target_id);
      parentOf.set(e.target_id, e.source_id);
    }
    return { childrenOf, parentOf };
  }, [graph]);

  const roots = useMemo(() => {
    if (graph.nodes.has(rootId)) return [rootId];
    // No synthetic root in view - surface every parentless node that has children.
    return [...graph.nodes.keys()].filter((id) => !parentOf.has(id) && childrenOf.has(id));
  }, [graph.nodes, rootId, parentOf, childrenOf]);

  const [open, setOpen] = useState<Set<string>>(() => new Set([rootId]));

  // Reveal the selection: open every ancestor + the root, then scroll into view.
  useEffect(() => {
    if (!selectedId) return;
    setOpen((prev) => {
      const next = new Set(prev);
      next.add(rootId);
      let cur = parentOf.get(selectedId);
      while (cur) { next.add(cur); cur = parentOf.get(cur); }
      return next;
    });
  }, [selectedId, rootId, parentOf]);

  useEffect(() => {
    if (selectedId) selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId, open]);

  const toggle = (id: string, loadedChildren: number) => {
    const wasOpen = open.has(id);
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!wasOpen && loadedChildren === 0) expand(id); // opening with nothing loaded → fetch
  };

  const renderNode = (id: string, depth: number) => {
    const node = graph.nodes.get(id);
    if (!node) return null;
    const kids = childrenOf.get(id) ?? [];
    const expandable = node.synthetic === true || !LEAF_KINDS.has(node.node_kind) || kids.length > 0;
    const isOpen = open.has(id);
    const isSel = id === selectedId;
    const busy = expanding.has(id);

    return (
      <li key={id} role="treeitem" aria-selected={isSel} aria-expanded={expandable ? isOpen : undefined}>
        <div
          ref={isSel ? selectedRowRef : undefined}
          className={`flex items-center gap-1 rounded-md transition-colors duration-150 ease-out ${isSel ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]"}`}
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          {expandable ? (
            <button
              type="button"
              onClick={() => toggle(id, kids.length)}
              aria-label={isOpen ? "Collapse" : "Expand"}
              className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-subtle)] hover:text-[var(--text)]"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <ChevronRight className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden />
              )}
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => select(id)}
            data-testid="tree-row"
            className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1 pr-2 text-left"
          >
            <span className={`truncate text-sm ${isSel ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
              {node.name}
            </span>
            <span className="shrink-0 text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {node.node_kind}
            </span>
          </button>
        </div>
        {expandable && isOpen && kids.length > 0 && (
          <ul role="group">{kids.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  if (graph.nodes.size === 0) {
    return <p className="px-2 py-3 text-xs text-[var(--text-subtle)]">No structure yet.</p>;
  }

  return (
    <ul role="tree" aria-label="Containment structure" data-testid="containment-tree" className="max-h-[420px] overflow-y-auto py-1">
      {roots.map((id) => renderNode(id, 0))}
    </ul>
  );
}
