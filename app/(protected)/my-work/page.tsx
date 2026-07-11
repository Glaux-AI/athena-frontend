"use client";

/**
 * /my-work - the signed-in user's personal queue. One prioritized list of what
 * is on them right now, ordered by actionability: a single focus card spotlights
 * the one thing to do next (a sign-off, else resume active work, else start the
 * top of the queue), then dense rows grouped On you / In progress / Up next, with
 * Blocked and Watching recessed at the foot (awareness, not action). Within every
 * group rows sort by latest activity (switchable to priority via the header
 * toggle), and each row carries its absolute "Updated" timestamp. Server-bucketed
 * via `api.tasks.myWork`; cards open the cockpit, where every task action lives,
 * so this stays a calm navigation surface.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, Lock, SignalHigh } from "lucide-react";

import { toast } from "sonner";

import {
  ApiError,
  api,
  type MyWork,
  type Task,
  type TaskPatchInput,
  type TaskPriority,
} from "@/lib/api/client";
import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { focusRing } from "@/components/ui/focus";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { TaskIdChip } from "@/components/work/task-id-chip";
import {
  PriorityControl,
  StatusControl,
} from "@/components/work/property-controls";
import { cn } from "@/lib/cn";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { formatDateTime } from "@/lib/utils/format";

type SectionKey = keyof MyWork;

interface SectionDef {
  key: SectionKey;
  label: string;
  hint: string;
  /** Star-dot color - a semantic token reference for `--dot-color`. */
  dotColor: string;
  /** Blocked + Watching render quietly: no action is possible on them. */
  recede?: boolean;
}

/** Ordered by actionability, not by bucket size. Review sign-offs and active
 *  work lead; blocked / watched work recedes to the foot. */
const SECTIONS: SectionDef[] = [
  { key: "on_you", label: "On you", hint: "Waiting on your review or sign-off", dotColor: "var(--warning)" },
  { key: "in_progress", label: "In progress", hint: "Your active work", dotColor: "var(--primary)" },
  { key: "up_next", label: "Up next", hint: "Ready to pick up", dotColor: "var(--success)" },
  { key: "blocked", label: "Blocked", hint: "Waiting on a dependency", dotColor: "var(--text-subtle)", recede: true },
  { key: "watching", label: "Watching", hint: "Tasks you follow", dotColor: "var(--text-subtle)", recede: true },
];

type SortKey = "activity" | "priority";

const SORT_OPTIONS: SegmentedOption<SortKey>[] = [
  { value: "activity", label: "Latest", icon: <Clock className="size-3.5" aria-hidden /> },
  { value: "priority", label: "Priority", icon: <SignalHigh className="size-3.5" aria-hidden /> },
];

const byNewest = (a: Task, b: Task) =>
  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const priorityRank = (p: TaskPriority | null) => (p ? PRIORITY_RANK[p] : 4);

/** Most urgent first, then earliest due (undated last), then latest activity. */
const byPriority = (a: Task, b: Task) => {
  const rank = priorityRank(a.priority) - priorityRank(b.priority);
  if (rank !== 0) return rank;
  const aDue = a.target_date ? new Date(a.target_date).getTime() : Infinity;
  const bDue = b.target_date ? new Date(b.target_date).getTime() : Infinity;
  if (aDue !== bDue) return aDue - bDue;
  return byNewest(a, b);
};

