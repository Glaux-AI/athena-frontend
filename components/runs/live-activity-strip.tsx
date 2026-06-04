"use client";

/**
 * LiveActivityStrip — compact, collapsible live SSE feed for a run.
 *
 * Default state: single-line strip showing the latest agent_step or
 * tool_call event + a tiny event counter + connection dot. Click the
 * row to expand into a scrollable timeline (max-h-64) of all events
 * received so far.
 *
 * Designed for inline placement (between DecisionsStrip and the phase
 * content grid on /runs/[id]); the strip eats only ~40px of vertical
 * space when collapsed. Per UX standard §7+§11.
 *
 * SSE field names follow FE truth (lib/api/mock/sse.ts): agent_step
 * carries {kind, label, duration_ms}; tool_call carries {name,
 * args_summary, duration_ms}; gate_pending carries {gate, requires};
 * run_status carries {status, spent_usd}.
 */

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Brain,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CheckCircle2,
  Eye,
  Hammer,
  Hourglass,
  PencilLine,
  Wrench,
} from "lucide-react";

import { type RunEvent, useRunStream } from "@/features/runs/use-run-stream";
import type { RunStatus } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/utils/format";

const KIND_ICON: Record<string, typeof Brain> = {
  plan: Brain,
  reason: Brain,
  retrieve: Eye,
  read: Eye,
  draft: PencilLine,
  write: PencilLine,
};

const KIND_VERB: Record<string, string> = {
  plan: "Planning",
  reason: "Reasoning",
  retrieve: "Retrieving",
  read: "Reading",
  draft: "Drafting",
  write: "Writing",
};

