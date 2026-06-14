"use client";

/**
 * WatchToggle - the cockpit header's "follow this task" control. Watching a task
 * surfaces it in your My Work "Watching" section (and is the only way to put it
 * there). Self-contained: fetches its own initial state, toggles optimistically,
 * reverts on failure. Soft-fails to "not watching" if the state can't load.
 */

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export function WatchToggle({ taskId }: { taskId: string }) {
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.tasks
      .watchState(taskId)
      .then((r) => {
        if (!cancelled) setWatching(r.watching);
      })
      .catch(() => {
        if (!cancelled) setWatching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const toggle = async () => {
    if (watching === null || busy) return;
    const next = !watching;
    setBusy(true);
    setWatching(next); // optimistic
    try {
      const r = next
        ? await api.tasks.watch(taskId)
        : await api.tasks.unwatch(taskId);
      setWatching(r.watching);
    } catch {
      setWatching(!next); // revert
    } finally {
      setBusy(false);
    }
  };

  const isWatching = watching === true;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={watching === null || busy}
      aria-pressed={isWatching}
      title={
        isWatching
          ? "You're watching this task - it shows in your My Work"
          : "Watch this task to track it in your My Work"
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        isWatching
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      {isWatching ? (
        <Eye className="size-3.5" aria-hidden />
      ) : (
        <EyeOff className="size-3.5" aria-hidden />
      )}
      {isWatching ? "Watching" : "Watch"}
    </button>
  );
}
