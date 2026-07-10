"use client";

// ActiveTaskSwitcher: the single top-bar control that surfaces local machine state.
//
// THE ONLY place locality is made visible. It shows the focused task + stage as a closed chip
// and, on open, the active tasks with a strictly-local "on this device" worktree badge. That
// badge must never read as a sync indicator: the cloud is the source of truth for "someone is
// working this task"; this dot is demoted to "on this device" so its ABSENCE never implies the
// task is idle. Selecting a task focuses it (binds new terminals + diff base) and routes to
// /work/<id>. Renders nothing on the web build.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, GitBranch, Plus, Terminal as TerminalIcon } from "lucide-react";

import { Pill } from "@/components/ui/pill";
import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { ExecutorRun, WorktreeMeta } from "@/lib/desktop/types";
import { useWorktrees } from "@/lib/desktop/worktrees-store";
import { useTerminalsStore } from "@/lib/desktop/terminals-store";
import { useDesktopDock } from "@/components/desktop/dock-context";

interface ActiveTask {
  taskDisplayId: string;
  stage: string | null;
  onThisMac: boolean;
  live: boolean;
  branch: string | null;
}

// A run in one of these statuses is actively working THIS device right now (drives the live dot).
const LIVE_RUN_STATUSES: ReadonlySet<ExecutorRun["status"]> = new Set([
  "claiming",
  "working",
  "submitting",
]);

// Fold worktrees AND live executor runs into one active-task list. A run is the primary signal: a
// local run (e.g. a document/knowledge task) leaves no git worktree, so without this the chip would
// read "No active task" the whole time Claude is working. Runs win on stage/live since they are the
// live truth; worktrees contribute the branch + "on this device" badge.
function collapseActive(worktrees: WorktreeMeta[], runs: ExecutorRun[]): ActiveTask[] {
  const byTask = new Map<string, ActiveTask>();
  for (const wt of worktrees) {
    const existing = byTask.get(wt.taskDisplayId);
    const live = wt.heldBy !== null;
    if (!existing) {
      byTask.set(wt.taskDisplayId, {
        taskDisplayId: wt.taskDisplayId,
        stage: wt.claimedStage,
        onThisMac: true,
        live,
        branch: wt.branch,
      });
      continue;
    }
    if (live && !existing.live) {
      existing.stage = wt.claimedStage;
      existing.branch = wt.branch;
    }
    existing.live = existing.live || live;
  }
  for (const run of runs) {
    const live = LIVE_RUN_STATUSES.has(run.status);
    const existing = byTask.get(run.taskDisplayId);
    if (!existing) {
      // A finished run that left no worktree (e.g. a document/knowledge task) should NOT linger as
      // an active task - executor.list() keeps terminal runs for the process lifetime. Only surface a
      // run-only task while it is live; once done, the worktree (if any) is its sole remaining source.
      if (!live) continue;
      byTask.set(run.taskDisplayId, {
        taskDisplayId: run.taskDisplayId,
        stage: run.stage,
        onThisMac: true,
        live,
        branch: null,
      });
      continue;
    }
    // The run carries the authoritative current stage + liveness for this task.
    existing.stage = run.stage || existing.stage;
    existing.live = existing.live || live;
  }
  return [...byTask.values()].sort((a, b) => a.taskDisplayId.localeCompare(b.taskDisplayId));
}

