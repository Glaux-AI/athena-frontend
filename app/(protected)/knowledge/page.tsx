"use client";

/**
 * /knowledge — the Org knowledge surface.
 *
 * Renders the org Brief in full: overview, capability registry, capability
 * graph, glossary, security policies. Each section is editable through the
 * same `api.brief.org.*` endpoints that power the capability + repo Brief
 * surfaces, with lock / regenerate / revisions / proposal-accept affordances.
 *
 * A right-side "Across capabilities" rail surfaces what's stored at the
 * org level but lives outside the Brief (capability cards with KG stats,
 * org-wide rules + ADRs, the skills inventory) so the user can drill into
 * any of them without leaving the page.
 *
 * Replaces the prior force-directed knowledge graph (which only rendered 8
 * sparse nodes with no editability and no context for what's actually
 * stored in the org). The graph view is preserved at `/knowledge/graph`
 * for users who want the spatial view; the default is now the Brief.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, ChevronRight, Database, FileText,
  GitBranch, Sparkles, Shield, Wrench,
} from "lucide-react";

import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import {
  api,
  ApiError,
  type BriefSection,
  type BriefSectionProposal,
  type BriefToc,
  type Capability,
  type CapabilityKnowledge,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";
import { BriefToc as BriefTocSidebar } from "@/components/brief/brief-toc";
import { BriefSectionViewer } from "@/components/brief/brief-section-viewer";
import { SectionEditor } from "@/components/brief/section-editor";
import { SectionRevisions } from "@/components/brief/section-revisions";
import { ProposalQueue } from "@/components/brief/proposal-queue";
import { ProposalDiffModal } from "@/components/brief/proposal-diff-modal";

export default function OrgKnowledgePage() {
  const { activeOrgId, me } = useSession();
  const activeOrgName = me?.memberships.find((m) => m.orgId === activeOrgId)?.orgName ?? null;
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

  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [capabilityStats, setCapabilityStats] = useState<Record<string, CapabilityKnowledge>>({});

  // TOC + proposals
  const refreshToc = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [t, p] = await Promise.all([
        api.brief.org.getToc(activeOrgId),
        api.brief.org.listProposals(activeOrgId).catch(() => [] as BriefSectionProposal[]),
      ]);
      setToc(t);
      setProposals(p);
      if (!activeKey && t.sections.length > 0) {
        setActiveKey(t.sections[0]!.section_key);
      }
      setTocError(null);
    } catch (e) {
      setTocError(e instanceof ApiError ? e.message : "Failed to load org Brief.");
    }
  }, [activeOrgId, activeKey]);

  useEffect(() => { void refreshToc(); }, [refreshToc]);

  // Active section body
  useEffect(() => {
    if (!activeOrgId || !activeKey) return;
    let cancelled = false;
    setSectionLoading(true);
    (async () => {
      try {
        const s = await api.brief.org.getSection(activeOrgId, activeKey);
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
  }, [activeOrgId, activeKey]);

  // Capabilities + per-cap KG stats for the right rail.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caps = await api.capabilities.list();
        if (cancelled) return;
        setCapabilities(caps);
        const statsEntries = await Promise.all(
          caps.map(async (c) => {
            try {
              const stats = await api.capabilities.knowledge(c.id);
              return [c.id, stats] as const;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const map: Record<string, CapabilityKnowledge> = {};
        for (const entry of statsEntries) if (entry) map[entry[0]] = entry[1];
        setCapabilityStats(map);
      } catch {
        // soft-fail
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!activeOrgId || !activeKey) return;
    const updated = await api.brief.org.editSection(activeOrgId, activeKey, { body_markdown, change_note });
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, activeKey, refreshToc]);

  const handleLockToggle = useCallback(async () => {
    if (!activeOrgId || !activeKey || !section) return;
    const updated = section.locked
      ? await api.brief.org.unlockSection(activeOrgId, activeKey)
      : await api.brief.org.lockSection(activeOrgId, activeKey);
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, activeKey, section, refreshToc]);

  const handleRegenerate = useCallback(async () => {
    if (!activeOrgId || !activeKey) return;
    const updated = await api.brief.org.regenerateSection(activeOrgId, activeKey);
    if ("body_markdown" in updated) {
      setSection(updated);
      setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    await refreshToc();
  }, [activeOrgId, activeKey, refreshToc]);

  const handleProposalAccept = useCallback(async (proposal: BriefSectionProposal) => {
    if (!activeOrgId) return;
    const updated = await api.brief.org.acceptProposal(activeOrgId, proposal.id);
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, refreshToc]);

  const handleProposalEditAccept = useCallback(async (proposal: BriefSectionProposal, edited: string) => {
    if (!activeOrgId) return;
    const updated = await api.brief.org.editAndAcceptProposal(activeOrgId, proposal.id, { body_markdown: edited });
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, refreshToc]);

  const handleProposalReject = useCallback(async (proposal: BriefSectionProposal, reason: string) => {
    if (!activeOrgId) return;
    await api.brief.org.rejectProposal(activeOrgId, proposal.id, { reason });
    await refreshToc();
  }, [activeOrgId, refreshToc]);

  const totalKgNodes = useMemo(
    () => Object.values(capabilityStats).reduce((sum, s) => sum + (s.nodes_total ?? 0), 0),
    [capabilityStats],
  );
  const totalRepos = useMemo(
    () => Object.values(capabilityStats).reduce((sum, s) => sum + (s.repos_indexed ?? 0), 0),
    [capabilityStats],
  );
  const totalDecisions = useMemo(
    () => Object.values(capabilityStats).reduce((sum, s) => sum + (s.decision_records ?? 0), 0),
    [capabilityStats],
  );

  if (tocError) {
    return (
      <Stack gap="4">
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{tocError}</p>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="6" className="min-h-full">
      {/* Header */}
      <Stack gap="1">
        <Cluster gap="2" align="center">
          <h1 className="text-2xl font-semibold tracking-tight">Org knowledge</h1>
          {toc && (
            <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {toc.status}
            </span>
          )}
        </Cluster>
        <p className="text-sm text-[var(--text-muted)]">
          The org Brief — what Athena knows about <strong>{activeOrgName ?? "your org"}</strong>: mission, capability registry, capability graph, glossary, security policies. Edit any section; AI proposals queue for your approval.
        </p>
      </Stack>

      {/* KPIs strip — what we store, in numbers */}
      <Grid cols="4" gap="3">
        <StatTile
          icon={BookOpen}
          label="Brief sections"
          value={toc?.sections.length ?? "—"}
          hint={`${proposals.length} pending proposal${proposals.length === 1 ? "" : "s"}`}
        />
        <StatTile
          icon={GitBranch}
          label="Capabilities"
          value={capabilities.length}
          hint={`${totalRepos} repos indexed`}
        />
        <StatTile
          icon={Database}
          label="KG nodes"
          value={totalKgNodes.toLocaleString()}
          hint="services, modules, configs, docs"
        />
        <StatTile
          icon={FileText}
          label="Decisions"
          value={totalDecisions}
          hint="across all capability Briefs"
        />
      </Grid>

      {/* Approval queue, if any proposals are pending */}
      <ProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />

      {/* Main two-column: TOC + section viewer */}
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_320px]">
        {/* Brief TOC */}
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {toc === null ? (
            <div className="p-3">
              <Stack gap="2" aria-busy="true" aria-label="Loading TOC">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 animate-pulse rounded-md bg-[var(--surface-2)]" />
                ))}
              </Stack>
            </div>
          ) : (
            <BriefTocSidebar
              sections={toc.sections}
              activeSectionKey={activeKey}
              onSelect={setActiveKey}
            />
          )}
        </aside>

        {/* Section viewer */}
        <div className="min-w-0">
          {sectionLoading || !section ? (
            <Stack gap="3" aria-busy="true" aria-label="Loading section">
              <Card>
                <Stack gap="2">
                  <div className="h-6 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded-md bg-[var(--surface-2)]" />
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

        {/* Right rail — drill into other org-level surfaces */}
        <Stack gap="4">
          <Card>
            <Stack gap="3">
              <Cluster gap="2" align="center">
                <GitBranch className="size-4 text-[var(--primary)]" />
                <span className="text-sm font-semibold">Capabilities</span>
              </Cluster>
              <Stack gap="2">
                {capabilities.map((c) => {
                  const stats = capabilityStats[c.id];
                  return (
                    <Link
                      key={c.id}
                      href={`/capabilities/${c.id}`}
                      className="block rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 transition-colors hover:bg-[var(--surface-2)] no-underline"
                    >
                      <Cluster justify="between" align="center">
                        <Stack gap="0" className="min-w-0">
                          <span className="text-xs font-semibold text-[var(--text)]">{c.name}</span>
                          <span className="text-[10px] text-[var(--text-subtle)] font-mono">/{c.slug}</span>
                        </Stack>
                        <ChevronRight className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
                      </Cluster>
                      {stats && (
                        <Cluster gap="2" align="center" className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                          <span>{stats.nodes_total.toLocaleString()} nodes</span>
                          <span>·</span>
                          <span>{stats.repos_indexed} repos</span>
                          <span>·</span>
                          <span>{stats.decision_records} decisions</span>
                        </Cluster>
                      )}
                    </Link>
                  );
                })}
              </Stack>
            </Stack>
          </Card>

          <Card>
            <Stack gap="3">
              <Cluster gap="2" align="center">
                <Shield className="size-4 text-[var(--primary)]" />
                <span className="text-sm font-semibold">Cross-cutting</span>
              </Cluster>
              <Stack gap="1">
                <Link href="/rules" className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-[var(--text)] no-underline hover:bg-[var(--surface-2)]">
                  <Cluster gap="2" align="center"><BookOpen className="size-3.5" /><span>Rules & ADRs</span></Cluster>
                  <ArrowRight className="size-3 text-[var(--text-subtle)]" />
                </Link>
                <Link href="/skills" className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-[var(--text)] no-underline hover:bg-[var(--surface-2)]">
                  <Cluster gap="2" align="center"><Wrench className="size-3.5" /><span>Skills inventory</span></Cluster>
                  <ArrowRight className="size-3 text-[var(--text-subtle)]" />
                </Link>
                <Link href="/mcp" className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-[var(--text)] no-underline hover:bg-[var(--surface-2)]">
                  <Cluster gap="2" align="center"><Sparkles className="size-3.5" /><span>MCP servers</span></Cluster>
                  <ArrowRight className="size-3 text-[var(--text-subtle)]" />
                </Link>
                <Link href="/knowledge/graph" className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-[var(--text)] no-underline hover:bg-[var(--surface-2)]">
                  <Cluster gap="2" align="center"><Database className="size-3.5" /><span>Knowledge graph (spatial)</span></Cluster>
                  <ArrowRight className="size-3 text-[var(--text-subtle)]" />
                </Link>
              </Stack>
            </Stack>
          </Card>

          {section?.source_refs && section.source_refs.length > 0 && (
            <Card>
              <Stack gap="2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Section sources
                </span>
                <Stack gap="1">
                  {section.source_refs.map((ref, i) => (
                    <div
                      key={`${ref.kind}-${i}`}
                      className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[10px]"
                      title={ref.id}
                    >
                      <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{ref.kind}</span>
                      <span className="truncate text-[var(--text)]">{ref.label}</span>
                      {ref.drift === "stale" && (
                        <span className="ml-auto rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 font-semibold uppercase text-[var(--warning)]">stale</span>
                      )}
                    </div>
                  ))}
                </Stack>
              </Stack>
            </Card>
          )}
        </Stack>
      </div>

      {/* Drawers + modals */}
      <SectionEditor
        section={editorOpen ? section : null}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditSave}
      />
      <SectionRevisions
        open={revisionsOpen}
        sectionTitle={section?.title ?? ""}
        sectionKey={activeKey}
        load={(key) => (activeOrgId ? api.brief.org.getRevisions(activeOrgId, key) : Promise.resolve([]))}
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

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <Stack gap="1">
        <Cluster gap="2" align="center">
          <Icon className="size-4 text-[var(--primary)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        </Cluster>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {hint && <span className="text-[10px] text-[var(--text-muted)]">{hint}</span>}
      </Stack>
    </Card>
  );
}
