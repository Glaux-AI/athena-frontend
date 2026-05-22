"use client";

/**
 * /capabilities/{id} — capability detail with full tabs.
 *
 *   - overview: KPIs, owner, last activity, top nodes.
 *   - repos:    attached repos.
 *   - resources: PDFs / Notion / runbooks / notes that feed the knowledge base.
 *   - notes:    domain notes promoted from chat / review.
 *   - tasks:    runs filtered to this capability.
 *   - config:   model per phase + skills attached + review policy.
 */

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  Loader2, GitBranch, Plus, BookOpen, FileText, StickyNote, ShieldCheck, Cpu,
  ExternalLink, CheckCircle2, AlertTriangle,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import {
  api, ApiError,
  type Capability, type CapabilityRepo, type RunDetail, type CapabilityResource, type CapabilityConfig, type DomainNote,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

type Tab = "overview" | "repos" | "resources" | "notes" | "tasks" | "config";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview",  label: "Overview"  },
  { key: "repos",     label: "Repos"     },
  { key: "resources", label: "Knowledge" },
  { key: "notes",     label: "Notes"     },
  { key: "tasks",     label: "Tasks"     },
  { key: "config",    label: "Config"    },
];

const RUN_STATUS_MAP: Record<RunDetail["status"], Status> = {
  queued: "queued", running: "running", completed: "completed", failed: "failed", cancelled: "cancelled",
};

export default function CapabilityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cap, setCap] = useState<Capability | null>(null);
  const [repos, setRepos] = useState<CapabilityRepo[]>([]);
  const [runs, setRuns] = useState<RunDetail[]>([]);
  const [resources, setResources] = useState<CapabilityResource[]>([]);
  const [config, setConfig] = useState<CapabilityConfig | null>(null);
  const [notes, setNotes] = useState<DomainNote[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, r, rs, res, cfg, nts] = await Promise.all([
          api.capabilities.get(id),
          api.capabilities.listRepos(id),
          api.runs.list() as Promise<RunDetail[]>,
          api.capabilities.listResources(id).catch(() => [] as CapabilityResource[]),
          api.capabilities.config(id).catch(() => null),
          api.capabilities.notes(id).catch(() => [] as DomainNote[]),
        ]);
        setCap(c);
        setRepos(r);
        setRuns(rs.filter((run) => run.capability_id === id));
        setResources(res);
        setConfig(cfg);
        setNotes(nts);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load capability");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>;
  if (error || !cap) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error ?? "Capability not found"}</p></Card>;

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Link href="/capabilities" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">← Capabilities</Link>
        <Cluster gap="2" align="center">
          <h1 className="text-2xl font-semibold tracking-tight">{cap.name}</h1>
          <span className="text-sm text-[var(--text-muted)]">/{cap.slug}</span>
        </Cluster>
        <p className="max-w-2xl text-sm text-[var(--text-muted)]">{cap.description}</p>
      </Stack>

      <div className="overflow-x-auto border-b border-[var(--border)]">
        <Cluster gap="0" className="-mb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium",
                tab === t.key ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </Cluster>
      </div>

      {tab === "overview" && <OverviewTab cap={cap} repos={repos} runs={runs} resources={resources} notes={notes} />}
      {tab === "repos" && <ReposTab repos={repos} />}
      {tab === "resources" && <ResourcesTab resources={resources} />}
      {tab === "notes" && <NotesTab notes={notes} />}
      {tab === "tasks" && <TasksTab runs={runs} />}
      {tab === "config" && <ConfigTab config={config} />}
    </Stack>
  );
}

function OverviewTab({ cap, repos, runs, resources, notes }: { cap: Capability; repos: CapabilityRepo[]; runs: RunDetail[]; resources: CapabilityResource[]; notes: DomainNote[] }) {
  const open = runs.filter((r) => r.status !== "completed" && r.status !== "cancelled").length;
  return (
    <Grid cols="auto-fit-220" gap="3">
      <KpiCard label="Open tasks"  value={open.toString()} />
      <KpiCard label="Repos"       value={repos.length.toString()} />
      <KpiCard label="Resources"   value={resources.length.toString()} sub={`${resources.filter((r) => r.status === "indexed").length} indexed`} />
      <KpiCard label="Domain notes"value={notes.length.toString()} />
      <KpiCard label="Owner"       value={cap.created_by_user_id?.replace("u_", "") ?? "—"} sub={`Created ${new Date(cap.created_at).toLocaleDateString()}`} />
    </Grid>
  );
}

