"use client";

// LocalRunLauncher: the desktop-only "Run this task locally with Claude" control on the task
// cockpit. It runs the headless local executor for the selected stage of ANY task type. Claude
// works through Athena's knowledge over MCP and only pulls a repo down locally if the stage needs
// code edits; those edits go through the approval gate and open a PR per repo it changes. Shows a
// live activity log of every step (clone, edit, test, gate, PR) and lets you pick the Claude model.
// Renders nothing on the web build (no window.athena bridge).

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, FolderGit2, Loader2, Square } from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { ExecutorLogLine, ExecutorRun } from "@/lib/desktop/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface LocalRunLauncherProps {
  taskId: string;
  taskDisplayId: string;
  /** The stage tab currently selected in the cockpit; the local run targets this stage. */
  stage: string | null;
}

const ACTIVE_STATUSES: ReadonlySet<ExecutorRun["status"]> = new Set(["claiming", "working", "submitting"]);

// Claude Code accepts model aliases (mapped to the latest of each tier) or a full id; "" = the
// CLI's configured default. These cover the common picks without pinning to ids that rotate.
const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default model" },
  { value: "opus", label: "Claude Opus" },
  { value: "sonnet", label: "Claude Sonnet" },
  { value: "haiku", label: "Claude Haiku" },
];

const MAX_LOG_LINES = 250;

function logClass(kind: ExecutorLogLine["kind"]): string {
  switch (kind) {
    case "tool":
      return "text-[var(--primary)]";
    case "agent":
      return "text-[var(--text-muted)]";
    case "result":
      return "font-medium text-[var(--text)]";
    case "stderr":
      return "text-[var(--danger)]";
    default:
      return "text-[var(--text-subtle)]"; // system
  }
}

export function LocalRunLauncher({ taskId, taskDisplayId, stage }: LocalRunLauncherProps) {
  const [mounted, setMounted] = useState(false);
  const [run, setRun] = useState<ExecutorRun | null>(null);
  const [model, setModel] = useState<string>("");
  const [log, setLog] = useState<ExecutorLogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Pick up an existing run for this task (e.g. after a tab switch or reload).
  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    void (async () => {
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

  // Track this task's run + activity log live.
  useEffect(() => {
    if (!isDesktop) return;
    const offEvent = athena.executor.onEvent((e) => {
      if (e.run.taskDisplayId === taskDisplayId) setRun(e.run);
    });
    const offLog = athena.executor.onLog((l) => {
      if (l.taskDisplayId !== taskDisplayId) return;
      setLog((prev) => {
        const next = prev.length >= MAX_LOG_LINES ? prev.slice(prev.length - MAX_LOG_LINES + 1) : prev.slice();
        next.push(l);
        return next;
      });
    });
    return () => {
      offEvent();
      offLog();
    };
  }, [taskDisplayId]);

  // Keep the log scrolled to the newest line.
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  const start = useCallback(async () => {
    const stageToRun = stage?.trim();
    if (!stageToRun) return;
    setStarting(true);
    setError(null);
    setLog([]);
    try {
      const req = { taskId, taskDisplayId, stage: stageToRun, ...(model ? { model } : {}) };
      await athena.executor.start(req);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the local run.");
    } finally {
      setStarting(false);
    }
  }, [stage, model, taskId, taskDisplayId]);

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
        Claude works this stage on your machine using Athena&apos;s knowledge over MCP. It only pulls a
        repo down if it needs to edit code, and every file write, command, and commit is reviewed by the
        approval gate before it lands. Code changes open a pull request per repo for you to review.
      </p>

      <label className="mb-2 flex flex-col gap-1 text-xs text-[var(--text-muted)]">
        Model
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={isActive}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value || "default"} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {run ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
          <FolderGit2 className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]" title={run.message}>
            <span className="font-medium text-[var(--text)]">{run.status}</span>: {run.message}
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

      {log.length > 0 ? (
        <div className="mb-2 max-h-56 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface-3)] p-2 font-mono text-[11px] leading-relaxed">
          {log.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-words ${logClass(l.kind)}`}>
              {l.kind === "tool" ? "› " : l.kind === "stderr" ? "! " : ""}
              {l.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      ) : null}

      {error ? <p className="mb-2 text-xs text-[var(--danger)]">{error}</p> : null}

      <Button
        onClick={() => void start()}
        disabled={isActive || starting || !stage}
        size="sm"
        className="w-full"
      >
        {isActive || starting ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
        {isActive ? "Running locally…" : "Run locally with Claude"}
      </Button>
      {!stage ? <p className="mt-2 text-xs text-[var(--text-subtle)]">Select a stage to run.</p> : null}
    </Card>
  );
}
