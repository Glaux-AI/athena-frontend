"use client";

/**
 * SprintHeader - the active (or next planned) cycle's banner on a team's
 * Sprint view (Work OS rehaul W5): name, goal, day X of Y, committed vs
 * completed points, capacity warning, and the lifecycle actions (Start /
 * Complete-with-carryover). The cycle ENGINE lives server-side
 * (`cycle_service`); this surfaces it where planning actually happens
 * instead of a settings page.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { Flag, Play } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api, type Cycle } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/overlay";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { Cluster, Stack } from "@/components/layout/primitives";
import { formatDate } from "@/lib/utils/format";

/** Day X of Y from the cycle's date window (null when undated). */
export function cycleDayProgress(
  cycle: Pick<Cycle, "starts_on" | "ends_on">,
  today: Date = new Date(),
): { day: number; total: number } | null {
  if (!cycle.starts_on || !cycle.ends_on) return null;
  const start = new Date(`${cycle.starts_on}T00:00:00`);
  const end = new Date(`${cycle.ends_on}T00:00:00`);
  const dayMs = 86_400_000;
  const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  // floor, not round: mid-day on the 3rd day is still day 3.
  const day = Math.floor((today.getTime() - start.getTime()) / dayMs) + 1;
  return { day: Math.min(Math.max(day, 1), total), total };
}

export function SprintHeader({
  cycle,
  nextPlanned,
  canManage,
  onChanged,
}: {
  /** The team's active cycle (or the next planned one when none is active). */
  cycle: Cycle;
  /** Planned cycles that could receive carryover / be activated on Complete. */
  nextPlanned: Cycle[];
  /** Team lead or `team:manage` - gates Start/Complete (server re-checks). */
  canManage: boolean;
  /** Re-fetch cycles + board after a lifecycle change. */
  onChanged: () => void;
}) {
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [carryTo, setCarryTo] = useState<string>("");
  const [activateNext, setActivateNext] = useState(false);
  const [busy, setBusy] = useState(false);

  const s = cycle.summary;
  const progress = useMemo(() => cycleDayProgress(cycle), [cycle]);
  const pct =
    s.committed_points > 0
      ? Math.min(100, Math.round((s.completed_points / s.committed_points) * 100))
      : null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work - try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Stack gap="1" className="min-w-0">
          <Cluster gap="2" align="center">
            <Flag className="size-4 shrink-0 text-[var(--primary)]" aria-hidden />
            <span className="truncate text-sm font-semibold text-[var(--text)]">
              {cycle.name}
            </span>
            <Pill
              size="sm"
              tone={cycle.state === "active" ? "success" : "neutral"}
              dot
              live={cycle.state === "active"}
            >
              {cycle.state === "active" ? "Active" : "Planned"}
            </Pill>
          </Cluster>
          {cycle.goal && (
            <p className="truncate text-xs text-[var(--text-muted)]">{cycle.goal}</p>
          )}
          <Cluster gap="3" align="center" className="flex-wrap text-micro text-[var(--text-subtle)]">
            {progress && cycle.state === "active" && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="orbit-ring size-4 shrink-0"
                  style={{
                    "--orbit-value": Math.round((progress.day / progress.total) * 100),
                  } as CSSProperties}
                  aria-hidden
                />
                Day {progress.day} of {progress.total}
              </span>
            )}
            {cycle.starts_on && cycle.ends_on && (
              <span>
                {formatDate(cycle.starts_on)} - {formatDate(cycle.ends_on)}
              </span>
            )}
            <span className="tabular-nums">
              {s.completed_points} / {s.committed_points} pts
              {` · ${s.completed_count}/${s.committed_count} tasks`}
            </span>
            {s.unpointed_count > 0 && (
              <span className="text-[var(--warning-ink)]">
                {s.unpointed_count} unpointed
              </span>
            )}
            {s.over_capacity && (
              <Pill size="sm" tone="warning">
                Over capacity
              </Pill>
            )}
          </Cluster>
          {pct !== null && (
            <div
              className="comet-track mt-1 w-full max-w-md"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Sprint progress: ${pct}%`}
            >
              <div
                className="comet-fill"
                style={{ "--comet-value": `${pct}%` } as CSSProperties}
              />
            </div>
          )}
        </Stack>
        {canManage && (
          <Cluster gap="2" className="shrink-0">
            {cycle.state === "planned" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => api.cycles.start(cycle.id), "Sprint started.")
                }
              >
                <Play className="mr-1.5 size-4" aria-hidden />
                Start sprint
              </Button>
            )}
            {cycle.state === "active" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  // Fresh choices per Complete - stale carryover state from
                  // an earlier open could silently file work into an already
                  // completed cycle (review fix).
                  setCarryTo("");
                  setActivateNext(false);
                  setConfirmComplete(true);
                }}
              >
                Complete sprint
              </Button>
            )}
          </Cluster>
        )}
      </div>

      <Modal
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        title="Complete this sprint?"
        description="Velocity is snapshotted and unfinished tasks move to the destination you pick. Nothing is auto-closed."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmComplete(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setConfirmComplete(false);
                void run(
                  () =>
                    api.cycles.complete(cycle.id, {
                      carry_to_cycle_id: carryTo || null,
                      activate_next_id:
                        activateNext && carryTo ? carryTo : null,
                    }),
                  "Sprint completed.",
                );
              }}
            >
              Complete
            </Button>
          </>
        }
      >
        <Stack gap="3">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Unfinished tasks go to
            <Select value={carryTo} onChange={(e) => setCarryTo(e.target.value)}>
              <option value="">Backlog</option>
              {nextPlanned.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          {carryTo && (
            <label className="flex items-center gap-2 text-xs text-[var(--text)]">
              <input
                type="checkbox"
                checked={activateNext}
                onChange={(e) => setActivateNext(e.target.checked)}
                className="size-3.5 accent-[var(--primary)]"
              />
              Start that sprint now
            </label>
          )}
        </Stack>
      </Modal>
    </Card>
  );
}
