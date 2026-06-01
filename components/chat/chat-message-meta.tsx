"use client";

/**
 * ChatMessageMeta — tiny usage footer under an assistant reply.
 *
 * Shows the total tokens spent on the turn (prompt + completion) and the turn
 * cost, in the same small/subtle font as the citation overflow chip. The
 * prompt/completion split lives in the hover `title` so the line stays compact.
 *
 * Renders nothing when no usage was captured — older persisted rows, failed
 * turns, or non-assistant roles — so callers can drop it under every bubble
 * unconditionally.
 */

import type { ChatTokenUsage } from "@/lib/api/client";
import { formatTokens, formatUsd } from "@/lib/utils/format";

export function ChatMessageMeta({ usage }: { usage?: ChatTokenUsage | undefined }) {
  if (!usage) return null;
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  const total = prompt + completion;
  const cost = usage.total_cost_usd;
  const hasCost = typeof cost === "number" && cost > 0;
  if (total <= 0 && !hasCost) return null;

  return (
    <div
      className="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-subtle)]"
      title={`Prompt ${formatTokens(prompt)} · Completion ${formatTokens(completion)} tokens`}
    >
      {total > 0 && <span>{formatTokens(total)} tokens</span>}
      {total > 0 && hasCost && <span aria-hidden>·</span>}
      {hasCost && <span>{formatUsd(cost as number)}</span>}
    </div>
  );
}
