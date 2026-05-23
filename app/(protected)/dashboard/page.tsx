"use client";

/**
 * /dashboard — Home.
 *
 * The default landing page after sign-in. Six surfaces:
 *   - Hero with "New task" CTA
 *   - KPIs (active tasks, MTD spend, unread inbox, capability count)
 *   - Recent tasks (top 5)
 *   - Inbox preview (top 5)
 *   - Capability snapshot
 *   - Activity rail (top 5)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Inbox, Plus, Sparkles, FolderGit2, CircleDollarSign } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useMascotStore } from "@/lib/stores/mascot";
import { useSession } from "@/lib/session/SessionProvider";
import {
  api, ApiError,
  type Run, type ActivityItem, type InboxItem, type Capability, type CostSummary,
} from "@/lib/api/client";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { CostPill } from "@/components/runs/cost-pill";
import { NewRunDialog } from "@/components/runs/new-run-dialog";
import { cn } from "@/lib/cn";

const STATUS_MAP: Record<Run["status"], Status> = {
  queued: "queued",
  running: "running",
  awaiting_gate: "awaiting_gate",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  gate_rejected: "gate_rejected",
};

export default function DashboardPage() {
  const router = useRouter();
  const { me } = useSession();
  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);
  const [tasks, setTasks] = useState<Run[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);

  useEffect(() => { setScreenDefault("idle"); }, [setScreenDefault]);

  // The Cmd-K palette dispatches this event when a user picks "Start a new task".
  useEffect(() => {
    const open = () => setOpenNew(true);
    document.addEventListener("athena:new-task", open);
    return () => document.removeEventListener("athena:new-task", open);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [taskList, inboxPage, activityPage, capabilityList, costSummary] = await Promise.all([
          api.runs.list(),
          api.inbox.list({ limit: 5 }),
          api.activity.list({ limit: 5 }),
          api.capabilities.list(),
          api.cost.summary().catch(() => null),
        ]);
        if (cancelled) return;
        setTasks(taskList.slice(0, 5));
        setInbox(inboxPage.items.slice(0, 5));
        setActivity(activityPage.items.slice(0, 5));
        setCapabilities(capabilityList.slice(0, 6));
        setCost(costSummary);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load dashboard");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onCreated = (run: Run) => {
    setOpenNew(false);
    router.push(`/runs/${run.id}`);
  };

  const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "queued").length;
  const unread = inbox.filter((i) => !i.read).length;

  return (
    <Stack gap="6">
      <Stack gap="2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{me ? `, ${me.displayName.split(" ")[0]}` : ""}.
        </h1>
        <p className="text-base text-[var(--text-muted)]">
          Start a task with a description of what you want. Athena will draft the spec, plan, code, and PR — with humans approving every gate.
        </p>
      </Stack>

      <Cluster gap="3">
        <Button onClick={() => setOpenNew(true)} size="lg">
          <Plus className="size-4" />
          New task
        </Button>
        <Link href="/inbox">
          <Button variant="outline" size="lg">
            <Inbox className="size-4" />
            Inbox{unread > 0 && <span className="ml-1 rounded-full bg-[var(--danger)] px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread}</span>}
          </Button>
        </Link>
      </Cluster>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      <Grid cols="auto-fit-220" gap="3">
        <KpiCard icon={Sparkles}        label="Active tasks"           value={activeTasks.toString()} href="/runs" />
        <KpiCard icon={Inbox}           label="Inbox · waiting on you" value={unread.toString()}      href="/inbox" tone={unread > 0 ? "warning" : "neutral"} />
        <KpiCard icon={CircleDollarSign}label="MTD spend"               value={cost ? `$${cost.spend_usd.toLocaleString()}` : "—"} sub={cost ? `${Math.round(cost.budget_utilization * 100)}% of budget` : undefined} href="/cost" />
        <KpiCard icon={FolderGit2}      label="Capabilities"            value={capabilities.length.toString()} href="/capabilities" />
      </Grid>

      <Grid cols="auto-fit-360" gap="4">
        <Card>
          <CardHeader>
            <Cluster justify="between" align="center">
              <Stack gap="0">
                <CardTitle>Recent tasks</CardTitle>
                <CardDescription>Your most recent activity in this workspace.</CardDescription>
              </Stack>
              <Link href="/runs" className="text-xs font-medium text-[var(--primary)] hover:underline">All tasks <ArrowRight className="inline size-3" /></Link>
            </Cluster>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-7" />}
                title="No tasks yet"
                description="Start your first task with the button above."
              />
            ) : (
              <Stack gap="2" as="ul">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/runs/${task.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="line-clamp-1 flex-1">{task.goal}</span>
                      <Cluster gap="2" align="center">
                        <CostPill usd={task.spent_usd} />
                        <StatusPill status={STATUS_MAP[task.status]} />
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
            <Cluster justify="between" align="center">
              <Stack gap="0">
                <CardTitle>Inbox</CardTitle>
                <CardDescription>Things waiting on your attention.</CardDescription>
              </Stack>
              <Link href="/inbox" className="text-xs font-medium text-[var(--primary)] hover:underline">Open inbox <ArrowRight className="inline size-3" /></Link>
            </Cluster>
          </CardHeader>
          <CardContent>
            {inbox.length === 0 ? (
              <EmptyState icon={<Inbox className="size-7" />} title="Inbox zero" description="You're caught up." />
            ) : (
              <Stack gap="2" as="ul">
                {inbox.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.task_id ? `/runs/${item.task_id}` : item.to ?? "/inbox"}
                      className={cn(
                        "-mx-2 block rounded-md px-2 py-2 text-sm hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                        item.priority === "high" && "border-l-2 border-l-[var(--danger)] pl-3",
                      )}
                    >
                      <span className="line-clamp-1 font-medium">{item.title}</span>
                      <span className="text-xs text-[var(--text-muted)]">{item.actor} · {item.when}</span>
                    </Link>
                  </li>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid cols="auto-fit-360" gap="4">
        <Card>
          <CardHeader>
            <Cluster justify="between" align="center">
              <Stack gap="0">
                <CardTitle>Capabilities</CardTitle>
                <CardDescription>Domain ownership across your codebase.</CardDescription>
              </Stack>
              <Link href="/capabilities" className="text-xs font-medium text-[var(--primary)] hover:underline">All capabilities <ArrowRight className="inline size-3" /></Link>
            </Cluster>
          </CardHeader>
          <CardContent>
            {capabilities.length === 0 ? (
              <EmptyState icon={<FolderGit2 className="size-7" />} title="No capabilities yet" description="Define your first capability to start grouping repos." />
            ) : (
              <Stack gap="2" as="ul">
                {capabilities.map((c) => (
                  <li key={c.id}>
                    <Link href={`/capabilities/${c.id}`} className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-[var(--surface-2)]">
                      <Stack gap="0">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-[var(--text-muted)]">/{c.slug}</span>
                      </Stack>
                      <ArrowRight className="size-3.5 text-[var(--text-subtle)]" />
                    </Link>
                  </li>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Cluster justify="between" align="center">
              <Stack gap="0">
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>What&apos;s happening in the workspace.</CardDescription>
              </Stack>
              <Link href="/activity" className="text-xs font-medium text-[var(--primary)] hover:underline">Open <ArrowRight className="inline size-3" /></Link>
            </Cluster>
          </CardHeader>
          <CardContent>
            <Stack gap="2" as="ul">
              {activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="block" dangerouslySetInnerHTML={{ __html: `<strong>${a.who}</strong> ${a.text_html}` }} />
                  <span className="text-xs text-[var(--text-muted)]">{a.when}</span>
                </li>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <NewRunDialog open={openNew} onOpenChange={setOpenNew} onCreated={onCreated} />
    </Stack>
  );
}

function KpiCard({ icon: Icon, label, value, sub, href, tone }: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  sub?: string | undefined;
  href: string;
  tone?: "warning" | "neutral" | undefined;
}) {
  return (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
      <Card className="hover:bg-[var(--surface-2)]">
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Icon className="size-4 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
          </Cluster>
          <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", tone === "warning" && Number(value) > 0 && "text-[var(--warning)]")}>{value}</span>
          {sub && <span className="text-xs text-[var(--text-muted)]">{sub}</span>}
        </Stack>
      </Card>
    </Link>
  );
}
