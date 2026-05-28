"use client";

/**
 * CapabilityKnowledgePanel — pure presentation surface for the
 * `Knowledge` tab on `/capabilities/[id]`. Renders the KG-distinctive
 * slice of `CapabilityKnowledge` (ADR-042 / ADR-049) in four sections:
 *
 *   1. `nodes_by_kind` histogram   (counts per node kind, sorted desc)
 *   2. `top_entities`              (importance-ranked entity table)
 *   3. `overlay_terms`             (domain term → matched KG node bridges)
 *   4. `recent_changes`            (raw KG ingestion projection)
 *
 * No fetching here — `data` is owned by the parent page so loading +
 * error states stay co-located with the rest of the capability data.
 * Empty zero-state when the histogram is empty / entities/terms/changes
 * arrays are empty falls back to a single `<EmptyState>` per UX §9.2.
 */

import { BarChart3, BookOpen, Brain, Database, GitCommit, Network } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { CapabilityKnowledge } from "@/lib/api/client";

const CHANGE_CLASS_TONE: Record<string, string> = {
  cosmetic: "bg-[var(--surface-2)]    text-[var(--text-subtle)]",
  minor:    "bg-[var(--primary-soft)] text-[var(--primary)]",
  material: "bg-[var(--warning-soft)] text-[var(--warning)]",
};

export function CapabilityKnowledgePanel({ knowledge }: { knowledge: CapabilityKnowledge }) {
  const histogram = Object.entries(knowledge.nodes_by_kind).sort((a, b) => b[1] - a[1]);
  const maxCount = histogram[0]?.[1] ?? 0;
  const totallyEmpty =
    histogram.length === 0 &&
    knowledge.top_entities.length === 0 &&
    knowledge.overlay_terms.length === 0 &&
    knowledge.recent_changes.length === 0;

  if (totallyEmpty) {
    return (
      <EmptyState
        icon={<Database className="size-8" aria-hidden />}
        title="No knowledge ingested yet"
        description="Attach a repo and run Sync from the Repos tab to populate the KG overlay."
      />
    );
  }

  return (
    <Stack gap="4">
      {histogram.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <BarChart3 className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Node kinds</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {knowledge.nodes_total.toLocaleString()} nodes ·{" "}
                {knowledge.edges_total.toLocaleString()} edges
              </span>
            </Cluster>
            <Stack gap="1.5" as="ul" data-testid="capability-knowledge-histogram">
              {histogram.map(([kind, count]) => {
                const pct = maxCount === 0 ? 0 : Math.max(2, Math.round((count / maxCount) * 100));
                return (
                  <li key={kind} className="grid grid-cols-[80px_1fr_56px] items-center gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-[var(--text-subtle)]">{kind}</span>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"
                      title={`${count.toLocaleString()} ${kind} nodes`}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{ width: `${pct}%` }}
                        aria-hidden
                      />
                    </div>
                    <span className="text-right font-semibold tabular-nums text-[var(--text)]">
                      {count.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </Stack>
          </Stack>
        </Card>
      )}

      {knowledge.top_entities.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <Network className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Top entities</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {knowledge.top_entities.length} ranked by importance
              </span>
            </Cluster>
            <Stack gap="1" as="ul" data-testid="capability-knowledge-entities">
              {knowledge.top_entities.map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-[1fr_auto_64px] items-center gap-3 rounded border border-[var(--border)] px-2 py-1.5 text-xs"
                >
                  <Cluster gap="2" align="center" className="min-w-0">
                    <span className="font-semibold">{e.name}</span>
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      {e.kind}
                    </span>
                    <code
                      className="truncate font-mono text-[10px] text-[var(--text-muted)]"
                      title={e.path}
                    >
                      {e.path}
                    </code>
                  </Cluster>
                  <span className="text-[10px] text-[var(--text-subtle)]">{e.repo}</span>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
                    title={`Importance ${(e.importance * 100).toFixed(0)}/100`}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${e.importance * 100}%` }}
                      aria-hidden
                    />
                  </div>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {knowledge.overlay_terms.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <Brain className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Overlay terms</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                domain vocabulary → KG nodes
              </span>
            </Cluster>
            <Stack gap="1.5" as="ul" data-testid="capability-knowledge-overlay-terms">
              {knowledge.overlay_terms.map((t, i) => (
                <li key={`${t.term}-${i}`} className="rounded-md border border-[var(--border)] p-2">
                  <Cluster gap="2" align="center" className="text-sm">
                    <span className="font-semibold">{t.term}</span>
                    <div
                      className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-2)]"
                      title={`Confidence ${(t.confidence * 100).toFixed(0)}%`}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{ width: `${t.confidence * 100}%` }}
                        aria-hidden
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">
                      {(t.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                      from {t.extracted_from.resource_id} {t.extracted_from.line_range}
                    </span>
                  </Cluster>
                  <Cluster gap="1" align="center" className="text-[10px]">
                    <span className="text-[var(--text-subtle)]">{"->"}</span>
                    {t.matched_node_labels.map((label) => (
                      <code
                        key={label}
                        className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[var(--text-muted)]"
                      >
                        {label}
                      </code>
                    ))}
                  </Cluster>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {knowledge.recent_changes.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <GitCommit className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Recent changes</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                raw KG projection · ADR-048 verdict
              </span>
            </Cluster>
            <Stack gap="0" as="ul" data-testid="capability-knowledge-recent-changes">
              {knowledge.recent_changes.map((c, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-3 py-2",
                    i > 0 && "border-t border-[var(--border)]",
                  )}
                >
                  <span className="w-16 shrink-0 text-[10px] font-mono uppercase tracking-wider text-[var(--text-subtle)]">
                    {c.when}
                  </span>
                  <Stack gap="0.5" className="min-w-0 flex-1">
                    <span className="text-sm text-[var(--text)]">{c.summary}</span>
                    <Cluster gap="2" align="center" className="text-[10px] text-[var(--text-subtle)]">
                      <span className="font-mono">{c.repo}</span>
                      <span>·</span>
                      <span>
                        {c.nodes_affected} node{c.nodes_affected === 1 ? "" : "s"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                          CHANGE_CLASS_TONE[c.change_class] ??
                            "bg-[var(--surface-2)] text-[var(--text-subtle)]",
                        )}
                      >
                        {c.change_class}
                      </span>
                    </Cluster>
                  </Stack>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      <p className="text-[10px] text-[var(--text-subtle)]">
        <BookOpen className="mr-1 inline size-3" aria-hidden />
        Counts refresh on every ingest. See the Topology tab for the visual entity graph.
      </p>
    </Stack>
  );
}
