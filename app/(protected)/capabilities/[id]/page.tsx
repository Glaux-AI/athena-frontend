"use client";

/**
 * /capabilities/{id} — capability detail with faceted tabs (ADR-073).
 *
 * Universal shell (ADR-073 §7): Breadcrumb + ScopeHeader + ScopeTabs +
 * TabContent. Nine tabs:
 *   - **Blueprint** — 16 narrative sections (BlueprintToc + viewer)
 *   - **Topology**  — TopologyHeader + EntityGraph + OverlayTermsList +
 *                     attached-repos mini-list with links to new repo route
 *   - **Decisions** — capability-scoped decision records (virtualized)
 *   - **Activity**  — capability-scoped event timeline (runs + ingestion)
 *   - **Repos**     — attached repos list; each row LINKS to the new
 *                     /capabilities/[id]/repos/[repo_id] route (no inline
 *                     expand — that page is now first-class)
 *   - **Sources**   — CapabilityResource[] with index status
 *   - **Notes**     — DomainNote[] promoted from chat
 *   - **Tasks**     — runs filtered to this capability
 *   - **Config**    — model per phase + skills + review policy + context repos
 *
 * Canonical-home rule (ADR-073 §4):
 *   - No KPI strip at top — counts live on Topology header only.
 *   - No KG cards on Blueprint — they live on Topology only.
 *   - Freshness pill lives ONLY in ScopeHeader.
 */

