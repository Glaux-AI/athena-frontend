"use client";

/**
 * DecisionRow — one row in the decision-list pane (F-04.7).
 *
 * Per-row chrome (see frontend-fixes.md F-04.7):
 *   - Author avatar + name (agent badge for agent decisions)
 *   - Kind badge (Improve / Approve / Reject / Comment / User decision /
 *     Manual edit / Choice / Note / Regenerate / Handoff)
 *   - Scope chip: "Global" | "Section: <anchor preview>" | "Selection in <doc>"
 *   - Title + 1-line summary; expandable for full body
 *   - Impact pill (high / medium / low)
 *   - Status decoration: superseded rows show muted with arrow to the
 *     superseding row's id
 *   - Actions on hover: Revert / Escalate / Edit (gated on user_editable)
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CornerUpRight,
  Edit3,
  Flame,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import type {
  RunDecisionImpact,
  RunDecisionKind,
  RunDecisionRow as DecisionRowData,
} from "@/lib/api/client";

const KIND_STYLES: Record<RunDecisionKind, { label: string; tone: string; icon: LucideIcon | null }> = {
  choice:        { label: "Choice",        tone: "bg-[var(--info-soft)] text-[var(--info)]",      icon: null },
  regenerate:    { label: "Regenerate",    tone: "bg-[var(--info-soft)] text-[var(--info)]",      icon: null },
  approve:       { label: "Approve",       tone: "bg-[var(--success-soft)] text-[var(--success)]",icon: null },
  reject:        { label: "Reject",        tone: "bg-[var(--danger-soft)] text-[var(--danger)]",  icon: null },
  handoff:       { label: "Handoff",       tone: "bg-[var(--surface-2)] text-[var(--text-muted)]",icon: null },
  note:          { label: "Note",          tone: "bg-[var(--surface-2)] text-[var(--text-muted)]",icon: null },
  improve:       { label: "Improve",       tone: "bg-[var(--primary-soft)] text-[var(--primary)]",icon: null },
  manual_edit:   { label: "Manual edit",   tone: "bg-[var(--primary-soft)] text-[var(--primary)]",icon: Edit3 },
  comment:       { label: "Comment",       tone: "bg-[var(--info-soft)] text-[var(--info)]",      icon: null },
  user_decision: { label: "User decision", tone: "bg-[var(--warning-soft)] text-[var(--warning)]",icon: null },
};

const IMPACT_TONES: Record<RunDecisionImpact, string> = {
  high:   "bg-[var(--danger-soft)] text-[var(--danger)]",
  medium: "bg-[var(--warning-soft)] text-[var(--warning)]",
  low:    "bg-[var(--surface-2)] text-[var(--text-muted)]",
};

export interface DecisionRowProps {
  decision: DecisionRowData;
  /** Look-up of all decisions in the run by id — drives the supersedure arrow. */
  bySupersededId?: Record<string, DecisionRowData | undefined>;
  onEdit?: (decision: DecisionRowData) => void;
  onRevert?: (decision: DecisionRowData) => Promise<void> | void;
  onEscalate?: (decision: DecisionRowData) => Promise<void> | void;
}

