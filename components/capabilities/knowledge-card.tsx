"use client";

/**
 * CapabilityKnowledgeCard — KG-distinctive ingestion data for a capability.
 * Renders on the Overview tab of /capabilities/[id].
 *
 * Reads `CapabilityKnowledge` produced by ingestion + the hierarchical KG
 * (ADR-042) and the capability-overlay rebuild (ADR-049). Per ADR-071, the
 * card renders ONLY data that is not a Brief section. The curated narrative
 * (overview / guardrails / conventions / services / decisions / open
 * questions / domain_glossary / cross_repo_workflows / recent_activity)
 * lives in the Brief tab — never here.
 *
 * Sections, in scan order:
 *   1. Header + lead sentence  ← freshness pill + "see Brief for narrative"
 *   2. KG totals stat line     ← counts + `nodes_by_kind` histogram inline
 *   3. Entity graph + ledger   ← `top_entities` (importance ranking)
 *   4. Overlay terms           ← `overlay_terms[]` (KG-overlay bridges)
 *   5. Recent ingestion        ← `recent_changes[]` (raw KG projection)
 */

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  GitCommit,
  Layers,
  Library,
  Network,
  ScrollText,
  Sparkles,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { CapabilityKnowledge } from "@/lib/api/client";
import { KnowledgeMiniGraph, type MiniGraphNode, type MiniGraphEdge } from "@/components/knowledge/mini-graph";

const FRESHNESS_STYLES: Record<CapabilityKnowledge["ingestion_status"], { tone: string; label: string }> = {
  fresh:            { tone: "bg-[var(--success-soft)] text-[var(--success)]",  label: "Fresh"                  },
  debouncing:       { tone: "bg-[var(--primary-soft)] text-[var(--primary)]",  label: "Rebuilding (debounced)" },
  stale_but_usable: { tone: "bg-[var(--warning-soft)] text-[var(--warning)]",  label: "Stale (still usable)"   },
  ingesting:        { tone: "bg-[var(--primary-soft)] text-[var(--primary)]",  label: "Indexing"               },
  failed:           { tone: "bg-[var(--danger-soft)]  text-[var(--danger)]",   label: "Ingestion failed"       },
};

const CHANGE_CLASS_TONE: Record<string, string> = {
  cosmetic: "bg-[var(--surface-2)]    text-[var(--text-subtle)]",
  minor:    "bg-[var(--primary-soft)] text-[var(--primary)]",
  material: "bg-[var(--warning-soft)] text-[var(--warning)]",
};

export function CapabilityKnowledgeCard({ knowledge }: { knowledge: CapabilityKnowledge }) {
  const fresh = FRESHNESS_STYLES[knowledge.ingestion_status];
  const kindHistogram = Object.entries(knowledge.nodes_by_kind).sort((a, b) => b[1] - a[1]);

  return (
    <Stack gap="4">
      {/* 1. Header — single source of capability_summary ----------------- */}
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
          <p className="text-xs text-[var(--text-muted)]">
            KG-derived ingestion data only. For the curated narrative — overview, guardrails, conventions, services, decisions,
            open questions, glossary, cross-repo workflows — open the Brief tab.
          </p>

          {/* 2. KG totals stat line (replaces the 7-bar histogram card) -- */}
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
            <Cluster gap="4" align="center" className="flex-wrap text-xs">
              <StatInline label="Nodes"   value={knowledge.nodes_total.toLocaleString()} />
              <StatInline label="Edges"   value={knowledge.edges_total.toLocaleString()} />
              <StatInline label="Repos"   value={knowledge.repos_indexed.toString()}     icon={Library} />
              <StatInline label="ADRs"    value={knowledge.decision_records.toString()}  icon={ScrollText} />
              <StatInline label="Concepts" value={knowledge.domain_concepts.toString()}  icon={BookOpen} />
              <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-subtle)]">
                {kindHistogram.map(([kind, count]) => (
                  <span key={kind} className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono">
                    {kind} {count}
                  </span>
                ))}
              </span>
            </Cluster>
          </div>
        </Stack>
      </Card>

      {/* 3. Entity graph (canonical view of top_entities — no list dup) - */}
      <Card>
        <Stack gap="3">
          <SectionHeading icon={Network} label="Entity graph" hint="top entities by importance · grouped by kind" />
          <KnowledgeMiniGraph
            size="wide"
            nodes={buildCapabilityGraphNodes(knowledge)}
            edges={buildCapabilityGraphEdges(knowledge)}
          />
          {/* compact per-entity importance ledger — no card duplication */}
          <Stack gap="1" as="ul">
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
                  <code className="truncate font-mono text-[10px] text-[var(--text-muted)]" title={e.path}>{e.path}</code>
                </Cluster>
                <span className="text-[10px] text-[var(--text-subtle)]">{e.repo}</span>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
                  title={`Importance ${(e.importance * 100).toFixed(0)}/100`}
                >
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${e.importance * 100}%` }} aria-hidden />
                </div>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      {/* 5. Overlay terms — domain vocab → matched KG nodes -------------- */}
      {knowledge.overlay_terms.length > 0 && (
        <Card>
          <Stack gap="3">
            <SectionHeading icon={Brain} label="Overlay terms" hint="domain vocabulary Athena learned → matched KG nodes" />
            <Stack gap="1.5" as="ul">
              {knowledge.overlay_terms.map((t, i) => (
                <li key={`${t.term}-${i}`} className="rounded-md border border-[var(--border)] p-2">
                  <Cluster gap="2" align="center" className="text-sm">
                    <span className="font-semibold">{t.term}</span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-2)]" title={`Confidence ${(t.confidence * 100).toFixed(0)}%`}>
                      <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${t.confidence * 100}%` }} aria-hidden />
                    </div>
                    <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">{(t.confidence * 100).toFixed(0)}%</span>
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                      from {t.extracted_from.resource_id} {t.extracted_from.line_range}
                    </span>
                  </Cluster>
                  <Cluster gap="1" align="center" className="text-[10px]">
                    <span className="text-[var(--text-subtle)]">→</span>
                    {t.matched_node_labels.map((label) => (
                      <code key={label} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[var(--text-muted)]">
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

      {/* 5. Recent ingestion activity (raw KG projection — Brief.recent_activity is the narrative) -- */}
      <Card>
        <Stack gap="3">
          <SectionHeading icon={GitCommit} label="Recent ingestion activity" hint="smart-classifier verdict per ADR-048" />
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
                    <span>{c.nodes_affected} node{c.nodes_affected === 1 ? "" : "s"}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        CHANGE_CLASS_TONE[c.change_class] ?? "bg-[var(--surface-2)] text-[var(--text-subtle)]",
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
    </Stack>
  );
}

function SectionHeading({ icon: Icon, label, hint }: { icon: typeof Network; label: string; hint?: string | undefined }) {
  return (
    <Cluster gap="2" align="center">
      <Icon className="size-4 text-[var(--primary)]" aria-hidden />
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="ml-auto text-xs text-[var(--text-muted)]">{hint}</span>}
    </Cluster>
  );
}

