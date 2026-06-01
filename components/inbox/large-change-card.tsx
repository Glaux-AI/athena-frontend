"use client";

/**
 * LargeChangeCard — Inbox card variant for the large-change scenario
 * admin-approval gate (readiness §5.28 row 1783).
 *
 * Renders when a run's blast-radius classifier flags `large_change` and the
 * run pauses with `gate_kind === "large_change_admin_approval"`. Surfaces:
 *
 *   - projected cost in USD (from the BE's projected token usage),
 *   - scope (files touched, optional lines added/removed),
 *   - Approve / Skip CTAs wired to the canonical
 *     `POST /v1/runs/{run_id}/gates/{gate_key}/close` surface
 *     (see `lib/api/gates.ts`).
 *
 * The card is rendered by the inbox page's existing item loop when the
 * incoming `InboxItem.payload.gate_kind === "large_change_admin_approval"`.
 * Older BE builds that omit the payload fall through to the generic
 * `approval_needed` row — there is no second wire surface.
 *
 * Wire fields stay snake_case per ADR-032 (BE bends to FE).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { approveGate, rejectGate } from "@/lib/api/gates";
import { formatUsd } from "@/lib/utils/format";
import { ApiError, type InboxItem } from "@/lib/api/client";

/** Canonical gate_key the BE opens for this scenario. Keeping the literal
 *  here (and in `payload.gate_kind`) so the FE can render the card without
 *  threading the gate_key through every InboxItem — it's deterministic per
 *  gate_kind. */
const LARGE_CHANGE_GATE_KEY = "large_change_admin_approval";

/** Required reason payload for `rejectGate` — BE enforces ≥10 chars. The
 *  Skip CTA is "not a typed rejection", just the operator opting out of
 *  the large-change scope, so we pass a stable canned reason. */
const SKIP_REASON = "Operator skipped large-change scope from inbox card.";

interface LargeChangeCardProps {
  item: InboxItem;
  /** Called after a successful Approve or Skip so the parent can refetch
   *  the inbox list (and remove the resolved card). */
  onResolved: () => void;
}

export function LargeChangeCard({ item, onResolved }: LargeChangeCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "skip" | null>(null);
  const payload = item.payload ?? null;
  const cost = payload?.cost_estimate_usd ?? null;
  const scope = payload?.scope ?? null;
  const filesTouched = scope?.files_touched ?? null;
  const linesAdded = scope?.lines_added ?? null;
  const linesRemoved = scope?.lines_removed ?? null;

  const runId = item.task_id;

  const handleApprove = async () => {
    if (!runId) return;
    setPending("approve");
    try {
      await approveGate(runId, LARGE_CHANGE_GATE_KEY);
      toast.success("Large-change approved — Athena will resume the run.");
      onResolved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't approve the gate.");
    } finally {
      setPending(null);
    }
  };

  const handleSkip = async () => {
    if (!runId) return;
    setPending("skip");
    try {
      await rejectGate(runId, LARGE_CHANGE_GATE_KEY, SKIP_REASON);
      toast.success("Large-change skipped — the run will not proceed at this scope.");
      onResolved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't skip the gate.");
    } finally {
      setPending(null);
    }
  };

  const handleOpenRun = () => {
    if (runId) router.push(`/runs/${runId}`);
  };

  return (
    <Card
      data-testid="large-change-card"
      className="border-l-2 border-l-[var(--warning)]"
    >
      <Stack gap="3">
        <Cluster justify="between" align="start">
          <Cluster gap="3" align="start" className="flex-1 min-w-0">
            <div
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--warning-soft)] text-[var(--warning)]"
            >
              <AlertTriangle className="size-4" />
            </div>
            <Stack gap="1" className="flex-1 min-w-0">
              <Cluster gap="2" align="center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--warning)]">
                  Large change · admin approval
                </span>
                {item.priority === "high" && (
                  <span className="rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]">
                    High
                  </span>
                )}
              </Cluster>
              <button
                type="button"
                onClick={handleOpenRun}
                className="text-left text-sm font-medium text-[var(--text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
              >
                {item.title}
              </button>
              <span className="line-clamp-2 text-sm text-[var(--text-muted)]">
                {item.context}
              </span>
              <span className="text-xs text-[var(--text-subtle)]">
                {item.actor} · {item.when}
              </span>
            </Stack>
          </Cluster>
        </Cluster>

        {/* Cost + scope strip. Hidden when the BE omitted the payload — the
            card still renders the Approve/Skip CTAs so the operator can act. */}
        {(cost !== null || filesTouched !== null) && (
          <div data-testid="large-change-card-stats">
            <Cluster
              gap="4"
              align="center"
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs flex-wrap"
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

        <Cluster gap="2" justify="end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void handleSkip()}
            disabled={pending !== null || !runId}
            loading={pending === "skip"}
            data-testid="large-change-card-skip"
            aria-label="Skip large-change gate"
          >
            <XCircle className="size-3.5" />
            Skip
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleApprove()}
            disabled={pending !== null || !runId}
            loading={pending === "approve"}
            data-testid="large-change-card-approve"
            aria-label="Approve large-change gate"
          >
            <CheckCircle2 className="size-3.5" />
            Approve
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}

/** Discriminator the inbox-list switch uses to pick this variant over the
 *  generic kind row. Exported so the page-level loop can keep its switch
 *  tiny without hardcoding the literal. */
export function isLargeChangeInboxItem(item: InboxItem): boolean {
  return (
    item.kind === "approval_needed" &&
    item.payload?.gate_kind === "large_change_admin_approval"
  );
}
