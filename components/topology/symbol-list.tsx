/**
 * SymbolList — repo Topology's symbol-graph view (virtualized).
 *
 * Per ADR-073 §4 (canonical-home rule): top symbols live ONLY on the Repo
 * Topology tab. Per §6, the list is virtualized so a 1M-symbol repo
 * renders in bounded time.
 *
 * Scoped to the current TierExplorer tier where relevant (caller filters
 * the symbol list to the tier path before passing it in); at root tier,
 * shows the top-N across the whole repo.
 */

import {
  Hash,
  ScrollText,
} from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";
import type { TopSymbol } from "@/lib/api/client";

const SYMBOL_KIND_TONE: Record<string, string> = {
  function:  "bg-[var(--primary-soft)] text-[var(--primary)]",
  class:     "bg-[var(--info-soft)]    text-[var(--info)]",
  method:    "bg-[var(--primary-soft)] text-[var(--primary)]",
  type:      "bg-[var(--surface-2)]    text-[var(--text-muted)]",
  config:    "bg-[var(--warning-soft)] text-[var(--warning)]",
  module:    "bg-[var(--surface-2)]    text-[var(--text-muted)]",
};

export interface SymbolListProps {
  symbols: readonly TopSymbol[];
  /** Title slot — defaults to "Symbols". Pass e.g. "Symbols in handlers"
   *  when scoped to a tier. */
  title?: string;
}

export function SymbolList({ symbols, title = "Symbols" }: SymbolListProps) {
  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <Hash className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-[var(--text-muted)]">
          {symbols.length} · ranked by importance · signatures from the symbol graph
        </span>
      </Cluster>
      {symbols.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">No symbols at this tier.</p>
      ) : (
        <VirtualList
          items={symbols}
          estimatedItemHeight={140}
          ariaLabel={title}
          getKey={(s) => s.id}
          renderItem={(sym) => (
            <div className="rounded-md border border-[var(--border)] p-2.5">
              <Cluster gap="2" align="center">
                <span className="font-semibold text-sm">{sym.name}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    SYMBOL_KIND_TONE[sym.kind] ?? "bg-[var(--surface-2)] text-[var(--text-subtle)]",
                  )}
                >
                  {sym.kind}
                </span>
                <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
                  {sym.visibility}
                </span>
                {sym.has_tests && (
                  <span className="rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--success)]">
                    Tested
                  </span>
                )}
                <span className="ml-auto text-[10px] tabular-nums text-[var(--text-subtle)]">
                  {(sym.importance * 100).toFixed(0)}
                </span>
              </Cluster>
              <code className="block font-mono text-[10px] text-[var(--text-subtle)]">{sym.path}</code>
              <code className="mt-1 block whitespace-pre-wrap rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-[10px] text-[var(--text)]">
                {sym.signature}
              </code>
              {sym.docstring && (
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] line-clamp-3">
                  {sym.docstring}
                </p>
              )}
              <Cluster gap="3" align="center" className="mt-1 text-[10px] text-[var(--text-subtle)]">
                <span>
                  <strong className="text-[var(--text-muted)]">{sym.callers_count}</strong> callers
                </span>
                <span>·</span>
                <span>
                  <strong className="text-[var(--text-muted)]">{sym.callees_count}</strong> callees
                </span>
                {sym.adrs_referenced.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <ScrollText className="size-3" aria-hidden />
                      {sym.adrs_referenced.join(", ")}
                    </span>
                  </>
                )}
              </Cluster>
            </div>
          )}
        />
      )}
    </Stack>
  );
}
