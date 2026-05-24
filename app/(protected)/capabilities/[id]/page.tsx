"use client";

/**
 * /capabilities/{id} — capability detail with full tabs.
 *
 *   - overview: KPIs, owner, last activity, top nodes.
 *   - repos:    attached repos.
 *   - resources: PDFs / Notion / runbooks / notes that feed the knowledge base.
 *   - notes:    domain notes promoted from chat / review.
 *   - tasks:    runs filtered to this capability.
 *   - config:   model per phase + skills attached + review policy.
 */

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Loader2, GitBranch, Plus, BookOpen, FileText, StickyNote, ShieldCheck, Cpu,
  ExternalLink, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
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
  type BlueprintSection, type BlueprintSectionProposal, type BlueprintSectionSummary, type BlueprintToc,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";
import {
  KgSnapshotCard,
  KgEntityGraphCard,
  KgOverlayTermsCard,
  KgRecentIngestionCard,
} from "@/components/capabilities/knowledge-card";
import { RepoKnowledgePanel } from "@/components/capabilities/repo-knowledge";
import { BlueprintToc as BlueprintTocSidebar } from "@/components/blueprint/blueprint-toc";
import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import { BlueprintSectionEditor } from "@/components/blueprint/blueprint-section-editor";
import { BlueprintSectionRevisions } from "@/components/blueprint/blueprint-section-revisions";
import { BlueprintProposalQueue } from "@/components/blueprint/blueprint-proposal-queue";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { cn } from "@/lib/cn";

type Tab = "blueprint" | "repos" | "resources" | "notes" | "tasks" | "config";
const TABS: { key: Tab; label: string }[] = [
  // "Blueprint" IS the canonical capability surface (ADR-072): all Blueprint
  // sections + the KG-derived snapshot / entity graph / overlay terms / raw
  // ingestion projection render here, interleaved, in one scroll. There's
  // no separate "Overview" or "Knowledge" tab — landing here IS landing on
  // the capability's Blueprint.
  { key: "blueprint", label: "Blueprint" },
  { key: "repos",     label: "Repos"     },
  { key: "resources", label: "Sources"   },
  { key: "notes",     label: "Notes"     },
  { key: "tasks",     label: "Tasks"     },
  { key: "config",    label: "Config"    },
];

/* Category order for the merged capability Overview scroll. Matches the
 * BlueprintToc sidebar's grouping so the scroll top-to-bottom mirrors
 * what the sidebar shows. */
