"use client";

/**
 * Inline sub-agent activity chips, rendered under the parent message that
 * spawned them. Each chip shows a child's name + live status; clicking opens
 * the full activity drawer. A compact "the agent is working" summary that keeps
 * the transcript clean (the detail + controls live in the drawer).
 */

import { Bot } from "lucide-react";

import { type AgentExecution, type ExecutionStatus } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const STATUS_META: Record<
  ExecutionStatus,
  { label: string; dot: string; live: boolean }
> = {
  queued: { label: "Queued", dot: "bg-[var(--text-subtle)]", live: false },
  running: { label: "Running", dot: "bg-[var(--primary)]", live: true },
  steering: { label: "Steering", dot: "bg-[var(--warning-ink)]", live: true },
  completed: { label: "Done", dot: "bg-[var(--success-ink)]", live: false },
  failed: { label: "Failed", dot: "bg-[var(--danger-ink)]", live: false },
  cancelled: { label: "Cancelled", dot: "bg-[var(--text-subtle)]", live: false },
};

export function AgentRunChip({
  execution,
  onOpen,
}: {
  execution: AgentExecution;
  onOpen: (id: string) => void;
}) {
  const meta = STATUS_META[execution.status];
  return (
    <button
      type="button"
      onClick={() => onOpen(execution.id)}
      className={cn(
        "flex items-center gap-2 rounded-full border border-[var(--border)] px-2.5 py-1",
        "text-xs transition-colors hover:bg-[var(--surface-2)]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
      )}
      aria-label={`Sub-agent ${execution.subagent_name}: ${meta.label}`}
    >
      <Bot className="size-3.5 shrink-0 text-[var(--text-muted)]" />
      <span className="max-w-[12rem] truncate font-medium text-[var(--text)]">
        {execution.subagent_name}
      </span>
      <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            meta.dot,
            meta.live && "animate-pulse",
          )}
        />
        {meta.label}
      </span>
    </button>
  );
}

export function AgentRunGroup({
  executions,
  onOpen,
}: {
  executions: AgentExecution[];
  onOpen: (id: string) => void;
}) {
  if (executions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
        Agents
      </span>
      {executions.map((e) => (
        <AgentRunChip key={e.id} execution={e} onOpen={onOpen} />
      ))}
    </div>
  );
}
