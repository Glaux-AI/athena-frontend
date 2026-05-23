"use client";

/**
 * RepoKnowledgePanel — per-repo knowledge view. Renders inline inside
 * an expanded repo card on the Repos tab of /capabilities/[id].
 *
 * Reads `RepoKnowledge` (lib/api/client.ts) produced by ingestion +
 * the hierarchical KG (ADR-042 service-tier summary).
 *
 * Lazy-loaded: the panel only fetches when its parent row is
 * expanded, so closed rows stay cheap.
 */

import { useEffect, useState } from "react";
import {
  Box,
  Boxes,
  Code2,
  FileCode,
  GitCommit,
  Layers,
  Sparkles,
} from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import { api, ApiError, type RepoKnowledge } from "@/lib/api/client";
import { KnowledgeMiniGraph, type MiniGraphNode, type MiniGraphEdge } from "@/components/knowledge/mini-graph";

const FRESHNESS_STYLES: Record<RepoKnowledge["ingestion_status"], { tone: string; label: string }> = {
  fresh:               { tone: "bg-[var(--success-soft)] text-[var(--success)]",   label: "Fresh"                         },
  debouncing:          { tone: "bg-[var(--primary-soft)] text-[var(--primary)]",   label: "Rebuilding"                    },
  stale_but_usable:    { tone: "bg-[var(--warning-soft)] text-[var(--warning)]",   label: "Stale (usable)"                },
  ingesting:           { tone: "bg-[var(--primary-soft)] text-[var(--primary)]",   label: "Indexing"                      },
  failed:              { tone: "bg-[var(--danger-soft)]  text-[var(--danger)]",    label: "Failed"                        },
};

export function RepoKnowledgePanel({ capabilityId, repoId }: { capabilityId: string; repoId: string }) {
  const [data, setData] = useState<RepoKnowledge | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const k = await api.capabilities.repoKnowledge(capabilityId, repoId);
        if (!cancelled) setData(k);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load repo knowledge");
      }
    })();
    return () => { cancelled = true; };
  }, [capabilityId, repoId]);

  if (error) {
    return (
      <div className="rounded-md border border-[var(--border-strong)] bg-[var(--danger-soft)] p-3">
        <p className="text-xs text-[var(--danger)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <Stack gap="2" aria-busy="true" aria-label="Loading repo knowledge">
        <div className="h-4 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-16 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-10 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-10 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-10 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </div>
      </Stack>
    );
  }

  const fresh = FRESHNESS_STYLES[data.ingestion_status];

  return (
    <Stack gap="3" className="border-t border-[var(--border)] pt-3">
      {/* Top row: stats + freshness pill */}
      <Cluster gap="3" align="center" className="flex-wrap">
        <Stat label="Files indexed" value={data.files_indexed.toLocaleString()} />
        <Stat label="LOC" value={data.loc.toLocaleString()} />
        <Stat label="Language" value={data.primary_language} />
        <Stat label="Exports" value={data.exports.toString()} />
        <Stat label="ADRs referenced" value={data.decision_records_referenced.toString()} />
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            fresh.tone,
          )}
          title={`Last ingested ${data.last_ingested_at}`}
        >
          <Sparkles className="size-2.5" />
          {fresh.label}
        </span>
      </Cluster>

      {/* Summary */}
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">{data.summary}</p>

      {/* Repo graph — services on top, modules below; edges link service → modules
       *  it owns. Lets the user see the repo's shape at a glance. */}
      <Stack gap="1.5">
        <Cluster gap="2" align="center">
          <Code2 className="size-3.5 text-[var(--primary)]" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Module graph
          </span>
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            service → owned modules (sized by symbol count)
          </span>
        </Cluster>
        <KnowledgeMiniGraph
          size="wide"
          nodes={buildRepoGraphNodes(data)}
          edges={buildRepoGraphEdges(data)}
        />
      </Stack>

      {/* Services + modules */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Services */}
        <Stack gap="1.5">
          <Cluster gap="2" align="center">
            <Boxes className="size-3.5 text-[var(--text-muted)]" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Services
            </span>
          </Cluster>
          <Stack gap="1" as="ul">
            {data.services.map((s) => (
              <li key={s.id} className="rounded-md border border-[var(--border)] p-2">
                <Stack gap="0.5">
                  <Cluster gap="2" align="center" className="text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-auto rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
                      {s.symbols} symbols
                    </span>
                  </Cluster>
                  <code className="font-mono text-[10px] text-[var(--text-subtle)]">{s.path}</code>
                  <p className="text-xs text-[var(--text-muted)]">{s.description}</p>
                </Stack>
              </li>
            ))}
          </Stack>
        </Stack>

        {/* Modules */}
        <Stack gap="1.5">
          <Cluster gap="2" align="center">
            <Box className="size-3.5 text-[var(--text-muted)]" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Top modules
            </span>
          </Cluster>
          <Stack gap="1" as="ul">
            {data.modules.map((mod) => (
              <li key={mod.id} className="rounded-md border border-[var(--border)] p-2">
                <Cluster gap="2" align="center" className="text-sm">
                  <FileCode className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                  <span className="truncate font-mono text-xs">{mod.name}</span>
                  <span className="ml-auto rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
                    {mod.symbols}
                  </span>
                </Cluster>
                <code className="block font-mono text-[10px] text-[var(--text-subtle)]">{mod.path}</code>
              </li>
            ))}
          </Stack>
        </Stack>
      </div>

      {/* Recent commits */}
      <Stack gap="1.5">
        <Cluster gap="2" align="center">
          <GitCommit className="size-3.5 text-[var(--text-muted)]" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Recent commits processed
          </span>
        </Cluster>
        <Stack gap="0" as="ul">
          {data.recent_commits.map((c, i) => (
            <li
              key={c.sha}
              className={cn(
                "grid grid-cols-[60px_60px_1fr_auto] gap-2 py-1.5 text-xs",
                i > 0 && "border-t border-[var(--border)]",
              )}
            >
              <code className="font-mono text-[10px] text-[var(--text-subtle)]">{c.sha}</code>
              <span className="text-[10px] text-[var(--text-subtle)]">{c.when}</span>
              <span className="min-w-0 truncate text-[var(--text)]">{c.message}</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {c.author} · {c.nodes_affected} node{c.nodes_affected === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{value}</span>
    </Stack>
  );
}

/** Skeleton placeholder used by parent before the panel is expanded.
 * Kept here so the parent doesn't have to depend on lucide / shape. */
export function RepoKnowledgeSkeleton() {
  return (
    <div className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]" aria-hidden />
  );
}

/** Tiny inline indicator used in the collapsed repo row. */
export function RepoKnowledgeBadge({ status }: { status: RepoKnowledge["ingestion_status"] | undefined }) {
  if (!status) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
        aria-label="Loading"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--text-muted)]" aria-hidden />
        Loading
      </span>
    );
  }
  const fresh = FRESHNESS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        fresh.tone,
      )}
    >
      <Code2 className="size-2.5" />
      {fresh.label}
    </span>
  );
}

