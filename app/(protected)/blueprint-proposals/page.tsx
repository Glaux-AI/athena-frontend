"use client";

/**
 * /blueprint-proposals — org-wide Blueprint approval queue (§5.29.9).
 *
 * Lists every pending AI-proposed section update across org / capability /
 * repo Blueprints in one place so reviewers don't have to walk each scope.
 * Filters by status (pending | accepted | rejected | all) and scope_kind.
 * Per-row "Review" opens the existing `<BlueprintProposalDiffModal>` —
 * the modal handles Accept / Edit-and-accept / Reject end-to-end, then
 * we refetch.
 *
 * Wires to:
 *   GET  /v1/blueprint-proposals?status=&scope_kind=&scope_id=
 *   POST /v1/blueprint-proposals/{id}/{accept,edit-accept,reject}
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileCheck2, GitBranch, Network, Layers, Loader2, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type BlueprintProposalStatus, type BlueprintSectionProposal } from "@/lib/api/client";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { cn } from "@/lib/cn";

type StatusFilter = "pending" | "accepted" | "rejected" | "all";
type ScopeFilter = "all" | "org" | "capability" | "repo";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "pending",  label: "Pending"  },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "all",      label: "All"      },
];

const SCOPE_FILTERS: { id: ScopeFilter; label: string }[] = [
  { id: "all",        label: "All scopes" },
  { id: "org",        label: "Org"        },
  { id: "capability", label: "Capability" },
  { id: "repo",       label: "Repo"       },
];

export default function BlueprintProposalsPage() {
  const [proposals, setProposals] = useState<BlueprintSectionProposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSeed, setReviewSeed] = useState<BlueprintSectionProposal | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const body = await api.blueprintProposals.list({
        status: statusFilter,
        ...(scopeFilter !== "all" ? { scope_kind: scopeFilter } : {}),
      });
      setProposals(body);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load proposals.");
    }
  }, [statusFilter, scopeFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Reviewer modal payload — when the user clicks "Review" on a row we
   * scope the modal to that single proposal so the prev/next buttons in
   * the modal don't surprise them by walking the whole org queue. */
  const reviewList = useMemo(
    () => (reviewSeed ? [reviewSeed] : []),
    [reviewSeed],
  );

  const onAccept = useCallback(async (p: BlueprintSectionProposal) => {
    await api.blueprintProposals.accept(p.id);
    await refresh();
  }, [refresh]);

  const onEditAndAccept = useCallback(async (p: BlueprintSectionProposal, edited: string) => {
    await api.blueprintProposals.editAccept(p.id, { body_markdown: edited });
    await refresh();
  }, [refresh]);

  const onReject = useCallback(async (p: BlueprintSectionProposal, reason: string) => {
    await api.blueprintProposals.reject(p.id, { reason });
    await refresh();
  }, [refresh]);

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Cluster gap="2" align="center">
          <FileCheck2 className="size-5 text-[var(--primary)]" aria-hidden />
          <GradientText as="h1" className="text-2xl font-semibold">Blueprint approvals</GradientText>
        </Cluster>
        <p className="text-sm text-[var(--text-muted)]">
          AI-proposed section updates across every org, capability, and repo
          Blueprint in one queue. Accept, edit, or reject — your team owns the
          narrative.
        </p>
      </Stack>

      <FilterBar
        status={statusFilter}
        onStatusChange={setStatusFilter}
        scope={scopeFilter}
        onScopeChange={setScopeFilter}
      />

      {error ? (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      ) : proposals === null ? (
        <ProposalsSkeleton />
      ) : proposals.length === 0 ? (
        <ProposalsEmptyState statusFilter={statusFilter} />
      ) : (
        <Stack gap="2" as="ul">
          {proposals.map((p) => (
            <li key={p.id}>
              <ProposalRow
                proposal={p}
                onReview={() => { setReviewSeed(p); setReviewOpen(true); }}
              />
            </li>
          ))}
        </Stack>
      )}

      <BlueprintProposalDiffModal
        open={reviewOpen}
        proposals={reviewList}
        resolveCurrentSection={() => null /* full body lives on the scope page; this queue compares against an empty current to keep the queue light */}
        onAccept={onAccept}
        onEditAndAccept={onEditAndAccept}
        onReject={onReject}
        onClose={() => { setReviewOpen(false); setReviewSeed(null); }}
      />
    </Stack>
  );
}

/* ============================ Sub-components ============================ */

function FilterBar({
  status,
  onStatusChange,
  scope,
  onScopeChange,
}: {
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  scope: ScopeFilter;
  onScopeChange: (s: ScopeFilter) => void;
}) {
  return (
    <Cluster gap="4" align="center" className="flex-wrap">
      <FilterChipGroup label="Status" active={status} onChange={onStatusChange} options={STATUS_FILTERS} />
      <FilterChipGroup label="Scope"  active={scope}  onChange={onScopeChange}  options={SCOPE_FILTERS} />
    </Cluster>
  );
}

