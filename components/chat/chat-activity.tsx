"use client";

/**
 * ChatActivity - the live "what Athena is doing" panel, shown at the head of
 * the in-flight assistant turn while a reply streams in.
 *
 * Thin adapter over the shared <AgentActivity> surface (components/agent/
 * agent-activity.tsx - ONE activity component across chat + tasks). This file
 * only projects the `StreamingTurn` onto the shared row shape; verbs, icons,
 * the friendly tool vocabulary, motion, and the fold all live there. The
 * answer itself types in below this panel.
 */

import { useMemo } from "react";

import {
  AgentActivity,
  activityHeadlineVerb,
  type ActivityRow,
} from "@/components/agent/agent-activity";
import type { StreamingTurn } from "@/features/chat/use-chat-turn";

export function ChatActivity({ turn }: { turn: StreamingTurn }) {
  const rows = useMemo<ActivityRow[]>(
    () =>
      turn.tools.map((t, i) => {
        const row: ActivityRow = {
          key: `${t.id}-${i}`,
          kind: "tool",
          toolName: t.name,
          summary: t.args_summary ?? "",
          status: t.done ? "ok" : "running",
          order: i,
          live: true,
        };
        return row;
      }),
    [turn.tools],
  );

  return (
    <AgentActivity
      headline={`Athena is ${activityHeadlineVerb(turn.status).toLowerCase()}…`}
      rows={rows}
      live
      resetKey="chat-turn"
      defaultExpanded
      maxHeightClass="max-h-40"
      emptyText="Warming up…"
    />
  );
}
