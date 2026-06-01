"use client";

/**
 * ChatToolsRecap — collapsed "tools used" trace under a finished assistant
 * reply.
 *
 * Reads the persisted `tool_calls` the BE serialises on every assistant
 * message (the live `message` frame *and* thread reload, both via
 * `_to_message_out` in chat.py), so the tool trace the user watched stream in
 * stays available — collapsed — after the turn ends and across reloads. The
 * answer leads; the receipts are one click away. The live, in-flight version
 * is `<ChatActivity>`; this is its settled counterpart.
 *
 * Renders nothing when the turn used no tools, so callers can drop it under
 * every assistant bubble unconditionally.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";

import type { ChatToolCall } from "@/lib/api/client";

export function ChatToolsRecap({ tools }: { tools: ChatToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  if (tools.length === 0) return null;

  return (
    <div className="w-full rounded-lg border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <Wrench className="size-3 shrink-0" aria-hidden />
        <span>
          {tools.length} tool{tools.length === 1 ? "" : "s"} used
        </span>
        <span className="ml-auto" aria-hidden>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </span>
      </button>

      {expanded && (
        <ol className="flex max-h-48 flex-col gap-1 overflow-auto border-t border-[var(--border)] px-2.5 py-1.5">
          {tools.map((t, i) => (
            <li key={`${t.name}-${i}`} className="flex items-start gap-2 text-xs">
              <Wrench className="mt-0.5 size-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <span className="min-w-0 break-words font-mono text-[var(--text)]">{t.name}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