function FilterChipGroup<T extends string>({
  label,
  active,
  onChange,
  options,
}: {
  label: string;
  active: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5 shadow-[var(--shadow-1)]">
      <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            o.id === active
              ? "bg-[var(--primary)] text-[var(--primary-fg)] shadow-[var(--shadow-1)]"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ProposalRow({
  proposal,
  onReview,
}: {
  proposal: BlueprintSectionProposal;
  onReview: () => void;
}) {
  const scopeIcon = scopeIconFor(proposal.scope_kind);
  return (
    <Card className="transition-[box-shadow,transform,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-2)]">
      <Cluster justify="between" align="start" gap="3">
        <Stack gap="1" className="min-w-0 flex-1">
          <Cluster gap="2" align="center">
            <ScopeChip scope_kind={proposal.scope_kind} icon={scopeIcon} />
            <StatusPill status={proposal.status} />
            <span className="truncate text-sm font-semibold">
              {proposal.section_title ?? proposal.section_key}
            </span>
          </Cluster>
          <p className="text-xs text-[var(--text-muted)]">{proposal.reason}</p>
          {proposal.diff_summary && (
            <p className="text-[10px] text-[var(--text-subtle)]">{proposal.diff_summary}</p>
          )}
          <span className="text-[10px] text-[var(--text-subtle)]">
            Proposed {prettyTime(proposal.proposed_at)}
          </span>
        </Stack>
        <Cluster gap="2" align="center">
          {proposal.status === "pending" && (
            <Button size="sm" onClick={onReview}>Review</Button>
          )}
          <ScopeDeepLink proposal={proposal} />
        </Cluster>
      </Cluster>
    </Card>
  );
}

function ScopeChip({ scope_kind, icon: Icon }: { scope_kind: BlueprintSectionProposal["scope_kind"]; icon: typeof Network }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      <Icon className="size-3" aria-hidden />
      {scope_kind ?? "scope"}
    </span>
  );
}

function StatusPill({ status }: { status: BlueprintProposalStatus }) {
  const map: Record<BlueprintProposalStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pending:    { label: "Pending",    cls: "bg-[var(--primary-soft)] text-[var(--primary)]",   Icon: Loader2 },
    accepted:   { label: "Accepted",   cls: "bg-[var(--success-soft)] text-[var(--success-ink)]",   Icon: CheckCircle2 },
    rejected:   { label: "Rejected",   cls: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",     Icon: XCircle },
    superseded: { label: "Superseded", cls: "bg-[var(--surface-2)] text-[var(--text-muted)]",   Icon: CheckCircle2 },
    obsolete:   { label: "Obsolete",   cls: "bg-[var(--surface-2)] text-[var(--text-muted)]",   Icon: CheckCircle2 },
  };
  const { label, cls, Icon } = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", cls)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function ScopeDeepLink({ proposal }: { proposal: BlueprintSectionProposal }) {
  /* Best-effort: the cross-scope endpoint returns blueprint_id but not the
   * owning capability_id / repo_id. The page-scope deep link is therefore
   * disabled when we don't know the scope_id; clicking through to the
   * Blueprint pane stays a follow-up. */
  if (proposal.scope_kind === "org") {
    return (
      <Button size="sm" variant="ghost" asChild>
        <Link href="/knowledge?tab=blueprint">Open in context</Link>
      </Button>
    );
  }
  return null;
}

function ProposalsEmptyState({ statusFilter }: { statusFilter: StatusFilter }) {
  return (
    <EmptyState
      icon={<CheckCircle2 className="size-6 text-[var(--success)]" aria-hidden />}
      title="All caught up"
      description={
        statusFilter === "pending"
          ? "No pending proposals — Athena will queue new ones here as sync detects changes."
          : `No proposals match the "${statusFilter}" filter.`
      }
    />
  );
}

function ProposalsSkeleton() {
  return (
    <Stack gap="2" aria-busy="true" aria-label="Loading proposals">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 w-full animate-pulse rounded-lg bg-[var(--surface-2)]" />
      ))}
    </Stack>
  );
}

/* ================================ Helpers ================================ */

function scopeIconFor(kind: BlueprintSectionProposal["scope_kind"]): typeof Network {
  switch (kind) {
    case "org":        return Network;
    case "capability": return Layers;
    case "repo":       return GitBranch;
    default:           return Network;
  }
}

function prettyTime(iso: string): string {
  try {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const diffH = Math.round(diffMs / 3_600_000);
    if (diffH < 1) return "just now";
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}
