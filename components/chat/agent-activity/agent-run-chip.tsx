"use client";

/**
 * Inline sub-agent activity chips, rendered under the parent message that
 * spawned them. Each chip shows a child's name + live status; clicking opens
 * the full activity drawer. A compact "the agent is working" summary that keeps
 * the transcript clean (the detail + controls live in the drawer).
 */

import { type CSSProperties } from "react";
import { Bot } from "lucide-react";

import { type AgentExecution, type ExecutionStatus } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/components/ui/eyebrow";

const STATUS_META: Record<
  ExecutionStatus,
  { label: string; dot: string; live: boolean }
> = {
  queued: { label: "Queued", dot: "var(--text-subtle)", live: false },
  running: { label: "Running", dot: "var(--primary)", live: true },
  steering: { label: "Steering", dot: "var(--warning)", live: true },
  completed: { label: "Done", dot: "var(--success)", live: false },
  failed: { label: "Failed", dot: "var(--danger)", live: false },
  cancelled: { label: "Cancelled", dot: "var(--text-subtle)", live: false },
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
      <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
        <span
          className={cn("star-dot", meta.live && "is-live")}
          style={{ "--dot-color": meta.dot } as CSSProperties}
          aria-hidden
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
      <Eyebrow>Agents</Eyebrow>
      {executions.map((e) => (
        <AgentRunChip key={e.id} execution={e} onOpen={onOpen} />
      ))}
    </div>
  );
}
