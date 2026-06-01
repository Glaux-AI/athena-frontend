"use client";

/**
 * NodeRefChip / NodeRefButton — the canonical clickable reference to a KG
 * node (Phase D contract #1). Rendered everywhere a {@link NodeRef} appears
 * (dossier relations, blueprint derived tables, glossary, hubs). Clicking it
 * opens the shared node-dossier drawer on the ref's `node_id`.
 *
 * One component so node-id navigation looks + behaves identically across
 * the whole knowledge surface.
 */

import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/cn";
import type { NodeRef } from "@/lib/api/client";
import { useNodeDossier } from "@/components/knowledge/node-dossier-context";

/** Compact pill — name + kind. Use inline in lists / relation rows. */
export function NodeRefChip({
  node,
  className,
  onNavigate,
}: {
  node: Pick<NodeRef, "node_id" | "name" | "kind"> & { path?: string | null };
  className?: string;
  /** Optional override (the drawer passes its in-stack `push`); defaults to
   *  the global `open`. */
  onNavigate?: (nodeId: string) => void;
}) {
  const { open } = useNodeDossier();
  const go = onNavigate ?? open;
  return (
    <button
      type="button"
      onClick={() => go(node.node_id)}
      data-testid="node-ref-chip"
      data-node-id={node.node_id}
      title={node.path ?? node.name}
      className={cn(
        "group inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]",
        "transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
        className,
      )}
    >
      <span className="truncate font-medium text-[var(--text)] group-hover:text-[var(--primary)]">{node.name}</span>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--text-subtle)]">{node.kind}</span>
    </button>
  );
}

/** Full-width row — name + kind + path. Use in linked tables (derived
 *  sections, glossary). Accepts the minimal ref fields so callers can
 *  synthesise a row from any node-bearing shape (path may be null). */
export function NodeRefRow({
  node,
  headline,
  onNavigate,
}: {
  node: Pick<NodeRef, "node_id" | "name" | "kind"> & { path?: string | null };
  /** Optional one-line description rendered under the name. */
  headline?: string | null;
  onNavigate?: (nodeId: string) => void;
}) {
  const { open } = useNodeDossier();
  const go = onNavigate ?? open;
  return (
    <button
      type="button"
      onClick={() => go(node.node_id)}
      data-testid="node-ref-row"
      data-node-id={node.node_id}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-left",
        "transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--text)]">{node.name}</span>
          <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {node.kind}
          </span>
        </div>
        {headline && <p className="truncate text-xs text-[var(--text-muted)]">{headline}</p>}
        {node.path && (
          <code className="block truncate font-mono text-[10px] text-[var(--text-subtle)]" title={node.path}>
            {node.path}
          </code>
        )}
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-[var(--text-subtle)] group-hover:text-[var(--primary)]" aria-hidden />
    </button>
  );
}