function ReposTab({ repos }: { repos: CapabilityRepo[] }) {
  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">{repos.length} repo{repos.length === 1 ? "" : "s"} indexed.</span>
        <Button variant="outline"><Plus className="size-4" />Attach repo</Button>
      </Cluster>
      <Stack gap="2" as="ul">
        {repos.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No repos attached.</p> : repos.map((r) => (
          <li key={r.id}>
            <Card>
              <Cluster justify="between" align="center">
                <Cluster gap="3" align="center">
                  <GitBranch className="size-4 text-[var(--text-muted)]" />
                  <Stack gap="0">
                    <span className="font-medium">{r.repo_full_name}</span>
                    <span className="text-xs text-[var(--text-muted)]">default branch: {r.default_branch}</span>
                  </Stack>
                </Cluster>
                <span className="text-xs text-[var(--text-subtle)]">attached {new Date(r.created_at).toLocaleDateString()}</span>
              </Cluster>
            </Card>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

function ResourcesTab({ resources }: { resources: CapabilityResource[] }) {
  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">{resources.length} resource{resources.length === 1 ? "" : "s"}.</span>
        <Button><Plus className="size-4" />Upload resource</Button>
      </Cluster>
      {resources.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No resources yet. Drop PDFs, Notion links, or paste a markdown note.</p> : (
        <Stack gap="2" as="ul">
          {resources.map((r) => (
            <li key={r.id}>
              <Card>
                <Stack gap="2">
                  <Cluster justify="between" align="center">
                    <Cluster gap="2" align="center">
                      {r.kind === "file" && <FileText className="size-4 text-[var(--text-muted)]" />}
                      {r.kind === "link" && <ExternalLink className="size-4 text-[var(--text-muted)]" />}
                      {r.kind === "note" && <StickyNote className="size-4 text-[var(--text-muted)]" />}
                      <Stack gap="0">
                        <span className="text-sm font-semibold">{r.title}</span>
                        <span className="text-xs text-[var(--text-muted)]">{r.source} · {r.format}</span>
                      </Stack>
                    </Cluster>
                    <Cluster gap="2" align="center">
                      {r.status === "indexed" && <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]"><CheckCircle2 className="mr-1 inline size-2.5" />Indexed · {r.nodes_generated} nodes</span>}
                      {r.status === "indexing" && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]"><Loader2 className="mr-1 inline size-2.5 animate-spin" />Indexing {r.progress ?? 0}%</span>}
                      {r.status === "queued" && <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Queued</span>}
                      {r.status === "failed" && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]"><AlertTriangle className="mr-1 inline size-2.5" />Failed</span>}
                    </Cluster>
                  </Cluster>
                  <p className="text-xs text-[var(--text-muted)]">{r.summary}</p>
                  <Cluster gap="2" align="center">
                    {r.tags.map((t) => (
                      <span key={t} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{t}</span>
                    ))}
                    <span className="ml-auto text-[10px] text-[var(--text-subtle)]">
                      {r.uploaded_by} · {r.uploaded_at}{r.last_used ? ` · last used ${r.last_used}` : ""}
                    </span>
                  </Cluster>
                </Stack>
              </Card>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function NotesTab({ notes }: { notes: DomainNote[] }) {
  return (
    <Stack gap="3">
      <Cluster justify="between" align="center">
        <span className="text-sm text-[var(--text-muted)]">{notes.length} note{notes.length === 1 ? "" : "s"} promoted from team conversations.</span>
        <Button variant="outline"><Plus className="size-4" />Add note</Button>
      </Cluster>
      {notes.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No notes yet. Promote findings from chat or review here.</p> : (
        <Stack gap="2" as="ul">
          {notes.map((n) => (
            <li key={n.id}>
              <Card>
                <Stack gap="1">
                  <Cluster gap="2" align="center">
                    <BookOpen className="size-4 text-[var(--text-muted)]" />
                    <span className="text-sm font-semibold">{n.title}</span>
                  </Cluster>
                  <p className="text-sm text-[var(--text-muted)]">{n.body}</p>
                  <span className="text-[10px] text-[var(--text-subtle)]">{n.author} · {n.date} · promoted from {n.promoted_from}</span>
                </Stack>
              </Card>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function TasksTab({ runs }: { runs: RunDetail[] }) {
  return (
    <Stack gap="2" as="ul">
      {runs.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No tasks for this capability yet.</p> : runs.map((r) => (
        <li key={r.id}>
          <Link href={`/runs/${r.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-lg">
            <Card className="hover:bg-[var(--surface-2)]">
              <Cluster justify="between" align="center">
                <Stack gap="0">
                  <span className="font-medium">{r.goal}</span>
                  <span className="text-xs text-[var(--text-muted)]">requested by {r.requested_by} · phase {r.current_phase + 1}/6</span>
                </Stack>
                <StatusPill status={RUN_STATUS_MAP[r.status]} />
              </Cluster>
            </Card>
          </Link>
        </li>
      ))}
    </Stack>
  );
}

function ConfigTab({ config }: { config: CapabilityConfig | null }) {
  if (!config) return <Card><p className="text-sm text-[var(--text-muted)]">No config defined yet.</p></Card>;
  const phases = ["spec","plan","implement","review","ci","pr"] as const;
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center"><Cpu className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Model per phase</span></Cluster>
          <Grid cols="auto-fit-180" gap="2">
            {phases.map((p) => (
              <div key={p} className="rounded-md border border-[var(--border)] p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{p}</div>
                <div className="font-mono text-xs text-[var(--text)]">{config.models[p] ?? "—"}</div>
              </div>
            ))}
          </Grid>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Skills attached ({config.skills.length})</span>
          <Cluster gap="2">
            {config.skills.map((s) => (
              <Link key={s} href={`/skills/${s}`} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary)] hover:underline">{s}</Link>
            ))}
          </Cluster>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center"><ShieldCheck className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Review policy</span></Cluster>
          <Grid cols="auto-fit-200" gap="2">
            <KpiCard label="Spec approvers"   value={config.review_policy.spec_approvers.toString()} />
            <KpiCard label="Review approvers" value={config.review_policy.review_approvers.toString()} />
            <KpiCard label="CI must pass"     value={config.review_policy.ci_must_pass ? "Yes" : "No"} />
            <KpiCard label="Auto-merge"       value={config.review_policy.auto_merge ? "Enabled" : "Disabled"} />
          </Grid>
        </Stack>
      </Card>
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Context repos</span>
          <Cluster gap="2">
            {config.context_repos.map((r) => (
              <span key={r} className="rounded bg-[var(--surface-2)] px-2 py-1 font-mono text-xs">{r}</span>
            ))}
          </Cluster>
        </Stack>
      </Card>
    </Stack>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <Stack gap="1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-xs text-[var(--text-muted)]">{sub}</span>}
      </Stack>
    </Card>
  );
}
