"use client";

/**
 * DecisionsTab — the canonical home for decision-record listings.
 *
 * Per ADR-073 §4: decision records live ONLY on the Decisions tab (filtered
 * by scope). Stale-decision alerts live ONLY on the Org Decisions tab.
 * Capability Decisions shows the capability-scoped records; Repo has no
 * Decisions tab because decisions roll up to capability.
 *
 * The list is virtualized for large orgs (>50 records).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ScrollText, Plus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";
import type { DecisionRecord } from "@/lib/api/client";

const KIND_TONE: Record<string, string> = {
  ADR:           "bg-[var(--primary-soft)] text-[var(--primary)]",
  Convention:    "bg-[var(--info-soft)]    text-[var(--info)]",
  "Domain note": "bg-[var(--surface-2)]    text-[var(--text-muted)]",
};

export interface StaleDecisionAlert {
  id: string;
  title: string;
  reason: string;
  last_reviewed: string;
}

export interface DecisionsTabProps {
  scope: "org" | "capability";
  decisions: readonly DecisionRecord[];
  /** Org scope only — banner of decisions flagged by decision_record_health. */
  staleAlerts?: readonly StaleDecisionAlert[];
  /** Called when the user clicks "+ New decision". Optional; if absent,
   *  the button is hidden. */
  onNewDecision?: () => void;
}

export function DecisionsTab({ scope, decisions, staleAlerts, onNewDecision }: DecisionsTabProps) {
  const [activeKind, setActiveKind] = useState<"all" | "ADR" | "Convention" | "Domain note">("all");
  const filtered = useMemo(
    () => (activeKind === "all" ? decisions : decisions.filter((d) => d.kind === activeKind)),
    [decisions, activeKind],
  );

  return (
    <Stack gap="4">
      {scope === "org" && staleAlerts && staleAlerts.length > 0 && (
        <Card className="border-[var(--warning)] bg-[var(--warning-soft)]">
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
              <span className="text-sm font-semibold text-[var(--warning)]">
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
                    <span className="font-medium">{d.title}</span>
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                      reviewed {d.last_reviewed}
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
          Decisions {scope === "org" ? "(org-wide)" : "(this capability)"}
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
          {onNewDecision && (
            <button
              type="button"
              onClick={onNewDecision}
              className="ml-2 inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <Plus className="size-3" aria-hidden /> New decision
            </button>
          )}
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
          estimatedItemHeight={92}
          ariaLabel="Decisions"
          getKey={(d) => d.id}
          renderItem={(d) => (
            <Card className="!p-3">
              <Stack gap="1">
                <Cluster gap="2" align="center">
                  <code className="font-mono text-[10px] font-semibold text-[var(--primary)]">{d.id}</code>
                  <span className="font-medium text-sm">{d.title}</span>
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
              </Stack>
            </Card>
          )}
        />
      )}
    </Stack>
  );
}
