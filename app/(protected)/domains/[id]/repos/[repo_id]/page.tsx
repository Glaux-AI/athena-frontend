"use client";

/**
 * /domains/[id]/repos/[repo_id] - first-class Repo surface (ADR-073).
 *
 * The hierarchy `org → domain → repo` is now navigable: this page is
 * the canonical Repo surface, replacing the inline expanded panel inside
 * the Domain page's Repos tab.
 *
 * Universal shell (ADR-073 §7): Breadcrumb + ScopeHeader + ScopeTabs +
 * TabContent. Four tabs:
 *   - **Blueprint** - 18 narrative sections (RepoBlueprintSections)
 *   - **Topology** - TopologyHeader + SnapshotCard + the unified
 *     <TopologyExplorer> (search + graph + structure tree + node detail) +
 *     collapsible call table
 *   - **Activity** - per-repo commit + sync-history timeline
 *   - **Configs** - build/test/env configs from KG (ConfigArtifact[])
 *
 * Canonical-home rule (ADR-073 §4):
 *   - Files / LOC / language / commits counts live ONLY on TopologyHeader.
 *   - Freshness pill lives ONLY in ScopeHeader.
 *   - No KPI tile strip.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import {
  api,
  ApiError,
  type Domain,
  type DomainRepo,
  type RepoKnowledge,
  type RepoSyncStatus,
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
import { CallGraphList } from "@/components/topology/call-graph-list";
import { TopologyExplorer } from "@/components/topology/explorer/topology-explorer";
import { seedRepo } from "@/components/topology/explorer/scope-seed";
import { ActivityTab } from "@/components/activity/activity-tab";
import { DecisionsTab } from "@/components/decisions/decisions-tab";
import { RepoBlueprintSections } from "@/components/domains/repo-blueprint-sections";
import { SnapshotCard } from "@/components/knowledge/repo-knowledge-panel";
import {
  SyncStatusPanel,
  signalsFromKnowledge,
  deriveFreshness,
  deriveSyncState,
} from "@/components/repo/sync-status";
import { useSyncMascot } from "@/features/mascot/use-mascot-activity";
import { RepoDashboardHeader } from "@/components/repo/repo-dashboard-header";
import { PullRequestsTab } from "@/components/repo/pull-requests-tab";
import { AdrsReferencedCard } from "@/components/repo/adrs-referenced-card";
import { FileBrowser } from "@/components/repo/file-browser";
import { BranchesTab } from "@/components/repo/branches-tab";
import { SandboxPanel } from "@/components/repo/sandbox-panel";
import { useIngestProgress } from "@/features/repos/use-ingest-progress";
import { formatRelativeTime } from "@/lib/utils/format";
import { FileCode, Settings, Hash } from "lucide-react";

type RepoTab = "blueprint" | "topology" | "branches" | "files" | "pull_requests" | "decisions" | "activity" | "configs" | "sandbox";

const REPO_TABS: RepoTab[] = ["blueprint", "topology", "branches", "files", "pull_requests", "decisions", "activity", "configs", "sandbox"];

// Live ingest stages that mean the worker has settled. When the ambient
// ingest-progress poll reports one of these while the page's snapshotted
// `knowledge.current_sync_stage` still reads in-flight, we reconcile (see the
// effect in RepoDetail) so the chip / header / Stop button flip off "Indexing…".
const TERMINAL_INGEST_STAGES: ReadonlySet<string> = new Set([
  "completed",
  "degraded",
  "failed",
  "cancelled",
]);

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
  const [cap, setCap] = useState<Domain | null>(null);
  const [repo, setRepo] = useState<DomainRepo | null>(null);
  const [knowledge, setKnowledge] = useState<RepoKnowledge | null>(null);
  const [syncStatus, setSyncStatus] = useState<RepoSyncStatus | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skippingAll, setSkippingAll] = useState(false);
  const [retryingPaused, setRetryingPaused] = useState(false);

  const tabParam = searchParams.get("tab");
  const tab: RepoTab = isRepoTab(tabParam) ? tabParam : "blueprint";

  // Polling auto-stops when the ingest stage reaches a terminal value.
  const { data: ingestProgress, refetch: refetchIngest } = useIngestProgress(repo?.repo_id ?? null);

  useEffect(() => {
    (async () => {
      try {
        const [c, r, k, a, o] = await Promise.all([
          api.domains.get(id),
          api.domains.listRepos(id).then((repos) => repos.find((x) => (x.repo_id ?? x.id) === repo_id) ?? null),
          api.domains.repoKnowledge(id, repo_id),
          api.domains.repoActivity(id, repo_id, { limit: 200 }).catch(() => [] as ActivityEvent[]),
          activeOrgId ? api.orgs.get(activeOrgId).catch(() => null) : Promise.resolve(null),
        ]);
        setCap(c);
        setRepo(r);
        setKnowledge(k);
        setActivity(a);
        setOrg(o);
        // §5.29.10 row 1c - load repo decisions in a separate await so
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

  // Phase D contract #3 - live staleness gate. Hits the LIVE GitHub HEAD
  // check on load; the SyncStatus panel shows the Sync action ONLY when
  // `is_stale` (or the live check couldn't run). Soft-fails so a flaky
  // GitHub call never blocks the page.
  useEffect(() => {
    let cancelled = false;
    api.domains
      .repoSyncStatus(id, repo_id)
      .then((s) => { if (!cancelled) setSyncStatus(s); })
      .catch(() => { if (!cancelled) setSyncStatus(null); });
    return () => { cancelled = true; };
  }, [id, repo_id]);

  // Re-pull the live signals after a sync settles so the chip flips.
  const refreshSync = useCallback(async () => {
    const [k, s] = await Promise.all([
      api.domains.repoKnowledge(id, repo_id).catch(() => null),
      api.domains.repoSyncStatus(id, repo_id).catch(() => null),
    ]);
    if (k) setKnowledge(k);
    if (s) setSyncStatus(s);
    void refetchIngest();
  }, [id, repo_id, refetchIngest]);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await api.domains.syncRepoKnowledge(id, repo_id);
      toast.success("Sync queued. Knowledge will refresh shortly.");
      // Poll a few times so the timeline + chip reflect progress.
      const tick = setInterval(() => { void refreshSync(); }, 3000);
      setTimeout(() => { clearInterval(tick); setSyncing(false); void refreshSync(); }, 30_000);
    } catch (e) {
      setSyncing(false);
      toast.error(e instanceof ApiError ? e.message : "Sync failed.");
    }
  }, [id, repo_id, syncing, refreshSync]);

  // Stop ingestion - the in-flight counterpart to Sync. Optimistically flips
  // the button to "Cancelling…", calls the cancel endpoint (which already
  // stamps current_sync_stage='cancelled' for instant feedback), then refetches
  // the live signals so the chip flips. `cancelled:false` is a no-op (nothing
  // was running) → just refetch. 403 / errors surface as a toast like Sync.
  const handleStop = useCallback(async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await api.domains.repoCancelSync(id, repo_id);
      // Worker stops a beat later; poll a couple of times so the timeline +
      // chip settle on the terminal `cancelled` state. The endpoint already
      // set the stage, so the first refetch usually suffices.
      await refreshSync();
      const tick = setInterval(() => { void refreshSync(); }, 2000);
      setTimeout(() => {
        clearInterval(tick);
        setCancelling(false);
        void refreshSync();
      }, 6000);
    } catch (e) {
      setCancelling(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't stop ingestion.");
    }
  }, [id, repo_id, cancelling, refreshSync]);

  const handleRetryEnrichments = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      const result = await api.domains.retryRepoEnrichments(id, repo_id);
      if (result.succeeded > 0 && result.still_failed === 0) {
        toast.success(`Retry succeeded - ${result.succeeded} enrichment${result.succeeded === 1 ? "" : "s"} backfilled.`);
      } else if (result.succeeded > 0) {
        toast.success(`Backfilled ${result.succeeded} of ${result.retried}. ${result.still_failed} still failing.`);
      } else {
        toast.error("Retry didn't backfill anything. Check LiteLLM config.");
      }
      await refreshSync();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }, [id, repo_id, retrying, refreshSync]);

  // Resume a PAUSED ingest by skipping the failed file (item 1). The endpoint
  // appends it to the skip-set + re-enqueues; poll so the timeline flips off
  // `paused` back into the in-flight stages. Cancel instead via handleStop.
  const handleSkipFile = useCallback(async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      const result = await api.domains.repoSkipPausedFile(id, repo_id);
      if (result.resumed) {
        toast.success("Skipping that file - ingestion resumed.");
      } else {
        toast.info("Nothing to skip - the sync isn't paused.");
      }
      await refreshSync();
      const tick = setInterval(() => { void refreshSync(); }, 3000);
      setTimeout(() => { clearInterval(tick); setSkipping(false); void refreshSync(); }, 12_000);
    } catch (e) {
      setSkipping(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't skip the file.");
    }
  }, [id, repo_id, skipping, refreshSync]);

  // "Skip all failing files" - resume and auto-resolve EVERY subsequent failing
  // file raw (no more pauses) for the rest of this run. Same action-driven shape
  // as handleSkipFile; the worker absorbs the work, the poll loop reflects it.
  const handleSkipAll = useCallback(async () => {
    if (skippingAll) return;
    setSkippingAll(true);
    try {
      const result = await api.domains.repoSkipPausedFile(id, repo_id, { all: true });
      if (result.resumed) {
        toast.success("Skipping all failing files - ingestion resumed.");
      } else {
        toast.info("Nothing to skip - the sync isn't paused.");
      }
      await refreshSync();
      const tick = setInterval(() => { void refreshSync(); }, 3000);
      setTimeout(() => { clearInterval(tick); setSkippingAll(false); void refreshSync(); }, 12_000);
    } catch (e) {
      setSkippingAll(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't skip the failing files.");
    }
  }, [id, repo_id, skippingAll, refreshSync]);

  // "Retry" - re-attempt the paused file's LLM call (e.g. after a rate limit or
  // quota resets); the file is NOT skipped. If it fails again it re-pauses.
  const handleRetryPaused = useCallback(async () => {
    if (retryingPaused) return;
    setRetryingPaused(true);
    try {
      const result = await api.domains.repoRetryPausedFile(id, repo_id);
      if (result.resumed) {
        toast.success("Retrying that file - ingestion resumed.");
      } else {
        toast.info("Nothing to retry - the sync isn't paused.");
      }
      await refreshSync();
      const tick = setInterval(() => { void refreshSync(); }, 3000);
      setTimeout(() => { clearInterval(tick); setRetryingPaused(false); void refreshSync(); }, 12_000);
    } catch (e) {
      setRetryingPaused(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't retry the file.");
    }
  }, [id, repo_id, retryingPaused, refreshSync]);

  const syncSignals = useMemo(() => signalsFromKnowledge(knowledge, syncStatus), [knowledge, syncStatus]);
  const freshness = useMemo(() => deriveFreshness(syncSignals, syncing), [syncSignals, syncing]);
  // Drive the TopBar Sophia owl from the live ingest state - working while the
  // repo indexes, focused when it needs attention, idle once fresh.
  const syncState = useMemo(() => deriveSyncState(syncSignals, syncing), [syncSignals, syncing]);
  useSyncMascot(syncState);

  // Reconcile the chip/header with a sync that settles WHILE this page is open.
  // The timeline polls `ingest-progress` (and stops once terminal), but the chip
  // / freshness pill / Stop button read `knowledge.current_sync_stage`, which is
  // snapshotted at mount and never re-read. So when the worker finishes (or
  // fails) with the window open, those would stay stuck on "Indexing…" even
  // though the timeline shows Completed. When the live poll first reports a
  // terminal stage while the snapshot still reads in-flight, re-pull knowledge +
  // sync status once so the chip flips AND the snapshot/blueprint pick up the
  // freshly-ingested knowledge. The ref latches per settle (re-armed when a new
  // run goes back in-flight) so we never loop on refetch.
  const liveIngestStage = ingestProgress?.current?.stage ?? null;
  const reconciledTerminalRef = useRef(false);
  useEffect(() => {
    if (liveIngestStage == null || !TERMINAL_INGEST_STAGES.has(liveIngestStage)) {
      reconciledTerminalRef.current = false;
      return;
    }
    if (reconciledTerminalRef.current) return;
    // A page opened AFTER completion already reads the terminal stage - only
    // reconcile when the snapshot still disagrees (chip thinks it's running).
    if (syncState !== "in_flight") return;
    reconciledTerminalRef.current = true;
    void refreshSync();
  }, [liveIngestStage, syncState, refreshSync]);

  const onTabChange = useCallback(
    (nextTab: AnyTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", nextTab);
      router.push(`/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repo_id)}?${sp.toString()}`);
    },
    [router, searchParams, id, repo_id],
  );

  const breadcrumbItems = useMemo(() => {
    if (!org || !cap || !repo) return [];
    return [
      { label: org.display_name ?? org.name, href: "/knowledge" },
      { label: cap.name, href: `/domains/${encodeURIComponent(cap.id)}?tab=repos` },
      { label: repo.repo_full_name, href: `/domains/${encodeURIComponent(cap.id)}/repos/${encodeURIComponent(repo.repo_id ?? repo.id)}` },
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
        <p className="text-sm text-[var(--danger-ink)]">{error ?? "Repo not found."}</p>
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
        chips={[
          { label: "lang", value: knowledge?.primary_language ?? "-" },
          { label: "cap",  value: cap.name },
        ]}
        freshness={freshness.state}
        {...(freshness.detail ? { freshnessDetail: freshness.detail } : {})}
        {...(knowledge?.last_ingested_at ? { freshnessTitle: `Last ingested ${knowledge.last_ingested_at}` } : {})}
      />
      <ScopeTabs scope="repo" activeTab={tab} onChange={onTabChange} badges={{ pull_requests: undefined }} />

      <div className="min-h-0">
        {tab === "blueprint" && (
          <Stack gap="4">
            {/* Computed dashboard header band: summary + unified sync status
                (Phase D locked IA). The architecture diagram + hubs render in
                the `architecture` Blueprint section below (no duplication). */}
            <RepoDashboardHeader
              knowledge={knowledge}
              syncSlot={
                <SyncStatusPanel
                  signals={syncSignals}
                  progress={ingestProgress}
                  syncing={syncing}
                  onSync={handleSync}
                  onStop={handleStop}
                  cancelling={cancelling}
                  onRetryEnrichments={handleRetryEnrichments}
                  retrying={retrying}
                  onSkipFile={handleSkipFile}
                  skipping={skipping}
                  onSkipAll={handleSkipAll}
                  skippingAll={skippingAll}
                  onRetryPaused={handleRetryPaused}
                  retryingPaused={retryingPaused}
                />
              }
            />
            <RepoBlueprintSections repoId={repo.repo_id ?? repo.id} />
          </Stack>
        )}

        {tab === "topology" && knowledge && (
          <TopologyTab
            repoId={repo.repo_id ?? repo.id}
            domainId={id}
            knowledge={knowledge}
          />
        )}

        {tab === "branches" && (
          <BranchesTab domainId={id} repoId={repo.repo_id ?? repo.id} />
        )}

        {tab === "files" && repo?.repo_id && (
          <FileBrowser repoId={repo.repo_id} />
        )}

        {tab === "pull_requests" && (
          <PullRequestsTab domainId={id} repoId={repo.repo_id ?? repo.id} />
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
        {tab === "sandbox" && repo?.repo_id && (
          <SandboxPanel repoId={repo.repo_id} />
        )}
      </div>
    </Stack>
  );
}

