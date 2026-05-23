"use client";

/**
 * DecisionListPane — F-04.7 sidebar tab on `/runs/[id]`.
 *
 * Chronological list of all `run_decisions` for the current run. Filterable
 * by status / scope_kind / kind / who_kind. The pane manages its own filter
 * state, fetches via `api.runs.decisionList.list`, and forwards row actions
 * (revert / escalate / edit) to the appropriate API verbs.
 *
 * Top-of-pane summary shows active / superseded / reverted counts +
 * high-impact ratio so reviewers can scan the run's "decision density" at a
 * glance. The "+ Add decision" button opens DecisionAddModal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Filter, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api/client";
import type {
  RunDecisionCreateRequest,
  RunDecisionKind,
  RunDecisionListFilters,
  RunDecisionPatchRequest,
  RunDecisionRow as DecisionRowData,
  RunDecisionScopeKind,
  RunDecisionStatus,
} from "@/lib/api/client";
import { DecisionRow } from "./decision-row";
import { DecisionAddModal } from "./decision-add-modal";
import { DecisionEditDrawer } from "./decision-edit-drawer";

export interface DecisionListPaneProps {
  runId: string;
  /** Optional section-anchor presets surfaced in the Add modal's section picker. */
  sectionAnchors?: Array<{ anchor_id: string; label: string; doc_id: string | null }>;
}

const STATUS_FILTERS: Array<{ id: RunDecisionStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "superseded", label: "Superseded" },
  { id: "reverted", label: "Reverted" },
];

const SCOPE_FILTERS: Array<{ id: RunDecisionScopeKind | "all"; label: string }> = [
  { id: "all", label: "Any scope" },
  { id: "global", label: "Global" },
  { id: "section", label: "Section" },
  { id: "selection", label: "Selection" },
];

const KIND_FILTERS: Array<{ id: RunDecisionKind | "all"; label: string }> = [
  { id: "all", label: "Any kind" },
  { id: "improve", label: "Improve" },
  { id: "manual_edit", label: "Manual edit" },
  { id: "approve", label: "Approve" },
  { id: "choice", label: "Choice" },
  { id: "comment", label: "Comment" },
  { id: "user_decision", label: "User decision" },
];

const WHO_FILTERS: Array<{ id: "agent" | "human" | "all"; label: string }> = [
  { id: "all", label: "Anyone" },
  { id: "agent", label: "Agents" },
  { id: "human", label: "Humans" },
];

