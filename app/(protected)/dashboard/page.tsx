"use client";

/**
 * Dashboard — the default protected route. Sophia renders in `idle`.
 * The "Start demo run" button POSTs and navigates to the run page where
 * Sophia reacts to live SSE events.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Sparkles, Inbox, ArrowRight } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useMascotStore } from "@/lib/stores/mascot";
import { api, ApiError, type DemoRun } from "@/lib/api/client";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { KnowledgeSyncCard } from "@/components/knowledge/sync-card";
import Link from "next/link";
import { formatUsd } from "@/lib/utils/format";
import { config } from "@/lib/config";

const STATUS_MAP: Record<DemoRun["status"], Status> = {
  queued: "queued",
  running: "running",
  completed: "completed",
};

export default function DashboardPage() {
  const router = useRouter();
  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);
  const [recent, setRecent] = useState<DemoRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setScreenDefault("idle");
  }, [setScreenDefault]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.demo.list();
        if (!cancelled) setRecent(list.slice(0, 5));
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load runs");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startNew = (goal?: string) => {
    start(async () => {
      try {
        const run = await api.demo.create(goal);
        router.push(`/runs/${run.id}`);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to start run");
      }
    });
  };

  const monthSpend = recent.reduce((sum, r) => sum + r.spent_usd, 0);

  return (
    <Stack gap="8">
      <Stack gap="2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Athena</h1>
        <p className="text-base text-[var(--text-muted)]">
          Start a run with a description of what you want. Athena will draft a PRD,
          design, tickets, and a pull request — with your team approving every step.
        </p>
      </Stack>

      {config.enableDemo && (
        <Cluster gap="3">
          <Button onClick={() => startNew()} loading={pending}>
            <Play className="size-4" />
            Start demo run
          </Button>
          <Button variant="secondary" onClick={() => startNew("Generate a PRD for a new feature")}>
            <Sparkles className="size-4" />
            Generate a PRD
          </Button>
        </Cluster>
      )}

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      <KnowledgeSyncCard projectId="prj_demo" />

      <Grid cols="auto-fit-320" gap="4">
        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Your most recent runs in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-7" />}
                title="No runs yet"
                description="Start your first run by clicking the button above."
              />
            ) : (
              <Stack gap="2" as="ul">
                {recent.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/runs/${run.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="line-clamp-1 flex-1">{run.goal}</span>
                      <Cluster gap="2" align="center">
                        <StatusPill status={STATUS_MAP[run.status]} />
                        <ArrowRight className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
                      </Cluster>
                    </Link>
                  </li>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending gates</CardTitle>
            <CardDescription>Approvals waiting on you.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<Inbox className="size-7" />}
              title="Nothing for you to review"
              description="When agents reach a phase boundary, you'll see approval requests here."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
            <CardDescription>Usage at a glance.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="3">
              <UsageStat label="Runs" value={String(recent.length)} />
              <UsageStat label="Spend" value={formatUsd(monthSpend)} />
              <UsageStat label="Cache hit rate" value="—" muted />
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Stack>
  );
}

function UsageStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span
        className={`text-base font-medium tabular-nums ${
          muted ? "text-[var(--text-muted)]" : "text-[var(--text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
