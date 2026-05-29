"use client";

/**
 * /capabilities/[id]/repos/[repo_id] — first-class Repo surface (ADR-073).
 *
 * The hierarchy `org → capability → repo` is now navigable: this page is
 * the canonical Repo surface, replacing the inline expanded panel inside
 * the Capability page's Repos tab.
 *
 * Universal shell (ADR-073 §7): Breadcrumb + ScopeHeader + ScopeTabs +
 * TabContent. Four tabs:
 *   - **Blueprint** — 18 narrative sections (RepoBlueprintSections)
 *   - **Topology** — TopologyHeader + TierExplorer + SymbolList + CallGraphList
 *   - **Activity** — per-repo commit + sync-history timeline
 *   - **Configs** — build/test/env configs from KG (ConfigArtifact[])
 *
 * Canonical-home rule (ADR-073 §4):
 *   - Files / LOC / language / commits counts live ONLY on TopologyHeader.
 *   - Freshness pill lives ONLY in ScopeHeader.
 *   - No KPI tile strip.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  type Capability,
  type CapabilityRepo,
  type RepoKnowledge,
  type TierNode,
  type ActivityEvent,
  type ConfigArtifact,
  type DecisionRecord,
  type Org,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

import { Breadcrumb } from "@/components/scope/breadcrumb";
import { ScopeHeader } from "@/components/scope/scope-header";
import { ScopeTabs, type AnyTab } from "@/components/scope/scope-tabs";
import { TopologyHeader } from "@/components/topology/topology-header";
import { TierExplorer } from "@/components/topology/tier-explorer";
import { SymbolList } from "@/components/topology/symbol-list";
import { CallGraphList } from "@/components/topology/call-graph-list";
import { ImportsGraph } from "@/components/topology/imports-graph";
import { ActivityTab } from "@/components/activity/activity-tab";
import { DecisionsTab } from "@/components/decisions/decisions-tab";
import { RepoBlueprintSections } from "@/components/capabilities/repo-blueprint-sections";
import { SnapshotCard } from "@/components/knowledge/repo-knowledge-panel";
import { SyncStateChip } from "@/components/repo/sync-state-chip";
import { IngestTimeline } from "@/components/repo/ingest-timeline";
import { AdrsReferencedCard } from "@/components/repo/adrs-referenced-card";
import { FileBrowser } from "@/components/repo/file-browser";
import { useIngestProgress } from "@/features/repos/use-ingest-progress";
import { ingestionToFreshness } from "@/lib/freshness";
import { formatRelativeTime } from "@/lib/utils/format";
import { FileCode, Settings, Hash } from "lucide-react";

type RepoTab = "blueprint" | "topology" | "files" | "decisions" | "activity" | "configs";

const REPO_TABS: RepoTab[] = ["blueprint", "topology", "files", "decisions", "activity", "configs"];

function isRepoTab(s: string | null | undefined): s is RepoTab {
  return s != null && (REPO_TABS as string[]).includes(s);
}

export default function RepoDetail({
  params,
}: {
  params: Promise<{ id: string; repo_id: string }>;
}) {
  const { id, repo_id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeOrgId } = useSession();

  const [org, setOrg] = useState<Org | null>(null);
  const [cap, setCap] = useState<Capability | null>(null);
  const [repo, setRepo] = useState<CapabilityRepo | null>(null);
  const [knowledge, setKnowledge] = useState<RepoKnowledge | null>(null);
  const [tierTree, setTierTree] = useState<TierNode | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab");
  const tab: RepoTab = isRepoTab(tabParam) ? tabParam : "blueprint";
  const tierParam = searchParams.get("tier");

  // ADR-073 §4 canonical-home — the header chip stays at-a-glance, the
  // rich `<IngestTimeline>` lives on the Topology tab where the
  // repo-internal data already concentrates. Polling auto-stops when
  // the stage reaches a terminal value.
  const { data: ingestProgress } = useIngestProgress(repo?.repo_id ?? null);

  useEffect(() => {
    (async () => {
      try {
        const [c, r, k, t, a, o] = await Promise.all([
          api.capabilities.get(id),
          api.capabilities.listRepos(id).then((repos) => repos.find((x) => (x.repo_id ?? x.id) === repo_id) ?? null),
          api.capabilities.repoKnowledge(id, repo_id),
          api.capabilities.repoTierTree(id, repo_id).catch(() => null),
          api.capabilities.repoActivity(id, repo_id, { limit: 200 }).catch(() => [] as ActivityEvent[]),
          activeOrgId ? api.orgs.get(activeOrgId).catch(() => null) : Promise.resolve(null),
        ]);
        setCap(c);
        setRepo(r);
        setKnowledge(k);
        setTierTree(t);
        setActivity(a);
        setOrg(o);
        // §5.29.10 row 1c — load repo decisions in a separate await so
        // a missing repo_id (legacy attachment) doesn't break the page.
        if (r?.repo_id) {
          const d = await api.repos.decisionList
            .list(r.repo_id)
            .catch(() => [] as DecisionRecord[]);
          setDecisions(d);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load repo");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, repo_id, activeOrgId]);

  const onTabChange = useCallback(
    (nextTab: AnyTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", nextTab);
      router.push(`/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repo_id)}?${sp.toString()}`);
    },
    [router, searchParams, id, repo_id],
  );

  const onTierNavigate = useCallback(
    (nextPath: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (nextPath) sp.set("tier", nextPath);
      else sp.delete("tier");
      sp.set("tab", "topology");
      router.push(`/capabilities/${encodeURIComponent(id)}/repos/${encodeURIComponent(repo_id)}?${sp.toString()}`);
    },
    [router, searchParams, id, repo_id],
  );

  const breadcrumbItems = useMemo(() => {
    if (!org || !cap || !repo) return [];
    return [
      { label: org.display_name ?? org.name, href: "/knowledge" },
      { label: cap.name, href: `/capabilities/${encodeURIComponent(cap.id)}?tab=repos` },
      { label: repo.repo_full_name, href: `/capabilities/${encodeURIComponent(cap.id)}/repos/${encodeURIComponent(repo.repo_id ?? repo.id)}` },
    ];
  }, [org, cap, repo]);

  if (loading) {
    return (
      <Stack gap="4">
        <div className="h-4 w-64 animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="h-12 w-96 animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="h-8 w-full animate-pulse rounded bg-[var(--surface-2)]" />
        <div className="h-64 w-full animate-pulse rounded bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  if (error || !cap || !repo) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger)]">{error ?? "Repo not found."}</p>
      </Card>
    );
  }

  return (
    <Stack gap="4" className="min-h-full">
      <Breadcrumb items={breadcrumbItems} />
      <ScopeHeader
        scope="repo"
        name={repo.repo_full_name}
        slug={repo.default_branch ?? "main"}
        description={
          knowledge
            ? `${knowledge.primary_language} · ${knowledge.files_indexed.toLocaleString()} files · ${knowledge.loc.toLocaleString()} LOC`
            : "Repository attached to this capability."
        }
        chips={[
          { label: "lang", value: knowledge?.primary_language ?? "—" },
          { label: "cap",  value: cap.name },
        ]}
        freshness={ingestionToFreshness(knowledge?.ingestion_status)}
        {...(knowledge?.last_ingested_at ? { freshnessTitle: `Last ingested ${knowledge.last_ingested_at}` } : {})}
        actions={<SyncStateChip repo={repo} />}
      />
      <ScopeTabs scope="repo" activeTab={tab} onChange={onTabChange} />

      <div className="min-h-0">
        {tab === "blueprint" && <RepoBlueprintSections repoId={repo.repo_id ?? repo.id} />}

        {tab === "topology" && knowledge && (
          <TopologyTab
            knowledge={knowledge}
            tierTree={tierTree}
            tierParam={tierParam}
            onTierNavigate={onTierNavigate}
            ingestProgress={ingestProgress}
          />
        )}

        {tab === "files" && repo?.repo_id && (
          <FileBrowser repoId={repo.repo_id} />
        )}
        {tab === "files" && !repo?.repo_id && (
          <Card>
            <p className="text-sm text-[var(--text-muted)]">
              This repo attachment hasn&apos;t been linked to an
              underlying repo yet (legacy expand-migrate state). Run a
              sync to back-fill the link, then revisit this tab.
            </p>
          </Card>
        )}

        {tab === "decisions" && repo?.repo_id && (
          <DecisionsTab
            scope="repo"
            scopeId={repo.repo_id}
            decisions={decisions}
            onRefresh={async () => {
              if (!repo.repo_id) return;
              const next = await api.repos.decisionList.list(repo.repo_id).catch(() => [] as DecisionRecord[]);
              setDecisions(next);
            }}
          />
        )}
        {tab === "decisions" && !repo?.repo_id && (
          <Card>
            <p className="text-sm text-[var(--text-muted)]">
              This repo attachment hasn&apos;t been linked to an
              underlying repo yet (legacy expand-migrate state). Run a
              sync to back-fill the link, then revisit this tab.
            </p>
          </Card>
        )}

        {tab === "activity" && (
          <ActivityTab scope="repo" events={activity} />
        )}

        {tab === "configs" && knowledge && (
          <ConfigsTab configs={knowledge.configs} />
        )}
      </div>
    </Stack>
  );
}

/* ----------------------------- Topology tab --------------------------- */