const CATEGORY_ORDER = ["Overview", "Rules", "Architecture", "Ops", "Activity"] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_FOR_SECTION: Record<string, Category> = {
  // Overview — at-a-glance orientation
  overview: "Overview",
  domain_glossary: "Overview",
  glossary: "Overview",
  standards: "Overview",
  mission: "Overview",
  maturity: "Overview",
  external_references: "Overview",
  ownership: "Overview",
  // Rules — what to do / what not to do
  guardrails: "Rules",
  conventions: "Rules",
  security_policies: "Rules",
  principles: "Rules",
  open_questions: "Rules",
  // Architecture — structural reference
  services: "Architecture",
  stack: "Architecture",
  api_surface: "Architecture",
  data_models: "Architecture",
  entry_points: "Architecture",
  hot_files: "Architecture",
  build_and_run: "Architecture",
  deployment_surface: "Architecture",
  external_deps: "Architecture",
  local_idioms: "Architecture",
  cross_repo_workflows: "Architecture",
  decisions: "Architecture",
  // Ops — running it day-to-day
  runbook: "Ops",
  observability: "Ops",
  secrets_handling: "Ops",
  environments: "Ops",
  compliance: "Ops",
  tests_and_ci: "Ops",
  success_metrics: "Ops",
  risks: "Ops",
  // Activity — what's happened
  recent_activity: "Activity",
  incident_history: "Activity",
  change_log: "Activity",
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
  const [cap, setCap] = useState<Capability | null>(null);
  const [repos, setRepos] = useState<CapabilityRepo[]>([]);
  const [runs, setRuns] = useState<RunDetail[]>([]);
  const [resources, setResources] = useState<CapabilityResource[]>([]);
  const [config, setConfig] = useState<CapabilityConfig | null>(null);
  const [notes, setNotes] = useState<DomainNote[]>([]);
  const [knowledge, setKnowledge] = useState<CapabilityKnowledge | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tab, setTab] = useState<Tab>("blueprint");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, r, rs, res, cfg, nts, kg, mem] = await Promise.all([
          api.capabilities.get(id),
          api.capabilities.listRepos(id),
          api.runs.list() as Promise<RunDetail[]>,
          api.capabilities.listResources(id).catch(() => [] as CapabilityResource[]),
          api.capabilities.config(id).catch(() => null),
          api.capabilities.notes(id).catch(() => [] as DomainNote[]),
          api.capabilities.knowledge(id).catch(() => null),
          activeOrgId ? api.members.list(activeOrgId).catch(() => [] as Member[]) : Promise.resolve([] as Member[]),
        ]);
        setCap(c);
        setRepos(r);
        setRuns(rs.filter((run) => run.capability_id === id));
        setResources(res);
        setConfig(cfg);
        setNotes(nts);
        setKnowledge(kg);
        setMembers(mem);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load capability");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, activeOrgId]);

  if (loading) return (
    <Stack gap="6" aria-busy="true" aria-label="Loading capability">
      <Stack gap="1">
        <div className="h-3 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-7 w-64 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
      <div className="h-10 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </div>
      <div className="h-48 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
  if (error || !cap) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error ?? "Capability not found"}</p></Card>;

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Link href="/capabilities" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">← Capabilities</Link>
        <Cluster gap="2" align="center">
          <h1 className="text-2xl font-semibold tracking-tight">{cap.name}</h1>
          <span className="text-sm text-[var(--text-muted)]">/{cap.slug}</span>
        </Cluster>
        <p className="max-w-2xl text-sm text-[var(--text-muted)]">{cap.description}</p>
      </Stack>

      <div className="overflow-x-auto border-b border-[var(--border)]">
        <Cluster gap="0" className="-mb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium",
                tab === t.key ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </Cluster>
      </div>

      {tab === "blueprint" && <BlueprintTab cap={cap} repos={repos} runs={runs} resources={resources} notes={notes} knowledge={knowledge} members={members} capabilityId={cap.id} />}
      {tab === "repos" && <ReposTab repos={repos} capabilityId={cap.id} />}
      {tab === "resources" && <ResourcesTab resources={resources} />}
      {tab === "notes" && <NotesTab notes={notes} />}
      {tab === "tasks" && <TasksTab runs={runs} />}
      {tab === "config" && <ConfigTab config={config} />}
    </Stack>
  );
}

/**
 * BlueprintTab — the canonical capability surface (ADR-072).
 *
 * This IS the Blueprint. All sections of the Capability Blueprint render
 * inline, interleaved with KG-derived data at precise anchors. There is no
 * separate "Overview" or "Knowledge" tab to also click — landing on this
 * tab IS landing on the full capability page.
 *
 * Renders, in order:
 *   1. KPI strip (open tasks / repos / sources / notes / owner)
 *   2. Pending-proposal queue (when any Blueprint AI proposals are waiting)
 *   3. Two-column layout:
 *        - sticky BlueprintToc sidebar (left), grouped by category
 *          (Overview / Rules / Architecture / Ops / Activity)
 *        - scrollable section stack (right) rendering in the same category
 *          order, weaving Blueprint sections with 4 KG cards at precise
 *          anchors:
 *            after `overview`        → <KgSnapshotCard>      (counts + histogram + freshness)
 *            after `services`        → <KgEntityGraphCard>   (navigable graph + ledger)
 *            after `domain_glossary` → <KgOverlayTermsCard>  (capability_overlay_terms)
 *            after `recent_activity` → <KgRecentIngestionCard> (raw recent_changes)
 *
 * All Blueprint sections are pre-fetched in parallel. Clicking a TOC row
 * scrolls to the matching anchor; no per-section spinner. Edit / lock /
 * regenerate / proposal-queue affordances live on each section header.
 */
