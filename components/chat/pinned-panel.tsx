"use client";

/**
 * PinnedPanel - the conversation header's "Pinned" affordance: a count chip
 * that opens a popover listing this thread's pinned AI answers (newest of
 * each shown as a snippet + timestamp). Clicking a row jumps to that message;
 * each row carries an unpin action. Self-contained open/scrim handling mirrors
 * the thread rail's "+" popover. Hidden by the parent when there are no pins.
 */

import { useState } from "react";
import { Star, X } from "lucide-react";

import { type ChatMessage } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/components/ui/eyebrow";
import { formatDateTime } from "@/lib/utils/format";

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}

export function PinnedPanel({
  pins,
  onJump,
  onUnpin,
}: {
  pins: ChatMessage[];
  onJump: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (pins.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Pinned answers (${pins.length})`}
        title="Pinned answers"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {/* Pin IS starring - the affordance is a lit star in the accent color. */}
        <Star className="size-3.5 fill-current text-[var(--primary)] drop-shadow-[0_0_5px_var(--glow-accent)]" />
        {pins.length}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="glass-panel absolute right-0 top-full z-[var(--z-popover)] mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-1">
            <div className="px-2 py-1.5">
              <Eyebrow>Pinned answers</Eyebrow>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {pins.map((m) => (
                <li key={m.id} className="group/pin relative">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onJump(m.id);
                    }}
                    className={cn(
                      "block w-full rounded-md px-2 py-1.5 pr-7 text-left transition-colors hover:bg-[var(--surface-2)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    )}
                  >
                    <span className="line-clamp-2 text-[13px] text-[var(--text)]">{snippet(m.content)}</span>
                    <span className="text-micro mt-0.5 block text-[var(--text-subtle)]">
                      {formatDateTime(m.pinned_at || m.created_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUnpin(m.id)}
                    aria-label="Unpin answer"
                    title="Unpin"
                    className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-md text-[var(--text-subtle)] opacity-0 transition-[color,background-color,opacity] hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover/pin:opacity-100 max-lg:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
