"use client";

/**
 * /runs/[id] — run detail page.
 *
 * Three things on screen:
 *   1. Top bar: goal + status + cost + cancel.
 *   2. Left rail (placeholder): phase nav.
 *   3. Right (large): RunStreamPanel — the live SSE timeline.
 *
 * Sophia (in the global TopBar) reacts to the same SSE stream via
 * useRunStream / mascot store. The user sees her change moods in real time.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { api, ApiError, type DemoRun } from "@/lib/api/client";
import { useMascotStore } from "@/lib/stores/mascot";
import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { CostPill } from "@/components/runs/cost-pill";
import { RunStreamPanel } from "@/components/runs/run-stream-panel";
import { formatRelativeTime } from "@/lib/utils/format";

const STATUS_MAP: Record<DemoRun["status"], Status> = {
  queued: "queued",
  running: "running",
  completed: "completed",
};

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<DemoRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);

  useEffect(() => {
    // Page-level default; SSE events will override per Sophia's contract.
    setScreenDefault("thinking");
  }, [setScreenDefault]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await api.demo.get(params.id);
        if (!cancelled) setRun(fetched);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load run");
      }
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  if (error) {
    return (
      <Stack gap="4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/runs")}>
          <ArrowLeft className="size-4" />
          Back to runs
        </Button>
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      </Stack>
    );
  }

  if (!run) {
    return (
      <Stack gap="4">
        <div className="h-8 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-64 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  return (
    <Stack gap="4" className="h-[calc(100vh-6rem-4rem)]">
      <Cluster gap="3" align="center" justify="between">
        <Cluster gap="3" align="center">
          <Button variant="ghost" size="sm" onClick={() => router.push("/runs")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Stack gap="0">
            <h1 className="text-lg font-semibold leading-tight">{run.goal}</h1>
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {run.id} · started {formatRelativeTime(run.created_at)}
            </span>
          </Stack>
        </Cluster>
        <Cluster gap="2" align="center">
          <CostPill usd={run.spent_usd} />
          <StatusPill status={STATUS_MAP[run.status]} />
        </Cluster>
      </Cluster>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
        <PhaseRail current="prd" />
        <RunStreamPanel runId={run.id} streamUrl={api.demo.streamUrl(run.id)} />
      </div>
    </Stack>
  );
}

function PhaseRail({ current }: { current: "prd" | "design" | "tickets" | "code" | "review" | "deploy" }) {
  const phases: { key: typeof current; label: string }[] = [
    { key: "prd", label: "PRD" },
    { key: "design", label: "Design" },
    { key: "tickets", label: "Tickets" },
    { key: "code", label: "Code" },
    { key: "review", label: "Review" },
    { key: "deploy", label: "Deploy plan" },
  ];
  return (
    <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
        Phases
      </h2>
      <ul className="flex flex-col gap-1">
        {phases.map((p) => (
          <li
            key={p.key}
            className={
              p.key === current
                ? "rounded-md bg-[var(--primary-soft)] px-2 py-1.5 text-sm font-medium text-[var(--primary)]"
                : "px-2 py-1.5 text-sm text-[var(--text-muted)]"
            }
          >
            {p.label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
