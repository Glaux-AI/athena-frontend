"use client";

/**
 * /knowledge — the Org knowledge surface.
 *
 * Single-page view of what Athena's KG knows at org scope. Per ADR-071,
 * the page renders ONLY data that is not an Org Blueprint section. The
 * curated narrative (standards / glossary / security_policies) lives
 * in the org Blueprint — surfaced by the TOC + section viewer in the
 * middle of the page — never as separate cards above or below it.
 *
 * Sections, in scan order:
 *   1. Header + KPI tiles      ← `totals` (single source for KPIs)
 *   2. Stale decisions alert   ← `stale_decisions[]` (only when non-empty)
 *   3. Blueprint proposal queue ← capability/org Blueprint proposals
 *   4. Capability dependencies ← `cross_cap_dependencies` (graph + table)
 *   5. Blueprint TOC + viewer  ← canonical org narrative (Blueprint sections)
 *   6. Capability registry     ← `capabilities[]` with deltas (not a Blueprint section)
 *   7. Cross-cutting nav       ← jumps to Rules / Skills / MCP / spatial graph
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Database,
  GitBranch,
  HelpCircle,
  Layers,
  Network,
  ScrollText,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import {
  api,
  ApiError,
  type BlueprintSection,
  type BlueprintSectionProposal,
  type BlueprintToc,
  type OrgKnowledge,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";
import { BlueprintToc as BlueprintTocSidebar } from "@/components/blueprint/blueprint-toc";
import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import { BlueprintSectionEditor } from "@/components/blueprint/blueprint-section-editor";
import { BlueprintSectionRevisions } from "@/components/blueprint/blueprint-section-revisions";
import { BlueprintProposalQueue } from "@/components/blueprint/blueprint-proposal-queue";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { KnowledgeMiniGraph, type MiniGraphNode, type MiniGraphEdge } from "@/components/knowledge/mini-graph";
import { cn } from "@/lib/cn";

const INGESTION_TONE: Record<NonNullable<OrgKnowledge["capabilities"][number]["ingestion_status"]>, string> = {
  fresh:             "bg-[var(--success-soft)] text-[var(--success)]",
  debouncing:        "bg-[var(--primary-soft)] text-[var(--primary)]",
  stale_but_usable:  "bg-[var(--warning-soft)] text-[var(--warning)]",
  ingesting:         "bg-[var(--primary-soft)] text-[var(--primary)]",
  failed:            "bg-[var(--danger-soft)]  text-[var(--danger)]",
};

const CAP_LAYER: Record<string, number> = {
  cap_inbox:    0,
  cap_billing:  0,
  cap_data:     1,
  cap_platform: 2,
};

export default function OrgKnowledgePage() {
  const router = useRouter();
  const { activeOrgId, me } = useSession();
  const activeOrgName = me?.memberships.find((m) => m.orgId === activeOrgId)?.orgName ?? null;
  const [toc, setToc] = useState<BlueprintToc | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [section, setSection] = useState<BlueprintSection | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [proposals, setProposals] = useState<BlueprintSectionProposal[]>([]);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocError, setTocError] = useState<string | null>(null);
  const [sectionCache, setSectionCache] = useState<Record<string, BlueprintSection>>({});

  const [orgKnowledge, setOrgKnowledge] = useState<OrgKnowledge | null>(null);

  // TOC + proposals
  const refreshToc = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [t, p] = await Promise.all([
        api.blueprint.org.getToc(activeOrgId),
        api.blueprint.org.listProposals(activeOrgId).catch(() => [] as BlueprintSectionProposal[]),
      ]);
      setToc(t);
      setProposals(p);
      if (!activeKey && t.sections.length > 0) {
        setActiveKey(t.sections[0]!.section_key);
      }
      setTocError(null);
    } catch (e) {
      setTocError(e instanceof ApiError ? e.message : "Failed to load org Blueprint.");
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
        const s = await api.blueprint.org.getSection(activeOrgId, activeKey);
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

  // Org-level knowledge (registry + cross-cap + glossary/standards/policies).
  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    (async () => {
      try {
        const k = await api.orgs.knowledge(activeOrgId);
        if (!cancelled) setOrgKnowledge(k);
      } catch {
        // soft-fail; the page still works with Blueprint-only mode.
      }
    })();
    return () => { cancelled = true; };
  }, [activeOrgId]);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!activeOrgId || !activeKey) return;
    const updated = await api.blueprint.org.editSection(activeOrgId, activeKey, { body_markdown, change_note });
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, activeKey, refreshToc]);

  const handleLockToggle = useCallback(async () => {
    if (!activeOrgId || !activeKey || !section) return;
    const updated = section.locked
      ? await api.blueprint.org.unlockSection(activeOrgId, activeKey)
      : await api.blueprint.org.lockSection(activeOrgId, activeKey);
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, activeKey, section, refreshToc]);

  const handleRegenerate = useCallback(async () => {
    if (!activeOrgId || !activeKey) return;
    const updated = await api.blueprint.org.regenerateSection(activeOrgId, activeKey);
    if ("body_markdown" in updated) {
      setSection(updated);
      setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    await refreshToc();
  }, [activeOrgId, activeKey, refreshToc]);

  const handleProposalAccept = useCallback(async (proposal: BlueprintSectionProposal) => {
    if (!activeOrgId) return;
    const updated = await api.blueprint.org.acceptProposal(activeOrgId, proposal.id);
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, refreshToc]);

  const handleProposalEditAccept = useCallback(async (proposal: BlueprintSectionProposal, edited: string) => {
    if (!activeOrgId) return;
    const updated = await api.blueprint.org.editAndAcceptProposal(activeOrgId, proposal.id, { body_markdown: edited });
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [activeOrgId, refreshToc]);

  const handleProposalReject = useCallback(async (proposal: BlueprintSectionProposal, reason: string) => {
    if (!activeOrgId) return;
    await api.blueprint.org.rejectProposal(activeOrgId, proposal.id, { reason });
    await refreshToc();
  }, [activeOrgId, refreshToc]);

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
          What Athena knows about <strong>{activeOrgName ?? "your org"}</strong>: capability registry, cross-cap dependencies, glossary, standards, security policies — plus the editable org Blueprint.
        </p>
      </Stack>

      {/* 1. KPI tiles — single source: orgKnowledge.totals */}
      <Grid cols="auto-fit-180" gap="3">
        <StatTile icon={GitBranch}  label="Capabilities" value={orgKnowledge?.capabilities.length ?? "—"} hint={`${orgKnowledge?.totals.repos ?? "—"} repos indexed`} />
        <StatTile icon={Database}   label="KG nodes"     value={orgKnowledge ? orgKnowledge.totals.nodes.toLocaleString() : "—"} hint={`${orgKnowledge ? orgKnowledge.totals.edges.toLocaleString() : "—"} edges`} />
        <StatTile icon={ScrollText} label="Decisions"    value={orgKnowledge?.totals.decisions ?? "—"} hint={orgKnowledge && orgKnowledge.stale_decisions.length > 0 ? `${orgKnowledge.stale_decisions.length} stale` : "all current"} />
        <StatTile icon={HelpCircle} label="Open questions" value={orgKnowledge?.totals.open_questions ?? "—"} hint="across capabilities" />
        <StatTile icon={BookOpen}   label="Blueprint sections" value={toc?.sections.length ?? "—"} hint={`${proposals.length} pending proposal${proposals.length === 1 ? "" : "s"}`} />
      </Grid>

      {/* 2. Stale-decisions alert ----------------------------------------- */}
      {orgKnowledge && orgKnowledge.stale_decisions.length > 0 && (
        <Card className="border-[var(--warning)] bg-[var(--warning-soft)]">
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
              <span className="text-sm font-semibold text-[var(--warning)]">
                {orgKnowledge.stale_decisions.length} decision{orgKnowledge.stale_decisions.length === 1 ? "" : "s"} flagged stale
              </span>
            </Cluster>
            <Stack gap="1" as="ul">
              {orgKnowledge.stale_decisions.map((d) => (
                <li key={d.id} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-xs">
                  <Cluster gap="2" align="center">
                    <code className="font-mono text-[10px] font-semibold text-[var(--primary)]">{d.id}</code>
                    <span className="font-medium">{d.title}</span>
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">{d.last_reviewed}</span>
                  </Cluster>
                  <p className="text-[var(--text-muted)]">{d.reason}</p>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {/* 3. Approval queue, if any proposals pending --------------------- */}
      <BlueprintProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />

      {/* 4. Capability dependency graph (canonical visual + edge table) - */}
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">Capability dependencies</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">
              {orgKnowledge?.capabilities.length ?? 0} capabilities · {orgKnowledge?.cross_cap_dependencies.length ?? 0} cross-cap edges
            </span>
          </Cluster>
          <KnowledgeMiniGraph
            size="wide"
            nodes={buildOrgGraphNodes(orgKnowledge)}
            edges={buildOrgGraphEdges(orgKnowledge)}
            onSelect={(node) => {
              // Click a capability node → navigate to its detail page.
              router.push(`/capabilities/${encodeURIComponent(node.id)}`);
            }}
          />
          {orgKnowledge && orgKnowledge.cross_cap_dependencies.length > 0 && (
            <Stack gap="1" as="ul">
              {orgKnowledge.cross_cap_dependencies.map((d, i) => (
                <li
                  key={`${d.from_capability_id}->${d.to_capability_id}-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded border border-[var(--border)] px-2 py-1.5 text-xs"
                  title={d.evidence.join(" · ")}
                >
                  <span className="font-mono text-[var(--text-muted)]">{capLabel(d.from_capability_id, orgKnowledge)}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    {d.kind === "data" ? "→ data" : "⇢ control"}
                  </span>
                  <span className="font-mono text-[var(--text-muted)]">{capLabel(d.to_capability_id, orgKnowledge)}</span>
                  <span className="text-[var(--text-muted)]">{d.label}</span>
                  <Cluster gap="1" align="center" className="text-[10px] text-[var(--text-subtle)]">
                    {d.evidence.slice(0, 2).map((e) => (
                      <code key={e} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono">{e}</code>
                    ))}
                  </Cluster>
                </li>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      {/* 5. Main two-column: TOC + section viewer (no right rail) -------- */}
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
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
            <BlueprintTocSidebar
              sections={toc.sections}
              activeSectionKey={activeKey}
              onSelect={setActiveKey}
            />
          )}
        </aside>

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
            <BlueprintSectionViewer
              section={section}
              onEdit={() => setEditorOpen(true)}
              onLockToggle={handleLockToggle}
              onRegenerate={handleRegenerate}
              onViewRevisions={() => setRevisionsOpen(true)}
            />
          )}
        </div>
      </div>

      {/* 6. Capability registry (replaces right-rail capability list) --- */}
      {orgKnowledge && orgKnowledge.capabilities.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <Layers className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Capability registry</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">click a capability to open its detail page</span>
            </Cluster>
            <Stack gap="1.5" as="ul">
              {orgKnowledge.capabilities.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/capabilities/${c.id}`}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 no-underline transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <Stack gap="0" className="min-w-0">
                      <span className="text-sm font-semibold text-[var(--text)]">{c.name}</span>
                      <code className="font-mono text-[10px] text-[var(--text-subtle)]">/{c.slug}{c.lead_user_id ? ` · lead ${c.lead_user_id.replace(/^u_/, "")}` : ""}</code>
                    </Stack>
                    <span className="text-[10px] text-[var(--text-muted)]">{c.repos_indexed} repos</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{c.nodes_total.toLocaleString()} nodes</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{c.open_tasks} open · {c.material_changes_7d} material/7d</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", INGESTION_TONE[c.ingestion_status])}>
                      {c.ingestion_status}
                    </span>
                  </Link>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {/* 7. Cross-cutting navigation (compact rail) ---------------------- */}
      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">Related surfaces</span>
          </Cluster>
          <Grid cols="auto-fit-180" gap="2">
            <NavTile href="/rules"            icon={ScrollText} label="Rules & ADRs"      sub="org-wide" />
            <NavTile href="/skills"           icon={Wrench}     label="Skills inventory" sub="capability-attached" />
            <NavTile href="/mcp"              icon={Sparkles}   label="MCP servers"      sub="connected tools" />
            <NavTile href="/knowledge/graph"  icon={Network}    label="Knowledge graph"  sub="spatial canvas" />
          </Grid>
        </Stack>
      </Card>

      {section?.source_refs && section.source_refs.length > 0 && (
        <Card>
          <Stack gap="2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Active section sources
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

      {/* Drawers + modals */}
      <BlueprintSectionEditor
        section={editorOpen ? section : null}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditSave}
      />
      <BlueprintSectionRevisions
        open={revisionsOpen}
        sectionTitle={section?.title ?? ""}
        sectionKey={activeKey}
        load={(key) => (activeOrgId ? api.blueprint.org.getRevisions(activeOrgId, key) : Promise.resolve([]))}
        onClose={() => setRevisionsOpen(false)}
      />
      <BlueprintProposalDiffModal
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

function capLabel(capId: string, orgKnowledge: OrgKnowledge): string {
  return orgKnowledge.capabilities.find((c) => c.id === capId)?.name ?? capId;
}

function buildOrgGraphNodes(orgKnowledge: OrgKnowledge | null): MiniGraphNode[] {
  if (!orgKnowledge) return [];
  return orgKnowledge.capabilities.map((c) => ({
    id: c.id,
    label: c.name,
    kind: "capability",
    layer: CAP_LAYER[c.id] ?? 1,
    sublabel: `/${c.slug}`,
    badge: `${(c.nodes_total / 1000).toFixed(1)}k`,
    importance: 0.9,
  }));
}

function buildOrgGraphEdges(orgKnowledge: OrgKnowledge | null): MiniGraphEdge[] {
  if (!orgKnowledge) return [];
  return orgKnowledge.cross_cap_dependencies.map((d) => ({
    src: d.from_capability_id,
    dst: d.to_capability_id,
    label: d.label,
    style: d.kind === "control" ? "dashed" : "solid",
  }));
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
          <Icon className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        </Cluster>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {hint && <span className="text-[10px] text-[var(--text-muted)]">{hint}</span>}
      </Stack>
    </Card>
  );
}

function NavTile({ href, icon: Icon, label, sub }: { href: string; icon: typeof BookOpen; label: string; sub?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-xs no-underline transition-colors hover:bg-[var(--surface-2)]"
    >
      <Cluster gap="2" align="center">
        <Icon className="size-3.5 text-[var(--primary)]" aria-hidden />
        <Stack gap="0">
          <span className="font-semibold text-[var(--text)]">{label}</span>
          {sub && <span className="text-[10px] text-[var(--text-subtle)]">{sub}</span>}
        </Stack>
      </Cluster>
      <ArrowRight className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
    </Link>
  );
}
