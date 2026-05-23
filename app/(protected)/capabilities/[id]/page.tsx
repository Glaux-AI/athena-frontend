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
  ExternalLink, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, ArrowRight,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import {
  api, ApiError,
  type Capability, type CapabilityRepo, type RunDetail, type CapabilityResource, type CapabilityConfig, type DomainNote,
  type CapabilityKnowledge,
  type BriefSection, type BriefSectionProposal, type BriefToc,
} from "@/lib/api/client";
import { CapabilityKnowledgeCard } from "@/components/capabilities/knowledge-card";
import { RepoKnowledgePanel } from "@/components/capabilities/repo-knowledge";
import { BriefToc as BriefTocSidebar } from "@/components/brief/brief-toc";
import { BriefSectionViewer } from "@/components/brief/brief-section-viewer";
import { SectionEditor } from "@/components/brief/section-editor";
import { SectionRevisions } from "@/components/brief/section-revisions";
import { ProposalQueue } from "@/components/brief/proposal-queue";
import { ProposalDiffModal } from "@/components/brief/proposal-diff-modal";
import { cn } from "@/lib/cn";

type Tab = "overview" | "brief" | "repos" | "resources" | "notes" | "tasks" | "config";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview",  label: "Overview"  },
  { key: "brief",     label: "Brief"     },
  { key: "repos",     label: "Repos"     },
  { key: "resources", label: "Knowledge" },
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
  const [cap, setCap] = useState<Capability | null>(null);
  const [repos, setRepos] = useState<CapabilityRepo[]>([]);
  const [runs, setRuns] = useState<RunDetail[]>([]);
  const [resources, setResources] = useState<CapabilityResource[]>([]);
  const [config, setConfig] = useState<CapabilityConfig | null>(null);
  const [notes, setNotes] = useState<DomainNote[]>([]);
  const [knowledge, setKnowledge] = useState<CapabilityKnowledge | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, r, rs, res, cfg, nts, kg] = await Promise.all([
          api.capabilities.get(id),
          api.capabilities.listRepos(id),
          api.runs.list() as Promise<RunDetail[]>,
          api.capabilities.listResources(id).catch(() => [] as CapabilityResource[]),
          api.capabilities.config(id).catch(() => null),
          api.capabilities.notes(id).catch(() => [] as DomainNote[]),
          api.capabilities.knowledge(id).catch(() => null),
        ]);
        setCap(c);
        setRepos(r);
        setRuns(rs.filter((run) => run.capability_id === id));
        setResources(res);
        setConfig(cfg);
        setNotes(nts);
        setKnowledge(kg);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load capability");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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

      {tab === "overview" && <OverviewTab cap={cap} repos={repos} runs={runs} resources={resources} notes={notes} knowledge={knowledge} onOpenBrief={() => setTab("brief")} />}
      {tab === "brief" && <BriefTab capabilityId={cap.id} />}
      {tab === "repos" && <ReposTab repos={repos} capabilityId={cap.id} />}
      {tab === "resources" && <ResourcesTab resources={resources} />}
      {tab === "notes" && <NotesTab notes={notes} />}
      {tab === "tasks" && <TasksTab runs={runs} />}
      {tab === "config" && <ConfigTab config={config} />}
    </Stack>
  );
}

