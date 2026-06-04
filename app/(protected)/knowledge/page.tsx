"use client";

/**
 * /knowledge — Org knowledge surface (ADR-073 faceted-tab redesign).
 *
 * Universal shell: ScopeHeader + ScopeTabs + TabContent (no Breadcrumb at
 * org scope — it's the top of the hierarchy). Five universal tabs:
 *   - **Blueprint**  — 8 narrative sections (mission / standards / glossary
 *                      / security_policies / principles / compliance /
 *                      incident_history / change_log)
 *   - **Topology**   — TopologyHeader + cross-cap dependency graph + cap
 *                      registry (the only place to jump to a capability)
 *   - **Decisions**  — org-wide decision records + stale-decisions alert
 *   - **Activity**   — org-wide ingestion + runs + decision-edit timeline
 *   - **Operations** — cost / sync health / integrations / members /
 *                      audit preview / re-embed classifier metrics
 *
 * Canonical-home rule (ADR-073 §4):
 *   - Counts (nodes / edges / capabilities / decisions) live ONLY on
 *     TopologyHeader inside Topology — not in any KPI tile at the page
 *     top, not echoed inside cards.
 *   - Stale-decision alert lives ONLY on Decisions tab.
 *   - Cap dependency graph + registry live ONLY on Topology tab.
 *   - Cost / sync health / integrations / members / audit / reembed
 *     live ONLY on Operations tab.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, Layers } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import {
  api,
  ApiError,
  type ActivityEvent,
  type BlueprintSection,
  type BlueprintSectionProposal,
  type BlueprintToc,
  type DecisionRecord,
  type OrgKnowledge,
  type OrgOperationsData,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

import { ScopeHeader } from "@/components/scope/scope-header";
import { ScopeTabs, type AnyTab } from "@/components/scope/scope-tabs";
import { TopologyHeader } from "@/components/topology/topology-header";
import { DecisionsTab } from "@/components/decisions/decisions-tab";
import { ActivityTab as ActivityTabComponent } from "@/components/activity/activity-tab";
import { OperationsTab } from "@/components/operations/operations-tab";
import { BlueprintToc as BlueprintTocSidebar } from "@/components/blueprint/blueprint-toc";
import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import { pollBlueprintReady } from "@/lib/poll-blueprint-ready";
import { BlueprintSectionEditor } from "@/components/blueprint/blueprint-section-editor";
import { BlueprintSectionRevisions } from "@/components/blueprint/blueprint-section-revisions";
import { BlueprintProposalQueue } from "@/components/blueprint/blueprint-proposal-queue";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { TopologyExplorer } from "@/components/topology/explorer/topology-explorer";
import { seedOrg } from "@/components/topology/explorer/scope-seed";
import { OrgDashboardHeader } from "@/components/knowledge/org-dashboard-header";
import { cn } from "@/lib/cn";

type OrgTab = "blueprint" | "topology" | "decisions" | "activity" | "operations";
const ORG_TABS: OrgTab[] = ["blueprint", "topology", "decisions", "activity", "operations"];
function isOrgTab(s: string | null | undefined): s is OrgTab {
  return s != null && (ORG_TABS as string[]).includes(s);
}

const INGESTION_TONE: Record<NonNullable<OrgKnowledge["capabilities"][number]["ingestion_status"]>, string> = {
  fresh:             "bg-[var(--success-soft)] text-[var(--success-ink)]",
  debouncing:        "bg-[var(--primary-soft)] text-[var(--primary)]",
  stale_but_usable:  "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  ingesting:         "bg-[var(--primary-soft)] text-[var(--primary)]",
  failed:            "bg-[var(--danger-soft)]  text-[var(--danger-ink)]",
  // Batch 12k — degraded ingest landed, KG usable but missing signal.
  degraded:          "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

export default function OrgKnowledgePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeOrgId, me } = useSession();
  const activeOrgName = me?.memberships.find((m) => m.orgId === activeOrgId)?.orgName ?? null;
  const activeOrgSlug = me?.memberships.find((m) => m.orgId === activeOrgId)?.orgSlug ?? null;

  const tabParam = searchParams.get("tab");
  const tab: OrgTab = isOrgTab(tabParam) ? tabParam : "blueprint";

  const onTabChange = useCallback(
    (next: AnyTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", next);
      router.push(`/knowledge?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const [orgKnowledge, setOrgKnowledge] = useState<OrgKnowledge | null>(null);
  const [operations, setOperations] = useState<OrgOperationsData | null>(null);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  // Load all non-Blueprint datasets in parallel.
  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    (async () => {
      const [k, ops, dec, act] = await Promise.all([
        api.orgs.knowledge(activeOrgId).catch(() => null),
        api.orgs.operations(activeOrgId).catch(() => null),
        api.orgs.decisions(activeOrgId).catch(() => [] as DecisionRecord[]),
        api.orgs.activity(activeOrgId, { limit: 200 }).catch(() => [] as ActivityEvent[]),
      ]);
      if (cancelled) return;
      setOrgKnowledge(k);
      setOperations(ops);
      setDecisions(dec);
      setActivity(act);
    })();
    return () => { cancelled = true; };
  }, [activeOrgId]);

  // Derive freshness for the ScopeHeader pill from the worst child cap.
  const headerFreshness = useMemo(() => {
    if (!orgKnowledge || orgKnowledge.capabilities.length === 0) return "no_data" as const;
    const statuses = orgKnowledge.capabilities.map((c) => c.ingestion_status);
    if (statuses.some((s) => s === "failed")) return "failed" as const;
    if (statuses.some((s) => s === "ingesting" || s === "debouncing")) return "indexing" as const;
    if (statuses.some((s) => s === "stale_but_usable")) return "stale_minor" as const;
    return "fresh" as const;
  }, [orgKnowledge]);

  return (
    <Stack gap="4" className="min-h-full">
      <ScopeHeader
        scope="org"
        name={activeOrgName ?? "Org knowledge"}
        slug={activeOrgSlug ?? undefined}
        description="Everything Athena knows about your org — Blueprint, capability registry, cross-cap dependencies, decisions, activity, operational health."
        freshness={headerFreshness}
      />
      <ScopeTabs
        scope="org"
        activeTab={tab}
        onChange={onTabChange}
        badges={{
          decisions: decisions.length || undefined,
          activity:  activity.length  || undefined,
        }}
      />

      <div className="min-h-0">
        {tab === "blueprint"  && <BlueprintTab orgId={activeOrgId} orgKnowledge={orgKnowledge} />}
        {tab === "topology"   && <TopologyTab orgKnowledge={orgKnowledge} orgName={activeOrgName} />}
        {tab === "decisions"  && activeOrgId && (
          <DecisionsTab
            scope="org"
            scopeId={activeOrgId}
            decisions={decisions}
            staleAlerts={orgKnowledge?.stale_decisions ?? []}
            onRefresh={async () => {
              const next = await api.orgs.decisions(activeOrgId).catch(() => [] as DecisionRecord[]);
              setDecisions(next);
            }}
          />
        )}
        {tab === "activity"   && <ActivityTabComponent scope="org" events={activity} />}
        {tab === "operations" && (
          operations
            ? <OperationsTab
                cost={operations.cost}
                syncHealth={operations.sync_health}
                integrations={operations.integrations}
                members={operations.members}
                auditPreview={operations.audit_preview}
                reembed={operations.reembed}
              />
            : (
              <Stack gap="4" aria-busy="true" aria-label="Loading operations">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--surface-2)]" />
                  ))}
                </div>
                <div className="h-64 w-full animate-pulse rounded-lg bg-[var(--surface-2)]" />
              </Stack>
            )
        )}
      </div>
    </Stack>
  );
}

/* ============================== Blueprint tab ============================ */

