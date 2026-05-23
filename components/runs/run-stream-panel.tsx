"use client";

/**
 * RunStreamPanel — live timeline of agent events.
 *
 * Uses useRunStream() from features/runs. Auto-scrolls unless the user has
 * scrolled up. Renders each event with a tiny icon + summary.
 *
 * Per UX standard §11.
 */

import { useEffect, useRef } from "react";
import {
  Brain,
  Eye,
  PencilLine,
  Wrench,
  Hourglass,
  CheckCircle2,
  Hammer,
  CircleAlert,
  Activity,
} from "lucide-react";

import { type RunEvent, useRunStream } from "@/features/runs/use-run-stream";
import type { RunStatus } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const ICON_FOR_STEP: Record<string, typeof Brain> = {
  plan: Brain,
  reason: Brain,
  retrieve: Eye,
  read: Eye,
  draft: PencilLine,
  write: PencilLine,
};

export function RunStreamPanel({
  runId,
  streamUrl,
  initialStatus,
}: {
  runId: string;
  streamUrl: string;
  initialStatus?: RunStatus;
}) {
  const { events, status, runStatus } = useRunStream(runId, streamUrl, initialStatus);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to newest unless the user has scrolled up.
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-medium">Live activity</span>
        </div>
        <span
          className={cn(
            "text-xs",
            status === "open"
              ? "text-[var(--success)]"
              : status === "error"
              ? "text-[var(--danger)]"
              : "text-[var(--text-muted)]"
          )}
        >
          {status === "open" ? "connected" : status === "error" ? "reconnecting…" : status}
        </span>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3" aria-live="polite">
        {events.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Waiting for the agent to start…</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </ol>
        )}
      </div>

      {runStatus !== "queued" && (
        <footer className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <span>Status:</span>
          <span className="font-medium text-[var(--text)]">{runStatus}</span>
        </footer>
      )}
    </div>
  );
}

function EventRow({ ev }: { ev: RunEvent }) {
  if (ev.event === "agent_step") {
    const kind = String(ev.data["kind"] ?? "");
    const Icon = ICON_FOR_STEP[kind] ?? Brain;
    const label = String(ev.data["label"] ?? kind);
    const durationMs = typeof ev.data["duration_ms"] === "number" ? (ev.data["duration_ms"] as number) : null;
    return (
      <li className="flex items-start gap-2 text-sm">
        <Icon className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
        <span>
          <span className="text-[var(--text-muted)]">{kind} · </span>
          {label}
          {durationMs !== null && (
            <span className="ml-2 text-xs text-[var(--text-muted)]">{(durationMs / 1000).toFixed(1)}s</span>
          )}
        </span>
      </li>
    );
  }

  if (ev.event === "tool_call") {
    const argsSummary = String(ev.data["args_summary"] ?? "");
    const durationMs = typeof ev.data["duration_ms"] === "number" ? (ev.data["duration_ms"] as number) : null;
    return (
      <li className="ml-6 flex items-start gap-2 text-sm">
        <Wrench className="mt-0.5 size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <span className="font-mono text-xs text-[var(--text-muted)]">
          {String(ev.data["name"] ?? "tool")}
          {argsSummary && ` (${argsSummary})`}
          {durationMs !== null && (
            <span className="ml-2 text-[10px]">{durationMs}ms</span>
          )}
        </span>
      </li>
    );
  }

  if (ev.event === "gate_pending") {
    return (
      <li className="flex items-start gap-2 text-sm">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" aria-hidden />
        <span>
          Awaiting human approval:{" "}
          <span className="font-medium">{String(ev.data["gate"] ?? "gate")}</span>
        </span>
      </li>
    );
  }

  if (ev.event === "run_status") {
    const status = String(ev.data["status"] ?? "");
    if (status === "completed") {
      return (
        <li className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
          <span>
            Run completed
            {typeof ev.data["spent_usd"] === "number" ? ` · spent $${(ev.data["spent_usd"] as number).toFixed(2)}` : ""}
          </span>
        </li>
      );
    }
    if (status === "running") {
      return (
        <li className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
          <Hammer className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
          <span>Run started</span>
        </li>
      );
    }
    return (
      <li className="flex items-start gap-2 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--info)]" aria-hidden />
        <span>{status}</span>
      </li>
    );
  }

  return null;
}