function BriefTab({ capabilityId }: { capabilityId: string }) {
  const [toc, setToc] = useState<BriefToc | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [section, setSection] = useState<BriefSection | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [proposals, setProposals] = useState<BriefSectionProposal[]>([]);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocError, setTocError] = useState<string | null>(null);
  const [sectionCache, setSectionCache] = useState<Record<string, BriefSection>>({});

  const refreshToc = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api.brief.capability.getToc(capabilityId),
        api.brief.capability.listProposals(capabilityId).catch(() => [] as BriefSectionProposal[]),
      ]);
      setToc(t);
      setProposals(p);
      if (!activeKey && t.sections.length > 0) setActiveKey(t.sections[0]!.section_key);
      setTocError(null);
    } catch (e) {
      setTocError(e instanceof ApiError ? e.message : "Failed to load Brief.");
    }
  }, [capabilityId, activeKey]);

  useEffect(() => { void refreshToc(); }, [refreshToc]);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    setSectionLoading(true);
    (async () => {
      try {
        const s = await api.brief.capability.getSection(capabilityId, activeKey);
        if (!cancelled) {
          setSection(s);
          setSectionCache((prev) => ({ ...prev, [s.section_key]: s }));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load section.");
      } finally {
        if (!cancelled) setSectionLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [capabilityId, activeKey]);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!activeKey) return;
    const updated = await api.brief.capability.editSection(capabilityId, activeKey, { body_markdown, change_note });
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [capabilityId, activeKey, refreshToc]);

  const handleLockToggle = useCallback(async () => {
    if (!activeKey || !section) return;
    const updated = section.locked
      ? await api.brief.capability.unlockSection(capabilityId, activeKey)
      : await api.brief.capability.lockSection(capabilityId, activeKey);
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [capabilityId, activeKey, section, refreshToc]);

  const handleRegenerate = useCallback(async () => {
    if (!activeKey) return;
    const updated = await api.brief.capability.regenerateSection(capabilityId, activeKey);
    if ("body_markdown" in updated) {
      setSection(updated);
      setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    await refreshToc();
  }, [capabilityId, activeKey, refreshToc]);

  const handleProposalAccept = useCallback(async (proposal: BriefSectionProposal) => {
    const updated = await api.brief.capability.acceptProposal(capabilityId, proposal.id);
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [capabilityId, refreshToc]);

  const handleProposalEditAccept = useCallback(async (proposal: BriefSectionProposal, edited: string) => {
    const updated = await api.brief.capability.editAndAcceptProposal(capabilityId, proposal.id, { body_markdown: edited });
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [capabilityId, refreshToc]);

  const handleProposalReject = useCallback(async (proposal: BriefSectionProposal, reason: string) => {
    await api.brief.capability.rejectProposal(capabilityId, proposal.id, { reason });
    await refreshToc();
  }, [capabilityId, refreshToc]);

  if (tocError) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger)]">{tocError}</p>
      </Card>
    );
  }

  return (
    <Stack gap="3">
      <ProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {toc === null ? (
            <div className="p-3">
              <Stack gap="2" aria-busy="true" aria-label="Loading TOC">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-7 animate-pulse rounded-md bg-[var(--surface-2)]" />
                ))}
              </Stack>
            </div>
          ) : (
            <BriefTocSidebar sections={toc.sections} activeSectionKey={activeKey} onSelect={setActiveKey} />
          )}
        </aside>
        <div className="min-w-0">
          {sectionLoading || !section ? (
            <Stack gap="3" aria-busy="true" aria-label="Loading section">
              <Card>
                <Stack gap="2">
                  <div className="h-6 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
                </Stack>
              </Card>
              <Card>
                <Stack gap="2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                  ))}
                </Stack>
              </Card>
            </Stack>
          ) : error ? (
            <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
              <p className="text-sm text-[var(--danger)]">{error}</p>
            </Card>
          ) : (
            <BriefSectionViewer
              section={section}
              onEdit={() => setEditorOpen(true)}
              onLockToggle={handleLockToggle}
              onRegenerate={handleRegenerate}
              onViewRevisions={() => setRevisionsOpen(true)}
            />
          )}
        </div>
      </div>
      <SectionEditor
        section={editorOpen ? section : null}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditSave}
      />
      <SectionRevisions
        open={revisionsOpen}
        sectionTitle={section?.title ?? ""}
        sectionKey={activeKey}
        load={(key) => api.brief.capability.getRevisions(capabilityId, key)}
        onClose={() => setRevisionsOpen(false)}
      />
      <ProposalDiffModal
        open={proposalsOpen}
        proposals={proposals}
        resolveCurrentSection={(key) => sectionCache[key] ?? null}
        onAccept={handleProposalAccept}
        onEditAndAccept={handleProposalEditAccept}
        onReject={handleProposalReject}
        onClose={() => setProposalsOpen(false)}
      />
    </Stack>
  );
}

function OverviewTab({ cap, repos, runs, resources, notes, knowledge, onOpenBrief }: { cap: Capability; repos: CapabilityRepo[]; runs: RunDetail[]; resources: CapabilityResource[]; notes: DomainNote[]; knowledge: CapabilityKnowledge | null; onOpenBrief: () => void }) {
  const open = runs.filter((r) => r.status !== "completed" && r.status !== "cancelled").length;
  return (
    <Stack gap="6">
      <Grid cols="auto-fit-220" gap="3">
        <KpiCard label="Open tasks"  value={open.toString()} />
        <KpiCard label="Repos"       value={repos.length.toString()} />
        <KpiCard label="Resources"   value={resources.length.toString()} sub={`${resources.filter((r) => r.status === "indexed").length} indexed`} />
        <KpiCard label="Domain notes"value={notes.length.toString()} />
        <KpiCard label="Owner"       value={cap.created_by_user_id?.replace("u_", "") ?? "—"} sub={`Created ${new Date(cap.created_at).toLocaleDateString()}`} />
      </Grid>

      {/* Brief CTA — opens the inline Brief tab. Drives users to the structured
       *  knowledge surface (overview / guardrails / conventions / stack / api /
       *  data models / decisions / open questions). */}
      <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
        <Cluster gap="3" align="center" justify="between">
          <Cluster gap="2" align="start">
            <BookOpen className="size-4 shrink-0 text-[var(--primary)]" />
            <Stack gap="0">
              <span className="text-sm font-semibold text-[var(--primary)]">Capability Brief</span>
              <span className="text-xs text-[var(--text-muted)]">
                Structured knowledge for {cap.name}: overview, guardrails, conventions, stack, API surface, data models, decisions. Editable per-section.
              </span>
            </Stack>
          </Cluster>
          <Button variant="outline" size="sm" onClick={onOpenBrief}>
            Open Brief
            <ArrowRight className="size-3" />
          </Button>
        </Cluster>
      </Card>

      {knowledge
        ? <CapabilityKnowledgeCard knowledge={knowledge} />
        : <Card><p className="text-sm text-[var(--text-muted)]">No ingestion knowledge yet for this capability. Attach a repo and trigger a sync to populate.</p></Card>}
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
          <Link
            href={`/capabilities/${encodeURIComponent(capabilityId)}/repos/${encodeURIComponent(repo.id)}/brief`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-medium text-[var(--text)] no-underline hover:bg-[var(--surface-2)]"
          >
            <BookOpen className="size-3" />
            Repo Brief
          </Link>
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

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
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
