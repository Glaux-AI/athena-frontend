"use client";

/**
 * /domains/{id} - domain detail with faceted tabs (ADR-073).
 *
 * Universal shell (ADR-073 §7): Breadcrumb + ScopeHeader + ScopeTabs +
 * TabContent. Tabs:
 *   - **Blueprint** - 16 narrative sections (BlueprintToc + viewer)
 *   - **Topology**  - TopologyHeader + <TopologyExplorer> + OverlayTermsList +
 *                     attached-repos mini-list with links to new repo route
 *   - **Decisions** - domain-scoped decision records (virtualized)
 *   - **Repos**     - attached repos list; each row LINKS to the new
 *                     /domains/[id]/repos/[repo_id] route (no inline
 *                     expand - that page is now first-class)
 *   - **Sources**   - DomainResource[] with index status
 *   - **Notes**     - DomainNote[] promoted from chat
 *   - **Tasks**     - runs filtered to this domain
 *   - **Config**    - model per phase + skills + review policy + context repos
 *
 * Canonical-home rule (ADR-073 §4):
 *   - No KPI strip at top - counts live on Topology header only.
 *   - No KG cards on Blueprint - they live on Topology only.
 *   - Freshness pill lives ONLY in ScopeHeader.
 */

import { useCallback, useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, GitBranch, Plus, BookOpen, FileText, StickyNote, ShieldCheck, Cpu,
  ExternalLink, CheckCircle2, AlertTriangle, ChevronRight, RefreshCw, Trash2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import {
  api, ApiError,
  type Domain, type DomainRepo, type DomainResource, type DomainConfig, type DomainNote,
  type DomainKnowledge,
  type Member,
  type DomainMember,
  type DecisionRecord,
  type Org,
  type Task, type TaskCancelReason, type KanbanColumn,
  type BlueprintSection, type BlueprintSectionProposal, type BlueprintToc,
} from "@/lib/api/client";
import { KanbanBoard } from "@/components/board/kanban-board";
import { type TaskCardActions } from "@/components/board/task-card";
import { useSession } from "@/lib/session/SessionProvider";

import { Breadcrumb } from "@/components/scope/breadcrumb";
import { ScopeHeader } from "@/components/scope/scope-header";
import { ScopeTabs, type AnyTab } from "@/components/scope/scope-tabs";
import { TopologyHeader } from "@/components/topology/topology-header";
import { TopologyExplorer } from "@/components/topology/explorer/topology-explorer";
import { seedDomain } from "@/components/topology/explorer/scope-seed";
import { OverlayTermsList } from "@/components/topology/overlay-terms-list";
import { DecisionsTab } from "@/components/decisions/decisions-tab";
import { BlueprintToc as BlueprintTocSidebar } from "@/components/blueprint/blueprint-toc";
import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import { pollBlueprintReady } from "@/lib/poll-blueprint-ready";
import { BlueprintSectionEditor } from "@/components/blueprint/blueprint-section-editor";
import { BlueprintSectionRevisions } from "@/components/blueprint/blueprint-section-revisions";
import { BlueprintProposalQueue } from "@/components/blueprint/blueprint-proposal-queue";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { AttachRepoDialog } from "@/components/domains/attach-repo-dialog";
import { UploadResourceDialog } from "@/components/domains/upload-resource-dialog";
import { DomainMembersTab } from "@/components/domains/members-tab";
import { DomainDangerZoneTab } from "@/components/domains/danger-zone-tab";
import { DomainDashboardHeader } from "@/components/domains/domain-dashboard-header";
import { DomainSkillsCard } from "@/components/domains/domain-skills-card";
import { SyncStatusChip, signalsFromRepo } from "@/components/repo/sync-status";
import { ingestionToFreshness } from "@/lib/freshness";
import { formatDateTime } from "@/lib/utils/format";

type DomainTab = "blueprint" | "topology" | "decisions" | "repos" | "sources" | "notes" | "tasks" | "members" | "config" | "danger";

const DOMAIN_TABS: DomainTab[] = ["blueprint", "topology", "decisions", "repos", "sources", "notes", "tasks", "members", "config", "danger"];

function isDomainTab(s: string | null | undefined): s is DomainTab {
  return s != null && (DOMAIN_TABS as string[]).includes(s);
}

/* Blueprint category order - drives the section rendering inside the
 * Blueprint tab. Per ADR-073 §2 the labels are Identity / Rules /
 * Architecture / Operations / History. */
const CATEGORY_ORDER = ["Identity", "Rules", "Architecture", "Operations", "History"] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_FOR_SECTION: Record<string, Category> = {
  overview: "Identity", domain_glossary: "Identity", glossary: "Identity",
  standards: "Identity", mission: "Identity", maturity: "Identity",
  external_references: "Identity", ownership: "Identity",
  guardrails: "Rules", conventions: "Rules", security_policies: "Rules",
  principles: "Rules", open_questions: "Rules",
  services: "Architecture", stack: "Architecture", api_surface: "Architecture",
  data_models: "Architecture", entry_points: "Architecture", hot_files: "Architecture",
  build_and_run: "Architecture", deployment_surface: "Architecture",
  external_deps: "Architecture", local_idioms: "Architecture",
  cross_repo_workflows: "Architecture", decisions: "Architecture",
  runbook: "Operations", observability: "Operations", secrets_handling: "Operations",
  environments: "Operations", compliance: "Operations", tests_and_ci: "Operations",
  success_metrics: "Operations", risks: "Operations",
  recent_activity: "History", incident_history: "History", change_log: "History",
};

export default function DomainDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeOrgId, me } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cap, setCap] = useState<Domain | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [repos, setRepos] = useState<DomainRepo[]>([]);
  const [board, setBoard] = useState<KanbanColumn[]>([]);
  const [resources, setResources] = useState<DomainResource[]>([]);
  const [config, setConfig] = useState<DomainConfig | null>(null);
  const [notes, setNotes] = useState<DomainNote[]>([]);
  const [knowledge, setKnowledge] = useState<DomainKnowledge | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [capMembers, setCapMembers] = useState<DomainMember[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab");
  const tab: DomainTab = isDomainTab(tabParam) ? tabParam : "blueprint";

  useEffect(() => {
    (async () => {
      try {
        // §5.31 - pass `includeDeleted` so the trash view + the Danger
        // zone tab can render the deleted banner. Live caps are
        // unaffected (BE ignores the flag when deleted_at IS NULL).
        const [c, r, rs, res, cfg, nts, kg, mem, capMem, dec, o] = await Promise.all([
          api.domains.get(id, { includeDeleted: true }),
          api.domains.listRepos(id),
          api.tasks.board({ domain_id: id }).catch(() => [] as KanbanColumn[]),
          api.domains.listResources(id).catch(() => [] as DomainResource[]),
          api.domains.config(id).catch(() => null),
          api.domains.notes(id).catch(() => [] as DomainNote[]),
          api.domains.knowledge(id).catch(() => null),
          activeOrgId ? api.members.list(activeOrgId).catch(() => [] as Member[]) : Promise.resolve([] as Member[]),
          api.domains.members.list(id).catch(() => [] as DomainMember[]),
          api.domains.decisions(id).catch(() => [] as DecisionRecord[]),
          activeOrgId ? api.orgs.get(activeOrgId).catch(() => null) : Promise.resolve(null),
        ]);
        setCap(c);
        setRepos(r);
        setBoard(rs);
        setResources(res);
        setConfig(cfg);
        setNotes(nts);
        setKnowledge(kg);
        setMembers(mem);
        setCapMembers(capMem);
        setDecisions(dec);
        setOrg(o);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load domain");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, activeOrgId]);

  const onTabChange = useCallback(
    (next: AnyTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", next);
      router.push(`/domains/${encodeURIComponent(id)}?${sp.toString()}`);
    },
    [router, searchParams, id],
  );

  /* Re-fetch the two slices that move when an ingest job runs: the repo
   * list (for `last_indexed_sha` advancing) and the knowledge bundle
   * (for the freshness pill in ScopeHeader). Used by `ReposTab` while
   * polling a Sync-now click - keeps the rest of the tab data stable. */
  const refreshAfterSync = useCallback(async () => {
    const [r, kg] = await Promise.all([
      api.domains.listRepos(id).catch(() => null),
      api.domains.knowledge(id).catch(() => null),
    ]);
    if (r !== null) setRepos(r);
    if (kg !== null) setKnowledge(kg);
  }, [id]);

  /* Re-fetch the Sources-tab resource list after an upload / delete so the
   * list + tab badge update without a full page reload. */
  const refreshResources = useCallback(async () => {
    const next = await api.domains.listResources(id).catch(() => null);
    if (next !== null) setResources(next);
  }, [id]);

  /* Re-fetch the domain-scoped task board after a board mutation (mark done /
   * archive) from the Tasks tab - keeps the columns + the tab badge in sync. */
  const reloadBoard = useCallback(async () => {
    const next = await api.tasks.board({ domain_id: id }).catch(() => null);
    if (next) setBoard(next);
  }, [id]);

  const breadcrumbItems = useMemo(() => {
    if (!org || !cap) return [];
    return [
      { label: org.display_name ?? org.name, href: "/knowledge" },
      { label: cap.name, href: `/domains/${encodeURIComponent(cap.id)}` },
    ];
  }, [org, cap]);

  const owner = members.find((m) => m.user_id === cap?.created_by_user_id);
  const ownerLabel = owner?.display_name ?? cap?.created_by_user_id?.replace(/^u_/, "") ?? "-";

  /* §5.30 row 5 - per-cap permission gating, fine-grained. The detail
   * GET returns the CALLER's effective domain permissions
   * (`caller_permissions`: admins get all; custom rows their subset;
   * viewers `[]`), so each surface gates on its own permission.
   * Older BEs (and mock) omit the field - fall back to the legacy
   * org-admin / cap-admin derivation. Defense-in-depth on top of the
   * BE per-domain permission check. */
  const callerPerms = cap?.caller_permissions ?? null;
  const orgRole = me?.memberships.find((mm) => mm.orgId === activeOrgId)?.role ?? "";
  const isOrgAdmin = orgRole === "owner" || orgRole === "admin";
  const myCapRole = me ? capMembers.find((mm) => mm.user_id === me.id)?.role ?? null : null;
  const legacyCapAdmin = isOrgAdmin || myCapRole === "admin";
  const canCap = (perm: string): boolean =>
    callerPerms != null ? callerPerms.includes(perm) : legacyCapAdmin;

  // Re-fetch just the domain config (used after a skill attach/detach on the
  // Config tab, so the attached-skills list reflects the change).
  const refreshConfig = useCallback(() => {
    api.domains.config(id).then(setConfig).catch(() => {});
  }, [id]);

  if (loading) return (
    <Stack gap="6" aria-busy="true" aria-label="Loading domain">
      <div className="h-3 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
      <Stack gap="1">
        <div className="h-7 w-64 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
      <div className="h-8 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-64 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
  if (error || !cap) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger-ink)]">{error ?? "Domain not found"}</p></Card>;

  return (
    <Stack gap="4" className="min-h-full">
      <Breadcrumb items={breadcrumbItems} />
      <ScopeHeader
        scope="domain"
        name={cap.name}
        slug={cap.slug}
        description={cap.description}
        chips={[
          { label: "owner", value: ownerLabel, title: owner?.role },
          { label: "repos", value: repos.length.toString() },
        ]}
        freshness={ingestionToFreshness(knowledge?.ingestion_status)}
        freshnessTitle={knowledge?.last_ingested_at ? `Last ingested ${knowledge.last_ingested_at}` : undefined}
      />
      <ScopeTabs
        scope="domain"
        activeTab={tab}
        onChange={onTabChange}
        badges={{
          decisions: decisions.length  || undefined,
          repos:     repos.length      || undefined,
          sources:   resources.length  || undefined,
          notes:     notes.length      || undefined,
          tasks:     board.reduce((n, c) => n + c.total, 0) || undefined,
          members:   capMembers.length || undefined,
        }}
      />

      <div className="min-h-0">
        {tab === "blueprint" && (
          <BlueprintTab
            domainId={cap.id}
            repos={repos}
            canManage={canCap("blueprint:edit") || canCap("blueprint:approve")}
          />
        )}
        {tab === "topology"  && <TopologyTab knowledge={knowledge} repos={repos} domainId={cap.id} domainName={cap.name} />}
        {tab === "decisions" && (
          <DecisionsTab
            scope="domain"
            scopeId={cap.id}
            decisions={decisions}
            onRefresh={async () => {
              const next = await api.domains.decisions(cap.id).catch(() => [] as DecisionRecord[]);
              setDecisions(next);
            }}
          />
        )}
        {tab === "repos"     && <ReposTab repos={repos} domainId={cap.id} onRefresh={refreshAfterSync} canManage={canCap("repos:manage") || canCap("knowledge:sync")} />}
        {tab === "sources"   && <ResourcesTab resources={resources} domainId={cap.id} onRefresh={refreshResources} />}
        {tab === "notes"     && <NotesTab notes={notes} />}
        {tab === "tasks"     && <TasksTab columns={board} onMutated={reloadBoard} />}
        {tab === "members"   && me && (
          <DomainMembersTab
            domainId={cap.id}
            members={capMembers}
            currentUserId={me.id}
            canManage={canCap("members:manage")}
            onChanged={async () => {
              const next = await api.domains.members.list(cap.id).catch(() => [] as DomainMember[]);
              setCapMembers(next);
            }}
          />
        )}
        {tab === "config"    && <ConfigTab config={config} domainId={cap.id} canManage={canCap("settings:manage")} onChange={refreshConfig} />}
        {tab === "danger" && (
          <DomainDangerZoneTab
            cap={cap}
            canManage={canCap("lifecycle:manage")}
            onChanged={async () => {
              const next = await api.domains.get(cap.id, { includeDeleted: true }).catch(() => null);
              if (next) setCap(next);
            }}
          />
        )}
      </div>
    </Stack>
  );
}

/* ============================== Blueprint tab ============================ */

/**
 * Blueprint tab - pure narrative. No KG cards interleaved (per ADR-073 §4).
 * Two-column: sticky TOC sidebar + scrollable section stack grouped by
 * the five Identity / Rules / Architecture / Operations / History
 * categories.
 */
function BlueprintTab({ domainId, repos, canManage }: { domainId: string; repos: DomainRepo[]; canManage: boolean }) {
  const [toc, setToc] = useState<BlueprintToc | null>(null);
  const [sections, setSections] = useState<Record<string, BlueprintSection>>({});
  const [proposals, setProposals] = useState<BlueprintSectionProposal[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState<BlueprintSection | null>(null);
  const [revisionsKey, setRevisionsKey] = useState<string | null>(null);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [tocError, setTocError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api.blueprint.domain.getToc(domainId),
        api.blueprint.domain.listProposals(domainId).catch(() => [] as BlueprintSectionProposal[]),
      ]);
      setToc(t);
      setProposals(p);
      const fetched = await Promise.all(
        t.sections.map((s) => api.blueprint.domain.getSection(domainId, s.section_key)),
      );
      const map: Record<string, BlueprintSection> = {};
      for (const sec of fetched) map[sec.section_key] = sec;
      setSections(map);
      setTocError(null);
    } catch (e) {
      setTocError(e instanceof ApiError ? e.message : "Failed to load Blueprint.");
    }
  }, [domainId]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const handleScrollTo = useCallback((key: string) => {
    setActiveKey(key);
    if (typeof document !== "undefined") {
      document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!editorOpen) return;
    const updated = await api.blueprint.domain.editSection(domainId, editorOpen.section_key, { body_markdown, change_note });
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    setEditorOpen(null);
    await refreshAll();
  }, [domainId, editorOpen, refreshAll]);

  const handleLockToggle = useCallback(async (sectionKey: string) => {
    const cur = sections[sectionKey];
    if (!cur) return;
    const updated = cur.locked
      ? await api.blueprint.domain.unlockSection(domainId, sectionKey)
      : await api.blueprint.domain.lockSection(domainId, sectionKey);
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [domainId, sections, refreshAll]);

  const handleRegenerate = useCallback(async (sectionKey: string) => {
    const updated = await api.blueprint.domain.regenerateSection(domainId, sectionKey);
    if ("body_markdown" in updated) {
      setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    // `overview` regenerates via the async agentic explorer - wait for the
    // build to finish (no-op for the synchronous single-shot sections).
    await pollBlueprintReady(async () => (await api.blueprint.domain.getToc(domainId)).status);
    await refreshAll();
  }, [domainId, refreshAll]);

  const handleProposalAccept = useCallback(async (proposal: BlueprintSectionProposal) => {
    const updated = await api.blueprint.domain.acceptProposal(domainId, proposal.id);
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [domainId, refreshAll]);

  const handleProposalEditAccept = useCallback(async (proposal: BlueprintSectionProposal, edited: string) => {
    const updated = await api.blueprint.domain.editAndAcceptProposal(domainId, proposal.id, { body_markdown: edited });
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [domainId, refreshAll]);

  const handleProposalReject = useCallback(async (proposal: BlueprintSectionProposal, reason: string) => {
    await api.blueprint.domain.rejectProposal(domainId, proposal.id, { reason });
    await refreshAll();
  }, [domainId, refreshAll]);

  if (tocError) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger-ink)]">{tocError}</p>
      </Card>
    );
  }

  const tocSections = toc?.sections ?? [];
  const grouped: Record<Category, BlueprintSection[]> = {
    Identity: [], Rules: [], Architecture: [], Operations: [], History: [],
  };
  for (const s of [...tocSections].sort((a, b) => a.ordering - b.ordering)) {
    const sec = sections[s.section_key];
    if (sec) grouped[CATEGORY_FOR_SECTION[s.section_key] ?? "Architecture"].push(sec);
  }

  return (
    <Stack gap="4">
      {/* Computed dashboard header band - merges the old first-tab overview
          into Blueprint (Phase D locked IA): cap Mermaid + clickable repo
          links. Counts live on the Topology tab (ADR-073 canonical-home). */}
      <DomainDashboardHeader domainId={domainId} repos={repos} />
      <BlueprintProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {toc === null ? (
            <div className="p-3">
              <Stack gap="2" aria-busy="true" aria-label="Loading TOC">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-7 animate-pulse rounded-md bg-[var(--surface-2)]" />
                ))}
              </Stack>
            </div>
          ) : (
            <BlueprintTocSidebar sections={tocSections} activeSectionKey={activeKey} onSelect={handleScrollTo} />
          )}
        </aside>
        <div className="min-w-0 space-y-6">
          {toc === null ? (
            <Stack gap="3" aria-busy="true" aria-label="Loading sections">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <Stack gap="2">
                    <div className="h-6 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
                    {Array.from({ length: 6 }).map((_, j) => (
                      <div key={j} className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                    ))}
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const inCat = grouped[cat];
              if (inCat.length === 0) return null;
              return (
                <Stack key={cat} gap="3">
                  <div className="flex items-center gap-2 border-b border-[var(--border-strong)] pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      {cat}
                    </span>
                    <span className="text-[10px] text-[var(--text-subtle)]">
                      {inCat.length} section{inCat.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {inCat.map((section) => (
                    <section id={`section-${section.section_key}`} key={section.section_key} className="scroll-mt-4">
                      <BlueprintSectionViewer
                        section={section}
                        scope="domain"
                        scopeId={domainId}
                        onEdit={() => setEditorOpen(section)}
                        onLockToggle={() => handleLockToggle(section.section_key)}
                        onRegenerate={() => handleRegenerate(section.section_key)}
                        onViewRevisions={() => setRevisionsKey(section.section_key)}
                        canManage={canManage}
                      />
                    </section>
                  ))}
                </Stack>
              );
            })
          )}
        </div>
      </div>

      <BlueprintSectionEditor section={editorOpen} onClose={() => setEditorOpen(null)} onSave={handleEditSave} />
      <BlueprintSectionRevisions
        open={revisionsKey !== null}
        sectionTitle={revisionsKey ? sections[revisionsKey]?.title ?? "" : ""}
        sectionKey={revisionsKey}
        load={(key) => api.blueprint.domain.getRevisions(domainId, key)}
        onClose={() => setRevisionsKey(null)}
      />
      <BlueprintProposalDiffModal
        open={proposalsOpen}
        proposals={proposals}
        resolveCurrentSection={(key) => sections[key] ?? null}
        onAccept={handleProposalAccept}
        onEditAndAccept={handleProposalEditAccept}
        onReject={handleProposalReject}
        onClose={() => setProposalsOpen(false)}
      />
    </Stack>
  );
}