export function LiveActivityStrip({
  runId,
  streamUrl,
  initialStatus,
}: {
  runId: string;
  streamUrl: string;
  /** F-03.2 — initial truth from `api.runs.get(id)`. Avoids the
   * "queued" flash on completed runs whose SSE has nothing left to replay. */
  initialStatus?: RunStatus;
}) {
  const { events, status, runStatus } = useRunStream(runId, streamUrl, initialStatus);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the expanded timeline to newest when new events arrive.
  useEffect(() => {
    if (!expanded || !scrollRef.current) return;
    const el = scrollRef.current;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [events, expanded]);

  const latestActivity = findLatestActivity(events);
  const stepCount = events.filter((ev) => ev.event === "agent_step").length;
  const toolCount = events.filter((ev) => ev.event === "tool_call").length;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="live-activity-body"
      >
        <Activity
          className={cn(
            "size-4 shrink-0",
            status === "open" ? "text-[var(--primary)]" : "text-[var(--text-muted)]"
          )}
          aria-hidden
        />

        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {latestActivity ? (
            <CompactSummary ev={latestActivity} />
          ) : (
            <span className="text-[var(--text-muted)]">
              {status === "open"
                ? "Waiting for the agent to start…"
                : status === "error"
                ? "Reconnecting to live stream…"
                : "Connecting to live stream…"}
            </span>
          )}
        </span>

        <span className="hidden shrink-0 items-center gap-2 text-xs text-[var(--text-muted)] sm:flex">
          {stepCount > 0 && (
            <span>
              {stepCount} step{stepCount === 1 ? "" : "s"}
            </span>
          )}
          {toolCount > 0 && (
            <span>
              · {toolCount} tool call{toolCount === 1 ? "" : "s"}
            </span>
          )}
          <span
            className={cn(
              "ml-1 size-1.5 rounded-full",
              status === "open"
                ? "animate-pulse bg-[var(--success)]"
                : status === "error"
                ? "bg-[var(--danger)]"
                : "bg-[var(--text-muted)]"
            )}
            aria-hidden
            title={status === "open" ? "Live" : status === "error" ? "Reconnecting" : "Connecting"}
          />
        </span>

        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        )}
      </button>

      {expanded && (
        <div
          id="live-activity-body"
          ref={scrollRef}
          className="max-h-64 overflow-auto border-t border-[var(--border)] px-3 py-3"
          aria-live="polite"
        >
          {events.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Waiting for the agent to start…
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {events.map((ev) => (
                <EventRow key={ev.id} ev={ev} />
              ))}
            </ol>
          )}
          {runStatus !== "queued" && (
            <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
              <span>Run status:</span>
              <span className="font-medium text-[var(--text)]">{runStatus}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function findLatestActivity(events: RunEvent[]): RunEvent | undefined {
  // Prefer the most recent agent_step or tool_call as the compact summary line;
  // gate_pending and terminal run_status are handled in their own renderers.
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.event === "agent_step" || ev.event === "tool_call" || ev.event === "gate_pending") {
      return ev;
    }
  }
  return undefined;
}

function CompactSummary({ ev }: { ev: RunEvent }) {
  if (ev.event === "agent_step") {
    const kind = String(ev.data["kind"] ?? "");
    const Icon = KIND_ICON[kind] ?? Brain;
    const verb = KIND_VERB[kind] ?? "Working on";
    const label = String(ev.data["label"] ?? kind);
    return (
      <>
        <Icon className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
        <span className="truncate">
          <span className="text-[var(--text-muted)]">{verb}: </span>
          <span className="text-[var(--text)]">{label}</span>
        </span>
      </>
    );
  }
  if (ev.event === "tool_call") {
    const name = String(ev.data["name"] ?? "tool");
    const argsSummary = String(ev.data["args_summary"] ?? "");
    return (
      <>
        <Wrench className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <span className="truncate">
          <span className="text-[var(--text-muted)]">Calling </span>
          <span className="font-mono text-xs text-[var(--text)]">{name}</span>
          {argsSummary && (
            <span className="text-[var(--text-muted)]"> · {argsSummary}</span>
          )}
        </span>
      </>
    );
  }
  if (ev.event === "gate_pending") {
    return (
      <>
        <Hourglass className="size-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
        <span className="truncate">
          <span className="text-[var(--text-muted)]">Awaiting approval: </span>
          <span className="font-medium text-[var(--text)]">
            {String(ev.data["gate"] ?? "gate")}
          </span>
        </span>
      </>
    );
  }
  return null;
}

function EventRow({ ev }: { ev: RunEvent }) {
  if (ev.event === "agent_step") {
    const kind = String(ev.data["kind"] ?? "");
    const Icon = KIND_ICON[kind] ?? Brain;
    const label = String(ev.data["label"] ?? kind);
    const durationMs = typeof ev.data["duration_ms"] === "number" ? (ev.data["duration_ms"] as number) : null;
    return (
      <li className="flex items-start gap-2 text-sm">
        <Icon className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="text-[var(--text-muted)]">{kind} · </span>
          <span>{label}</span>
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
        <span className="min-w-0 flex-1 font-mono text-xs text-[var(--text-muted)]">
          {String(ev.data["name"] ?? "tool")}
          {argsSummary && ` (${argsSummary})`}
          {durationMs !== null && <span className="ml-2 text-[10px]">{durationMs}ms</span>}
        </span>
      </li>
    );
  }
  if (ev.event === "gate_pending") {
    const requires = Array.isArray(ev.data["requires"]) ? (ev.data["requires"] as string[]) : [];
    return (
      <li className="flex items-start gap-2 text-sm">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" aria-hidden />
        <span>
          Awaiting approval:{" "}
          <span className="font-medium">{String(ev.data["gate"] ?? "gate")}</span>
          {requires.length > 0 && (
            <span className="ml-2 text-xs text-[var(--text-muted)]">
              ({requires.join(", ")})
            </span>
          )}
        </span>
      </li>
    );
  }
  if (ev.event === "phase_transition") {
    // BE-canonical envelope (snake_case per ADR-032) uses `from_phase_key`
    // and `to_phase_key`. The pre-Phase-04 mock fixtures + tests use the
    // shorter `from` / `to` aliases — accept both so the strip renders
    // cleanly during the migration window.
    const from = String(ev.data["from_phase_key"] ?? ev.data["from"] ?? "");
    const to = String(ev.data["to_phase_key"] ?? ev.data["to"] ?? "");
    return (
      <li className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <span className="font-mono text-xs">
          {from} <span aria-hidden>→</span> {to}
        </span>
      </li>
    );
  }
  if (ev.event === "run_status") {
    const status = String(ev.data["status"] ?? "");
    const spent = typeof ev.data["spent_usd"] === "number" ? (ev.data["spent_usd"] as number) : null;
    if (status === "completed") {
      return (
        <li className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
          <span>
            Run completed
            {spent !== null && ` · spent ${formatUsd(spent)}`}
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
        <span>{status.replace("_", " ")}</span>
      </li>
    );
  }
  return null;
}
