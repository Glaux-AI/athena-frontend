"use client";

/**
 * /my-work - the signed-in user's personal queue. One sectioned view of what's
 * on them right now: tasks awaiting their sign-off (On you), their in-progress
 * and blocked work, what's up next, and the tasks they watch. Server-bucketed +
 * ordered (priority then due date) via `api.tasks.myWork`. Cards open the
 * cockpit; every task action lives there, so this stays a calm navigation
 * surface.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { ApiError, api, type MyWork, type Task } from "@/lib/api/client";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskCard } from "@/components/board/task-card";

const SECTIONS: { key: keyof MyWork; label: string; hint: string }[] = [
  { key: "on_you", label: "On you", hint: "Waiting on your review or sign-off" },
  { key: "in_progress", label: "In progress", hint: "Your active work" },
  { key: "blocked", label: "Blocked", hint: "Waiting on a dependency" },
  { key: "up_next", label: "Up next", hint: "Ready to pick up" },
  { key: "watching", label: "Watching", hint: "Tasks you follow" },
];

export default function MyWorkPage() {
  const router = useRouter();
  const [data, setData] = useState<MyWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mw = await api.tasks.myWork();
      setData(mw);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load your work");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data
    ? SECTIONS.reduce((n, s) => n + data[s.key].length, 0)
    : 0;

  return (
    <div className="p-6">
      <Stack gap="5">
        <Stack gap="0.5">
          <h1 className="text-xl font-semibold text-[var(--text)]">My Work</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Everything on you right now, most pressing first.
          </p>
        </Stack>

        {loading ? (
          <MyWorkSkeleton />
        ) : error ? (
          <p
            role="alert"
            className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-ink)]"
          >
            {error}
          </p>
        ) : !data || total === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-5" />}
            title="You're all clear"
            description="Nothing is waiting on you. Tasks you own, are assigned, or watch will show up here as they move."
          />
        ) : (
          <Stack gap="6">
            {SECTIONS.map((s) =>
              data[s.key].length > 0 ? (
                <Section
                  key={s.key}
                  label={s.label}
                  hint={s.hint}
                  tasks={data[s.key]}
                  onOpen={(id) => router.push(`/work/${id}`)}
                />
              ) : null,
            )}
          </Stack>
        )}
      </Stack>
    </div>
  );
}

function Section({
  label,
  hint,
  tasks,
  onOpen,
}: {
  label: string;
  hint: string;
  tasks: Task[];
  onOpen: (id: string) => void;
}) {
  return (
    <Stack gap="2.5">
      <Cluster gap="2" align="baseline" className="flex-wrap">
        <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--text-muted)]">
          {tasks.length}
        </span>
        <span className="text-xs text-[var(--text-subtle)]">{hint}</span>
      </Cluster>
      <Grid cols="auto-fit-260" gap="3">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onOpen={() => onOpen(t.id)} />
        ))}
      </Grid>
    </Stack>
  );
}

/** Section-shaped skeleton (page-level loading uses skeletons, not spinners). */
function MyWorkSkeleton() {
  return (
    <Stack gap="6" aria-hidden>
      {[0, 1, 2].map((s) => (
        <Stack key={s} gap="2.5">
          <div className="h-5 w-32 animate-pulse rounded bg-[var(--surface-2)]" />
          <Grid cols="auto-fit-260" gap="3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg bg-[var(--surface-2)]"
              />
            ))}
          </Grid>
        </Stack>
      ))}
    </Stack>
  );
}
