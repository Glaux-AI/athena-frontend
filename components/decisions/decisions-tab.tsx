"use client";

/**
 * DecisionsTab — the canonical home for decision-record listings.
 *
 * Per ADR-073 §4: decision records live ONLY on the Decisions tab (filtered
 * by scope). Stale-decision alerts live ONLY on the Org Decisions tab.
 * Capability Decisions shows the capability-scoped records; Repo has no
 * Decisions tab today (see readiness checklist §5.29.10 Item 1c for the
 * pending override).
 *
 * §5.29.10 Item 1b — Each row now exposes Edit / Revert / Escalate actions
 * and the toolbar carries a working "+ New decision" button. The tab owns
 * the create/edit dialog and the refetch lifecycle so callers only pass
 * `scope` + `scopeId` + the current list.
 *
 * The list is virtualized for large orgs (>50 records).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ScrollText, Plus, Pencil, Undo2, ArrowUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import { api, ApiError, type DecisionRecord } from "@/lib/api/client";
import { DecisionRecordEditDialog } from "./decision-record-edit-dialog";

const KIND_TONE: Record<string, string> = {
  ADR:           "bg-[var(--primary-soft)] text-[var(--primary)]",
  Convention:    "bg-[var(--info-soft)]    text-[var(--info-ink)]",
  "Domain note": "bg-[var(--surface-2)]    text-[var(--text-muted)]",
};

interface StaleDecisionAlert {
  id: string;
  title: string;
  reason: string;
  last_reviewed: string;
}

interface DecisionsTabProps {
  scope: "org" | "capability" | "repo";
  /** Org id when scope === "org", capability id when scope === "capability",
   *  repo id (underlying `repos.id`, not the per-cap attachment id) when
   *  scope === "repo". §5.29.10 row 1c overrides ADR-073 §4 to give
   *  repos a first-class Decisions tab. */
  scopeId: string;
  decisions: readonly DecisionRecord[];
  /** Org scope only — banner of decisions flagged by decision_record_health. */
  staleAlerts?: readonly StaleDecisionAlert[];
  /** Re-fetches the list after a create / edit / revert / escalate. The
   *  parent owns the fetch, so it passes its own loader in. */
  onRefresh: () => Promise<void> | void;
}

type ActionState =
  | { kind: "idle" }
  | { kind: "create" }
  | { kind: "edit"; record: DecisionRecord };