import { useCallback, useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2, GitBranch, Plus, BookOpen, FileText, StickyNote, ShieldCheck, Cpu,
  ExternalLink, CheckCircle2, AlertTriangle, ChevronRight,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import {
  api, ApiError,
  type Capability, type CapabilityRepo, type RunDetail, type CapabilityResource, type CapabilityConfig, type DomainNote,
  type CapabilityKnowledge,
  type Member,
  type DecisionRecord,
  type ActivityEvent,
  type Org,
  type BlueprintSection, type BlueprintSectionProposal, type BlueprintToc,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

import { Breadcrumb } from "@/components/scope/breadcrumb";
import { ScopeHeader } from "@/components/scope/scope-header";
import { ScopeTabs, type AnyTab } from "@/components/scope/scope-tabs";
import { TopologyHeader } from "@/components/topology/topology-header";
import { EntityGraph } from "@/components/topology/entity-graph";
import { OverlayTermsList } from "@/components/topology/overlay-terms-list";
import { DecisionsTab } from "@/components/decisions/decisions-tab";
import { ActivityTab as ActivityTabComponent } from "@/components/activity/activity-tab";
import { BlueprintToc as BlueprintTocSidebar } from "@/components/blueprint/blueprint-toc";
import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import { BlueprintSectionEditor } from "@/components/blueprint/blueprint-section-editor";
import { BlueprintSectionRevisions } from "@/components/blueprint/blueprint-section-revisions";
import { BlueprintProposalQueue } from "@/components/blueprint/blueprint-proposal-queue";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { ingestionToFreshness } from "@/lib/freshness";

type CapTab = "blueprint" | "topology" | "decisions" | "activity" | "repos" | "sources" | "notes" | "tasks" | "config";

const CAP_TABS: CapTab[] = ["blueprint", "topology", "decisions", "activity", "repos", "sources", "notes", "tasks", "config"];

function isCapTab(s: string | null | undefined): s is CapTab {
  return s != null && (CAP_TABS as string[]).includes(s);
}

/* Blueprint category order — drives the section rendering inside the
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

const RUN_STATUS_MAP: Record<RunDetail["status"], Status> = {
  queued: "queued",
  running: "running",
  awaiting_gate: "awaiting_gate",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  gate_rejected: "gate_rejected",
};

export default function CapabilityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeOrgId } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cap, setCap] = useState<Capability | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [repos, setRepos] = useState<CapabilityRepo[]>([]);
  const [runs, setRuns] = useState<RunDetail[]>([]);
  const [resources, setResources] = useState<CapabilityResource[]>([]);
  const [config, setConfig] = useState<CapabilityConfig | null>(null);
  const [notes, setNotes] = useState<DomainNote[]>([]);
  const [knowledge, setKnowledge] = useState<CapabilityKnowledge | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab");
  const tab: CapTab = isCapTab(tabParam) ? tabParam : "blueprint";

  useEffect(() => {
    (async () => {
      try {
        const [c, r, rs, res, cfg, nts, kg, mem, dec, act, o] = await Promise.all([
          api.capabilities.get(id),
          api.capabilities.listRepos(id),
          api.runs.list() as Promise<RunDetail[]>,
          api.capabilities.listResources(id).catch(() => [] as CapabilityResource[]),
          api.capabilities.config(id).catch(() => null),
          api.capabilities.notes(id).catch(() => [] as DomainNote[]),
          api.capabilities.knowledge(id).catch(() => null),
          activeOrgId ? api.members.list(activeOrgId).catch(() => [] as Member[]) : Promise.resolve([] as Member[]),
          api.capabilities.decisions(id).catch(() => [] as DecisionRecord[]),
          api.capabilities.activity(id, { limit: 200 }).catch(() => [] as ActivityEvent[]),
          activeOrgId ? api.orgs.get(activeOrgId).catch(() => null) : Promise.resolve(null),
        ]);
        setCap(c);
        setRepos(r);
        setRuns(rs.filter((run) => run.capability_id === id));
        setResources(res);
        setConfig(cfg);
        setNotes(nts);
        setKnowledge(kg);
        setMembers(mem);
        setDecisions(dec);
        setActivity(act);
        setOrg(o);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load capability");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, activeOrgId]);

  const onTabChange = useCallback(
    (next: AnyTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", next);
      router.push(`/capabilities/${encodeURIComponent(id)}?${sp.toString()}`);
    },
    [router, searchParams, id],
  );

  const breadcrumbItems = useMemo(() => {
    if (!org || !cap) return [];
    return [
      { label: org.display_name ?? org.name, href: "/knowledge" },
      { label: cap.name, href: `/capabilities/${encodeURIComponent(cap.id)}` },
    ];
  }, [org, cap]);

  const owner = members.find((m) => m.user_id === cap?.created_by_user_id);
  const ownerLabel = owner?.display_name ?? cap?.created_by_user_id?.replace(/^u_/, "") ?? "—";

  if (loading) return (
    <Stack gap="6" aria-busy="true" aria-label="Loading capability">
      <div className="h-3 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
      <Stack gap="1">
        <div className="h-7 w-64 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
      <div className="h-8 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-64 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
  if (error || !cap) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error ?? "Capability not found"}</p></Card>;

  return (
    <Stack gap="4" className="min-h-full">
      <Breadcrumb items={breadcrumbItems} />
      <ScopeHeader
        scope="capability"
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
        scope="capability"
        activeTab={tab}
        onChange={onTabChange}
        badges={{
          decisions: decisions.length || undefined,
          activity:  activity.length  || undefined,
          repos:     repos.length     || undefined,
          sources:   resources.length || undefined,
          notes:     notes.length     || undefined,
          tasks:     runs.length      || undefined,
        }}
      />

      <div className="min-h-0">
        {tab === "blueprint" && <BlueprintTab capabilityId={cap.id} />}
        {tab === "topology"  && <TopologyTab knowledge={knowledge} repos={repos} capabilityId={cap.id} />}
        {tab === "decisions" && <DecisionsTab scope="capability" decisions={decisions} />}
        {tab === "activity"  && <ActivityTabComponent scope="capability" events={activity} />}
        {tab === "repos"     && <ReposTab repos={repos} capabilityId={cap.id} />}
        {tab === "sources"   && <ResourcesTab resources={resources} />}
        {tab === "notes"     && <NotesTab notes={notes} />}
        {tab === "tasks"     && <TasksTab runs={runs} />}
        {tab === "config"    && <ConfigTab config={config} />}
      </div>
    </Stack>
  );
}

/* ============================== Blueprint tab ============================ */

/**
 * Blueprint tab — pure narrative. No KG cards interleaved (per ADR-073 §4).
 * Two-column: sticky TOC sidebar + scrollable section stack grouped by
 * the five Identity / Rules / Architecture / Operations / History
 * categories.
 */
function BlueprintTab({ capabilityId }: { capabilityId: string }) {
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
        api.blueprint.capability.getToc(capabilityId),
        api.blueprint.capability.listProposals(capabilityId).catch(() => [] as BlueprintSectionProposal[]),
      ]);
      setToc(t);
      setProposals(p);
      const fetched = await Promise.all(
        t.sections.map((s) => api.blueprint.capability.getSection(capabilityId, s.section_key)),
      );
      const map: Record<string, BlueprintSection> = {};
      for (const sec of fetched) map[sec.section_key] = sec;
      setSections(map);
      setTocError(null);
    } catch (e) {
      setTocError(e instanceof ApiError ? e.message : "Failed to load Blueprint.");
    }
  }, [capabilityId]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const handleScrollTo = useCallback((key: string) => {
    setActiveKey(key);
    if (typeof document !== "undefined") {
      document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!editorOpen) return;
    const updated = await api.blueprint.capability.editSection(capabilityId, editorOpen.section_key, { body_markdown, change_note });
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    setEditorOpen(null);
    await refreshAll();
  }, [capabilityId, editorOpen, refreshAll]);

  const handleLockToggle = useCallback(async (sectionKey: string) => {
    const cur = sections[sectionKey];
    if (!cur) return;
    const updated = cur.locked
      ? await api.blueprint.capability.unlockSection(capabilityId, sectionKey)
      : await api.blueprint.capability.lockSection(capabilityId, sectionKey);
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [capabilityId, sections, refreshAll]);

  const handleRegenerate = useCallback(async (sectionKey: string) => {
    const updated = await api.blueprint.capability.regenerateSection(capabilityId, sectionKey);
    if ("body_markdown" in updated) {
      setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    await refreshAll();
  }, [capabilityId, refreshAll]);

  const handleProposalAccept = useCallback(async (proposal: BlueprintSectionProposal) => {
    const updated = await api.blueprint.capability.acceptProposal(capabilityId, proposal.id);
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [capabilityId, refreshAll]);

  const handleProposalEditAccept = useCallback(async (proposal: BlueprintSectionProposal, edited: string) => {
    const updated = await api.blueprint.capability.editAndAcceptProposal(capabilityId, proposal.id, { body_markdown: edited });
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [capabilityId, refreshAll]);

  const handleProposalReject = useCallback(async (proposal: BlueprintSectionProposal, reason: string) => {
    await api.blueprint.capability.rejectProposal(capabilityId, proposal.id, { reason });
    await refreshAll();
  }, [capabilityId, refreshAll]);

  if (tocError) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger)]">{tocError}</p>
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
                        onEdit={() => setEditorOpen(section)}
                        onLockToggle={() => handleLockToggle(section.section_key)}
                        onRegenerate={() => handleRegenerate(section.section_key)}
                        onViewRevisions={() => setRevisionsKey(section.section_key)}
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
        load={(key) => api.blueprint.capability.getRevisions(capabilityId, key)}
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
  capabilityId,
}: {
  knowledge: CapabilityKnowledge | null;
  repos: CapabilityRepo[];
  capabilityId: string;
}) {
  if (!knowledge) {
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
          { label: "decisions",     value: knowledge.decision_records, title: "Count only — full list on Decisions tab" },
        ]}
      />
      <EntityGraph knowledge={knowledge} />
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
                href={`/capabilities/${encodeURIComponent(capabilityId)}/repos/${encodeURIComponent(r.id)}`}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-2)]"
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

