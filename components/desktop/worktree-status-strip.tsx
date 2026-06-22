"use client";

// WorktreeStatusStrip - a compact status row that shows every live worktree for the focused
// workspace: its branch, ahead/behind vs the indexed base, and the advisory `heldBy` lock.
//
// `heldBy` is the read-only advisory lock: the terminal surface and the executor both read it;
// overlap is shown, never hard-locked here. The authoritative fence stays claim_stage's CAS.
// When a held task leaves "active" the strip turns the chip stale-red (driven by a task_status
// notify event from main).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, GitBranch, TerminalSquare, TriangleAlert } from "lucide-react";

import { athena } from "@/lib/desktop/bridge";
import type { GitStatus, NotifyEvent, WorktreeMeta } from "@/lib/desktop/types";

interface WorktreeStatusStripProps {
  /** The active workspace whose worktrees to show; null hides the strip. */
  workspaceId: string | null;
}

interface Row {
  meta: WorktreeMeta;
  ahead: number | null;
  behind: number | null;
  stale: boolean;
}

function holderLabel(heldBy: WorktreeMeta["heldBy"]): string {
  if (heldBy === "executor") return "executor";
  if (heldBy === "terminal") return "terminal";
  return "idle";
}

export function WorktreeStatusStrip({ workspaceId }: WorktreeStatusStripProps) {
  const [worktrees, setWorktrees] = useState<WorktreeMeta[]>([]);
  const [statuses, setStatuses] = useState<Record<string, GitStatus>>({});
  const [staleTasks, setStaleTasks] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setWorktrees([]);
      setLoaded(true);
      return;
    }
    try {
      const list = await athena.worktree.list(workspaceId);
      setWorktrees(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to read worktrees");
    } finally {
      setLoaded(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!workspaceId || worktrees.length === 0) return;
    let cancelled = false;
    const repos = Array.from(new Set(worktrees.map((w) => w.repoFullName)));
    void Promise.all(
      repos.map(async (repoFullName) => {
        try {
          const status = await athena.git.status(workspaceId, repoFullName);
          return [repoFullName, status] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, GitStatus> = {};
      for (const pair of pairs) if (pair) next[pair[0]] = pair[1];
      setStatuses(next);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, worktrees]);

  useEffect(() => {
    const off = athena.notify.onEvent((e: NotifyEvent) => {
      if (e.kind !== "task_status") return;
      const left = !/\bactive\b/i.test(e.body);
      setStaleTasks((prev) => {
        const next = new Set(prev);
        if (left) next.add(e.taskDisplayId);
        else next.delete(e.taskDisplayId);
        return next;
      });
    });
    return off;
  }, []);

  const rows = useMemo<Row[]>(() => {
    return worktrees.map((meta) => {
      const status = statuses[meta.repoFullName];
      const onBranch = status && status.branch === meta.branch;
      return {
        meta,
        ahead: onBranch ? status.ahead : null,
        behind: onBranch ? status.behind : null,
        stale: staleTasks.has(meta.taskDisplayId),
      };
    });
  }, [worktrees, statuses, staleTasks]);

  if (!workspaceId) return null;
  if (loaded && worktrees.length === 0 && !error) {
    return (
      <div className="worktree-strip is-empty" role="status">
        <span className="worktree-strip-empty">No active worktrees.</span>
      </div>
    );
  }

  return (
    <div className="worktree-strip" role="list" aria-label="Active worktrees">
      {!loaded ? (
        <>
          <span className="worktree-chip is-skeleton" aria-hidden />
          <span className="worktree-chip is-skeleton" aria-hidden />
        </>
      ) : null}

      {error ? (
        <span className="worktree-strip-error" role="alert">
          <TriangleAlert size={13} aria-hidden /> {error}
        </span>
      ) : null}

      {rows.map((row) => {
        const { meta, ahead, behind, stale } = row;
        const holder = holderLabel(meta.heldBy);
        return (
          <span
            key={meta.path}
            role="listitem"
            className={`worktree-chip held-${holder}${stale ? " is-stale" : ""}${meta.inspect ? " is-inspect" : ""}`}
            title={
              stale
                ? `${meta.taskDisplayId} is no longer active - keep or remove this worktree`
                : `${meta.taskDisplayId} on ${meta.branch} (${holder})`
            }
          >
            <span className="worktree-chip-task">{meta.taskDisplayId}</span>
            <span className="worktree-chip-branch">
              <GitBranch size={12} aria-hidden /> {meta.branch}
            </span>
            {ahead != null && behind != null ? (
              <span className="worktree-chip-drift" aria-label={`${ahead} ahead, ${behind} behind`}>
                <span className="drift-ahead">↑{ahead}</span>
                <span className="drift-behind">↓{behind}</span>
              </span>
            ) : null}
            <span className={`worktree-chip-holder is-${holder}`}>
              {meta.heldBy === "executor" ? <Bot size={12} aria-hidden /> : null}
              {meta.heldBy === "terminal" ? <TerminalSquare size={12} aria-hidden /> : null}
              {holder}
              {meta.inspect ? " · inspect" : ""}
            </span>
            {stale ? (
              <span className="worktree-chip-stale-flag">
                <TriangleAlert size={12} aria-hidden /> task ended
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
