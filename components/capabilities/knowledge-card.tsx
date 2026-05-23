"use client";

/**
 * CapabilityKnowledgeCard — rich visualisation of what ingestion has
 * generated for a capability. Renders the LLM-written capability
 * summary, a kind-histogram of the KG, top entities, and recent
 * ingestion activity. Designed for the Overview tab of
 * /capabilities/[id].
 *
 * Reads `CapabilityKnowledge` produced by ingestion + the hierarchical
 * KG (ADR-042) and the capability-overlay rebuild (ADR-049).
 */

import {
  Box,
  Boxes,
  Brain,
  Cog,
  Database,
  FileCode,
  FileText,
  GitCommit,
  Layers,
  Library,
  Network,
  Settings,
  Sparkles,
  TestTube,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { CapabilityKnowledge } from "@/lib/api/client";

const KIND_ICON: Record<string, typeof Boxes> = {
  service: Boxes,
  module: Box,
  function: FileCode,
  class: Layers,
  config: Cog,
  document: FileText,
  test: TestTube,
};

const KIND_LABEL: Record<string, string> = {
  service: "Services",
  module: "Modules",
  function: "Functions",
  class: "Classes",
  config: "Configs",
  document: "Docs",
  test: "Tests",
};

const FRESHNESS_STYLES: Record<CapabilityKnowledge["ingestion_status"], { tone: string; label: string }> = {
  fresh:               { tone: "bg-[var(--success-soft)] text-[var(--success)]",   label: "Fresh"                         },
  debouncing:          { tone: "bg-[var(--primary-soft)] text-[var(--primary)]",   label: "Rebuilding (debounced)"        },
  stale_but_usable:    { tone: "bg-[var(--warning-soft)] text-[var(--warning)]",   label: "Stale (still usable)"          },
  ingesting:           { tone: "bg-[var(--primary-soft)] text-[var(--primary)]",   label: "Indexing"                      },
  failed:              { tone: "bg-[var(--danger-soft)]  text-[var(--danger)]",    label: "Ingestion failed"              },
};

export function CapabilityKnowledgeCard({ knowledge }: { knowledge: CapabilityKnowledge }) {
  const fresh = FRESHNESS_STYLES[knowledge.ingestion_status];
  const orderedKinds = Object.entries(knowledge.nodes_by_kind).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...orderedKinds.map(([, c]) => c), 1);

  return (
    <Stack gap="4">
      {/* Header: summary + freshness pill */}
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="start">
            <Cluster gap="2" align="center">
              <Brain className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Capability knowledge</span>
            </Cluster>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                fresh.tone,
              )}
              title={`Last ingested ${knowledge.last_ingested_at}`}
            >
              <Sparkles className="size-2.5" />
              {fresh.label}
            </span>
          </Cluster>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">{knowledge.capability_summary}</p>
        </Stack>
      </Card>

      {/* Node-kind histogram */}
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <Network className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Indexed entities</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">
              {knowledge.nodes_total.toLocaleString()} nodes · {knowledge.edges_total.toLocaleString()} edges
            </span>
          </Cluster>
          <Grid cols="auto-fit-140" gap="2">
            {orderedKinds.map(([kind, count]) => {
              const Icon = KIND_ICON[kind] ?? Boxes;
              const label = KIND_LABEL[kind] ?? kind;
              const fillPct = (count / maxCount) * 100;
              return (
                <div key={kind} className="rounded-md border border-[var(--border)] p-2">
                  <Cluster gap="2" align="center">
                    <Icon className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      {label}
                    </span>
                    <span className="ml-auto text-xs font-semibold tabular-nums">{count.toLocaleString()}</span>
                  </Cluster>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${fillPct}%` }}
                      aria-hidden
                    />
                  </div>
                </div>
              );
            })}
          </Grid>
          <Cluster gap="3" align="center" className="text-xs text-[var(--text-muted)]">
            <Cluster gap="1" align="center"><Library className="size-3" /> {knowledge.repos_indexed} repos indexed</Cluster>
            <Cluster gap="1" align="center"><FileText className="size-3" /> {knowledge.decision_records} decision records</Cluster>
            <Cluster gap="1" align="center"><Database className="size-3" /> {knowledge.domain_concepts} domain concepts</Cluster>
          </Cluster>
        </Stack>
      </Card>

      {/* Top entities */}
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <Settings className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Top entities</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">ranked by importance score</span>
          </Cluster>
          <Stack gap="2" as="ul">
            {knowledge.top_entities.map((e) => {
              const Icon = KIND_ICON[e.kind] ?? Boxes;
              return (
                <li key={e.id}>
                  <div className="grid grid-cols-[20px_1fr_auto] items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 hover:bg-[var(--surface-2)]">
                    <Icon className="mt-0.5 size-4 text-[var(--primary)]" aria-hidden />
                    <Stack gap="0.5">
                      <Cluster gap="2" align="center">
                        <span className="text-sm font-medium">{e.name}</span>
                        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                          {e.kind}
                        </span>
                        <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                          {e.path}
                        </code>
                      </Cluster>
                      <p className="text-xs text-[var(--text-muted)]">{e.description}</p>
                      <span className="text-[10px] text-[var(--text-subtle)]">{e.repo}</span>
                    </Stack>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-semibold tabular-nums text-[var(--primary)]">
                        {(e.importance * 100).toFixed(0)}
                      </span>
                      <div
                        className="h-1 w-12 overflow-hidden rounded-full bg-[var(--surface-2)]"
                        title={`Importance score ${(e.importance * 100).toFixed(0)}/100`}
                      >
                        <div
                          className="h-full rounded-full bg-[var(--primary)]"
                          style={{ width: `${e.importance * 100}%` }}
                          aria-hidden
                        />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </Stack>
        </Stack>
      </Card>

      {/* Recent changes */}
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <GitCommit className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Recent ingestion activity</span>
          </Cluster>
          <Stack gap="0" as="ul">
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
                    <span>{c.nodes_affected} node{c.nodes_affected === 1 ? "" : "s"} affected</span>
                  </Cluster>
                </Stack>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}
