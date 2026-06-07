"use client";

/**
 * ActivityTab — per-scope timeline of ingestion + run events.
 *
 * Per ADR-073 §4: activity events live ONLY on the Activity tab (filtered
 * by scope). The org Activity carries cross-repo ingestion + run events;
 * domain Activity is filtered to that domain's runs + change
 * projections; repo Activity is per-repo commits + sync history.
 *
 * Pagination: 50 events / page with a "Load more" button (a11y-safe, no
 * infinite scroll). Per ADR-073 §6.
 */

import { useMemo, useState } from "react";
import { Activity, GitCommit, ScrollText, Play, BookOpen, Filter } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { VirtualList } from "@/components/ui/virtual-list";
import { cn } from "@/lib/cn";

type ActivityKind = "ingestion" | "run" | "decision" | "blueprint";

interface ActivityEvent {
  id: string;
  when: string;
  kind: ActivityKind;
  /** Actor that produced the event (user id or "system"). */
  actor: string;
  /** Short human-readable summary. */
  summary: string;
  /** Optional scope context (repo full_name for ingestion, run id for run). */
  scope?: string;
  /** Optional impact metric. */
  impact?: { label: string; value: string };
  /** Optional change classification per ADR-048 (only for ingestion). */
  changeClass?: "cosmetic" | "minor" | "material";
}

const KIND_ICON: Record<ActivityKind, typeof Activity> = {
  ingestion: GitCommit,
  run:       Play,
  decision:  ScrollText,
  blueprint: BookOpen,
};

const KIND_LABEL: Record<ActivityKind, string> = {
  ingestion: "Ingestion",
  run:       "Run",
  decision:  "Decision",
  blueprint: "Blueprint edit",
};

const CHANGE_CLASS_TONE: Record<NonNullable<ActivityEvent["changeClass"]>, string> = {
  cosmetic: "bg-[var(--surface-2)]    text-[var(--text-subtle)]",
  minor:    "bg-[var(--info-soft)]    text-[var(--info-ink)]",
  material: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

const PAGE_SIZE = 50;

interface ActivityTabProps {
  scope: "org" | "domain" | "repo";
  events: readonly ActivityEvent[];
}

export function ActivityTab({ scope, events }: ActivityTabProps) {
  const [activeKinds, setActiveKinds] = useState<Set<ActivityKind>>(new Set(Object.keys(KIND_ICON) as ActivityKind[]));
  const [page, setPage] = useState(1);

  const allowedKinds: ActivityKind[] = useMemo(
    () => (scope === "repo"
      ? ["ingestion"]
      : ["ingestion", "run", "decision", "blueprint"]),
    [scope],
  );

  const filtered = useMemo(
    () => events.filter((e) => activeKinds.has(e.kind) && allowedKinds.includes(e.kind)),
    [events, activeKinds, allowedKinds],
  );

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > visible.length;

  const toggleKind = (k: ActivityKind) => {
    const next = new Set(activeKinds);
    if (next.has(k)) next.delete(k); else next.add(k);
    setActiveKinds(next);
  };

  return (
    <Stack gap="3">
      <Cluster gap="2" align="center">
        <Activity className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">
          Activity {scope === "org" ? "(org-wide)" : scope === "domain" ? "(this domain)" : "(this repo)"}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {visible.length} of {filtered.length}
        </span>
        <Cluster gap="1" align="center" className="ml-auto">
          <Filter className="size-3 text-[var(--text-subtle)]" aria-hidden />
          {allowedKinds.map((k) => {
            const on = activeKinds.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  on
                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "bg-[var(--surface-2)] text-[var(--text-subtle)] hover:text-[var(--text)]",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </Cluster>
      </Cluster>

      {visible.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            icon={<Activity className="size-7" />}
            title="No recent activity"
            description="No activity in the last 30 days."
          />
        </Card>
      ) : (
        <>
          <VirtualList
            items={visible}
            estimatedItemHeight={64}
            ariaLabel="Activity timeline"
            getKey={(e) => e.id}
            renderItem={(e) => {
              const Icon = KIND_ICON[e.kind];
              return (
                <div className="mb-1.5 grid grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-[var(--shadow-1)] transition-[background-color,border-color] duration-150 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]">
                  <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <Cluster gap="2" align="center">
                      <span className="text-xs font-semibold">{e.summary}</span>
                      {e.changeClass && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                            CHANGE_CLASS_TONE[e.changeClass],
                          )}
                          title="Smart-classifier verdict per ADR-048"
                        >
                          {e.changeClass}
                        </span>
                      )}
                    </Cluster>
                    <Cluster gap="2" align="center" className="text-[10px] text-[var(--text-subtle)]">
                      <span className="uppercase tracking-wider">{KIND_LABEL[e.kind]}</span>
                      <span>·</span>
                      <span>{e.actor}</span>
                      {e.scope && (
                        <>
                          <span>·</span>
                          <code className="font-mono">{e.scope}</code>
                        </>
                      )}
                      {e.impact && (
                        <>
                          <span>·</span>
                          <span className="tabular-nums">
                            {e.impact.value} {e.impact.label}
                          </span>
                        </>
                      )}
                    </Cluster>
                  </div>
                  <span className="text-[10px] text-[var(--text-subtle)] tabular-nums">{e.when}</span>
                </div>
              );
            }}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
              </button>
            </div>
          )}
        </>
      )}
    </Stack>
  );
}
