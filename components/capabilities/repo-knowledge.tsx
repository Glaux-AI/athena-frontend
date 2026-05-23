"use client";

/**
 * RepoKnowledgePanel — KG-distinctive ingestion data for one repo. Renders
 * inline inside an expanded repo card on the Repos tab of /capabilities/[id].
 *
 * Reads `RepoKnowledge` (lib/api/client.ts) produced by ingestion + the
 * hierarchical KG (ADR-042 five-tier summaries). Per ADR-071, the panel
 * renders ONLY data that is not a Repo Brief section — the curated
 * narrative (overview / guardrails / conventions / stack / api_surface /
 * data_models / entry_points / hot_files / tests_and_ci / build_and_run /
 * deployment_surface / external_deps / local_idioms / recent_activity)
 * lives in the Repo Brief (link in the row header).
 *
 * Sections, in scan order:
 *   1. Stats + freshness pill        ← files/LOC/lang/exports
 *   2. Snapshot                      ← indexed_sha, branch, pending PRs
 *   3. Module graph                  ← `services` + `modules` (visual)
 *   4. Service-tier summaries        ← `services[]` (KG node + tier_summary)
 *   5. Module-tier summaries         ← `modules[]` (KG node + tier_summary)
 *   6. Top symbols                   ← `top_symbols` (function/class detail)
 *   7. Call graph                    ← `call_edges`
 *   8. Decision records              ← `adrs_referenced`
 *   9. Configs                       ← `configs`
 *  10. Recent commits                ← `recent_commits` (raw projection)
 *
 * Lazy-loaded: the panel only fetches when its parent row is
 * expanded, so closed rows stay cheap.
 */

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Box,
  Code2,
  Cog,
  FileCode,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Hash,
  Layers,
  ScrollText,
  Sparkles,
} from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import { api, ApiError, type RepoKnowledge } from "@/lib/api/client";
import { KnowledgeMiniGraph, type MiniGraphNode, type MiniGraphEdge } from "@/components/knowledge/mini-graph";

const FRESHNESS_STYLES: Record<RepoKnowledge["ingestion_status"], { tone: string; label: string }> = {
  fresh:            { tone: "bg-[var(--success-soft)] text-[var(--success)]", label: "Fresh" },
  debouncing:       { tone: "bg-[var(--primary-soft)] text-[var(--primary)]", label: "Rebuilding" },
  stale_but_usable: { tone: "bg-[var(--warning-soft)] text-[var(--warning)]", label: "Stale (usable)" },
  ingesting:        { tone: "bg-[var(--primary-soft)] text-[var(--primary)]", label: "Indexing" },
  failed:           { tone: "bg-[var(--danger-soft)]  text-[var(--danger)]",  label: "Failed" },
};

const ADR_STATUS_TONE: Record<string, string> = {
  accepted:   "bg-[var(--success-soft)] text-[var(--success)]",
  proposed:   "bg-[var(--primary-soft)] text-[var(--primary)]",
  superseded: "bg-[var(--surface-2)] text-[var(--text-subtle)]",
  deprecated: "bg-[var(--warning-soft)] text-[var(--warning)]",
};

const SYMBOL_KIND_ICON = {
  function: FileCode,
  class: Layers,
  method: FileCode,
  interface: Hash,
  type: Hash,
  enum: Hash,
} as const;