export function DecisionsTab({ scope, scopeId, decisions, staleAlerts, onRefresh }: DecisionsTabProps) {
  const [activeKind, setActiveKind] = useState<"all" | "ADR" | "Convention" | "Domain note">("all");
  const [action, setAction] = useState<ActionState>({ kind: "idle" });
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (activeKind === "all" ? decisions : decisions.filter((d) => d.kind === activeKind)),
    [decisions, activeKind],
  );

  const runRowAction = async (
    record: DecisionRecord,
    fn: () => Promise<unknown>,
    successCopy: string,
    failureCopy: string,
  ) => {
    setPendingId(record.id);
    try {
      await fn();
      toast.success(successCopy);
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : failureCopy);
    } finally {
      setPendingId(null);
    }
  };

  const nsFor = (s: "org" | "capability" | "repo") =>
    s === "org" ? api.orgs.decisionList
      : s === "capability" ? api.capabilities.decisionList
      : api.repos.decisionList;
  const onRevert = (record: DecisionRecord) => {
    return runRowAction(record, () => nsFor(scope).revert(scopeId, record.id), "Decision reverted.", "Couldn't revert decision.");
  };
  const onEscalate = (record: DecisionRecord) => {
    return runRowAction(record, () => nsFor(scope).escalate(scopeId, record.id), "Decision escalated.", "Couldn't escalate decision.");
  };

  return (
    <Stack gap="4">
      {scope === "org" && staleAlerts && staleAlerts.length > 0 && (
        <Card className="border-[var(--warning)] bg-[var(--warning-soft)]">
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--warning-ink)]" aria-hidden />
              <span className="text-sm font-semibold text-[var(--warning-ink)]">
                {staleAlerts.length} decision{staleAlerts.length === 1 ? "" : "s"} flagged stale by{" "}
                <code className="font-mono text-[10px]">decision_record_health</code>
              </span>
            </Cluster>
            <Stack gap="1" as="ul">
              {staleAlerts.map((d) => (
                <li
                  key={d.id}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-xs"
                >
                  <Cluster gap="2" align="center">
                    <code className="font-mono text-[10px] font-semibold text-[var(--primary)]">{d.id}</code>
                    <Link
                      href={`/decisions/${encodeURIComponent(d.id)}`}
                      className="font-medium text-[var(--text)] no-underline hover:underline"
                    >
                      {d.title}
                    </Link>
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                      reviewed {Number.isNaN(Date.parse(d.last_reviewed)) ? d.last_reviewed : formatRelativeTime(d.last_reviewed)}
                    </span>
                  </Cluster>
                  <p className="text-[var(--text-muted)]">{d.reason}</p>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      <Cluster gap="2" align="center">
        <ScrollText className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">
          Decisions {scope === "org" ? "(org-wide)" : scope === "capability" ? "(this capability)" : "(this repo)"}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {filtered.length} of {decisions.length}
        </span>
        <Cluster gap="1" align="center" className="ml-auto">
          {(["all", "ADR", "Convention", "Domain note"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setActiveKind(k)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                activeKind === k
                  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAction({ kind: "create" })}
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Plus className="size-3" aria-hidden /> New decision
          </button>
        </Cluster>
      </Cluster>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">
            No decisions recorded. Add an ADR or promote a chat insight.
          </p>
        </Card>
      ) : (
        <VirtualList
          items={filtered}
          estimatedItemHeight={108}
          ariaLabel="Decisions"
          getKey={(d) => d.id}
          renderItem={(d) => (
            <Card className="!p-3">
              <Stack gap="1">
                <Cluster gap="2" align="center">
                  <code className="font-mono text-[10px] font-semibold text-[var(--primary)]">{d.tag || d.id}</code>
                  <Link
                    href={`/decisions/${encodeURIComponent(d.id)}`}
                    className="font-medium text-sm text-[var(--text)] no-underline hover:underline"
                  >
                    {d.title}
                  </Link>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                      KIND_TONE[d.kind] ?? "bg-[var(--surface-2)] text-[var(--text-subtle)]",
                    )}
                  >
                    {d.kind}
                  </span>
                  <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                    {d.author} · {d.date}
                  </span>
                </Cluster>
                <p className="text-xs leading-relaxed text-[var(--text-muted)] line-clamp-3">{d.summary}</p>
                <Cluster gap="1" align="center" className="pt-1">
                  <button
                    type="button"
                    onClick={() => setAction({ kind: "edit", record: d })}
                    disabled={pendingId === d.id}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
                  >
                    <Pencil className="size-3" aria-hidden /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevert(d)}
                    disabled={pendingId === d.id}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
                  >
                    {pendingId === d.id ? <Loader2 className="size-3 animate-spin" /> : <Undo2 className="size-3" aria-hidden />}
                    Revert
                  </button>
                  <button
                    type="button"
                    onClick={() => onEscalate(d)}
                    disabled={pendingId === d.id || d.kind === "ADR"}
                    title={d.kind === "ADR" ? "Already at the highest rung" : "Escalate to the next rung (Domain note → Convention → ADR)"}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ArrowUp className="size-3" aria-hidden /> Escalate
                  </button>
                </Cluster>
              </Stack>
            </Card>
          )}
        />
      )}

      <DecisionRecordEditDialog
        open={action.kind !== "idle"}
        onOpenChange={(o) => { if (!o) setAction({ kind: "idle" }); }}
        scope={scope}
        scopeId={scopeId}
        mode={action.kind === "edit" ? "edit" : "create"}
        existing={action.kind === "edit" ? action.record : null}
        onSaved={onRefresh}
      />
    </Stack>
  );
}