export function DecisionRow({
  decision,
  bySupersededId,
  onEdit,
  onRevert,
  onEscalate,
}: DecisionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<null | "revert" | "escalate">(null);
  const kind = KIND_STYLES[decision.kind];
  const superseder = bySupersededId
    ? Object.values(bySupersededId).find((d) => d?.supersedes_decision_id === decision.id) ?? null
    : null;

  const handleRevert = async () => {
    if (!onRevert) return;
    setBusy("revert");
    try { await onRevert(decision); }
    finally { setBusy(null); }
  };
  const handleEscalate = async () => {
    if (!onEscalate) return;
    setBusy("escalate");
    try { await onEscalate(decision); }
    finally { setBusy(null); }
  };

  const isMuted = decision.status === "superseded" || decision.status === "reverted";

  return (
    <li
      data-decision-id={decision.id}
      className={cn(
        "group rounded-md border bg-[var(--surface)] p-3 text-sm transition-shadow",
        isMuted ? "border-[var(--border)] opacity-70" : "border-[var(--border)] hover:shadow-[var(--shadow-1)]",
      )}
    >
      <Cluster justify="between" align="start" className="flex-wrap gap-2">
        <Cluster gap="2" align="start" className="min-w-0">
          <ActorAvatar
            name={decision.who_name}
            initials={decision.who_avatar}
            agent={decision.who_kind === "agent"}
            size={28}
          />
          <Stack gap="1" className="min-w-0">
            <Cluster gap="1.5" align="center" className="flex-wrap">
              <span className="text-sm font-semibold leading-tight">{decision.who_name}</span>
              <span className="text-xs text-[var(--text-subtle)]">·</span>
              <span className="text-xs text-[var(--text-muted)]">{decision.when}</span>
              {/* Kind badge */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  kind.tone,
                )}
              >
                {kind.icon && <kind.icon className="size-2.5" />}
                {kind.label}
              </span>
              {/* Scope chip */}
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <GitBranch className="size-2.5" />
                {decision.scope_kind === "global"
                  ? "Global"
                  : decision.scope_kind === "section"
                  ? `Section: ${decision.scope_section_anchor?.slice(0, 18) ?? "—"}`
                  : "Selection"}
              </span>
              {/* Impact pill */}
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", IMPACT_TONES[decision.impact])}>
                {decision.impact} impact
              </span>
              {/* Status decoration */}
              {decision.status !== "active" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {decision.status}
                </span>
              )}
            </Cluster>
            {/* Title + 1-line summary */}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="block w-full text-left"
              aria-expanded={expanded}
            >
              <Cluster gap="1" align="start" className="min-w-0">
                {expanded ? (
                  <ChevronDown className="mt-0.5 size-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
                ) : (
                  <ChevronRight className="mt-0.5 size-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
                )}
                <Stack gap="0.5" className="min-w-0">
                  <span className={cn("font-medium leading-snug", isMuted && "line-through")}>{decision.title}</span>
                  {!expanded && (
                    <p className="line-clamp-1 text-xs text-[var(--text-muted)]">{decision.body}</p>
                  )}
                </Stack>
              </Cluster>
            </button>
            {expanded && (
              <p className="whitespace-pre-line text-xs text-[var(--text-muted)]">{decision.body}</p>
            )}
            <Cluster gap="2" align="center" className="text-[11px] text-[var(--text-subtle)]">
              <span>phase: {decision.phase}</span>
              <span>·</span>
              <span>{decision.source}</span>
              {decision.supersedes_decision_id && (
                <>
                  <span>·</span>
                  <span>supersedes {decision.supersedes_decision_id}</span>
                </>
              )}
              {superseder && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-[var(--info)]">
                    <CornerUpRight className="size-3" />
                    superseded by {superseder.id}
                  </span>
                </>
              )}
            </Cluster>
          </Stack>
        </Cluster>
        <Cluster gap="1" align="center" className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {decision.user_editable && decision.status === "active" && onEdit && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(decision)}>
              <Edit3 className="size-3" />
              Edit
            </Button>
          )}
          {decision.status === "active" && onRevert && decision.user_editable && (
            <Button size="sm" variant="ghost" onClick={handleRevert} loading={busy === "revert"}>
              <CornerUpRight className="size-3" />
              Revert
            </Button>
          )}
          {decision.status === "active" && decision.impact !== "high" && onEscalate && (
            <Button size="sm" variant="ghost" onClick={handleEscalate} loading={busy === "escalate"}>
              <Flame className="size-3" />
              Escalate
            </Button>
          )}
        </Cluster>
      </Cluster>
    </li>
  );
}
