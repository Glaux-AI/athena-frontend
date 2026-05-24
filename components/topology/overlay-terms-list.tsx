/**
 * OverlayTermsList — capability Topology's overlay-term ledger.
 *
 * Per ADR-073 §4 (canonical-home rule): overlay terms live ONLY on the
 * Capability Topology tab. This is a separate component from EntityGraph
 * because the underlying datapoint is different — overlay terms are domain
 * vocabulary, top entities are KG nodes.
 */

import { Tags } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import type { CapabilityKnowledge } from "@/lib/api/client";

export interface OverlayTermsListProps {
  knowledge: CapabilityKnowledge;
}

export function OverlayTermsList({ knowledge }: OverlayTermsListProps) {
  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <Tags className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Overlay terms</span>
        <span className="text-xs text-[var(--text-muted)]">
          domain vocabulary the overlay extracted · confidence ⇒ how strongly the term anchors
        </span>
      </Cluster>
      {knowledge.overlay_terms.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">
          No overlay terms extracted yet. Athena builds these from the capability&apos;s resources during the next sync.
        </p>
      ) : (
        <VirtualList
          items={knowledge.overlay_terms}
          estimatedItemHeight={56}
          ariaLabel="Overlay terms"
          getKey={(t) => t.term}
          renderItem={(t) => (
            <div className="rounded-md border border-[var(--border)] p-2.5">
              <Cluster gap="2" align="center">
                <code className="font-mono text-sm font-semibold text-[var(--text)]">{t.term}</code>
                <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--text-muted)]">
                  {(t.confidence * 100).toFixed(0)}%
                </span>
                <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                  from {t.extracted_from.resource_id} · {t.extracted_from.line_range}
                </span>
              </Cluster>
              {t.matched_node_labels.length > 0 && (
                <Cluster gap="1" align="center" className="mt-1 text-[10px] text-[var(--text-subtle)]">
                  <span className="uppercase tracking-wider">matches</span>
                  {t.matched_node_labels.slice(0, 3).map((m) => (
                    <code key={m} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono">
                      {m}
                    </code>
                  ))}
                </Cluster>
              )}
            </div>
          )}
        />
      )}
    </Stack>
  );
}