function TopologyTab({
  knowledge,
  tierTree,
  tierParam,
  onTierNavigate,
  ingestProgress,
}: {
  knowledge: RepoKnowledge;
  tierTree: TierNode | null;
  tierParam: string | null;
  onTierNavigate: (path: string) => void;
  ingestProgress: ReturnType<typeof useIngestProgress>["data"];
}) {
  return (
    <Stack gap="4">
      <TopologyHeader
        lastSync={knowledge.last_ingested_at ? formatRelativeTime(knowledge.last_ingested_at) : undefined}
        metrics={[
          { label: "files",    value: knowledge.files_indexed },
          { label: "LOC",      value: knowledge.loc },
          { label: "lang",     value: knowledge.primary_language },
          { label: "exports",  value: knowledge.exports },
          { label: "symbols",  value: knowledge.top_symbols.length, title: "Top-N — full graph in tier explorer" },
          { label: "edges",    value: knowledge.call_edges.length },
        ]}
      />
      {/* §3.13 row 1 — canonical home for the rich ingest disclosure
          (ADR-073 §4). The header chip stays compact for at-a-glance;
          the per-stage chronology + heartbeats render here. */}
      <IngestTimeline progress={ingestProgress} />
      <SnapshotCard knowledge={knowledge} />
      <ImportsGraphCard knowledge={knowledge} />
      {tierTree ? (
        <TierExplorer root={tierTree} tierPath={tierParam} onNavigate={onTierNavigate} />
      ) : (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">
            Tier tree not yet computed for this repo. Trigger a sync to populate.
          </p>
        </Card>
      )}
      <SymbolList symbols={knowledge.top_symbols} title="Top symbols (repo-wide)" />
      <CallGraphList edges={knowledge.call_edges} title="Call graph (repo-wide)" />
      <AdrsReferencedCard adrs={knowledge.adrs_referenced} />
    </Stack>
  );
}

