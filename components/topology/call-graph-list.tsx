/**
 * CallGraphList - repo Topology's edge listing (virtualized).
 *
 * Per ADR-073 §4 (canonical-home rule): the call-edge listing lives ONLY
 * on the Repo Topology tab. Each row is one symbol-graph edge with kind,
 * endpoints, and occurrence count.
 */

import { ArrowRight } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import type { CallEdge } from "@/lib/api/client";

// CallEdge.kind is lowercase on the wire - keys must match or the lookup
// always misses and falls through to the raw kind.
const EDGE_KIND_LABEL: Record<string, string> = {
  calls:      "calls",
  imports:    "imports",
  extends:    "extends",
  implements: "implements",
  references: "references",
  contains:   "contains",
  tested_by:  "tested by",
};

interface CallGraphListProps {
  edges: readonly CallEdge[];
  title?: string;
}

export function CallGraphList({ edges, title = "Call graph" }: CallGraphListProps) {
  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <ArrowRight className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-[var(--text-muted)]">
          {edges.length} edges · top by occurrence count
        </span>
      </Cluster>
      {edges.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">No call-graph edges at this tier.</p>
      ) : (
        <VirtualList
          items={edges}
          estimatedItemHeight={36}
          ariaLabel={title}
          getKey={(e, i) => `${e.from.id}->${e.to.id}-${i}`}
          renderItem={(edge) => (
            <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs transition-colors duration-150 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]">
              <span
                className="min-w-0 truncate font-mono text-[var(--text-muted)]"
                title={edge.from.path}
              >
                {edge.from.name}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {EDGE_KIND_LABEL[edge.kind] ?? edge.kind}
                <ArrowRight className="size-3" aria-hidden />
              </span>
              <span
                className="min-w-0 truncate font-mono text-[var(--text-muted)]"
                title={edge.to.path}
              >
                {edge.to.name}
              </span>
              <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--text-muted)]">
                ×{edge.occurrences}
              </span>
            </div>
          )}
        />
      )}
    </Stack>
  );
}
