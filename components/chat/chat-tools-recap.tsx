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

import { cn } from "@/lib/cn";
import type { ChatToolCall } from "@/lib/api/client";

export function ChatToolsRecap({ tools }: { tools: ChatToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  if (tools.length === 0) return null;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-2 bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] px-2.5 py-1.5 text-left text-xs text-[var(--text-muted)] shadow-[var(--inner-highlight)]",
          "transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          expanded && "border-b border-[var(--border)]",
        )}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--surface-3)] text-[var(--text-muted)]">
          <Wrench className="size-3" aria-hidden />
        </span>
        <span className="font-medium">
          {tools.length} tool{tools.length === 1 ? "" : "s"} used
        </span>
        <span className="ml-auto" aria-hidden>
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </span>
      </button>

      {expanded && (
        <ol className="flex max-h-48 flex-col gap-0.5 overflow-auto bg-[var(--surface)] px-2 py-1.5">
          {tools.map((t, i) => (
            <li
              key={`${t.name}-${i}`}
              className="flex items-start gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-[var(--surface-2)]"
            >
              <Wrench className="mt-0.5 size-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <span className="min-w-0 break-words font-mono text-[var(--text)]">{t.name}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