/* ============================== Topology tab ============================= */

function TopologyTab({
  knowledge,
  repos,
  domainId,
  domainName,
}: {
  knowledge: DomainKnowledge | null;
  repos: DomainRepo[];
  domainId: string;
  domainName: string;
}) {
  // Seed the unified explorer with the cap root → attached repos + top entities.
  // useMemo runs unconditionally (hook-order) - the empty-state returns after.
  const seed = useMemo(
    () =>
      knowledge
        ? seedDomain(knowledge, {
            name: domainName,
            repos: repos.map((r) => ({ id: repoScopedId(r), name: r.repo_full_name })),
          })
        : null,
    [knowledge, domainName, repos],
  );

  if (!knowledge || !seed) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">
          No knowledge ingested yet. Click Sync on the Repos tab.
        </p>
      </Card>
    );
  }
  return (
    <Stack gap="4">
      <TopologyHeader
        lastSync={knowledge.last_ingested_at}
        metrics={[
          { label: "entities",      value: knowledge.top_entities.length, emphasis: true },
          { label: "overlay terms", value: knowledge.overlay_terms.length },
          { label: "repos",         value: knowledge.repos_indexed },
          { label: "nodes",         value: knowledge.nodes_total },
          { label: "edges",         value: knowledge.edges_total },
          { label: "decisions",     value: knowledge.decision_records, title: "Count only - full list on Decisions tab" },
        ]}
      />
      <TopologyExplorer seed={seed} scope="domain" domainId={domainId} />
      <OverlayTermsList knowledge={knowledge} />
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Attached repos</span>
          <span className="text-xs text-[var(--text-muted)]">
            {repos.length} repo{repos.length === 1 ? "" : "s"} · click to open
          </span>
        </Cluster>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {repos.map((r) => (
            <li key={r.id}>
              <Link
                href={`/domains/${encodeURIComponent(domainId)}/repos/${encodeURIComponent(repoScopedId(r))}`}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 transition-[box-shadow,transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-accent)] hover:shadow-[var(--shadow-2)]"
              >
                <Stack gap="0" className="min-w-0">
                  <code className="truncate font-mono text-xs font-semibold">{r.repo_full_name}</code>
                  <span className="text-[10px] text-[var(--text-subtle)]">{r.default_branch}</span>
                </Stack>
                <ChevronRight className="size-4 text-[var(--text-subtle)]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Stack>
    </Stack>
  );
}

/* ============================== Repos tab ================================ */

/** §5.31.7 r3 - Active / Deleted / All chip filter on the per-cap Repos tab.
 *  Mirrors the `/domains` list pattern (domain-list `DomainStatusFilter`);
 *  filters the locally-loaded `DomainRepo[]` by `repo_deleted_at`. The
 *  cap detail page already requests `include_deleted` for the cap itself
 *  (so the danger-zone banner can render); the BE returns soft-deleted
 *  attached repos in the same listRepos response, so this is a pure
 *  client-side narrowing - no extra fetch needed. */
type RepoStatusFilter = "active" | "deleted" | "all";

function filterReposByStatus(
  repos: DomainRepo[],
  status: RepoStatusFilter,
): DomainRepo[] {
  if (status === "active") return repos.filter((r) => !r.repo_deleted_at);
  if (status === "deleted") return repos.filter((r) => !!r.repo_deleted_at);
  return repos;
}

/** The id to pass to repo-scoped routes + knowledge endpoints: ALWAYS
 *  `repos.id`, NEVER the `domain_repos` join-row id (`repo.id`).
 *
 *  Every repo-scoped knowledge endpoint (`knowledge:sync` / `:cancel` /
 *  `:retry`, `_resolve_sync_target`) resolves by `repos.id`; passing the join
 *  id 404s as "Repo not found" - the exact bug the BE fixed on 2026-06-02 and
 *  that the cap-list Sync/Retry handlers reintroduced by sending `repo.id`.
 *  Centralised so nav + mutations can't drift apart again. The `?? r.id`
 *  fallback only ever fires for a legacy attachment whose `repo_id` was never
 *  back-filled (ADR-031) - it still won't resolve for a mutation, but it keeps
 *  navigation best-effort. */
function repoScopedId(repo: DomainRepo): string {
  return repo.repo_id ?? repo.id;
}

function ReposTab({
  repos,
  domainId,
  onRefresh,
  canManage,
}: {
  repos: DomainRepo[];
  domainId: string;
  onRefresh: () => Promise<void>;
  canManage: boolean;
}) {
  /* §5.31.7 r3 - chip-row filter. Local state (not URL-driven) because the
   * cap detail page already owns the `?tab=` param. Defaults to Active. */
  const [statusFilter, setStatusFilter] = useState<RepoStatusFilter>("active");
  const visibleRepos = filterReposByStatus(repos, statusFilter);
  const deletedCount = repos.filter((r) => !!r.repo_deleted_at).length;
  const activeCount  = repos.length - deletedCount;

  /* Per-row sync state - tracks which rows the user kicked a sync on so the
   * chip flips to the optimistic "Syncing" before the worker reports back. */
  const [syncing, setSyncing] = useState<ReadonlySet<string>>(new Set());
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(new Set());

  /* §5.29.11 / S7.7 - AttachRepoDialog visibility. Onboarding deep-links
   * with `?attach=1` to auto-open the dialog on the Repos tab. */
  const searchParams = useSearchParams();
  const router = useRouter();
  const [attachOpen, setAttachOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get("attach") === "1") {
      setAttachOpen(true);
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("attach");
      router.replace(`/domains/${encodeURIComponent(domainId)}?${sp.toString()}`);
    }
  }, [searchParams, router, domainId]);

  /* Ambient polling: while ANY row has an in-flight stage, refetch every 3s
   * so the chip flips through stages live; clears `syncing` for settled rows.
   * Stops automatically when every row is at `completed | failed | null`. */
  useEffect(() => {
    const anyInFlight = repos.some((r) => isInFlight(r.current_sync_stage));
    if (!anyInFlight) {
      setSyncing((prev) => (prev.size ? new Set() : prev));
      return undefined;
    }
    const tick = setInterval(() => { void onRefresh(); }, 3000);
    return () => clearInterval(tick);
  }, [repos, onRefresh]);

  const startSync = useCallback(async (repo: DomainRepo) => {
    if (syncing.has(repo.id)) return;
    setSyncing((prev) => new Set(prev).add(repo.id));
    try {
      await api.domains.syncRepoKnowledge(domainId, repoScopedId(repo));
      toast.success(`Sync queued for ${repo.repo_full_name}.`);
      await onRefresh();
    } catch (e) {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(repo.id);
        return next;
      });
      toast.error(e instanceof ApiError ? e.message : "Sync failed.");
    }
  }, [domainId, syncing, onRefresh]);

  const startRetry = useCallback(async (repo: DomainRepo) => {
    if (retrying.has(repo.id)) return;
    setRetrying((prev) => new Set(prev).add(repo.id));
    try {
      const result = await api.domains.retryRepoEnrichments(domainId, repoScopedId(repo));
      if (result.succeeded > 0 && result.still_failed === 0) {
        toast.success(`Retry succeeded - ${result.succeeded} enrichment${result.succeeded === 1 ? "" : "s"} backfilled.`);
      } else if (result.succeeded > 0) {
        toast.success(`Backfilled ${result.succeeded} of ${result.retried}. ${result.still_failed} still failing.`);
      } else if (result.retried === 0) {
        toast(`No unresolved enrichment failures for ${repo.repo_full_name}.`);
      } else {
        toast.error("Retry didn't backfill anything. Check LiteLLM config.");
      }
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Retry failed.");
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(repo.id);
        return next;
      });
    }
  }, [domainId, retrying, onRefresh]);

  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">
          {repos.length} repo{repos.length === 1 ? "" : "s"} attached. Open a repo for its full knowledge home.
        </span>
        {canManage ? (
          <Button variant="outline" onClick={() => setAttachOpen(true)}>
            <Plus className="size-4" />Attach repo
          </Button>
        ) : (
          <span className="text-xs text-[var(--text-subtle)]" title="Cap-admin required to attach repos">
            view only
          </span>
        )}
      </Cluster>
      <div role="tablist" aria-label="Repo status filter">
        <Cluster gap="2" align="center">
        {(["active", "deleted", "all"] as const).map((s) => {
          const count = s === "active" ? activeCount : s === "deleted" ? deletedCount : repos.length;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === statusFilter}
              data-testid={`repo-status-chip-${s}`}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-[color,background-color,border-color] duration-150 ease-out",
                s === statusFilter
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-1)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              )}
            >
              {s === "active" ? "Active" : s === "deleted" ? "Deleted" : "All"}
              <span className="ml-1.5 text-[10px] tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
        </Cluster>
      </div>
      {repos.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No repos attached.</p>
      ) : visibleRepos.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {statusFilter === "deleted"
            ? "No soft-deleted repos. Anything you delete here will appear in this filter."
            : "No active repos in this domain."}
        </p>
      ) : (
        /* Phase D - compact rows: a unified SyncStatusChip + management
         * actions + "Open repo →". The heavy KG-knowledge view lives on the
         * canonical repo page (no inline expand here - ADR-073 §4). */
        <Stack gap="2" as="ul">
          {visibleRepos.map((r) => (
            <li key={r.id}>
              <Card className="transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
                <Cluster justify="between" align="center" className="flex-wrap gap-3">
                  <Cluster gap="3" align="center" className="min-w-0 flex-1">
                    <GitBranch className="size-4 text-[var(--text-muted)]" aria-hidden />
                    <Stack gap="0" className="min-w-0">
                      <Link
                        href={`/domains/${encodeURIComponent(domainId)}/repos/${encodeURIComponent(repoScopedId(r))}?tab=blueprint`}
                        className="truncate rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        {r.repo_full_name}
                      </Link>
                      <span className="text-xs text-[var(--text-muted)]">default branch: {r.default_branch}</span>
                    </Stack>
                  </Cluster>
                  <Cluster gap="3" align="center" className="flex-wrap">
                    {r.repo_deleted_at && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]"
                        title={`Soft-deleted ${r.repo_deleted_at}`}
                      >
                        <Trash2 className="size-3" />
                        Deleted
                      </span>
                    )}
                    <SyncStatusChip signals={signalsFromRepo(r)} syncing={syncing.has(r.id)} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { void startSync(r); }}
                      disabled={!canManage || !!r.repo_deleted_at || syncing.has(r.id) || isInFlight(r.current_sync_stage)}
                      title={
                        !canManage
                          ? "Cap-admin required to sync knowledge"
                          : r.repo_deleted_at
                          ? "Repo is soft-deleted - restore it first to sync."
                          : isInFlight(r.current_sync_stage)
                          ? `Sync already in progress (${prettyStage(r.current_sync_stage)})`
                          : r.last_sync_attempt_at
                            ? `Last attempt: ${new Date(r.last_sync_attempt_at).toLocaleString()}`
                            : undefined
                      }
                    >
                      {syncing.has(r.id) || isInFlight(r.current_sync_stage) ? (
                        <>
                          {/* The chip beside this button is the single status
                              surface (it shows the live stage). The button is
                              just the action, so it stays generic here - no
                              second copy of "Cloning…/Embedding…/Indexing…". */}
                          <Loader2 className="size-3 animate-spin" aria-hidden />
                          Syncing…
                        </>
                      ) : (
                        <><RefreshCw className="size-3" aria-hidden />Sync now</>
                      )}
                    </Button>
                    {r.current_sync_stage === "degraded" && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`retry-enrichments-${r.id}`}
                        onClick={() => { void startRetry(r); }}
                        disabled={!canManage || retrying.has(r.id)}
                        title={
                          !canManage
                            ? "Cap-admin required to retry enrichments"
                            : "Re-run the failed per-file LLM enrichments (embeddings, summaries, tags)."
                        }
                      >
                        {retrying.has(r.id) ? (
                          <><Loader2 className="size-3 animate-spin" aria-hidden />Retrying…</>
                        ) : (
                          <><RefreshCw className="size-3" aria-hidden />Retry enrichments</>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      asChild
                    >
                      <Link
                        href={`/domains/${encodeURIComponent(domainId)}/repos/${encodeURIComponent(repoScopedId(r))}?tab=blueprint`}
                        data-testid={`open-repo-${r.id}`}
                      >
                        Open repo<ChevronRight className="size-3" aria-hidden />
                      </Link>
                    </Button>
                    {canManage && <RepoLifecycleButton repo={r} onChanged={onRefresh} />}
                  </Cluster>
                </Cluster>
              </Card>
            </li>
          ))}
        </Stack>
      )}
      <AttachRepoDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        domainId={domainId}
        attachedRepos={repos}
        onAttached={onRefresh}
      />
    </Stack>
  );
}

