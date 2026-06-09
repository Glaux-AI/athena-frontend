"use client";

/**
 * LargeChangeCard — Inbox card variant for a large-change approval item.
 *
 * When a task stage parks at a hard gate after the blast-radius classifier
 * flags `large_change`, the BE inbox emits an `approval_needed` item with
 * `payload.gate_kind === "large_change_admin_approval"` carrying the projected
 * cost + scope. This variant surfaces that cost/scope up front, then deep-links
 * into the task cockpit (`/work/{task_id}`) where the canonical stage gate
 * (`StageActions`) owns approve / request-changes — the inbox does NOT duplicate
 * gate-decision logic (AGENT-2 Stage 4: one flow, the spine's gate model).
 *
 * Detection is payload-driven (`isLargeChangeInboxItem`); older BE builds that
 * omit the payload fall through to the generic `approval_needed` row. Wire
 * fields stay snake_case per ADR-032 (BE bends to FE).
 */

import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatUsd } from "@/lib/utils/format";
import { type InboxItem } from "@/lib/api/client";

interface LargeChangeCardProps {
  item: InboxItem;
  /** Open the task cockpit for this item — the parent routes to
   *  `/work/{task_id}` and marks the item read (the same handler the generic
   *  inbox rows use). */
  onOpen: () => void;
}

export function LargeChangeCard({ item, onOpen }: LargeChangeCardProps) {
  const payload = item.payload ?? null;
  const cost = payload?.cost_estimate_usd ?? null;
  const scope = payload?.scope ?? null;
  const filesTouched = scope?.files_touched ?? null;
  const linesAdded = scope?.lines_added ?? null;
  const linesRemoved = scope?.lines_removed ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Card
        variant="elevated"
        data-testid="large-change-card"
        className="border-l-2 border-l-[var(--warning)] transition-[background-color,border-color,box-shadow] duration-200 ease-out group-hover:border-[var(--border-strong)] group-hover:shadow-[var(--shadow-2)]"
      >
        <Stack gap="3">
          <Cluster justify="between" align="start">
            <Cluster gap="3" align="start" className="flex-1 min-w-0">
              <div
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--warning-soft)] text-[var(--warning-ink)]"
              >
                <AlertTriangle className="size-4" />
              </div>
              <Stack gap="1" className="flex-1 min-w-0">
                <Cluster gap="2" align="center">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--warning)]">
                    Large change · admin approval
                  </span>
                  {item.priority === "high" && (
                    <span className="rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger-ink)]">
                      High
                    </span>
                  )}
                </Cluster>
                <span className="text-sm font-medium text-[var(--text)]">
                  {item.title}
                </span>
                <span className="line-clamp-2 text-sm text-[var(--text-muted)]">
                  {item.context}
                </span>
                <span className="text-xs text-[var(--text-subtle)]">
                  {item.actor} · {item.when}
                </span>
              </Stack>
            </Cluster>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-[var(--primary)]">
              {item.cta || "Review"}
              <span
                aria-hidden
                className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
              >
                →
              </span>
            </span>
          </Cluster>

          {/* Cost + scope strip — the reason this is a dedicated card. Hidden
              when the BE omitted the payload (the row still deep-links). */}
          {(cost !== null || filesTouched !== null) && (
            <div data-testid="large-change-card-stats">
              <Cluster
                gap="4"
                align="center"
                className="flex-wrap rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-[var(--inner-highlight)]"
              >
                {cost !== null && (
                  <Stack gap="0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      Projected cost
                    </span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">
                      {formatUsd(cost)}
                    </span>
                  </Stack>
                )}
                {filesTouched !== null && (
                  <Stack gap="0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      Files touched
                    </span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">
                      {filesTouched}
                    </span>
                  </Stack>
                )}
                {(linesAdded !== null || linesRemoved !== null) && (
                  <Stack gap="0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      Lines
                    </span>
                    <Cluster gap="1.5" align="center">
                      {linesAdded !== null && (
                        <span className="font-semibold tabular-nums text-[var(--success)]">
                          +{linesAdded}
                        </span>
                      )}
                      {linesRemoved !== null && (
                        <span className="font-semibold tabular-nums text-[var(--danger)]">
                          -{linesRemoved}
                        </span>
                      )}
                    </Cluster>
                  </Stack>
                )}
              </Cluster>
            </div>
          )}
        </Stack>
      </Card>
    </button>
  );
}

/** Discriminator the inbox-list switch uses to pick this variant over the
 *  generic kind row. Exported so the page-level loop can keep its switch tiny
 *  without hardcoding the literal. */
export function isLargeChangeInboxItem(item: InboxItem): boolean {
  return (
    item.kind === "approval_needed" &&
    item.payload?.gate_kind === "large_change_admin_approval"
  );
}
