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
  type BlueprintSection, type BlueprintSectionProposal, type BlueprintToc,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";
import { CapabilityKnowledgeCard } from "@/components/capabilities/knowledge-card";
import { RepoKnowledgePanel } from "@/components/capabilities/repo-knowledge";
import { BlueprintToc as BlueprintTocSidebar } from "@/components/blueprint/blueprint-toc";
import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import { BlueprintSectionEditor } from "@/components/blueprint/blueprint-section-editor";
import { BlueprintSectionRevisions } from "@/components/blueprint/blueprint-section-revisions";
import { BlueprintProposalQueue } from "@/components/blueprint/blueprint-proposal-queue";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { cn } from "@/lib/cn";

type Tab = "overview" | "repos" | "resources" | "notes" | "tasks" | "config";
const TABS: { key: Tab; label: string }[] = [
  // The "Blueprint" tab was merged into "Overview" per ADR-072 — the
  // capability's Blueprint sections render inline on the Overview tab,
  // interleaved with the KG snapshot / entity graph / overlay terms / raw
  // ingestion projection. One canonical view per capability.
  { key: "overview",  label: "Overview"  },
  { key: "repos",     label: "Repos"     },
  { key: "resources", label: "Sources"   },
  { key: "notes",     label: "Notes"     },
  { key: "tasks",     label: "Tasks"     },
  { key: "config",    label: "Config"    },
];

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
  const [tab, setTab] = useState<Tab>("overview");
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

      {tab === "overview" && <OverviewTab cap={cap} repos={repos} runs={runs} resources={resources} notes={notes} knowledge={knowledge} members={members} capabilityId={cap.id} />}
      {tab === "repos" && <ReposTab repos={repos} capabilityId={cap.id} />}
      {tab === "resources" && <ResourcesTab resources={resources} />}
      {tab === "notes" && <NotesTab notes={notes} />}
      {tab === "tasks" && <TasksTab runs={runs} />}
      {tab === "config" && <ConfigTab config={config} />}
    </Stack>
  );
}

/**
 * OverviewTab — the canonical single-scroll capability page (ADR-072).
 *
 * Renders, in order:
 *   1. KPI strip (open tasks / repos / sources / notes / owner)
 *   2. Pending-proposal queue (when any Blueprint AI proposals are waiting)
 *   3. Two-column layout:
 *        - sticky Blueprint TOC sidebar (left)
 *        - scrollable section stack (right) that weaves Blueprint sections
 *          with KG-derived "virtual" sections at logical anchors:
 *            after `overview`           → KG snapshot (counts + freshness + histogram)
 *            after `services`           → entity graph (top KG entities)
 *            after `domain_glossary`    → overlay terms (KG-overlay bridges)
 *            after `recent_activity`    → raw ingestion projection
 *
 * All Blueprint sections are pre-fetched (~16 calls in parallel via the mock
 * handler, ~120ms total). Clicking a TOC row scrolls to the matching anchor;
 * no per-section spinner. Edit / lock / regenerate / proposal-queue
 * affordances live on each section header (BlueprintSectionViewer).
 */
function OverviewTab({
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

  if (tocError) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger)]">{tocError}</p>
      </Card>
    );
  }

  // Where to inject KG virtual sections in the scroll flow. Keys with leading
  // underscores are virtual (not real Blueprint sections); the TOC sidebar
  // navigates to them via scroll-to-anchor like real sections.
  const KG_VIRTUAL: Record<string, { key: string; title: string; summary: string }> = {
    overview:        { key: "_kg_snapshot",      title: "KG Snapshot",      summary: "Counts, histogram, freshness from the latest ingest" },
    services:        { key: "_entity_graph",     title: "Entity Graph",     summary: "Top entities by importance + cross-entity edges" },
    domain_glossary: { key: "_overlay_terms",    title: "Overlay Terms",    summary: "Domain vocab → matched KG nodes (capability_overlay_terms)" },
    recent_activity: { key: "_recent_ingestion", title: "Recent Ingestion", summary: "Raw KG projection of recent ingest events" },
  };

  const tocSections = toc?.sections ?? [];
  // Build the merged TOC with KG virtual rows injected after their anchors.
  const tocMerged = tocSections.flatMap((s) => {
    const inject = KG_VIRTUAL[s.section_key];
    if (!inject) return [s];
    const virtualRow = {
      section_key: inject.key,
      title: inject.title,
      summary: inject.summary,
      token_count: 0,
      origin: "derived" as const,
      editable: false,
      locked: false,
      protected_from_ai: false,
      current_version: 1,
      has_pending_proposal: false,
      parent_section_key: null,
      ordering: s.ordering + 0.5,
    };
    return [s, virtualRow];
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

        <div className="min-w-0 space-y-4">
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
            tocSections.flatMap((s) => {
              const section = sections[s.section_key];
              const rendered: React.ReactNode[] = [];
              if (section) {
                rendered.push(
                  <section id={`section-${s.section_key}`} key={s.section_key} className="scroll-mt-4">
                    <BlueprintSectionViewer
                      section={section}
                      onEdit={() => setEditorOpen(section)}
                      onLockToggle={() => handleLockToggle(section.section_key)}
                      onRegenerate={() => handleRegenerate(section.section_key)}
                      onViewRevisions={() => setRevisionsKey(section.section_key)}
                    />
                  </section>,
                );
              }
              const inject = KG_VIRTUAL[s.section_key];
              if (inject && knowledge) {
                rendered.push(
                  <section id={`section-${inject.key}`} key={inject.key} className="scroll-mt-4">
                    <KgVirtualCard kind={inject.key} title={inject.title} knowledge={knowledge} />
                  </section>,
                );
              }
              return rendered;
            })
          )}

          {/* If no Blueprint exists yet, fall back to the KG card on its own. */}
          {toc !== null && Object.keys(sections).length === 0 && knowledge && (
            <CapabilityKnowledgeCard knowledge={knowledge} />
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

/** KG-derived "virtual section" — one of four KG cards that interleave with
 * Blueprint sections on the merged Overview. Renders only the KG-distinctive
 * slice corresponding to its anchor key. */
function KgVirtualCard({ kind, title, knowledge }: { kind: string; title: string; knowledge: CapabilityKnowledge }) {
  // We reuse CapabilityKnowledgeCard's pre-existing section layout by passing
  // the full knowledge object and letting the card render the appropriate
  // slice via the `slice` prop. For this revision the card renders all KG
  // slices on the first encounter; subsequent calls render nothing to avoid
  // duplication. Future revision: split CapabilityKnowledgeCard into 4
  // sub-components keyed by `kind` for cleaner interleaving.
  if (kind === "_kg_snapshot") {
    return (
      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <span className="text-sm font-semibold">{title}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">auto · KG ingestion</span>
          </Cluster>
          <CapabilityKnowledgeCard knowledge={knowledge} />
        </Stack>
      </Card>
    );
  }
  // The other three virtual cards (entity_graph, overlay_terms, recent_ingestion)
  // are intentionally suppressed here — CapabilityKnowledgeCard renders all of
  // them in one block above. The TOC entries scroll to the same anchor (the
  // KG snapshot card) for now. A follow-up split of CapabilityKnowledgeCard
  // by kind will make each anchor distinct.
  return null;
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