function StatInline({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Library }) {
  return (
    <span className="flex items-center gap-1">
      {Icon && <Icon className="size-3 text-[var(--text-muted)]" aria-hidden />}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className="font-semibold tabular-nums text-[var(--text)]">{value}</span>
    </span>
  );
}

/**
 * Build the per-capability entity graph from the top_entities list. Layers:
 *   0 — services (top row)
 *   1 — classes
 *   2 — modules + functions
 *   3 — configs + documents (bottom row, "supporting" artifacts)
 *
 * Edge inference: services → classes/modules/configs they own (matched by
 * the entity's `path` containing the service's `path` prefix), classes →
 * documents they reference (only when the document's name is mentioned in
 * the class's description). Falls back to no edges if no overlap.
 */
function buildCapabilityGraphNodes(k: CapabilityKnowledge): MiniGraphNode[] {
  const KIND_TO_LAYER: Record<string, number> = {
    service:  0,
    class:    1,
    module:   2,
    function: 2,
    config:   3,
    document: 3,
  };
  return k.top_entities.map((e) => ({
    id: e.id,
    label: e.name,
    kind: (["service","module","function","class","config","document"].includes(e.kind)
      ? e.kind
      : "module") as MiniGraphNode["kind"],
    layer: KIND_TO_LAYER[e.kind] ?? 2,
    sublabel: e.path.split("/").slice(-2).join("/"),
    importance: e.importance,
    badge: e.kind === "service" ? "svc" : undefined,
  }));
}

function buildCapabilityGraphEdges(k: CapabilityKnowledge): MiniGraphEdge[] {
  const edges: MiniGraphEdge[] = [];
  const services = k.top_entities.filter((e) => e.kind === "service");
  const others = k.top_entities.filter((e) => e.kind !== "service" && e.kind !== "document");
  const docs = k.top_entities.filter((e) => e.kind === "document");

  for (const s of services) {
    for (const o of others) {
      if (o.repo === s.repo) edges.push({ src: s.id, dst: o.id });
    }
  }
  for (const o of others) {
    for (const d of docs) {
      const idMatch = d.name.replace(/^ADR-/, "").split(" ")[0] ?? "";
      if (idMatch && o.description?.includes(idMatch)) {
        edges.push({ src: o.id, dst: d.id, style: "dashed", label: "references" });
      }
    }
  }
  return edges;
}

/* Re-exports preserved for backwards-compat with sibling files. */
export { Layers, ArrowRight, AlertTriangle, CheckCircle2, BookOpen, ScrollText };