export { Layers };

/**
 * Build the per-repo module graph. Layout:
 *   layer 0 — services (entry points to this repo)
 *   layer 1 — modules (the bulk; sized by symbol count via importance scaling)
 *
 * Edges: service → module when the module's path lies under the service's
 * path prefix. Falls back to "first service owns everything" for repos with
 * a single service (the common case).
 */
function buildRepoGraphNodes(data: RepoKnowledge): MiniGraphNode[] {
  const maxSymbols = Math.max(
    1,
    ...data.services.map((s) => s.symbols),
    ...data.modules.map((m) => m.symbols),
  );
  const services: MiniGraphNode[] = data.services.map((s) => ({
    id: s.id,
    label: s.name,
    kind: "service",
    layer: 0,
    sublabel: s.path.split("/").slice(-2).join("/"),
    importance: 0.95,
    badge: `${s.symbols}`,
  }));
  const modules: MiniGraphNode[] = data.modules.slice(0, 6).map((m) => ({
    id: m.id,
    label: m.name.replace(/\.[^./]+$/, ""),  // strip extension for readability
    kind: "module",
    layer: 1,
    sublabel: m.path.split("/").slice(-2).join("/"),
    importance: 0.4 + 0.5 * (m.symbols / maxSymbols),
    badge: `${m.symbols}`,
  }));
  return [...services, ...modules];
}

function buildRepoGraphEdges(data: RepoKnowledge): MiniGraphEdge[] {
  const edges: MiniGraphEdge[] = [];
  const services = data.services;
  if (services.length === 0) return [];
  for (const m of data.modules.slice(0, 6)) {
    const owner = services.find((s) => m.path.startsWith(s.path)) ?? services[0]!;
    edges.push({ src: owner.id, dst: m.id });
  }
  return edges;
}
