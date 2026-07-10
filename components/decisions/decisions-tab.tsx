"use client";

/**
 * DecisionsTab - the canonical home for decision-record listings.
 *
 * Per ADR-073 §4: decision records live ONLY on the Decisions tab (filtered
 * by scope). Stale-decision alerts live ONLY on the Org Decisions tab.
 * Domain Decisions shows the domain-scoped records; Repo has no
 * Decisions tab today (see readiness checklist §5.29.10 Item 1c for the
 * pending override).
 *
 * §5.29.10 Item 1b - Each row now exposes Edit / Revert / Escalate actions
 * and the toolbar carries a working "+ New decision" button. The tab owns
 * the create/edit dialog and the refetch lifecycle so callers only pass
 * `scope` + `scopeId` + the current list.
 *
 * The list is virtualized for large orgs (>50 records).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ScrollText, Plus, Pencil, Undo2, ArrowUp, Loader2, MoreVertical, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import { api, ApiError, type DecisionRecord } from "@/lib/api/client";
import { DecisionRecordEditDialog } from "./decision-record-edit-dialog";

const KIND_TONE: Record<string, PillTone> = {
  ADR:           "primary",
  Convention:    "info",
  // Matches the rules-page vocabulary - Domain note is the neutral rung.
  "Domain note": "neutral",
};

interface StaleDecisionAlert {
  id: string;
  title: string;
  reason: string;
  last_reviewed: string;
}

interface DecisionsTabProps {
  scope: "org" | "domain" | "repo";
  /** Org id when scope === "org", domain id when scope === "domain",
   *  repo id (underlying `repos.id`, not the per-cap attachment id) when
   *  scope === "repo". §5.29.10 row 1c overrides ADR-073 §4 to give
   *  repos a first-class Decisions tab. */
  scopeId: string;
  decisions: readonly DecisionRecord[];
  /** Org scope only - banner of decisions flagged by decision_record_health. */
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

  const nsFor = (s: "org" | "domain" | "repo") =>
    s === "org" ? api.orgs.decisionList
      : s === "domain" ? api.domains.decisionList
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
                <code className="font-mono text-micro">decision_record_health</code>
              </span>
            </Cluster>
            <Stack gap="1" as="ul">
              {staleAlerts.map((d) => (
                <li
                  key={d.id}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-xs"
                >
                  <Cluster gap="2" align="center">
                    <code className="font-mono text-micro font-semibold text-[var(--primary)]">{d.id}</code>
                    <Link
                      href={`/decisions/${encodeURIComponent(d.id)}`}
                      className="font-medium text-[var(--text)] no-underline hover:underline"
                    >
                      {d.title}
                    </Link>
                    <span className="ml-auto text-micro text-[var(--text-subtle)]">
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
          Decisions {scope === "org" ? "(org-wide)" : scope === "domain" ? "(this domain)" : "(this repo)"}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {filtered.length} of {decisions.length}
        </span>
        <Cluster gap="2" align="center" className="ml-auto">
          <Segmented
            ariaLabel="Filter decisions by kind"
            size="sm"
            options={[
              { value: "all", label: "All" },
              { value: "ADR", label: "ADR" },
              { value: "Convention", label: "Convention" },
              { value: "Domain note", label: "Domain note" },
            ]}
            value={activeKind}
            onChange={setActiveKind}
          />
          <Button size="sm" variant="secondary" onClick={() => setAction({ kind: "create" })}>
            <Plus className="size-3" aria-hidden /> New decision
          </Button>
        </Cluster>
      </Cluster>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-6" aria-hidden />}
          title="No decisions recorded"
          description="Add an ADR or promote a chat insight to capture the decisions agents read on every phase."
        />
      ) : (
        <VirtualList
          items={filtered}
          estimatedItemHeight={108}
          ariaLabel="Decisions"
          getKey={(d) => d.id}
          renderItem={(d) => (
            <Card className="!p-3">
              <Stack gap="1">
                <Cluster gap="2" align="center" className="flex-nowrap">
                  <code className="font-mono text-micro font-semibold text-[var(--primary)]">{d.tag || d.id}</code>
                  <Link
                    href={`/decisions/${encodeURIComponent(d.id)}`}
                    className="min-w-0 truncate font-medium text-sm text-[var(--text)] no-underline hover:underline"
                  >
                    {d.title}
                  </Link>
                  <Pill size="sm" tone={KIND_TONE[d.kind] ?? "neutral"}>{d.kind}</Pill>
                  <span className="ml-auto text-micro text-[var(--text-subtle)]">
                    {d.author} · {d.date}
                  </span>
                  <DecisionRowMenu
                    record={d}
                    pending={pendingId === d.id}
                    onEdit={() => setAction({ kind: "edit", record: d })}
                    onRevert={() => { void onRevert(d); }}
                    onEscalate={() => { void onEscalate(d); }}
                  />
                </Cluster>
                <p className="text-xs leading-relaxed text-[var(--text-muted)] line-clamp-3">{d.summary}</p>
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

/**
 * DecisionRowMenu - the `⋮` kebab on each decision row. Tucks
 * Edit / Revert / Escalate behind a glass-panel menu (same pattern the
 * Blueprint section card uses) so the list reads calm. Outside-click +
 * Escape close; the trigger shows the spinner while a mutation runs.
 */
function DecisionRowMenu({
  record,
  pending,
  onEdit,
  onRevert,
  onEscalate,
}: {
  record: DecisionRecord;
  pending: boolean;
  onEdit: () => void;
  onRevert: () => void;
  onEscalate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
      ?.focus();
  }, [open]);

  const items: Array<{ key: string; Icon: LucideIcon; label: string; onSelect: () => void; disabled: boolean; title?: string | undefined }> = [
    { key: "edit", Icon: Pencil, label: "Edit", onSelect: onEdit, disabled: pending },
    { key: "revert", Icon: Undo2, label: "Revert", onSelect: onRevert, disabled: pending },
    {
      key: "escalate",
      Icon: ArrowUp,
      label: "Escalate",
      onSelect: onEscalate,
      disabled: pending || record.kind === "ADR",
      title: record.kind === "ADR" ? "Already at the highest rung" : "Escalate to the next rung (Domain note → Convention → ADR)",
    },
  ];

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${record.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)]",
          "transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <MoreVertical className="size-3.5" aria-hidden />}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={`Actions for ${record.title}`}
          className="glass-panel absolute right-0 top-full z-[var(--z-popover)] mt-1 w-44 overflow-hidden py-1"
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={it.disabled}
              title={it.title}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text)]",
                "transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]",
                "focus:bg-[var(--surface-2)] focus:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
              )}
            >
              <it.Icon className="size-3.5 text-[var(--text-muted)]" aria-hidden />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
