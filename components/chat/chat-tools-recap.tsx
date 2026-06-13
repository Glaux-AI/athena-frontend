"use client";

/**
 * ChatToolsRecap - collapsed "tools used" trace under a finished assistant
 * reply.
 *
 * Thin adapter over the shared <AgentActivity> surface (components/agent/
 * agent-activity.tsx - ONE activity component across chat + tasks). Reads the
 * persisted `tool_calls` the BE serialises on every assistant message (the
 * live `message` frame *and* thread reload), so the trace the user watched
 * stream in stays available - collapsed - after the turn ends and across
 * reloads. Each call now renders its friendly verb + an args summary (the
 * persisted payload carries args), not just a bare tool name. The answer
 * leads; the receipts are one click away.
 *
 * Renders nothing when the turn used no tools, so callers can drop it under
 * every assistant bubble unconditionally.
 */

import { useMemo } from "react";

import { AgentActivity, type ActivityRow } from "@/components/agent/agent-activity";
import type { ChatToolCall } from "@/lib/api/client";

/** One-line, length-capped `k=v` summary of a persisted tool call's args. */
function argsSummary(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const parts = Object.entries(args)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 3)
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`);
  return parts.join(", ").slice(0, 120);
}

export function ChatToolsRecap({ tools }: { tools: ChatToolCall[] }) {
  const rows = useMemo<ActivityRow[]>(
    () =>
      tools.map((t, i) => ({
        key: `${t.name}-${i}`,
        kind: "tool",
        toolName: t.name,
        summary: argsSummary(t.args),
        status: "ok" as const,
        order: i,
      })),
    [tools],
  );
  if (tools.length === 0) return null;

  return (
    <AgentActivity
      headline={`${tools.length} tool${tools.length === 1 ? "" : "s"} used`}
      rows={rows}
      live={false}
      maxHeightClass="max-h-48"
    />
  );
}