export function ActiveTaskSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // The last task we saw running, so we auto-focus a NEWLY-started run exactly once and never snap
  // focus back after the user deliberately cleared or changed it.
  const lastLiveTaskRef = useRef<string | null>(null);

  const focusedTaskDisplayId = useWorktrees((s) => s.focusedTaskDisplayId);
  const setFocused = useWorktrees((s) => s.setFocused);
  const addTab = useTerminalsStore((s) => s.addTab);
  const { open: openDock } = useDesktopDock();

  const refresh = useCallback(async () => {
    if (!isDesktop) {
      setLoading(false);
      return;
    }
    try {
      const [workspaces, runs] = await Promise.all([
        athena.workspace.list(),
        athena.executor.list().catch(() => [] as ExecutorRun[]),
      ]);
      const all: WorktreeMeta[] = [];
      for (const ws of workspaces) {
        // One bad workspace (a moved/deleted repo dir, transient git/IPC error) must not blank the
        // whole chip: degrade to "no worktree badge for that task" and keep the live runs.
        all.push(...(await athena.worktree.list(ws.id).catch(() => [] as WorktreeMeta[])));
      }
      const merged = collapseActive(all, runs);
      setTasks(merged);

      // Auto-focus the task a NEWLY-started run is working, so the top-bar chip reflects "what's
      // running now" without the user having to pick it. Fires once per new live task and only when
      // nothing valid is focused - it never snaps focus back after the user deliberately cleared
      // (selectTask(null)) or picked a different task. Sets the chip only; no navigation.
      const liveTask = merged.find((t) => t.live);
      if (liveTask) {
        const isNewLiveTask = lastLiveTaskRef.current !== liveTask.taskDisplayId;
        const focused = useWorktrees.getState().focusedTaskDisplayId;
        const focusedStillPresent = merged.some((t) => t.taskDisplayId === focused);
        if (isNewLiveTask && (!focused || !focusedStillPresent)) {
          useWorktrees.getState().setFocused(liveTask.taskDisplayId);
          void athena.workspace.focus(liveTask.taskDisplayId).catch(() => undefined);
        }
        lastLiveTaskRef.current = liveTask.taskDisplayId;
      } else {
        lastLiveTaskRef.current = null;
      }
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!isDesktop) return;
    const off = athena.executor.onEvent(() => void refresh());
    return off;
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const focused = useMemo(
    () => tasks.find((t) => t.taskDisplayId === focusedTaskDisplayId) ?? null,
    [tasks, focusedTaskDisplayId],
  );

  const selectTask = useCallback(
    async (taskDisplayId: string | null) => {
      setOpen(false);
      setFocused(taskDisplayId);
      if (isDesktop) {
        try {
          await athena.workspace.focus(taskDisplayId);
        } catch {
          /* advisory; logged in main */
        }
      }
      if (taskDisplayId) router.push(`/work/${encodeURIComponent(taskDisplayId)}`);
    },
    [router, setFocused],
  );

  // Hidden entirely on the web build (no local worktrees to surface).
  if (!isDesktop) return null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          height: "1.75rem",
          padding: "0 0.5rem",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          font: "inherit",
          fontSize: "0.8125rem",
          cursor: "pointer",
          maxWidth: "15rem",
        }}
      >
        <GitBranch size={13} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {focused ? focused.taskDisplayId : "No active task"}
        </span>
        {focused?.stage ? <span style={{ color: "var(--text-muted)" }}>· {focused.stage}</span> : null}
        {focused?.live ? <LiveDot /> : null}
        <ChevronDown size={13} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 50,
            width: "20rem",
            maxHeight: "24rem",
            overflowY: "auto",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-3)",
            padding: "0.375rem",
          }}
        >
          <div
            className="text-micro"
            style={{
              padding: "0.25rem 0.5rem 0.375rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Active tasks
          </div>

          {loading ? (
            <SwitcherSkeleton />
          ) : tasks.length === 0 ? (
            <p style={{ margin: 0, padding: "0.5rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              No worktree on this device yet. Start a task or open a scratch terminal.
            </p>
          ) : (
            tasks.map((t) => (
              <button
                key={t.taskDisplayId}
                type="button"
                role="menuitem"
                onClick={() => void selectTask(t.taskDisplayId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  width: "100%",
                  padding: "0.4375rem 0.5rem",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    t.taskDisplayId === focusedTaskDisplayId
                      ? "color-mix(in oklch, var(--primary) 12%, transparent)"
                      : "transparent",
                  color: "var(--text)",
                  font: "inherit",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: 500 }}>{t.taskDisplayId}</span>
                {t.stage ? <span style={{ color: "var(--text-muted)" }}>{t.stage}</span> : null}
                <span
                  style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
                >
                  {t.live ? <LiveDot /> : null}
                  {t.onThisMac ? <OnThisDeviceBadge /> : null}
                </span>
              </button>
            ))
          )}

          <div style={{ height: 1, background: "var(--border)", margin: "0.375rem 0" }} />

          <button type="button" role="menuitem" onClick={() => void selectTask(null)} style={menuActionStyle}>
            <Plus size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
            New worktree for a task
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              addTab({ title: "scratch", boundTaskDisplayId: null });
              openDock();
            }}
            style={menuActionStyle}
          >
            <TerminalIcon size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
            Open scratch terminal
          </button>
        </div>
      ) : null}
    </div>
  );
}

const menuActionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  width: "100%",
  padding: "0.4375rem 0.5rem",
  borderRadius: "6px",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  font: "inherit",
  fontSize: "0.8125rem",
  cursor: "pointer",
  textAlign: "left",
};

function LiveDot() {
  return (
    <span
      aria-label="live on this device"
      title="A worktree is held on this device"
      style={{
        width: 7,
        height: 7,
        borderRadius: "999px",
        background: "var(--success)",
        boxShadow: "0 0 0 3px color-mix(in oklch, var(--success) 24%, transparent)",
        flex: "none",
      }}
    />
  );
}

function OnThisDeviceBadge() {
  return (
    <Pill
      tone="neutral"
      kind="outline"
      size="sm"
      title="A worktree for this task exists on this device"
    >
      on this device
    </Pill>
  );
}

function SwitcherSkeleton() {
  return (
    <div aria-hidden="true" style={{ padding: "0.25rem 0.5rem" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: "1.25rem",
            margin: "0.375rem 0",
            borderRadius: "6px",
            background: "color-mix(in oklch, var(--text-muted) 12%, transparent)",
          }}
        />
      ))}
    </div>
  );
}
