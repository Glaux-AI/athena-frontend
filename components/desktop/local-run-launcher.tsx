"use client";

// LocalRunLauncher: the desktop-only "Run this task locally with Claude Code" control on the task
// cockpit. It starts the headless local executor (claim_stage -> worktree -> claude CLI driving the
// GATED local tool surface -> register_pull_request) for a chosen stage, in a chosen local
// workspace + cloned repo, and shows the run's live status. Renders nothing on the web build.
//
// The task carries no single repo (the repo comes from stage context), so the user picks which of
// their cloned repos the task targets - the one place that choice is unambiguous.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, FolderGit2, Loader2, Square } from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { ExecutorRun, Workspace } from "@/lib/desktop/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface LocalRunLauncherProps {
  taskId: string;
  taskDisplayId: string;
  /** The stage tab currently selected in the cockpit; pre-fills the stage to run. */
  stage: string | null;
}

interface RepoOption {
  workspaceId: string;
  repoFullName: string;
}

const ACTIVE_STATUSES: ReadonlySet<ExecutorRun["status"]> = new Set(["claiming", "working", "submitting"]);

export function LocalRunLauncher({ taskId, taskDisplayId, stage }: LocalRunLauncherProps) {
  const [mounted, setMounted] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [repoKey, setRepoKey] = useState<string>("");
  const [stageInput, setStageInput] = useState<string>(stage ?? "");
  const [run, setRun] = useState<ExecutorRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (stage && !stageInput) setStageInput(stage);
  }, [stage, stageInput]);

  // Load the user's local workspaces (for the repo picker) + any existing run for this task.
  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    void (async () => {
      try {
        const list = await athena.workspace.list();
        if (alive) setWorkspaces(list);
      } catch {
        if (alive) setWorkspaces([]);
      }
      try {
        const runs = await athena.executor.list();
        const mine = runs.filter((r) => r.taskDisplayId === taskDisplayId);
        const last = mine[mine.length - 1];
        if (alive && last) setRun(last);
      } catch {
        /* no runs */
      }
    })();
    return () => {
      alive = false;
    };
  }, [taskDisplayId]);

  // Track this task's run live.
  useEffect(() => {
    if (!isDesktop) return;
    const off = athena.executor.onEvent((e) => {
      if (e.run.taskDisplayId === taskDisplayId) setRun(e.run);
    });
    return off;
  }, [taskDisplayId]);

  const repoOptions = useMemo<RepoOption[]>(() => {
    if (!workspaces) return [];
    const out: RepoOption[] = [];
    for (const ws of workspaces) {
      for (const repo of ws.repos) out.push({ workspaceId: ws.id, repoFullName: repo.fullName });
    }
    return out;
  }, [workspaces]);

  // Default the repo selection to the only option (common single-repo case).
  useEffect(() => {
    const only = repoOptions[0];
    if (!repoKey && repoOptions.length === 1 && only) {
      setRepoKey(`${only.workspaceId}::${only.repoFullName}`);
    }
  }, [repoKey, repoOptions]);

  const start = useCallback(async () => {
    const [workspaceId, repoFullName] = repoKey.split("::");
    const stageToRun = stageInput.trim();
    if (!workspaceId || !repoFullName || !stageToRun) return;
    setStarting(true);
    setError(null);
    try {
      await athena.executor.start({ taskId, taskDisplayId, stage: stageToRun, workspaceId, repoFullName });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the local run.");
    } finally {
      setStarting(false);
    }
  }, [repoKey, stageInput, taskId, taskDisplayId]);

  const stop = useCallback(async () => {
    if (!run) return;
    try {
      await athena.executor.stop(run.id);
    } catch {
      /* already stopped */
    }
  }, [run]);

  if (!mounted || !isDesktop) return null;

  const isActive = run != null && ACTIVE_STATUSES.has(run.status);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Bot className="size-4 text-[var(--primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text)]">Run locally with Claude</h3>
      </div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        Claude Code runs this stage in a local git worktree on your machine. Every file write, command,
        and commit is reviewed by the approval gate before it lands.
      </p>

      {repoOptions.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          Clone this task&apos;s repo into a local workspace first.{" "}
          <Link href="/local/workspaces" className="text-[var(--primary)] underline">
            Open Workspaces
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Repo
            <select
              value={repoKey}
              onChange={(e) => setRepoKey(e.target.value)}
              disabled={isActive}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="">Select a cloned repo…</option>
              {repoOptions.map((o) => (
                <option key={`${o.workspaceId}::${o.repoFullName}`} value={`${o.workspaceId}::${o.repoFullName}`}>
                  {o.repoFullName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Stage
            <input
              value={stageInput}
              onChange={(e) => setStageInput(e.target.value)}
              placeholder="e.g. execute"
              disabled={isActive}
              spellCheck={false}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>

          {run ? (
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
              <FolderGit2 className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]" title={run.message}>
                <span className="font-medium text-[var(--text)]">{run.status}</span> — {run.message}
              </span>
              {isActive ? (
                <button
                  type="button"
                  onClick={() => void stop()}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  <Square className="size-3" /> Stop
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}

          <Button
            onClick={() => void start()}
            disabled={isActive || starting || !repoKey || !stageInput.trim()}
            size="sm"
            className="w-full"
          >
            {isActive || starting ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
            {isActive ? "Running locally…" : "Run locally with Claude"}
          </Button>
        </div>
      )}
    </Card>
  );
}