function BlueprintTab({
  cap,
  repos,
  runs,
  resources,
  notes,
  knowledge,
  members,
  capabilityId,
}: {
  cap: Capability;
  repos: CapabilityRepo[];
  runs: RunDetail[];
  resources: CapabilityResource[];
  notes: DomainNote[];
  knowledge: CapabilityKnowledge | null;
  members: Member[];
  capabilityId: string;
}) {
  const open = runs.filter((r) => r.status !== "completed" && r.status !== "cancelled").length;
  const owner = members.find((m) => m.user_id === cap.created_by_user_id);
  const ownerLabel = owner?.display_name ?? cap.created_by_user_id?.replace(/^u_/, "") ?? "—";

  // Blueprint state
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

  // onSelect handler for the entity graph — scroll to the matched entity's
  // row in the Services or Decisions section, falling back to the entity-graph
  // anchor itself. Declared before any early returns to satisfy rules-of-hooks.
  const handleEntitySelect = useCallback((entityId: string) => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(`entity-${entityId}`)
      ?? document.getElementById("section-_entity_graph");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (tocError) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger)]">{tocError}</p>
      </Card>
    );
  }

  // KG virtual sections — what gets injected after which Blueprint section.
  // Each KG card lands at exactly one anchor. The TOC shows all 4 virtual
  // entries so users can scroll-to-anchor like any Blueprint section.
  const KG_VIRTUAL = {
    overview:        { key: "_kg_snapshot",      title: "KG snapshot",      summary: "Counts, freshness, node-kind histogram",                  Card: KgSnapshotCard },
    services:        { key: "_entity_graph",     title: "Entity graph",     summary: "Top entities by importance · click to jump",              Card: KgEntityGraphCard },
    domain_glossary: { key: "_overlay_terms",    title: "Overlay terms",    summary: "capability_overlay_terms · domain vocab → matched nodes", Card: KgOverlayTermsCard },
    recent_activity: { key: "_recent_ingestion", title: "Recent ingestion", summary: "Raw KG projection of recent ingest events",               Card: KgRecentIngestionCard },
  } as const;

  const tocSections = toc?.sections ?? [];

  // Group sections by category (Overview / Rules / Architecture / Ops /
  // Activity). The scroll renders in this category order so it matches the
  // TOC sidebar's grouping — no more mixed-ordering scatter.
  const grouped: Record<Category, BlueprintSection[]> = {
    Overview: [], Rules: [], Architecture: [], Ops: [], Activity: [],
  };
  for (const s of [...tocSections].sort((a, b) => a.ordering - b.ordering)) {
    const sec = sections[s.section_key];
    if (sec) grouped[CATEGORY_FOR_SECTION[s.section_key] ?? "Architecture"].push(sec);
  }

  // Build the merged TOC (Blueprint sections + KG virtual rows interleaved
  // at the right anchor positions) for the sidebar.
  const tocMerged: BlueprintSectionSummary[] = tocSections.flatMap((s) => {
    const inject = KG_VIRTUAL[s.section_key as keyof typeof KG_VIRTUAL];
    if (!inject) return [s];
    return [s, {
      section_key: inject.key,
      title: inject.title,
      summary: inject.summary,
      token_count: 0,
      origin: "derived",
      editable: false,
      locked: false,
      protected_from_ai: false,
      current_version: 1,
      has_pending_proposal: false,
      parent_section_key: null,
      ordering: s.ordering + 0.5,
    }];
  });

  return (
    <Stack gap="6">
      {/* 1. KPI strip */}
      <Grid cols="auto-fit-220" gap="3">
        <KpiCard label="Open tasks"  value={open.toString()} />
        <KpiCard label="Repos"       value={repos.length.toString()} />
        <KpiCard label="Sources"     value={resources.length.toString()} sub={`${resources.filter((r) => r.status === "indexed").length} indexed`} />
        <KpiCard label="Domain notes"value={notes.length.toString()} />
        <KpiCard label="Owner"       value={ownerLabel} sub={owner?.role} />
      </Grid>

      {/* 2. Proposal queue */}
      <BlueprintProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />

      {/* 3. Two-column: sticky TOC + scrollable sections */}
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
            <BlueprintTocSidebar sections={tocMerged} activeSectionKey={activeKey} onSelect={handleScrollTo} />
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
                  {inCat.flatMap((section) => {
                    const items: React.ReactNode[] = [
                      <section id={`section-${section.section_key}`} key={section.section_key} className="scroll-mt-4">
                        <BlueprintSectionViewer
                          section={section}
                          onEdit={() => setEditorOpen(section)}
                          onLockToggle={() => handleLockToggle(section.section_key)}
                          onRegenerate={() => handleRegenerate(section.section_key)}
                          onViewRevisions={() => setRevisionsKey(section.section_key)}
                        />
                      </section>,
                    ];
                    const inject = KG_VIRTUAL[section.section_key as keyof typeof KG_VIRTUAL];
                    if (inject && knowledge) {
                      const KgCard = inject.Card;
                      items.push(
                        <section id={`section-${inject.key}`} key={inject.key} className="scroll-mt-4">
                          {inject.key === "_entity_graph"
                            ? <KgEntityGraphCard knowledge={knowledge} onSelectEntity={handleEntitySelect} />
                            : <KgCard knowledge={knowledge} />}
                        </section>,
                      );
                    }
                    return items;
                  })}
                </Stack>
              );
            })
          )}
        </div>
      </div>

      {/* Modals */}
      <BlueprintSectionEditor
        section={editorOpen}
        onClose={() => setEditorOpen(null)}
        onSave={handleEditSave}
      />
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