export default function MyWorkPage() {
  const router = useRouter();
  const [data, setData] = useState<MyWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("activity");

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    // `quiet` refreshes in place (a quick action re-bucketing rows) - only
    // the INITIAL load swaps the page to the skeleton, so triage never
    // yanks the list away or loses scroll position.
    if (!opts?.quiet) setLoading(true);
    try {
      const mw = await api.tasks.myWork();
      setData(mw);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load your work");
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback((id: string) => router.push(`/work/${id}`), [router]);

  // Hover quick actions (status / priority) - triage without opening each
  // task. Non-optimistic: patch, then quietly reload the buckets (a status
  // move can change which section a row lives in).
  const patchTask = useCallback(
    async (id: string, body: TaskPatchInput, ok: string) => {
      try {
        await api.tasks.patch(id, body);
        toast.success(ok);
        await load({ quiet: true });
      } catch (e) {
        toast.error(
          e instanceof ApiError ? e.message : "That didn't work - try again.",
        );
      }
    },
    [load],
  );

  // Re-sort every bucket by latest activity (the server orders by priority/due;
  // this surface leads with what moved most recently).
  const sorted = useMemo<MyWork | null>(() => {
    if (!data) return null;
    const cmp = sort === "priority" ? byPriority : byNewest;
    return {
      on_you: [...data.on_you].sort(cmp),
      in_progress: [...data.in_progress].sort(cmp),
      blocked: [...data.blocked].sort(cmp),
      up_next: [...data.up_next].sort(cmp),
      watching: [...data.watching].sort(cmp),
    };
  }, [data, sort]);

  const total = sorted
    ? SECTIONS.reduce((n, s) => n + sorted[s.key].length, 0)
    : 0;
  const focus = sorted ? pickFocus(sorted) : null;

  return (
    <div className="p-6">
      <Stack gap="5">
        <Cluster justify="between" align="center" gap="3" className="flex-wrap">
          <Stack gap="0.5">
            <h1 className="text-xl font-semibold text-[var(--text)]">My Work</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Everything on you, grouped by what needs you. Blocked work waits at the foot.
            </p>
          </Stack>
          {!loading && !error && sorted && total > 0 && (
            <Segmented
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSort}
              ariaLabel="Sort tasks within each group"
            />
          )}
        </Cluster>

        {loading ? (
          <MyWorkSkeleton />
        ) : error ? (
          <p
            role="alert"
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
          >
            {error}
          </p>
        ) : !sorted || total === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-5" />}
            title="You're all clear"
            description="Nothing is waiting on you. Tasks you own, are assigned, or watch will show up here as they move."
          />
        ) : (
          <Stack gap="6">
            {focus && (
              <FocusCard
                task={focus.task}
                kicker={focus.kicker}
                cta={focus.cta}
                onOpen={() => open(focus.task.id)}
              />
            )}
            {SECTIONS.map((s) => {
              // The spotlighted focus task already leads the page - don't
              // repeat it at the top of its own section list.
              const tasks =
                focus && focus.section === s.key
                  ? sorted[s.key].filter((t) => t.id !== focus.task.id)
                  : sorted[s.key];
              return tasks.length > 0 ? (
                <Section
                  key={s.key}
                  def={s}
                  tasks={tasks}
                  onOpen={open}
                  onPatch={patchTask}
                />
              ) : null;
            })}
          </Stack>
        )}
      </Stack>
    </div>
  );
}

/** The single most pressing actionable item: a sign-off you owe, else work to
 *  resume, else the top of the queue. Null when only blocked / watched remain.
 *  Carries its bucket key so the section list below can exclude it. */
function pickFocus(
  data: MyWork,
): { task: Task; kicker: string; cta: string; section: SectionKey } | null {
  if (data.on_you[0]) return { task: data.on_you[0], kicker: "Needs your sign-off", cta: "Review", section: "on_you" };
  if (data.in_progress[0]) return { task: data.in_progress[0], kicker: "Pick up where you left off", cta: "Resume", section: "in_progress" };
  if (data.up_next[0]) return { task: data.up_next[0], kicker: "Ready to start", cta: "Start", section: "up_next" };
  return null;
}

/** The hero strip: one task, one primary affordance answering "what next?".
 *  The one sanctioned moment on this page - everything below stays L0. */
function FocusCard({
  task,
  kicker,
  cta,
  onOpen,
}: {
  task: Task;
  kicker: string;
  cta: string;
  onOpen: () => void;
}) {
  const meta = TASK_TYPE_META[task.type];
  const Icon = meta.Icon;
  return (
    <Card variant="glass" interactive className="p-0">
      <div className="flex w-full items-center gap-4 p-4">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-4 rounded-lg text-left",
            focusRing,
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-micro block font-medium text-[var(--text-subtle)]">{kicker}</span>
            <span className="mt-0.5 block truncate text-[15px] font-medium text-[var(--text)]">{task.title}</span>
            <span className="text-micro mt-1 flex flex-wrap items-center gap-1.5 text-[var(--text-subtle)]">
              <TaskIdChip id={task.display_id} />
              <span aria-hidden>·</span>
              <span>{meta.label}</span>
              <span aria-hidden>·</span>
              <span>Updated {formatDateTime(task.updated_at)}</span>
            </span>
          </span>
        </button>
        <Button glow onClick={onOpen} className="shrink-0">
          {cta}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

function Section({
  def,
  tasks,
  onOpen,
  onPatch,
}: {
  def: SectionDef;
  tasks: Task[];
  onOpen: (id: string) => void;
  onPatch: (id: string, body: TaskPatchInput, ok: string) => Promise<void>;
}) {
  return (
    <Stack gap="2">
      <Cluster gap="2" align="center" className="flex-wrap">
        <span
          className="star-dot"
          style={{ "--dot-color": def.dotColor } as CSSProperties}
          aria-hidden
        />
        <span
          className={cn(
            "text-sm font-semibold",
            def.recede ? "text-[var(--text-muted)]" : "text-[var(--text)]",
          )}
        >
          {def.label}
        </span>
        <Pill size="sm" tone="neutral" className="tabular-nums">
          {tasks.length}
        </Pill>
        <span className="text-xs text-[var(--text-subtle)]">{def.hint}</span>
      </Cluster>
      <Card
        className={cn(
          "divide-y divide-[var(--border-soft)] overflow-hidden p-0",
          def.recede && "bg-[var(--surface-2)]",
        )}
      >
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            section={def.key}
            recede={def.recede ?? false}
            onOpen={() => onOpen(t.id)}
            onPatch={onPatch}
          />
        ))}
      </Card>
    </Stack>
  );
}