/* ----------------------------- Topology tab --------------------------- */

function TopologyTab({
  repoId,
  domainId,
  knowledge,
}: {
  repoId: string;
  domainId: string;
  knowledge: RepoKnowledge;
}) {
  // One unified, search-driven explorer replaces the former
  // graph + inline blueprint + path-faked tier tree. The metric strip +
  // snapshot stay as siblings above; the call table + ADRs below.
  const seed = useMemo(() => seedRepo(knowledge), [knowledge]);

  return (
    <Stack gap="4">
      <TopologyHeader
        lastSync={knowledge.last_ingested_at ? formatRelativeTime(knowledge.last_ingested_at) : undefined}
        metrics={[
          { label: "files",    value: knowledge.files_indexed },
          { label: "LOC",      value: knowledge.loc },
          { label: "lang",     value: knowledge.primary_language },
          { label: "exports",  value: knowledge.exports },
          { label: "edges",    value: knowledge.call_edges.length },
        ]}
      />
      {/* Ingest progress now lives in the unified SyncStatus panel on the
          Blueprint dashboard header (Phase D - one sync surface). */}
      <SnapshotCard knowledge={knowledge} />
      <TopologyExplorer seed={seed} scope="repo" repoId={repoId} domainId={domainId} />
      <CallGraphCard edges={knowledge.call_edges} />
      <AdrsReferencedCard adrs={knowledge.adrs_referenced} />
    </Stack>
  );
}