export function DecisionListPane({ runId, sectionAnchors }: DecisionListPaneProps) {
  const [rows, setRows] = useState<DecisionRowData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DecisionRowData | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<RunDecisionStatus | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<RunDecisionScopeKind | "all">("all");
  const [kindFilter, setKindFilter] = useState<RunDecisionKind | "all">("all");
  const [whoFilter, setWhoFilter] = useState<"agent" | "human" | "all">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const filters: RunDecisionListFilters = {};
      if (statusFilter !== "all") filters.status = statusFilter;
      if (scopeFilter !== "all") filters.scope_kind = scopeFilter;
      if (kindFilter !== "all") filters.kind = kindFilter;
      if (whoFilter !== "all") filters.who_kind = whoFilter;
      const list = await api.runs.decisionList.list(runId, filters);
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load decisions.");
    } finally {
      setLoading(false);
    }
  }, [runId, statusFilter, scopeFilter, kindFilter, whoFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.status === "active").length;
    const superseded = rows.filter((r) => r.status === "superseded").length;
    const reverted = rows.filter((r) => r.status === "reverted").length;
    const high = rows.filter((r) => r.status === "active" && r.impact === "high").length;
    return { active, superseded, reverted, high };
  }, [rows]);

  const handleCreate = async (body: RunDecisionCreateRequest) => {
    try {
      await api.runs.decisionList.create(runId, body);
      toast.success("Decision added.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't add the decision.");
    }
  };

  const handleEdit = async (decisionId: string, body: RunDecisionPatchRequest) => {
    try {
      await api.runs.decisionList.patch(runId, decisionId, body);
      toast.success("Decision updated — original is now superseded.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the decision.");
    }
  };

  const handleRevert = async (decision: DecisionRowData) => {
    try {
      await api.runs.decisionList.revert(runId, decision.id);
      toast.success("Decision reverted.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't revert.");
    }
  };

  const handleEscalate = async (decision: DecisionRowData) => {
    try {
      await api.runs.decisionList.escalate(runId, decision.id);
      toast.success("Escalated to high impact.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't escalate.");
    }
  };

  const bySupersededId = useMemo(() => {
    const m: Record<string, DecisionRowData | undefined> = {};
    for (const r of rows) m[r.id] = r;
    return m;
  }, [rows]);

  return (
    <Card className="p-0">
      <Cluster justify="between" align="center" className="border-b border-[var(--border)] px-4 py-3">
        <Stack gap="0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Decisions
          </span>
          <span className="text-sm font-semibold">
            {summary.active} active, {summary.superseded} superseded, {summary.reverted} reverted
            {summary.high > 0 && (
              <span className="ml-1 text-[var(--text-muted)]">· {summary.high} high-impact</span>
            )}
          </span>
        </Stack>
        <Cluster gap="2">
          <Button size="sm" variant="ghost" onClick={refresh} aria-label="Refresh">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add decision
          </Button>
        </Cluster>
      </Cluster>

      <Stack gap="2" className="border-b border-[var(--border)] px-4 py-2">
        <Cluster gap="1" align="center" className="text-xs text-[var(--text-muted)]">
          <Filter className="size-3" aria-hidden />
          <span>Filter</span>
        </Cluster>
        <Cluster gap="1.5" align="center" className="flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              aria-pressed={statusFilter === f.id}
              data-filter-status={f.id}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                statusFilter === f.id
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </Cluster>
        <Cluster gap="1.5" align="center" className="flex-wrap">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
            aria-label="Filter by scope"
          >
            {SCOPE_FILTERS.map((f) => (<option key={f.id} value={f.id}>{f.label}</option>))}
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
            aria-label="Filter by kind"
          >
            {KIND_FILTERS.map((f) => (<option key={f.id} value={f.id}>{f.label}</option>))}
          </select>
          <select
            value={whoFilter}
            onChange={(e) => setWhoFilter(e.target.value as typeof whoFilter)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
            aria-label="Filter by author kind"
          >
            {WHO_FILTERS.map((f) => (<option key={f.id} value={f.id}>{f.label}</option>))}
          </select>
        </Cluster>
      </Stack>

      <div className="max-h-[640px] overflow-y-auto p-3">
        {error && (
          <div className="mb-2 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
        {loading && rows.length === 0 ? (
          <Stack gap="2" aria-busy="true" aria-label="Loading decisions">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-md bg-[var(--surface-2)]" />
            ))}
          </Stack>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">
            <Cluster gap="2" align="center"><CheckCircle2 className="size-3.5 text-[var(--success)]" aria-hidden />No decisions match the current filters.</Cluster>
          </p>
        ) : (
          <Stack gap="2" as="ul" data-decision-list>
            {rows.map((d) => (
              <DecisionRow
                key={d.id}
                decision={d}
                bySupersededId={bySupersededId}
                onEdit={(r) => setEditing(r)}
                onRevert={handleRevert}
                onEscalate={handleEscalate}
              />
            ))}
          </Stack>
        )}
      </div>

      <DecisionAddModal
        open={addOpen}
        {...(sectionAnchors ? { sectionAnchors } : {})}
        onSubmit={handleCreate}
        onClose={() => setAddOpen(false)}
      />
      <DecisionEditDrawer
        decision={editing}
        history={rows}
        onSubmit={handleEdit}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}
