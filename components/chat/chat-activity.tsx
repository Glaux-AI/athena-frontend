"use client";

/**
 * ChatActivity — the live "what Athena is doing" panel, shown at the head of
 * the in-flight assistant turn while a reply streams in.
 *
 * A status line (the latest `agent_step` verb from the closed, mood-safe kind
 * set + an animated indicator) over a compact, height-capped list of tool
 * calls that fills in as they stream, each settling with a check on its paired
 * `tool_result`. Tokens-only; the answer itself types in below this panel.
 */

import { Brain, Check, Eye, Loader2, PencilLine, Wrench } from "lucide-react";

import type { StreamingTurn } from "@/features/chat/use-chat-turn";

const KIND_VERB: Record<string, string> = {
  plan: "Thinking",
  reason: "Reasoning",
  retrieve: "Retrieving",
  read: "Reading",
  draft: "Drafting",
  write: "Writing",
};

const KIND_ICON: Record<string, typeof Brain> = {
  plan: Brain,
  reason: Brain,
  retrieve: Eye,
  read: Eye,
  draft: PencilLine,
  write: PencilLine,
};

export function ChatActivity({ turn }: { turn: StreamingTurn }) {
  const StatusIcon = turn.status ? KIND_ICON[turn.status] ?? Loader2 : Brain;
  const verb = turn.status ? KIND_VERB[turn.status] ?? "Working" : "Thinking";

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)]">
        <StatusIcon className="size-3.5 shrink-0 animate-pulse text-[var(--primary)]" aria-hidden />
        <span>Athena is {verb.toLowerCase()}…</span>
        {turn.tools.length > 0 && (
          <span className="ml-auto text-xs tabular-nums">
            {turn.tools.length} tool{turn.tools.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {turn.tools.length > 0 && (
        <ol className="flex max-h-40 flex-col gap-1 overflow-auto border-t border-[var(--border)] px-3 py-2">
          {turn.tools.map((t, i) => (
            <li key={`${t.id}-${i}`} className="flex items-start gap-2 text-xs">
              {t.done ? (
                <Check className="mt-0.5 size-3 shrink-0 text-[var(--success)]" aria-hidden />
              ) : (
                <Wrench className="mt-0.5 size-3 shrink-0 animate-pulse text-[var(--text-muted)]" aria-hidden />
              )}
              <span className="min-w-0 truncate">
                <span className="font-mono text-[var(--text)]">{t.name}</span>
                {t.args_summary && <span className="text-[var(--text-muted)]"> · {t.args_summary}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