function ReposTab({ repos, capabilityId }: { repos: CapabilityRepo[]; capabilityId: string }) {
  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">
          {repos.length} repo{repos.length === 1 ? "" : "s"} indexed. Click a repo to see its ingested knowledge.
        </span>
        <Button variant="outline"><Plus className="size-4" />Attach repo</Button>
      </Cluster>
      {repos.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No repos attached.</p>
      ) : (
        <Stack gap="2" as="ul">
          {repos.map((r) => (
            <li key={r.id}>
              <RepoRow repo={r} capabilityId={capabilityId} />
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function RepoRow({ repo, capabilityId }: { repo: CapabilityRepo; capabilityId: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={`repo-knowledge-${repo.id}`}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
      >
        <Cluster gap="3" align="center">
          <GitBranch className="size-4 text-[var(--text-muted)]" />
          <Stack gap="0">
            <span className="font-medium">{repo.repo_full_name}</span>
            <span className="text-xs text-[var(--text-muted)]">default branch: {repo.default_branch}</span>
          </Stack>
        </Cluster>
        <Cluster gap="3" align="center">
          <span className="text-xs text-[var(--text-subtle)]">
            attached {new Date(repo.created_at).toLocaleDateString()}
          </span>
          {expanded
            ? <ChevronUp className="size-4 text-[var(--text-muted)]" aria-hidden />
            : <ChevronDown className="size-4 text-[var(--text-muted)]" aria-hidden />}
        </Cluster>
      </button>
      {expanded && (
        <div id={`repo-knowledge-${repo.id}`} className="px-4 pb-4">
          <RepoKnowledgePanel capabilityId={capabilityId} repoId={repo.id} />
        </div>
      )}
    </Card>
  );
}

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