/* §5.31 - per-row Delete repo / Reindex CTA. Hidden when the underlying
 * repo_id isn't surfaced (legacy attachment pre-expand-migrate). When
 * live: shows "Delete repo" → typed-name confirm → soft-delete. When
 * soft-deleted: shows "Reindex" → restore (re-enqueues ingest). */
function RepoLifecycleButton({
  repo,
  onChanged,
}: {
  repo: DomainRepo;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!repo.repo_id) return null;
  const isDeleted = !!repo.repo_deleted_at;

  if (isDeleted) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          if (!repo.repo_id) return;
          setBusy(true);
          try {
            await api.repos.restore(repo.repo_id);
            toast.success(`Repo restored. Re-ingest enqueued at HEAD.`);
            await onChanged();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Restore failed.");
          } finally { setBusy(false); }
        }}
        title="Clear soft-delete + re-ingest knowledge"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
        Reindex
      </Button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => { setOpen(true); setConfirmInput(""); setError(null); }}
        className="text-[var(--danger)]"
        title="Soft-delete this repo (affects every domain using it)"
      >
        <Trash2 className="size-3" />
        Delete
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in" onClick={() => !busy && setOpen(false)}>
          <Card variant="glass" className="w-full max-w-md rounded-xl p-5 shadow-[var(--shadow-3)] motion-safe:animate-in motion-safe:zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <Stack gap="3">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--danger-ink)]">
                <Trash2 className="size-4" aria-hidden />
                Delete repo
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                Soft-deletes <strong>{repo.repo_full_name}</strong>. This affects
                <strong> every domain</strong> currently using this repo - its
                knowledge graph will stop surfacing in search. You can permanently
                delete from <code>/settings/trash</code> after this step.
              </p>
              {error && (
                <p className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]" role="alert">
                  {error}
                </p>
              )}
              <Stack gap="1">
                <label className="text-sm">
                  Type <code>{repo.repo_full_name}</code> to confirm.
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={repo.repo_full_name}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Stack>
              <Cluster gap="2" justify="end">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                <Button
                  variant="destructive"
                  disabled={busy || confirmInput !== repo.repo_full_name}
                  onClick={async () => {
                    if (!repo.repo_id) return;
                    setBusy(true); setError(null);
                    try {
                      await api.repos.softDelete(repo.repo_id);
                      toast.success(`Repo soft-deleted.`);
                      setOpen(false);
                      await onChanged();
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : "Failed to delete.");
                    } finally { setBusy(false); }
                  }}
                >
                  {busy ? "Deleting…" : "Soft delete"}
                </Button>
              </Cluster>
            </Stack>
          </Card>
        </div>
      )}
    </>
  );
}