const EDGE_KIND_LABEL: Record<string, string> = {
  calls: "calls",
  imports: "imports",
  extends: "extends",
  implements: "implements",
  references: "refs",
  tested_by: "tested by",
  documented_by: "doc",
  contains: "contains",
  configures: "configures",
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
    <Stack gap="4" className="border-t border-[var(--border)] pt-4">
      {/* 1. Stats + freshness pill ----------------------------------------- */}
      <Cluster gap="4" align="center" className="flex-wrap">
        <Stat label="Files" value={data.files_indexed.toLocaleString()} />
        <Stat label="LOC" value={data.loc.toLocaleString()} />
        <Stat label="Language" value={data.primary_language} />
        <Stat label="Exports" value={data.exports.toString()} />
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

      {/* 2. Snapshot info ------------------------------------------------- */}
      <SnapshotCard data={data} />

      <p className="text-xs text-[var(--text-muted)]">
        KG-derived ingestion data only. For the curated narrative — overview, stack, api_surface, data_models, entry_points,
        hot_files, tests_and_ci, build_and_run, external_deps, deployment_surface, recent_activity — open the Repo Brief
        (link in the row header).
      </p>

      {/* 3. Module graph (visual canonical view) -------------------------- */}
      <SectionHeading icon={Code2} label="Module graph" hint="services on top · top modules below (sized by symbol count)" />
      <KnowledgeMiniGraph
        size="wide"
        nodes={buildRepoGraphNodes(data)}
        edges={buildRepoGraphEdges(data)}
      />

      {/* 7. Service tier summaries --------------------------------------- */}
      {data.services.length > 0 && (
        <Stack gap="2">
          <SectionHeading icon={Boxes} label="Services" hint="service-tier summaries (ADR-042)" />
          <Stack gap="2" as="ul">
            {data.services.map((s) => (
              <li key={s.id} className="rounded-md border border-[var(--border)] p-3">
                <Stack gap="1">
                  <Cluster gap="2" align="center" className="text-sm">
                    <span className="font-semibold">{s.name}</span>
                    <code className="font-mono text-[10px] text-[var(--text-subtle)]">{s.path}</code>
                    <span className="ml-auto rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
                      {s.symbols} symbols · {s.public_endpoints} endpoints
                    </span>
                  </Cluster>
                  <p className="text-xs text-[var(--text-muted)]">{s.description}</p>
                  <p className="text-xs leading-relaxed text-[var(--text-muted)]">{s.tier_summary}</p>
                </Stack>
              </li>
            ))}
          </Stack>
        </Stack>
      )}

      {/* 8. Module tier summaries ---------------------------------------- */}
      <Stack gap="2">
        <SectionHeading icon={Box} label="Modules" hint="module-tier summaries · hot = top decile churn (90d)" />
        <Stack gap="1.5" as="ul">
          {data.modules.map((mod) => (
            <li key={mod.id} className="rounded-md border border-[var(--border)] p-2.5">
              <Cluster gap="2" align="center" className="text-sm">
                <FileCode className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                <span className="truncate font-mono text-xs">{mod.name}</span>
                {mod.hot && (
                  <span className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning)]">
                    Hot
                  </span>
                )}
                <span className="ml-auto rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-muted)]">
                  {mod.symbols}
                </span>
              </Cluster>
              <code className="block font-mono text-[10px] text-[var(--text-subtle)]">{mod.path}</code>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{mod.tier_summary}</p>
            </li>
          ))}
        </Stack>
      </Stack>

      {/* 9. Top symbols (the function-level surface) --------------------- */}
      {data.top_symbols.length > 0 && (
        <Stack gap="2">
          <SectionHeading icon={Hash} label="Top symbols" hint="ranked by importance · signatures from symbol graph" />
          <Stack gap="1.5" as="ul">
            {data.top_symbols.map((sym) => {
              const Icon = SYMBOL_KIND_ICON[sym.kind] ?? Hash;
              return (
                <li key={sym.id} className="rounded-md border border-[var(--border)] p-2.5">
                  <Cluster gap="2" align="center" className="text-sm">
                    <Icon className="size-3.5 text-[var(--primary)]" aria-hidden />
                    <span className="font-semibold">{sym.name}</span>
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      {sym.kind}
                    </span>
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--text-muted)]">
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
                  <code className="block whitespace-pre-wrap rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-[10px] text-[var(--text)]">
                    {sym.signature}
                  </code>
                  {sym.docstring && (
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{sym.docstring}</p>
                  )}
                  <Cluster gap="3" align="center" className="mt-1 text-[10px] text-[var(--text-subtle)]">
                    <span><strong className="text-[var(--text-muted)]">{sym.callers_count}</strong> callers</span>
                    <span>·</span>
                    <span><strong className="text-[var(--text-muted)]">{sym.callees_count}</strong> callees</span>
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
                </li>
              );
            })}
          </Stack>
        </Stack>
      )}

      {/* 10. Call graph edges -------------------------------------------- */}
      {data.call_edges.length > 0 && (
        <Stack gap="2">
          <SectionHeading icon={ArrowRight} label="Call graph" hint="top edges from the symbol graph" />
          <Stack gap="1" as="ul">
            {data.call_edges.map((edge, i) => (
              <li
                key={`${edge.from.id}->${edge.to.id}-${i}`}
                className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate font-mono text-[var(--text-muted)]" title={edge.from.path}>
                  {edge.from.name}
                </span>
                <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  {EDGE_KIND_LABEL[edge.kind] ?? edge.kind}
                  <ArrowRight className="size-3" aria-hidden />
                </span>
                <span className="min-w-0 truncate font-mono text-[var(--text-muted)]" title={edge.to.path}>
                  {edge.to.name}
                </span>
                <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--text-muted)]">
                  ×{edge.occurrences}
                </span>
              </li>
            ))}
          </Stack>
        </Stack>
      )}

      {/* 11. ADRs referenced --------------------------------------------- */}
      {data.adrs_referenced.length > 0 && (
        <Stack gap="2">
          <SectionHeading icon={ScrollText} label="Decision records" hint={`${data.decision_records_referenced} referenced`} />
          <Stack gap="1" as="ul">
            {data.adrs_referenced.map((adr) => (
              <li key={adr.id} className="rounded-md border border-[var(--border)] p-2">
                <Cluster gap="2" align="center" className="text-xs">
                  <code className="font-mono text-[10px] font-semibold text-[var(--primary)]">{adr.id}</code>
                  <span className="font-medium">{adr.title}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                      ADR_STATUS_TONE[adr.status] ?? "bg-[var(--surface-2)] text-[var(--text-subtle)]",
                    )}
                  >
                    {adr.status}
                  </span>
                  <span className="ml-auto text-[10px] text-[var(--text-subtle)]">{adr.date}</span>
                </Cluster>
                <code className="font-mono text-[10px] text-[var(--text-subtle)]">{adr.path}</code>
              </li>
            ))}
          </Stack>
        </Stack>
      )}

      {/* 9. Configs ------------------------------------------------------ */}
      {data.configs.length > 0 && (
        <Stack gap="2">
          <SectionHeading icon={Cog} label="Configs" hint="config artifacts discovered during ingestion" />
          <Stack gap="1" as="ul">
            {data.configs.map((c) => (
              <li key={c.id} className="rounded-md border border-[var(--border)] p-2">
                <Cluster gap="2" align="center" className="text-xs">
                  <Cog className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                  <code className="font-mono text-[var(--text)]">{c.path}</code>
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    {c.format}
                  </span>
                </Cluster>
                <p className="text-xs text-[var(--text-muted)]">{c.summary}</p>
                {c.key_excerpts.length > 0 && (
                  <Cluster gap="1" align="center" className="text-[10px]">
                    {c.key_excerpts.map((k) => (
                      <code key={k} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[var(--text-subtle)]">
                        {k}
                      </code>
                    ))}
                  </Cluster>
                )}
                {c.adrs_referenced.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-subtle)]">
                    <ScrollText className="size-3" aria-hidden />
                    {c.adrs_referenced.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </Stack>
        </Stack>
      )}

      {/* 14. Recent commits ----------------------------------------------- */}
      <Stack gap="2">
        <SectionHeading icon={GitCommit} label="Recent commits" hint={`indexed ${data.last_ingested_at} · sha ${data.snapshot.indexed_sha}`} />
        <Stack gap="0" as="ul">
          {data.recent_commits.map((c, i) => (
            <li
              key={c.sha}
              className={cn(
                "grid grid-cols-[68px_60px_1fr_auto] items-start gap-2 py-1.5 text-xs",
                i > 0 && "border-t border-[var(--border)]",
              )}
            >
              <code className="font-mono text-[10px] text-[var(--text-subtle)]">{c.sha}</code>
              <span className="text-[10px] text-[var(--text-subtle)]">{c.when}</span>
              <span className="min-w-0 truncate text-[var(--text)]">{c.message}</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {c.author} · {c.files_changed} file{c.files_changed === 1 ? "" : "s"} · {c.delta_lines}L
              </span>
            </li>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}

/* ─── Cards ─────────────────────────────────────────────────────────── */

function SnapshotCard({ data }: { data: RepoKnowledge }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
      <Cluster gap="3" align="center" className="text-xs">
        <Cluster gap="1.5" align="center">
          <GitBranch className="size-3.5 text-[var(--text-muted)]" aria-hidden />
          <span className="font-mono">{data.snapshot.indexed_branch}</span>
          <code className="font-mono text-[10px] text-[var(--text-subtle)]">@{data.snapshot.indexed_sha}</code>
        </Cluster>
        <span className="text-[10px] text-[var(--text-subtle)]">full sync {data.snapshot.last_full_sync}</span>
        {data.snapshot.pending_prs.length > 0 && (
          <Cluster gap="1.5" align="center" className="ml-auto">
            <GitPullRequest className="size-3.5 text-[var(--primary)]" aria-hidden />
            <span className="text-[10px] text-[var(--text-muted)]">
              {data.snapshot.pending_prs.length} pending PR{data.snapshot.pending_prs.length === 1 ? "" : "s"} (
              {data.snapshot.pending_prs.map((p) => `#${p.pr_number}`).join(", ")})
            </span>
          </Cluster>
        )}
      </Cluster>
    </div>
  );
}

function SectionHeading({ icon: Icon, label, hint }: { icon: typeof Cog; label: string; hint?: string | undefined }) {
  return (
    <Cluster gap="2" align="center">
      <Icon className="size-3.5 text-[var(--primary)]" aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      {hint && <span className="ml-auto text-[10px] text-[var(--text-muted)]">{hint}</span>}
    </Cluster>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{value}</span>
    </Stack>
  );
}

/** Skeleton placeholder used by parent before the panel is expanded. */
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
 *   layer 1 — top modules (top 6 by symbol count, sized by importance)
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
    label: m.name.replace(/\.[^./]+$/, ""),
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