/* Call graph (dense edge table) - collapsed by default. The file graph above
 * is now the primary spatial view of the same edges; this keeps the scannable
 * table available without cluttering the default Topology view. */
function CallGraphCard({ edges }: { edges: RepoKnowledge["call_edges"] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        data-testid="call-graph-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold transition-colors duration-150",
          open
            ? "bg-gradient-to-b from-[var(--surface-2)] to-transparent shadow-[var(--inner-highlight)]"
            : "hover:bg-[var(--surface-2)]",
        )}
      >
        <span>Call graph - table view</span>
        <span className="text-xs font-normal text-[var(--text-muted)]">
          {edges.length} edges · {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-3">
          <CallGraphList edges={edges} title="Call graph (repo-wide)" />
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ Configs tab --------------------------- */

function ConfigsTab({ configs }: { configs: readonly ConfigArtifact[] }) {
  if (configs.length === 0) {
    return (
      <EmptyState
        icon={<Settings className="size-6" aria-hidden />}
        title="No configs discovered during ingestion"
        description="Add a stack section to the Blueprint if this surprises you."
      />
    );
  }
  return (
    <Stack gap="3">
      <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2">
        <Settings className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Configs discovered during ingestion</span>
        <span className="text-xs text-[var(--text-muted)]">{configs.length} files</span>
      </Cluster>
      <ul className="flex flex-col gap-2">
        {configs.map((c) => (
          <li key={c.path}>
            <Card className="!p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
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