function ReposTab({ repos, capabilityId }: { repos: CapabilityRepo[]; capabilityId: string }) {
  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">
          {repos.length} repo{repos.length === 1 ? "" : "s"} attached. Each opens its own first-class surface.
        </span>
        <Button variant="outline"><Plus className="size-4" />Attach repo</Button>
      </Cluster>
      {repos.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No repos attached.</p>
      ) : (
        <Stack gap="2" as="ul">
          {repos.map((r) => (
            <li key={r.id}>
              <Link
                href={`/capabilities/${encodeURIComponent(capabilityId)}/repos/${encodeURIComponent(r.id)}?tab=blueprint`}
                className="block"
              >
                <Card className="hover:bg-[var(--surface-2)] transition-colors">
                  <Cluster justify="between" align="center">
                    <Cluster gap="3" align="center">
                      <GitBranch className="size-4 text-[var(--text-muted)]" aria-hidden />
                      <Stack gap="0">
                        <span className="font-medium">{r.repo_full_name}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          default branch: {r.default_branch}
                        </span>
                      </Stack>
                    </Cluster>
                    <Cluster gap="3" align="center">
                      <span className="text-xs text-[var(--text-subtle)]">
                        attached {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <ChevronRight className="size-4 text-[var(--text-muted)]" aria-hidden />
                    </Cluster>
                  </Cluster>
                </Card>
              </Link>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/* ============================ Sources / Notes / Tasks / Config =========== */

function ResourcesTab({ resources }: { resources: CapabilityResource[] }) {
  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">{resources.length} resource{resources.length === 1 ? "" : "s"}.</span>
        <Button><Plus className="size-4" />Upload resource</Button>
      </Cluster>
      {resources.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No resources yet. Drop PDFs, Notion links, or paste a markdown note.</p> : (
        <Stack gap="2" as="ul">
          {resources.map((r) => (
            <li key={r.id}>
              <Card>
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
                      {r.status === "indexed" && <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]"><CheckCircle2 className="mr-1 inline size-2.5" />Indexed · {r.nodes_generated} nodes</span>}
                      {r.status === "indexing" && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]"><Loader2 className="mr-1 inline size-2.5 animate-spin" />Indexing {r.progress ?? 0}%</span>}
                      {r.status === "queued" && <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Queued</span>}
                      {r.status === "failed" && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]"><AlertTriangle className="mr-1 inline size-2.5" />Failed</span>}
                    </Cluster>
                  </Cluster>
                  <p className="text-xs text-[var(--text-muted)]">{r.summary}</p>
                  <Cluster gap="2" align="center">
                    {r.tags.map((t) => (
                      <span key={t} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{t}</span>
                    ))}
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                      {r.uploaded_by} · {r.uploaded_at}{r.last_used ? ` · last used ${r.last_used}` : ""}
                    </span>
                  </Cluster>
                </Stack>
              </Card>
            </li>
          ))}
        </Stack>
      )}
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
      {notes.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No notes yet. Promote findings from chat or review here.</p> : (
        <Stack gap="2" as="ul">
          {notes.map((n) => (
            <li key={n.id}>
              <Card>
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

function TasksTab({ runs }: { runs: RunDetail[] }) {
  return (
    <Stack gap="2" as="ul">
      {runs.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No tasks for this capability yet.</p> : runs.map((r) => (
        <li key={r.id}>
          <Link href={`/runs/${r.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-lg">
            <Card className="hover:bg-[var(--surface-2)]">
              <Cluster justify="between" align="center">
                <Stack gap="0">
                  <span className="font-medium">{r.goal}</span>
                  <span className="text-xs text-[var(--text-muted)]">requested by {r.requested_by} · phase {r.current_phase + 1}/6</span>
                </Stack>
                <StatusPill status={RUN_STATUS_MAP[r.status]} />
              </Cluster>
            </Card>
          </Link>
        </li>
      ))}
    </Stack>
  );
}

function ConfigTab({ config }: { config: CapabilityConfig | null }) {
  if (!config) return <Card><p className="text-sm text-[var(--text-muted)]">No config defined yet.</p></Card>;
  const phases = ["spec","plan","implement","review","ci","pr"] as const;
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center"><Cpu className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Model per phase</span></Cluster>
          <Grid cols="auto-fit-180" gap="2">
            {phases.map((p) => (
              <div key={p} className="rounded-md border border-[var(--border)] p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{p}</div>
                <div className="font-mono text-xs text-[var(--text)]">{config.models[p] ?? "—"}</div>
              </div>
            ))}
          </Grid>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Skills attached ({config.skills.length})</span>
          <Cluster gap="2">
            {config.skills.map((s) => (
              <Link key={s} href={`/skills/${s}`} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary)] hover:underline">{s}</Link>
            ))}
          </Cluster>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center"><ShieldCheck className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Review policy</span></Cluster>
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
          <span className="text-sm font-semibold">Context repos</span>
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
    <Card>
      <Stack gap="1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-xs text-[var(--text-muted)]">{sub}</span>}
      </Stack>
    </Card>
  );
}