const _IN_FLIGHT_STAGES: ReadonlySet<string> = new Set([
  // `queued` counts as in-flight - Arq picks 1 job at a time, so when
  // the user multi-attaches N repos every row past the first sits at
  // `queued` until the worker reaches it.
  "queued",
  "cloning",
  "parsing",
  "embedding",
  "indexing",
]);

function isInFlight(stage: string | null | undefined): boolean {
  return stage != null && _IN_FLIGHT_STAGES.has(stage);
}

function prettyStage(stage: string | null | undefined): string {
  switch (stage) {
    case "queued":    return "Queued";
    case "cloning":   return "Cloning…";
    case "parsing":   return "Parsing…";
    case "embedding": return "Embedding…";
    case "indexing":  return "Indexing…";
    default:          return "Syncing";
  }
}

/* ============================ Sources / Notes / Tasks / Config =========== */

function ResourcesTab({
  resources,
  domainId,
  onRefresh,
}: {
  resources: DomainResource[];
  domainId: string;
  onRefresh: () => Promise<void>;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const onDelete = useCallback(async (r: DomainResource) => {
    setDeletingId(r.id);
    try {
      await api.domains.deleteResource(domainId, r.id);
      toast.success(`Removed "${r.title}".`);
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete that resource.");
    } finally {
      setDeletingId(null);
    }
  }, [domainId, onRefresh]);

  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">{resources.length} resource{resources.length === 1 ? "" : "s"}.</span>
        <Button onClick={() => setUploadOpen(true)}><Plus className="size-4" />Upload resource</Button>
      </Cluster>
      {resources.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title="No resources yet"
          description="Drop PDFs, Notion links, or paste a markdown note to ground this domain."
          action={<Button onClick={() => setUploadOpen(true)}><Plus className="size-4" />Upload resource</Button>}
        />
      ) : (
        <Stack gap="2" as="ul">
          {resources.map((r) => (
            <li key={r.id}>
              <Card className="transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
                <Stack gap="2">
                  <Cluster justify="between" align="center">
                    <Cluster gap="2" align="center">
                      {r.kind === "file" && <FileText className="size-4 text-[var(--text-muted)]" />}
                      {r.kind === "link" && <ExternalLink className="size-4 text-[var(--text-muted)]" />}
                      {r.kind === "note" && <StickyNote className="size-4 text-[var(--text-muted)]" />}
                      <Stack gap="0">
                        <span className="text-sm font-semibold">{r.title}</span>
                        <span className="text-xs text-[var(--text-muted)]">{r.source} · {r.format}</span>
                      </Stack>
                    </Cluster>
                    <Cluster gap="2" align="center">
                      {r.status === "indexed" && <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success-ink)]"><CheckCircle2 className="mr-1 inline size-2.5" />Indexed · {r.nodes_generated} nodes</span>}
                      {r.status === "indexing" && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]"><Loader2 className="mr-1 inline size-2.5 animate-spin" />Indexing {r.progress ?? 0}%</span>}
                      {r.status === "queued" && <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Queued</span>}
                      {r.status === "failed" && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger-ink)]"><AlertTriangle className="mr-1 inline size-2.5" />Failed</span>}
                      <button
                        type="button"
                        onClick={() => { void onDelete(r); }}
                        disabled={deletingId === r.id}
                        className="rounded-md p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] disabled:opacity-50"
                        aria-label={`Delete ${r.title}`}
                        title="Delete resource"
                      >
                        {deletingId === r.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
                      </button>
                    </Cluster>
                  </Cluster>
                  <p className="text-xs text-[var(--text-muted)]">{r.summary}</p>
                  <Cluster gap="2" align="center">
                    {r.tags.map((t) => (
                      <span key={t} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{t}</span>
                    ))}
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                      {r.uploaded_by} · {formatDateTime(r.uploaded_at)}{r.last_used ? ` · last used ${formatDateTime(r.last_used)}` : ""}
                    </span>
                  </Cluster>
                </Stack>
              </Card>
            </li>
          ))}
        </Stack>
      )}
      <UploadResourceDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        domainId={domainId}
        onUploaded={onRefresh}
      />
    </Stack>
  );
}