/* Imports graph — accordion: open when ≤100 edges, closed when >100, so the
 * default-collapsed state keeps the page fast on big repos while still
 * surfacing the new viz inline next to the existing CallGraphList. */
function ImportsGraphCard({ knowledge }: { knowledge: RepoKnowledge }) {
  const importEdgeCount = useMemo(
    () => knowledge.call_edges.filter((e) => e.kind === "imports").length,
    [knowledge.call_edges],
  );
  const [open, setOpen] = useState(importEdgeCount > 0 && importEdgeCount <= 100);
  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        data-testid="imports-graph-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold hover:bg-[var(--surface-2)]"
      >
        <span>Imports graph</span>
        <span className="text-xs font-normal text-[var(--text-muted)]">
          {importEdgeCount} edges · {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-3">
          <ImportsGraph topSymbols={knowledge.top_symbols} edges={knowledge.call_edges} />
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ Configs tab --------------------------- */

function ConfigsTab({ configs }: { configs: readonly ConfigArtifact[] }) {
  if (configs.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">
          No configs discovered during ingestion. Add a stack section to the Blueprint if this surprises you.
        </p>
      </Card>
    );
  }
  return (
    <Stack gap="3">
      <Cluster gap="2" align="center">
        <Settings className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Configs discovered during ingestion</span>
        <span className="text-xs text-[var(--text-muted)]">{configs.length} files</span>
      </Cluster>
      <ul className="flex flex-col gap-2">
        {configs.map((c) => (
          <li key={c.path}>
            <Card className="!p-3">
              <Stack gap="1">
                <Cluster gap="2" align="center">
                  <FileCode className="size-3.5 text-[var(--primary)]" aria-hidden />
                  <code className="font-mono text-xs font-semibold">{c.path}</code>
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    {c.format}
                  </span>
                </Cluster>
                {c.summary && (
                  <p className="text-xs leading-relaxed text-[var(--text-muted)]">{c.summary}</p>
                )}
                {c.key_excerpts.length > 0 && (
                  <ul className="flex flex-col gap-1 text-[10px]">
                    {c.key_excerpts.map((ex) => (
                      <li key={ex} className="rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-[var(--text)]">
                        <Hash className="inline size-2.5 mr-1" aria-hidden />
                        {ex}
                      </li>
                    ))}
                  </ul>
                )}
                {c.adrs_referenced.length > 0 && (
                  <Cluster gap="1" align="center" className="text-[10px] text-[var(--text-subtle)]">
                    <span className="uppercase tracking-wider">refs</span>
                    {c.adrs_referenced.map((a) => (
                      <code key={a} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono">{a}</code>
                    ))}
                  </Cluster>
                )}
              </Stack>
            </Card>
          </li>
        ))}
      </ul>
    </Stack>
  );
}