function BlueprintTab({ orgId, orgKnowledge }: { orgId: string | null; orgKnowledge: OrgKnowledge | null }) {
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

  const refreshToc = useCallback(async () => {
    if (!orgId) return;
    try {
      const [t, p] = await Promise.all([
        api.blueprint.org.getToc(orgId),
        api.blueprint.org.listProposals(orgId).catch(() => [] as BlueprintSectionProposal[]),
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
  }, [orgId, activeKey]);

  useEffect(() => { void refreshToc(); }, [refreshToc]);

  useEffect(() => {
    if (!orgId || !activeKey) return;
    let cancelled = false;
    setSectionLoading(true);
    (async () => {
      try {
        const s = await api.blueprint.org.getSection(orgId, activeKey);
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
  }, [orgId, activeKey]);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!orgId || !activeKey) return;
    const updated = await api.blueprint.org.editSection(orgId, activeKey, { body_markdown, change_note });
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [orgId, activeKey, refreshToc]);

  const handleLockToggle = useCallback(async () => {
    if (!orgId || !activeKey || !section) return;
    const updated = section.locked
      ? await api.blueprint.org.unlockSection(orgId, activeKey)
      : await api.blueprint.org.lockSection(orgId, activeKey);
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [orgId, activeKey, section, refreshToc]);

  const handleRegenerate = useCallback(async () => {
    if (!orgId || !activeKey) return;
    const updated = await api.blueprint.org.regenerateSection(orgId, activeKey);
    if ("body_markdown" in updated) {
      setSection(updated);
      setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    // `portfolio` regenerates via the async agentic explorer — wait for the
    // build to finish (no-op for the synchronous single-shot sections).
    await pollBlueprintReady(async () => (await api.blueprint.org.getToc(orgId)).status);
    await refreshToc();
  }, [orgId, activeKey, refreshToc]);

  const handleProposalAccept = useCallback(async (proposal: BlueprintSectionProposal) => {
    if (!orgId) return;
    const updated = await api.blueprint.org.acceptProposal(orgId, proposal.id);
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [orgId, refreshToc]);

  const handleProposalEditAccept = useCallback(async (proposal: BlueprintSectionProposal, edited: string) => {
    if (!orgId) return;
    const updated = await api.blueprint.org.editAndAcceptProposal(orgId, proposal.id, { body_markdown: edited });
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [orgId, refreshToc]);

  const handleProposalReject = useCallback(async (proposal: BlueprintSectionProposal, reason: string) => {
    if (!orgId) return;
    await api.blueprint.org.rejectProposal(orgId, proposal.id, { reason });
    await refreshToc();
  }, [orgId, refreshToc]);

  if (tocError) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger-ink)]">{tocError}</p>
      </Card>
    );
  }

  return (
    <Stack gap="4">
      {/* Computed dashboard header band — portfolio Mermaid + org KG KPIs +
          clickable capability links (Phase D locked IA). */}
      {orgId && <OrgDashboardHeader orgId={orgId} orgKnowledge={orgKnowledge} />}
      <BlueprintProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-2)]">
          <div className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] shadow-[var(--inner-highlight)]">
            Sections
          </div>
          {toc === null ? (
            <div className="p-3">
              <Stack gap="2" aria-busy="true" aria-label="Loading TOC">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 animate-pulse rounded-md bg-[var(--surface-2)]" />
                ))}
              </Stack>
            </div>
          ) : (
            <BlueprintTocSidebar sections={toc.sections} activeSectionKey={activeKey} onSelect={setActiveKey} />
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
              <p className="text-sm text-[var(--danger-ink)]">{error}</p>
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

      <BlueprintSectionEditor
        section={editorOpen ? section : null}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditSave}
      />
      <BlueprintSectionRevisions
        open={revisionsOpen}
        sectionTitle={section?.title ?? ""}
        sectionKey={activeKey}
        load={(key) => (orgId ? api.blueprint.org.getRevisions(orgId, key) : Promise.resolve([]))}
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

/* ============================== Topology tab ============================= */

function TopologyTab({ orgKnowledge, orgName }: { orgKnowledge: OrgKnowledge | null; orgName: string | null }) {
  // Seed the unified explorer with the org root → one node per capability +
  // cross-cap edges. useMemo runs unconditionally (hook-order) — empty after.
  const seed = useMemo(
    () => (orgKnowledge ? seedOrg(orgKnowledge, { name: orgName ?? "Organization" }) : null),
    [orgKnowledge, orgName],
  );
  if (!orgKnowledge || !seed) {
    return (
      <Stack gap="4" aria-busy="true" aria-label="Loading topology">
        <div className="h-12 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        <Card variant="elevated" className="p-0 overflow-hidden">
          <div className="h-[420px] w-full animate-pulse bg-[var(--surface-2)]" />
        </Card>
      </Stack>
    );
  }
  return (
    <Stack gap="4">
      <TopologyHeader
        metrics={[
          { label: "capabilities", value: orgKnowledge.capabilities.length, emphasis: true },
          { label: "repos",        value: orgKnowledge.totals.repos },
          { label: "nodes",        value: orgKnowledge.totals.nodes },
          { label: "edges",        value: orgKnowledge.totals.edges },
          { label: "decisions",    value: orgKnowledge.totals.decisions, title: "Count only — full list on Decisions tab" },
          { label: "open Qs",      value: orgKnowledge.totals.open_questions },
        ]}
      />
      <TopologyExplorer seed={seed} scope="org" graphHeight={420} />
      {orgKnowledge.cross_cap_dependencies.length > 0 && (
        <Card>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Capability dependencies</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {orgKnowledge.cross_cap_dependencies.length} cross-cap edges
              </span>
            </Cluster>
            <Stack gap="1" as="ul">
              {orgKnowledge.cross_cap_dependencies.map((d, i) => (
                <li
                  key={`${d.from_capability_id}->${d.to_capability_id}-${i}`}
                  className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs transition-colors duration-150 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
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
          </Stack>
        </Card>
      )}
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <Layers className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">Capability registry</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">click a row to open its detail page</span>
          </Cluster>
          <Stack gap="1.5" as="ul">
            {orgKnowledge.capabilities.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/capabilities/${c.id}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 no-underline transition-[box-shadow,transform,background-color,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-2)]"
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
    </Stack>
  );
}

/* ============================== Helpers ================================= */

function capLabel(capId: string, orgKnowledge: OrgKnowledge): string {
  return orgKnowledge.capabilities.find((c) => c.id === capId)?.name ?? capId;
}