function TaskRow({
  task,
  section,
  recede,
  onOpen,
  onPatch,
}: {
  task: Task;
  section: SectionKey;
  recede?: boolean;
  onOpen: () => void;
  onPatch: (id: string, body: TaskPatchInput, ok: string) => Promise<void>;
}) {
  const meta = TASK_TYPE_META[task.type];
  const Icon = meta.Icon;
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 transition-colors",
        recede ? "hover:bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
        )}
      >
        <Icon
          className={cn(
            "size-4 shrink-0",
            recede ? "text-[var(--text-subtle)]" : "text-[var(--text-muted)]",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-medium",
              recede ? "text-[var(--text-muted)]" : "text-[var(--text)]",
            )}
          >
            {task.title}
          </span>
          <span className="text-micro mt-0.5 flex items-center gap-1.5 text-[var(--text-subtle)]">
            <TaskIdChip id={task.display_id} />
            <span aria-hidden>·</span>
            <span>{meta.label}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-micro whitespace-nowrap tabular-nums text-[var(--text-subtle)]">
            Updated {formatDateTime(task.updated_at)}
          </span>
          <RowAccessory section={section} task={task} />
        </span>
      </button>
      {/* Hover quick actions - triage in place (revealed on hover/focus so
          the resting rows stay calm; always reachable by keyboard). */}
      <span
        className="flex shrink-0 items-center gap-1 pr-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <StatusControl
          value={task.status}
          railed={task.type !== "task"}
          onChange={(next) =>
            onPatch(task.id, { status: next }, "Status updated.")
          }
        />
        <PriorityControl
          value={task.priority}
          onChange={(next) =>
            onPatch(
              task.id,
              { priority: next },
              next ? "Priority updated." : "Priority cleared.",
            )
          }
        />
      </span>
    </div>
  );
}

/** One contextual signal per row: a Review nudge on sign-offs, what a blocked
 *  task waits on, otherwise its spend (when cost is visible). */
function RowAccessory({ section, task }: { section: SectionKey; task: Task }) {
  if (section === "on_you") {
    return (
      <Pill tone="warning" size="sm">
        Review
      </Pill>
    );
  }
  if (section === "blocked") {
    const n = task.depends_on.length;
    if (n === 0) return null;
    return (
      <span className="text-micro inline-flex items-center gap-1 text-[var(--text-subtle)]">
        <Lock className="size-3" aria-hidden />
        Waiting on {n}
      </span>
    );
  }
  if (task.spent_usd != null && task.spent_usd > 0) {
    return (
      <span className="text-micro tabular-nums text-[var(--text-subtle)]">
        ${task.spent_usd.toFixed(2)}
      </span>
    );
  }
  return null;
}

/** List-shaped skeleton (page-level loading uses skeletons, not spinners). */
function MyWorkSkeleton() {
  return (
    <Stack gap="6" aria-hidden>
      <Skeleton className="h-[72px] rounded-xl" />
      {[0, 1].map((s) => (
        <Stack key={s} gap="2">
          <Skeleton className="h-4 w-40" />
          <div className="divide-y divide-[var(--border-soft)] overflow-hidden rounded-lg border border-[var(--border)]">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[52px] rounded-none" />
            ))}
          </div>
        </Stack>
      ))}
    </Stack>
  );
}
