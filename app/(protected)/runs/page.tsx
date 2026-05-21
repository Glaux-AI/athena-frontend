"use client";

/**
 * /runs — every agent run in the active workspace.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Inbox } from "lucide-react";

import { api, ApiError, type Run } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { CostPill } from "@/components/runs/cost-pill";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatRelativeTime } from "@/lib/utils/format";
import { NewRunDialog } from "@/components/runs/new-run-dialog";

const STATUS_MAP: Record<Run["status"], Status> = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

export default function RunsListPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await api.runs.list();
      setRuns(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onCreated = (run: Run) => {
    setOpenNew(false);
    router.push(`/runs/${run.id}`);
  };

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Every agent run started in this workspace. Click to watch it stream.
          </p>
        </Stack>
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="size-4" />
          Start a run
        </Button>
      </Cluster>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <Stack gap="2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
            />
          ))}
        </Stack>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-7" />}
          title="No runs yet"
          description="Start your first run to generate a PRD or get a chat reply."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="size-4" />
              Start a run
            </Button>
          }
        />
      ) : (
        <Stack gap="2" as="ul">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/runs/${run.id}`}
                className="block rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <Card className="hover:bg-[var(--surface-2)]">
                  <Cluster justify="between" align="center">
                    <Stack gap="1">
                      <span className="text-base font-medium">{run.goal}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatRelativeTime(run.created_at)} · {run.id}
                      </span>
                    </Stack>
                    <Cluster gap="2" align="center">
                      <CostPill usd={run.spent_usd} />
                      <StatusPill status={STATUS_MAP[run.status]} />
                    </Cluster>
                  </Cluster>
                </Card>
              </Link>
            </li>
          ))}
        </Stack>
      )}

      <NewRunDialog open={openNew} onOpenChange={setOpenNew} onCreated={onCreated} />
    </Stack>
  );
}