function NotesTab({ notes }: { notes: DomainNote[] }) {
  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">{notes.length} note{notes.length === 1 ? "" : "s"} promoted from team conversations.</span>
        <Button variant="outline"><Plus className="size-4" />Add note</Button>
      </Cluster>
      {notes.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" aria-hidden />}
          title="No notes yet"
          description="Promote findings from chat or review here to build the domain's shared memory."
        />
      ) : (
        <Stack gap="2" as="ul">
          {notes.map((n) => (
            <li key={n.id}>
              <Card className="transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
                <Stack gap="1">
                  <Cluster gap="2" align="center">
                    <BookOpen className="size-4 text-[var(--text-muted)]" />
                    <span className="text-sm font-semibold">{n.title}</span>
                  </Cluster>
                  <p className="text-sm text-[var(--text-muted)]">{n.body}</p>
                  <span className="text-[10px] text-[var(--text-subtle)]">{n.author} · {n.date} · promoted from {n.promoted_from}</span>
                </Stack>
              </Card>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** The domain's task board - the same kanban the org-wide `/work` page renders
 *  (`api.tasks.board` columns + `<KanbanBoard>`), scoped to this domain. Cards
 *  open the cockpit; the overflow menu marks done / removes from the board (the
 *  two common board actions - delete + the Removed view live on `/work`). */
function TasksTab({
  columns,
  onMutated,
}: {
  columns: KanbanColumn[];
  onMutated: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const mutate = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      await onMutated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work - try again.");
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (task: Task): TaskCardActions => ({
    onMarkDone: () =>
      void mutate(task.id, () => api.tasks.patch(task.id, { status: "done" }), "Marked done."),
    onArchive: (reason: TaskCancelReason) =>
      void mutate(
        task.id,
        () => api.tasks.cancel(task.id, reason),
        "Removed from the board - find it under Removed on /work.",
      ),
  });

  return (
    <KanbanBoard
      columns={columns}
      onTaskOpen={(t) => router.push(`/work/${t.id}`)}
      taskActions={actionsFor}
      busyId={busyId}
    />
  );
}

function ConfigTab({
  config, domainId, canManage, onChange,
}: {
  config: DomainConfig | null;
  domainId: string;
  canManage: boolean;
  onChange: () => void;
}) {
  if (!config) return <Card><p className="text-sm text-[var(--text-muted)]">No config defined yet.</p></Card>;
  const phases = ["spec","plan","implement","review","ci","pr"] as const;
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2"><Cpu className="size-4 text-[var(--primary)]" /><span className="text-sm font-semibold">Model per phase</span></Cluster>
          <Grid cols="auto-fit-180" gap="2">
            {phases.map((p) => (
              <div key={p} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-[var(--inner-highlight)]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{p}</div>
                <div className="font-mono text-xs text-[var(--text)]">{config.models[p] ?? "-"}</div>
              </div>
            ))}
          </Grid>
        </Stack>
      </Card>
      <DomainSkillsCard domainId={domainId} skills={config.skills} canManage={canManage} onChange={onChange} />
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2"><ShieldCheck className="size-4 text-[var(--primary)]" /><span className="text-sm font-semibold">Review policy</span></Cluster>
          <Grid cols="auto-fit-200" gap="2">
            <KpiCard label="Spec approvers"   value={config.review_policy.spec_approvers.toString()} />
            <KpiCard label="Review approvers" value={config.review_policy.review_approvers.toString()} />
            <KpiCard label="CI must pass"     value={config.review_policy.ci_must_pass ? "Yes" : "No"} />
            <KpiCard label="Auto-merge"       value={config.review_policy.auto_merge ? "Enabled" : "Disabled"} />
          </Grid>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <span className="border-b border-[var(--border)] pb-2 text-sm font-semibold">Context repos</span>
          <Cluster gap="2">
            {config.context_repos.map((r) => (
              <span key={r} className="rounded bg-[var(--surface-2)] px-2 py-1 font-mono text-xs">{r}</span>
            ))}
          </Cluster>
        </Stack>
      </Card>
    </Stack>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 shadow-[var(--inner-highlight)]">
      <Stack gap="1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-xs text-[var(--text-muted)]">{sub}</span>}
      </Stack>
    </div>
  );
}
