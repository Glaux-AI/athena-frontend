"use client";

/**
 * Read-grade Layers panel (the Pro disclosure): the prototype's element tree as
 * reported by the bridge, indented by depth. Clicking a layer selects + outlines
 * it in the preview (the same pick the canvas knobs act on). Read-only structure
 * - reordering/precision manipulation is the gated Phase-4 canvas, not this.
 */

import { Layers } from "lucide-react";

import { cn } from "@/lib/cn";

import type { DesignNode } from "./editor-bridge";

export function LayersPanel({
  tree,
  pickedId,
  onSelect,
}: {
  tree: DesignNode[];
  pickedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        <Layers className="size-3.5 text-[var(--primary)]" aria-hidden />
        Layers
        {tree.length > 0 && <span className="text-[var(--text-subtle)]">· {tree.length}</span>}
      </div>
      {tree.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">Reading the prototype structure…</p>
      ) : (
        <ul className="max-h-[360px] overflow-auto py-1">
          {tree.slice(0, 200).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                style={{ paddingLeft: `${0.5 + n.depth * 0.75}rem` }}
                className={cn(
                  "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors",
                  n.id === pickedId
                    ? "bg-[var(--primary-soft)] text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
                )}
              >
                <span className="font-mono text-[10px] text-[var(--primary)]">{n.tag}</span>
                <span className="truncate">{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
